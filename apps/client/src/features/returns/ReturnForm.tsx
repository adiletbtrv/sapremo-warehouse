import {
  Form,
  InputNumber,
  Select,
  Input,
  Button,
  Empty,
  Typography,
  Row,
  Col,
  Space,
  Tag,
  Card,
  Tooltip,
} from 'antd';
import { useMemo } from 'react';
import { Controller, useFormContext, useFieldArray, useWatch } from 'react-hook-form';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { Product, Driver } from '@/types';
import { REASON_OPTIONS } from './reasons';
import type { ReturnFormValues } from './returnForm.schema';
import { useTranslation } from 'react-i18next';
import { roundCurrency } from '@/utils/money';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

const { Option } = Select;
const { Text } = Typography;

interface ReturnFormProps {
  products: Product[];
  drivers: Driver[];
}

export default function ReturnForm({ products, drivers }: ReturnFormProps) {
  const { t } = useTranslation();
  const {
    control,
    formState: { errors },
  } = useFormContext<ReturnFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });

  const uniqueProducts = useMemo(() => {
    const seen = new Set<string>();
    return products.filter((p) => {
      const key = p.barcode || p.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [products]);

  const productsByBarcode = useMemo(
    () => new Map(uniqueProducts.map((p) => [p.barcode, p])),
    [uniqueProducts],
  );

  const rawWatchedItems = useWatch({ control, name: 'items' });
  const watchedItems = useMemo(() => rawWatchedItems ?? [], [rawWatchedItems]);
  const watchedReturnType = useWatch({ control, name: 'returnType' });

  const totals = useMemo(() => {
    let totalBoxes = 0;
    let totalPieces = 0;
    let totalAmount = 0;

    watchedItems.forEach((it) => {
      if (!it?.barcode) return;
      const product = productsByBarcode.get(it.barcode);
      const piecesPerBox =
        product?.boxQuantity && product.boxQuantity > 0 ? product.boxQuantity : 1;
      const boxes = Number(it.boxCount) || 0;
      const loosePieces = Number(it.quantity) || 0;
      const pcs = boxes * piecesPerBox + loosePieces;
      const lineSum = pcs * (product?.factoryPrice ?? 0);

      totalBoxes += boxes;
      totalPieces += pcs;
      totalAmount += lineSum;
    });

    return {
      totalBoxes,
      totalPieces,
      totalAmount: roundCurrency(totalAmount),
    };
  }, [watchedItems, productsByBarcode]);

  const itemsError = errors.items?.root?.message ?? errors.items?.message;

  return (
    <Form
      layout="vertical"
      requiredMark
      style={{ width: '100%' }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          e.preventDefault();
          const modal = e.currentTarget.closest('.ant-modal-content');
          const submitBtn = modal?.querySelector<HTMLButtonElement>('.ant-btn-primary');
          submitBtn?.click();
        }
      }}
    >
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <Form.Item
            label={t('returns.lblReturnType', { defaultValue: 'Тип возврата' })}
            validateStatus={errors.returnType ? 'error' : ''}
            help={errors.returnType?.message}
          >
            <Controller
              name="returnType"
              control={control}
              render={({ field }) => (
                <Select {...field}>
                  <Option value="from_driver">
                    {t('returns.typeFromDriver', { defaultValue: 'От водителя (на склад)' })}
                  </Option>
                  <Option value="to_factory">
                    {t('returns.typeToFactory', { defaultValue: 'Со склада (на завод)' })}
                  </Option>
                </Select>
              )}
            />
          </Form.Item>
        </Col>

        <Controller
          name="returnType"
          control={control}
          render={({ field: { value: returnType } }) => {
            if (returnType !== 'from_driver') return <></>;
            return (
              <Col xs={24} sm={12}>
                <Form.Item
                  label={t('returns.lblDriver', { defaultValue: 'Водитель' })}
                  validateStatus={errors.driverId ? 'error' : ''}
                  help={errors.driverId?.message}
                  required
                >
                  <Controller
                    name="driverId"
                    control={control}
                    render={({ field }) => (
                      <Select
                        {...field}
                        showSearch
                        placeholder={t('returns.phSelectDriver', {
                          defaultValue: 'Выберите водителя',
                        })}
                        optionFilterProp="children"
                        style={{ width: '100%' }}
                      >
                        {drivers.map((d) => (
                          <Option key={d.id} value={d.id}>
                            {d.fullName}
                            {d.vehicleNumber ? ` (${d.vehicleNumber})` : ''}
                          </Option>
                        ))}
                      </Select>
                    )}
                  />
                </Form.Item>
              </Col>
            );
          }}
        />
      </Row>

      <div style={{ marginTop: 8 }}>
        <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>
          {t('returns.itemsTitle', { defaultValue: 'Товары в возврате' })}
        </Text>

        {fields.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('returns.emptyNoItems', { defaultValue: 'Товары не добавлены' })}
            style={{ margin: '16px 0' }}
          />
        )}

        {fields.map((row, index) => {
          const currentItem = watchedItems[index];
          const product = currentItem?.barcode
            ? productsByBarcode.get(currentItem.barcode)
            : undefined;
          const piecesPerBox = product?.boxQuantity ?? 1;
          const boxes = Number(currentItem?.boxCount) || 0;
          const loose = Number(currentItem?.quantity) || 0;
          const totalPcs = boxes * piecesPerBox + loose;
          const unitPrice = product?.factoryPrice ?? 0;
          const itemTotalAmount = roundCurrency(totalPcs * unitPrice);

          return (
            <div
              key={row.id}
              style={{
                background: 'var(--ant-color-fill-alter)',
                padding: '12px',
                borderRadius: 8,
                border: '1px solid var(--ant-color-border-secondary)',
                marginBottom: '12px',
              }}
            >
              <Row gutter={[12, 8]} align="top">
                {/* 1. Товар */}
                <Col xs={24} sm={8}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                  >
                    {t('returns.colProduct', 'Товар')}
                  </Text>
                  <Form.Item
                    style={{ marginBottom: 0 }}
                    validateStatus={errors.items?.[index]?.barcode ? 'error' : ''}
                    help={errors.items?.[index]?.barcode?.message}
                  >
                    <Controller
                      name={`items.${index}.barcode`}
                      control={control}
                      render={({ field }) => (
                        <Select
                          {...field}
                          showSearch
                          placeholder={t('returns.phSelectProduct', { defaultValue: 'Товар' })}
                          optionFilterProp="children"
                          popupMatchSelectWidth={false}
                          style={{ width: '100%' }}
                        >
                          {uniqueProducts.map((p, pIndex) => (
                            <Option key={p.id ?? `${p.barcode}_${pIndex}`} value={p.barcode}>
                              {p.name} ({p.barcode})
                            </Option>
                          ))}
                        </Select>
                      )}
                    />
                  </Form.Item>
                  <Text
                    type="secondary"
                    style={{
                      fontSize: 11,
                      marginTop: 4,
                      display: 'block',
                      minHeight: 18,
                      visibility: product ? 'visible' : 'hidden',
                    }}
                  >
                    {t('common.inBox', {
                      count: product?.boxQuantity ?? 1,
                      defaultValue: `В 1 кор: ${product?.boxQuantity ?? 1} шт.`,
                    })}{' '}
                    |{' '}
                    {t('common.price', {
                      price: product?.factoryPrice ?? 0,
                      defaultValue: `Цена: ${product?.factoryPrice ?? 0} с`,
                    })}
                  </Text>
                </Col>

                {/* 2. Коробки */}
                <Col xs={12} sm={4}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                  >
                    {t('returns.colBoxes', 'Коробки (кор.)')}
                  </Text>
                  <Form.Item style={{ marginBottom: 0 }}>
                    <Controller
                      name={`items.${index}.boxCount`}
                      control={control}
                      render={({ field }) => (
                        <InputNumber {...field} min={0} placeholder="0" style={{ width: '100%' }} />
                      )}
                    />
                  </Form.Item>
                </Col>

                {/* 3. Штук без коробки */}
                <Col xs={12} sm={4}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                  >
                    {t('returns.colLoosePcs', 'Штук без кор.')}
                  </Text>
                  <Form.Item
                    style={{ marginBottom: 0 }}
                    validateStatus={errors.items?.[index]?.quantity ? 'error' : ''}
                    help={errors.items?.[index]?.quantity?.message}
                  >
                    <Controller
                      name={`items.${index}.quantity`}
                      control={control}
                      render={({ field }) => (
                        <InputNumber {...field} min={0} placeholder="0" style={{ width: '100%' }} />
                      )}
                    />
                  </Form.Item>
                </Col>

                {/* 4. Расчет Итого */}
                <Col xs={14} sm={4}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                  >
                    {t('returns.colTotal', 'Итого')}
                  </Text>
                  <div style={{ height: 32, display: 'flex', alignItems: 'center' }}>
                    <Tag
                      color="blue"
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        padding: '4px 8px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {totalPcs} {t('common.piecesShort', 'шт.')} ={' '}
                      <MoneyDisplay amount={itemTotalAmount} currencyFormat="short" strong />
                    </Tag>
                  </div>
                </Col>

                {/* 5. Причина */}
                <Col xs={8} sm={3}>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, display: 'block', marginBottom: 4 }}
                  >
                    {t('returns.colReason', 'Причина')}
                  </Text>
                  <Form.Item
                    style={{ marginBottom: 0 }}
                    validateStatus={errors.items?.[index]?.reason ? 'error' : ''}
                    help={errors.items?.[index]?.reason?.message}
                  >
                    <Controller
                      name={`items.${index}.reason`}
                      control={control}
                      render={({ field }) => (
                        <Select
                          {...field}
                          placeholder={t('returns.phReason', { defaultValue: 'Причина' })}
                          style={{ width: '100%' }}
                        >
                          {REASON_OPTIONS.map((o) => (
                            <Option key={o.value} value={o.value}>
                              {t(`returns.reason_${o.value}`, { defaultValue: o.label })}
                            </Option>
                          ))}
                        </Select>
                      )}
                    />
                  </Form.Item>
                </Col>

                {/* 6. Удалить */}
                <Col xs={2} sm={1} style={{ textAlign: 'center' }}>
                  <div style={{ height: 18, marginBottom: 4 }} />
                  <Tooltip title={t('common.deleteItem', { defaultValue: 'Удалить позицию' })}>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={t('common.deleteItem', { defaultValue: 'Удалить позицию' })}
                      onClick={() => remove(index)}
                      style={{ height: 32, width: 32 }}
                    />
                  </Tooltip>
                </Col>
              </Row>
            </div>
          );
        })}

        {itemsError && (
          <Text type="danger" style={{ display: 'block', marginTop: 4 }}>
            {itemsError}
          </Text>
        )}

        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => append({ barcode: '', boxCount: 1, quantity: 0, reason: 'unsold' })}
          style={{ marginTop: 8 }}
        >
          {t('returns.btnAddProduct', { defaultValue: 'Добавить товар' })}
        </Button>

        {/* Dynamic Return Summary Card */}
        {fields.length > 0 && (
          <Card
            size="small"
            style={{
              marginTop: 16,
              background: 'var(--ant-color-fill-quaternary)',
              borderColor: 'var(--ant-color-border)',
            }}
          >
            <Row justify="space-between" align="middle">
              <Col>
                <Space size="large" wrap>
                  <Text>
                    <strong>{t('returns.totalBoxes', 'Всего коробок:')}</strong> {totals.totalBoxes}{' '}
                    {t('common.boxesShort', 'кор.')}
                  </Text>
                  <Text>
                    <strong>{t('returns.totalPieces', 'Всего штук:')}</strong> {totals.totalPieces}{' '}
                    {t('common.piecesShort', 'шт.')}
                  </Text>
                </Space>
              </Col>
              <Col>
                <Typography.Text type="success" strong style={{ fontSize: 16 }}>
                  {watchedReturnType === 'to_factory'
                    ? t('returns.totalSumToFactory', 'Сумма возврата на завод:')
                    : t('returns.totalSumFromDriver', 'Сумма списания долга водителя:')}{' '}
                  <MoneyDisplay amount={totals.totalAmount} strong />
                </Typography.Text>
              </Col>
            </Row>
          </Card>
        )}
      </div>

      <Form.Item
        label={t('returns.lblNotes', { defaultValue: 'Примечание' })}
        style={{ marginTop: 16 }}
      >
        <Controller
          name="notes"
          control={control}
          render={({ field }) => (
            <Input.TextArea
              {...field}
              rows={2}
              placeholder={t('returns.phNotes', { defaultValue: 'Необязательно' })}
            />
          )}
        />
      </Form.Item>
    </Form>
  );
}
