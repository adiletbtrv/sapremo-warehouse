import { useEffect, useState, useMemo, useRef } from 'react';
import {
  Modal,
  Form,
  Button,
  Select,
  InputNumber,
  Space,
  Input,
  App,
  Typography,
  Card,
  Row,
  Col,
  Tag,
  Tooltip,
} from 'antd';
import { MinusCircleOutlined, PlusOutlined } from '@ant-design/icons';
import { useForm, Controller, useFieldArray, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { db } from '@/db/schema';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSyncStore } from '@/store/syncStore';
import { useAuthStore } from '@/store/authStore';
import type { FactoryOrder, FactoryOrderStatus } from '@/types';
import { factoryClient } from '@/api/client';
import { roundCurrency } from '@/utils/money';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

const { Text } = Typography;

const getFactoryOrderSchema = (t: TFunction) =>
  z.object({
    comment: z.string().optional(),
    items: z
      .array(
        z.object({
          productId: z
            .string()
            .min(1, t('factoryOrders.errSelectProduct', { defaultValue: 'Выберите товар' })),
          qty: z
            .number()
            .min(
              1,
              t('factoryOrders.errQtyMin', { defaultValue: 'Количество коробок должно быть > 0' }),
            ),
        }),
      )
      .min(1, t('factoryOrders.errMinOneProduct', { defaultValue: 'Добавьте хотя бы один товар' })),
  });

type FormValues = z.infer<ReturnType<typeof getFactoryOrderSchema>>;

interface FactoryOrderFormProps {
  open: boolean;
  onClose: () => void;
}

export default function FactoryOrderForm({ open, onClose }: FactoryOrderFormProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);
  const isOnline = useSyncStore((state) => state.isOnline);
  const addToQueue = useSyncStore((state) => state.addToQueue);

  const rawProducts = useLiveQuery(
    () => db.products.filter((p) => !p.isArchived).toArray(),
    [],
    [],
  );
  const products = useMemo(() => rawProducts ?? [], [rawProducts]);
  const noProductsAvailable = products.length === 0;
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(getFactoryOrderSchema(t)),
    defaultValues: {
      items: [{ productId: '', qty: 1 }],
      comment: '',
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  });

  const rawWatchedItems = useWatch({ control, name: 'items' });
  const watchedItems = useMemo(() => rawWatchedItems ?? [], [rawWatchedItems]);

  const totals = useMemo(() => {
    let totalBoxes = 0;
    let totalPieces = 0;
    let totalSum = 0;

    watchedItems.forEach((item) => {
      if (!item?.productId) return;
      const product = productsById.get(item.productId);
      const boxes = Number(item.qty) || 0;
      const piecesPerBox = product?.boxQuantity ?? 1;
      const pieces = boxes * piecesPerBox;
      const price = product?.factoryPrice ?? 0;

      totalBoxes += boxes;
      totalPieces += pieces;
      totalSum += roundCurrency(pieces * price);
    });

    return {
      totalBoxes,
      totalPieces,
      totalSum: roundCurrency(totalSum),
    };
  }, [watchedItems, productsById]);

  useEffect(() => {
    if (open) {
      reset({ items: [{ productId: '', qty: 1 }], comment: '' });
    }
  }, [open, reset]);

  const user = useAuthStore((state) => state.user);

  const isSubmittingRef = useRef(false);

  const onSubmit = async (values: FormValues) => {
    setLoading(true);
    try {
      const date = dayjs().toISOString();
      const existingCount = await db.factoryOrders.count();
      const warehouseId = user?.warehouseId;
      const validWarehouseId =
        warehouseId && warehouseId !== '00000000-0000-0000-0000-000000000001'
          ? warehouseId
          : undefined;

      let serverOrderId: string | undefined;

      if (isOnline && typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const body: Record<string, unknown> = {
            items: values.items.map((i) => ({
              product_id: i.productId,
              qty: i.qty,
            })),
            comment: values.comment ?? '',
          };
          if (validWarehouseId) body.warehouse_id = validWarehouseId;

          const res = await factoryClient.post<{ id?: string | number }>(
            '/warehouse-orders/',
            body,
          );
          if (res?.data?.id) {
            serverOrderId = String(res.data.id);
          }
        } catch (serverErr) {
          console.warn('[FactoryOrderForm] Online send failed, queuing offline:', serverErr);
        }
      }

      const id = serverOrderId ?? crypto.randomUUID();

      const localOrder: FactoryOrder = {
        id,
        orderNumber: existingCount + 1,
        date,
        status: 'pending' as FactoryOrderStatus,
        comment: values.comment,
        createdByName: user?.fullName ?? user?.username ?? 'Зав. склад',
        warehouseId: validWarehouseId,
        items: values.items.map((i) => {
          const prod = products.find((p) => p.id === i.productId);
          return {
            id: crypto.randomUUID(),
            productId: i.productId,
            productName: prod?.name ?? '',
            qty: i.qty,
            boxCount: i.qty,
          };
        }),
      };

      await db.factoryOrders.put(localOrder);

      if (!serverOrderId) {
        await addToQueue({ action: 'CREATE_FACTORY_ORDER', payload: localOrder });
        void message.info(
          t('factoryOrders.msgOrderQueued', {
            defaultValue: 'Нет интернета — заявка сохранена и отправится при подключении.',
          }),
        );
      } else {
        void message.success(
          t('factoryOrders.msgOrderSent', { defaultValue: 'Заявка успешно отправлена на завод!' }),
        );
      }
      onClose();
    } catch {
      void message.error(
        t('factoryOrders.errServer', { defaultValue: 'Ошибка при создании заявки' }),
      );
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const handleOk = () => {
    if (loading || isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    void handleSubmit(
      async (values) => {
        await onSubmit(values);
      },
      () => {
        isSubmittingRef.current = false;
      },
    )();
  };

  return (
    <Modal
      centered
      title={t('factoryOrders.modalTitle', { defaultValue: 'Новая заявка на завод' })}
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={loading}
      okText={t('factoryOrders.btnSend', { defaultValue: 'Отправить на завод' })}
      cancelText={t('common.cancel', { defaultValue: 'Отмена' })}
      okButtonProps={{ disabled: loading || noProductsAvailable, loading }}
      width="100%"
      style={{ maxWidth: 750 }}
    >
      <Form layout="vertical">
        <div style={{ marginBottom: 16 }}>
          <Text type="secondary">
            {t('factoryOrders.msgSelectProducts', {
              defaultValue:
                'Выберите товары и укажите необходимое количество коробок для заказа с завода.',
            })}
          </Text>
        </div>

        {noProductsAvailable && (
          <Text type="warning" style={{ display: 'block', marginBottom: 16 }}>
            {t('factoryOrders.msgNoProductsWarn', {
              defaultValue:
                'Справочник товаров пуст — добавить позиции в заявку нельзя, пока нет ни одного товара.',
            })}
          </Text>
        )}

        {fields.map((field, index) => {
          const currentItem = watchedItems[index];
          const product = currentItem?.productId
            ? productsById.get(currentItem.productId)
            : undefined;
          const boxes = Number(currentItem?.qty) || 0;
          const piecesPerBox = product?.boxQuantity ?? 1;
          const totalPcs = boxes * piecesPerBox;
          const lineSum = roundCurrency(totalPcs * (product?.factoryPrice ?? 0));

          return (
            <div
              key={field.id}
              style={{
                background: 'var(--ant-color-fill-alter)',
                padding: '12px',
                borderRadius: 8,
                border: '1px solid var(--ant-color-border-secondary)',
                marginBottom: 12,
              }}
            >
              <Row gutter={[12, 8]} align="top">
                {/* Выбор товара */}
                <Col xs={24} sm={12}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 11, display: 'block', marginBottom: 4 }}
                  >
                    {t('factoryOrders.colProduct', 'Товар')}
                  </Text>
                  <Form.Item
                    validateStatus={errors.items?.[index]?.productId ? 'error' : ''}
                    help={errors.items?.[index]?.productId?.message}
                    style={{ marginBottom: 0 }}
                  >
                    <Controller
                      name={`items.${index}.productId`}
                      control={control}
                      render={({ field: { value, onChange } }) => (
                        <Select
                          value={value || undefined}
                          onChange={onChange}
                          showSearch
                          placeholder={t('factoryOrders.formSelectProduct', {
                            defaultValue: 'Выберите товар',
                          })}
                          disabled={noProductsAvailable}
                          options={products.map((p) => ({
                            label: `${p.name} (Штрихкод: ${p.barcode})`,
                            value: p.id,
                          }))}
                          filterOption={(input, option) =>
                            (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                          }
                          style={{ width: '100%', minWidth: 0 }}
                        />
                      )}
                    />
                  </Form.Item>
                  {product && (
                    <Text type="secondary" style={{ fontSize: 11, marginTop: 4, display: 'block' }}>
                      {t('factoryOrders.inOneBoxWithPrice', {
                        count: product.boxQuantity ?? 1,
                        price: product.factoryPrice ?? 0,
                        defaultValue: `В 1 коробке: ${product.boxQuantity ?? 1} шт. | Цена завода: ${product.factoryPrice ?? 0} сом/шт.`,
                      })}
                    </Text>
                  )}
                </Col>

                {/* Количество коробок */}
                <Col xs={12} sm={5}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 11, display: 'block', marginBottom: 4 }}
                  >
                    {t('factoryOrders.formBoxes', { defaultValue: 'Коробок (кор.)' })}
                  </Text>
                  <Form.Item
                    validateStatus={errors.items?.[index]?.qty ? 'error' : ''}
                    help={errors.items?.[index]?.qty?.message}
                    style={{ marginBottom: 0 }}
                  >
                    <Controller
                      name={`items.${index}.qty`}
                      control={control}
                      render={({ field: { value, onChange } }) => (
                        <InputNumber
                          value={value}
                          onChange={(val) => onChange(val ?? 1)}
                          min={1}
                          placeholder={t('factoryOrders.formBoxesPlaceholder', {
                            defaultValue: 'Коробок',
                          })}
                          style={{ width: '100%', minWidth: 0 }}
                        />
                      )}
                    />
                  </Form.Item>
                </Col>

                {/* Расчет штук и суммы */}
                <Col xs={10} sm={6}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 11, display: 'block', marginBottom: 4 }}
                  >
                    {t('factoryOrders.colTotalPcs', { defaultValue: 'Итого' })}
                  </Text>
                  <div
                    style={{
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <Tag
                      color={product ? 'blue' : 'default'}
                      style={{ fontWeight: 600, fontSize: 12, padding: '2px 8px', margin: 0 }}
                    >
                      {totalPcs} {t('common.piecesShort', { defaultValue: 'шт.' })} (
                      <MoneyDisplay amount={lineSum} currencyFormat="short" strong />)
                    </Tag>
                  </div>
                </Col>

                {/* Удаление */}
                <Col xs={2} sm={1} style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      marginTop: 20,
                      height: 32,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {fields.length > 1 && (
                      <Tooltip title={t('common.deleteItem', { defaultValue: 'Удалить позицию' })}>
                        <Button
                          type="text"
                          danger
                          icon={<MinusCircleOutlined />}
                          aria-label={t('common.deleteItem', { defaultValue: 'Удалить позицию' })}
                          onClick={() => remove(index)}
                        />
                      </Tooltip>
                    )}
                  </div>
                </Col>
              </Row>
            </div>
          );
        })}

        {errors.items?.message && (
          <Text type="danger" style={{ display: 'block', marginBottom: 16 }}>
            {errors.items.message}
          </Text>
        )}

        <Button
          type="dashed"
          onClick={() => append({ productId: '', qty: 1 })}
          block
          icon={<PlusOutlined />}
          disabled={noProductsAvailable}
          style={{ marginBottom: 16 }}
        >
          {t('factoryOrders.btnAddProduct', { defaultValue: 'Добавить товар' })}
        </Button>

        {/* Сводка заявки */}
        {fields.length > 0 && (
          <Card
            size="small"
            style={{
              marginBottom: 16,
              background: 'var(--ant-color-fill-quaternary)',
              borderColor: 'var(--ant-color-border)',
            }}
          >
            <Row justify="space-between" align="middle">
              <Col>
                <Space size="large" wrap>
                  <Text>
                    <strong>{t('factoryOrders.totalBoxes', 'Всего коробок:')}</strong>{' '}
                    {totals.totalBoxes} {t('common.boxesShort', { defaultValue: 'кор.' })}
                  </Text>
                  <Text>
                    <strong>{t('factoryOrders.totalPieces', 'Всего штук:')}</strong>{' '}
                    {totals.totalPieces} {t('common.piecesShort', { defaultValue: 'шт.' })}
                  </Text>
                </Space>
              </Col>
              <Col>
                <Typography.Text type="success" strong style={{ fontSize: 15 }}>
                  {t('factoryOrders.estimatedSum', 'Сумма заявки:')}{' '}
                  <MoneyDisplay amount={totals.totalSum} strong />
                </Typography.Text>
              </Col>
            </Row>
          </Card>
        )}

        <Form.Item label={t('factoryOrders.formComment', { defaultValue: 'Комментарий к заявке' })}>
          <Controller
            name="comment"
            control={control}
            render={({ field }) => (
              <Input.TextArea
                {...field}
                rows={3}
                placeholder={t('factoryOrders.formCommentPlaceholder', {
                  defaultValue: 'Необязательно...',
                })}
              />
            )}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
