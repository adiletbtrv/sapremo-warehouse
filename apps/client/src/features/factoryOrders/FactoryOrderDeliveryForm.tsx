import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Modal, Form, Input, InputNumber, DatePicker, Table, Typography, App, Space } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { FactoryOrder } from '@/types';
import { resolveFactoryOrderNumber } from '@/utils/factoryOrderNumber';
import { enrichFactoryOrderItems } from '@/utils/factoryOrderStatus';
import { createDeliveryFromFactoryOrder } from '@/hooks/useFactoryOrderDelivery';
import { mapApiError } from '@/utils/errorMapper';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

const { Text } = Typography;

const dayjsSchema = z.custom<Dayjs>((val) => val != null && dayjs.isDayjs(val), {
  message: 'Выберите дату',
});

const getDeliverySchema = (t: TFunction) =>
  z.object({
    date: dayjsSchema,
    invoiceSuffix: z
      .string()
      .min(
        1,
        t('factoryOrders.deliveryInvoiceRequired', { defaultValue: 'Укажите номер накладной' }),
      ),
    items: z
      .array(
        z.object({
          productId: z.string(),
          productName: z.string(),
          qty: z
            .number()
            .min(1, t('factoryOrders.errQtyMin', { defaultValue: 'Количество должно быть > 0' })),
        }),
      )
      .min(1, t('factoryOrders.errMinOneProduct', { defaultValue: 'Добавьте хотя бы один товар' })),
  });

type FormValues = z.infer<ReturnType<typeof getDeliverySchema>>;

interface FactoryOrderDeliveryFormProps {
  open: boolean;
  order: FactoryOrder | null;
  onClose: () => void;
}

export default function FactoryOrderDeliveryForm({
  open,
  order,
  onClose,
}: FactoryOrderDeliveryFormProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const allOrders = useLiveQuery(() => db.factoryOrders.orderBy('date').toArray(), [], []);
  const products = useLiveQuery(() => db.products.filter((p) => !p.isArchived).toArray(), [], []);

  const orderNumber = useMemo(() => {
    if (!order) return 1;
    return resolveFactoryOrderNumber(order, allOrders);
  }, [order, allOrders]);

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(getDeliverySchema(t)),
    defaultValues: {
      date: dayjs(),
      invoiceSuffix: '',
      items: [],
    },
  });

  const watchedItems = watch('items');
  const lastOrderIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      lastOrderIdRef.current = null;
      return;
    }

    if (open && order && lastOrderIdRef.current !== order.id) {
      lastOrderIdRef.current = order.id;
      const enrichedItems = enrichFactoryOrderItems(
        order.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          productName: it.productName ?? '',
          qty: it.qty,
        })),
        products,
      );

      reset({
        date: dayjs(),
        invoiceSuffix: '',
        items: enrichedItems.map((it) => ({
          productId: it.productId,
          productName: it.productName ?? '',
          qty: it.qty,
        })),
      });
    }
  }, [open, order, products, reset]);

  const getProduct = useCallback(
    (productId?: string, productName?: string) => {
      const idStr = String(productId ?? '').trim();
      const nameStr = String(productName ?? '')
        .trim()
        .toLowerCase();
      return (
        products.find((p) => String(p.id).trim() === idStr) ??
        products.find((p) => String(p.barcode).trim() === idStr) ??
        (nameStr ? products.find((p) => p.name.trim().toLowerCase() === nameStr) : undefined)
      );
    },
    [products],
  );

  const totalSum = useMemo(() => {
    return (watchedItems ?? []).reduce((sum, item) => {
      const product = getProduct(item.productId, item.productName);
      const piecesPerBox =
        product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
      const totalPieces = (item.qty ?? 0) * piecesPerBox;
      return sum + totalPieces * (product?.factoryPrice ?? 0);
    }, 0);
  }, [watchedItems, getProduct]);

  const columns: ColumnsType<FormValues['items'][number] & { key: number }> = useMemo(
    () => [
      {
        title: t('factoryOrders.deliveryColProduct', { defaultValue: 'Товар' }),
        dataIndex: 'productName',
        key: 'productName',
        render: (name: string, record) => {
          const product = getProduct(record.productId, record.productName);
          return (
            <div>
              <Text strong>{name}</Text>
              {product && (
                <Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                  {t('factoryOrders.deliveryInBox', {
                    count: product.boxQuantity ?? 1,
                    defaultValue: `В 1 кор: ${product.boxQuantity ?? 1} шт.`,
                  })}
                </Text>
              )}
            </div>
          );
        },
      },
      {
        title: t('factoryOrders.deliveryColBoxes', { defaultValue: 'Коробок (кор.)' }),
        key: 'qty',
        width: 140,
        render: (_: unknown, _record, index) => (
          <Controller
            name={`items.${index}.qty`}
            control={control}
            render={({ field: { value, onChange } }) => (
              <InputNumber
                value={value}
                onChange={(val) => onChange(val ?? 1)}
                min={1}
                style={{ width: '100%' }}
              />
            )}
          />
        ),
      },
      {
        title: t('factoryOrders.deliveryColTotalPieces', { defaultValue: 'Всего (шт)' }),
        key: 'totalPieces',
        width: 120,
        align: 'right' as const,
        render: (_: unknown, record, index) => {
          const qty = watchedItems?.[index]?.qty ?? record.qty;
          const product = getProduct(record.productId, record.productName);
          const piecesPerBox =
            product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
          return `${qty * piecesPerBox} ${t('common.piecesShort', { defaultValue: 'шт.' })}`;
        },
      },
      {
        title: t('factoryOrders.deliveryColPrice', { defaultValue: 'Цена за 1 шт' }),
        key: 'price',
        width: 120,
        align: 'right' as const,
        render: (_: unknown, record) => {
          const product = getProduct(record.productId, record.productName);
          const price = product?.factoryPrice ?? 0;
          return price > 0 ? <MoneyDisplay amount={price} /> : '—';
        },
      },
      {
        title: t('factoryOrders.deliveryColTotal', { defaultValue: 'Сумма' }),
        key: 'total',
        width: 130,
        align: 'right' as const,
        render: (_: unknown, record, index) => {
          const qty = watchedItems?.[index]?.qty ?? record.qty;
          const product = getProduct(record.productId, record.productName);
          const piecesPerBox =
            product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
          const price = product?.factoryPrice ?? 0;
          const lineTotal = qty * piecesPerBox * price;
          return lineTotal > 0 ? <MoneyDisplay amount={lineTotal} /> : '—';
        },
      },
    ],
    [t, control, getProduct, watchedItems],
  );

  const isSubmittingRef = useRef(false);

  const onSubmit = async (values: FormValues) => {
    if (!order || isSubmittingRef.current || loading) return;

    const itemsWithoutPrice = values.items.filter((item) => {
      const product = getProduct(item.productId, item.productName);
      return !product?.factoryPrice || product.factoryPrice <= 0;
    });

    if (itemsWithoutPrice.length > 0) {
      const names = itemsWithoutPrice.map((it) => it.productName).join(', ');
      void message.error(
        t('receipts.errorNoPrice', {
          names,
          defaultValue: `Для следующих товаров не указана заводская цена: ${names}. Обновите карточку товара.`,
        }),
      );
      return;
    }

    const invoiceNumber = `${orderNumber}-${values.invoiceSuffix.trim()}`;

    isSubmittingRef.current = true;
    setLoading(true);
    try {
      await createDeliveryFromFactoryOrder({
        order,
        invoiceNumber,
        date: values.date.format('YYYY-MM-DD'),
        items: values.items,
      });

      void message.success(
        t('factoryOrders.deliverySuccess', { defaultValue: 'Поставка успешно оформлена' }),
      );
      onClose();
    } catch (err) {
      void message.error(
        mapApiError(
          err,
          t('factoryOrders.deliveryError', { defaultValue: 'Ошибка при создании поставки' }),
        ),
      );
    } finally {
      setLoading(false);
      isSubmittingRef.current = false;
    }
  };

  const tableData = (watchedItems ?? []).map((item, index) => ({ ...item, key: index }));

  return (
    <Modal
      centered
      title={t('factoryOrders.deliveryModalTitle', { defaultValue: 'Создать поставку из заявки' })}
      open={open}
      onCancel={onClose}
      onOk={() => {
        if (loading || isSubmittingRef.current) return;
        void handleSubmit(onSubmit)();
      }}
      confirmLoading={loading}
      okButtonProps={{ disabled: loading, loading }}
      okText={t('factoryOrders.deliveryBtnSave', { defaultValue: 'Сохранить поставку' })}
      cancelText={t('common.cancel', { defaultValue: 'Отмена' })}
      width="100%"
      style={{ maxWidth: 800 }}
      destroyOnHidden
    >
      {order && (
        <>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            {t('factoryOrders.deliverySubtitle', {
              number: orderNumber,
              date: dayjs(order.date).format('DD.MM.YYYY HH:mm'),
              defaultValue: 'Заявка №{{number}} от {{date}}',
            })}
            {order.comment ? ` — ${order.comment}` : ''}
          </Text>

          <Form
            layout="vertical"
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                (e.target as HTMLElement).tagName !== 'TEXTAREA'
              ) {
                e.preventDefault();
                void handleSubmit(onSubmit)();
              }
            }}
          >
            <Form.Item
              label={t('factoryOrders.deliveryInvoiceLabel', { defaultValue: 'Номер накладной' })}
              required
              validateStatus={errors.invoiceSuffix ? 'error' : ''}
              help={errors.invoiceSuffix?.message}
            >
              <Controller
                name="invoiceSuffix"
                control={control}
                render={({ field }) => (
                  <Space.Compact style={{ width: '100%' }}>
                    <Input
                      style={{ width: '20%', minWidth: 60, textAlign: 'center' }}
                      disabled
                      value={`${orderNumber}-`}
                    />
                    <Input
                      {...field}
                      style={{ width: '80%' }}
                      placeholder={t('factoryOrders.deliveryInvoicePlaceholder', {
                        defaultValue: 'Номер накладной',
                      })}
                    />
                  </Space.Compact>
                )}
              />
            </Form.Item>

            <Form.Item
              label={t('factoryOrders.deliveryDate', { defaultValue: 'Дата поставки' })}
              validateStatus={errors.date ? 'error' : ''}
              help={errors.date?.message}
            >
              <Controller
                name="date"
                control={control}
                render={({ field: { value, onChange } }) => (
                  <DatePicker
                    value={value}
                    onChange={onChange}
                    format="DD.MM.YYYY"
                    style={{ width: '100%' }}
                  />
                )}
              />
            </Form.Item>

            <Table
              columns={columns}
              dataSource={tableData}
              pagination={false}
              size="small"
              scroll={{ x: 'max-content' }}
              style={{ marginBottom: 16 }}
            />

            {errors.items?.message && (
              <Text type="danger" style={{ display: 'block', marginBottom: 8 }}>
                {errors.items.message}
              </Text>
            )}

            <Text strong>
              {t('factoryOrders.deliveryTotalLabel', { defaultValue: 'Общая сумма:' })}{' '}
              <MoneyDisplay amount={totalSum} strong />
            </Text>
          </Form>
        </>
      )}
    </Modal>
  );
}
