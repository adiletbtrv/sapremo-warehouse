import {
  App,
  Form,
  Input,
  InputNumber,
  Select,
  DatePicker,
  Button,
  Typography,
  Tag,
  Row,
  Col,
  Empty,
  Tooltip,
} from 'antd';
import { useMemo, useState, useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { Controller, useFormContext, useFieldArray, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { Product } from '@/types';
import type { ReceiptFormValues } from './receiptForm.schema';
import { roundCurrency } from '@/utils/money';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { playFeedbackSound } from '@/utils/soundFeedback';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

const { Text } = Typography;

interface ReceiptFormProps {
  products: Product[];
  scannerEnabled?: boolean;
}

export default function ReceiptForm({ products, scannerEnabled = true }: ReceiptFormProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const {
    control,
    setValue,
    formState: { errors },
  } = useFormContext<ReceiptFormValues>();
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const [highlightedBarcode, setHighlightedBarcode] = useState<string | null>(null);

  // Auto-clear visual row highlight after 1.5 seconds
  useEffect(() => {
    if (!highlightedBarcode) return;
    const timer = setTimeout(() => setHighlightedBarcode(null), 1500);
    return () => clearTimeout(timer);
  }, [highlightedBarcode]);

  const uniqueProducts = useMemo(() => {
    const seen = new Set<string>();
    return products.filter((p) => {
      const key = p.barcode || p.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [products]);

  const watchedItems = useWatch({ control, name: 'items' });
  const productsByBarcode = useMemo(
    () => new Map(uniqueProducts.map((p) => [p.barcode, p])),
    [uniqueProducts],
  );
  const itemsError = errors.items?.root?.message ?? errors.items?.message;

  // Real-time Hardware Barcode Scanner integration for rapid pallet / box scanning
  const handleBarcodeScan = useCallback(
    (scannedBarcode: string) => {
      const clean = scannedBarcode.trim();
      if (!clean) return;

      const product =
        productsByBarcode.get(clean) ??
        uniqueProducts.find((p) => p.barcode === clean || p.id === clean);

      if (!product) {
        playFeedbackSound('error');
        void message.error(
          t('scanner.unknownBarcode', {
            barcode: clean,
            defaultValue: `Неизвестный штрих-код: ${clean}`,
          }),
        );
        return;
      }

      const currentItems = watchedItems ?? [];
      const existingIndex = currentItems.findIndex((item) => item?.barcode === product.barcode);

      if (existingIndex !== -1) {
        const currentBoxes = currentItems[existingIndex]?.quantityBoxes ?? 0;
        const newBoxes = currentBoxes + 1;
        setValue(`items.${existingIndex}.quantityBoxes`, newBoxes, {
          shouldDirty: true,
          shouldValidate: true,
        });
        setHighlightedBarcode(product.barcode);
        playFeedbackSound('success');
        void message.success(
          t('scanner.incrementedBox', {
            name: product.name,
            count: newBoxes,
            defaultValue: `${product.name}: ${newBoxes} кор.`,
          }),
        );
      } else {
        append({
          barcode: product.barcode,
          quantityBoxes: 1,
        });
        setHighlightedBarcode(product.barcode);
        playFeedbackSound('success');
        void message.success(
          t('scanner.addedBox', {
            name: product.name,
            defaultValue: `+1 кор: ${product.name}`,
          }),
        );
      }
    },
    [productsByBarcode, uniqueProducts, watchedItems, setValue, append, t, message],
  );

  useBarcodeScanner({
    enabled: scannerEnabled,
    onScan: handleBarcodeScan,
  });

  const totalSum = useMemo(() => {
    const rawSum = (watchedItems ?? []).reduce((sum, item) => {
      if (!item?.barcode || !item?.quantityBoxes) return sum;
      const product = productsByBarcode.get(item.barcode);
      if (!product) return sum;
      const pieces = item.quantityBoxes * (product.boxQuantity ?? 0);
      return sum + pieces * (product.factoryPrice ?? 0);
    }, 0);
    return roundCurrency(rawSum);
  }, [watchedItems, productsByBarcode]);

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
        <Col xs={24} sm={8}>
          <Form.Item
            label={t('receipts.supplier', 'Поставщик')}
            required
            validateStatus={errors.supplierName ? 'error' : ''}
            help={errors.supplierName?.message}
          >
            <Controller
              name="supplierName"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder={t('receipts.supplierPlaceholder', 'Введите имя поставщика')}
                  allowClear
                />
              )}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item
            label={t('receipts.invoiceNumber', { defaultValue: 'Номер накладной' })}
            validateStatus={errors.invoiceNumber ? 'error' : ''}
            help={errors.invoiceNumber?.message}
          >
            <Controller
              name="invoiceNumber"
              control={control}
              render={({ field }) => (
                <Input
                  {...field}
                  placeholder={t('receipts.invoicePlaceholder', 'Авто: дата-время-Поставщик')}
                  allowClear
                />
              )}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={8}>
          <Form.Item
            label={t('receipts.date', { defaultValue: 'Дата поставки' })}
            required
            validateStatus={errors.date ? 'error' : ''}
            help={errors.date?.message}
          >
            <Controller
              name="date"
              control={control}
              render={({ field }) => (
                <DatePicker {...field} style={{ width: '100%' }} format="DD.MM.YYYY" />
              )}
            />
          </Form.Item>
        </Col>
      </Row>

      <div style={{ marginTop: 8 }}>
        <Text strong style={{ fontSize: 15, display: 'block', marginBottom: 12 }}>
          {t('receipts.itemsTitle', { defaultValue: 'Товары в поставке' })}
        </Text>

        {fields.length === 0 && (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={t('receipts.noItemsAdded', 'Товары не добавлены')}
            style={{ margin: '16px 0' }}
          />
        )}

        {fields.length > 0 && (
          <Row
            gutter={12}
            style={{
              fontWeight: 600,
              fontSize: 12,
              marginBottom: 8,
              padding: '0 8px',
              display: 'flex',
              alignItems: 'center',
            }}
            className="hidden-mobile"
          >
            <Col span={9}>{t('receipts.colProductName', 'Наименование товара')}</Col>
            <Col span={3} style={{ textAlign: 'center' }}>
              {t('receipts.colPcsInBox', 'В коробке шт')}
            </Col>
            <Col span={4} style={{ textAlign: 'center' }}>
              {t('receipts.colBoxQty', 'Количество коробок (шт)')}
            </Col>
            <Col span={3} style={{ textAlign: 'right' }}>
              {t('receipts.colUnitPrice', 'Цена за 1 шт')}
            </Col>
            <Col span={4} style={{ textAlign: 'right' }}>
              {t('receipts.colLineTotal', 'Общая сумма')}
            </Col>
            <Col span={1} style={{ textAlign: 'center' }}></Col>
          </Row>
        )}

        {fields.map((row, index) => {
          const currentBarcode = watchedItems?.[index]?.barcode;
          const currentBoxes = watchedItems?.[index]?.quantityBoxes ?? 0;
          const selectedProduct = currentBarcode ? productsByBarcode.get(currentBarcode) : null;
          const piecesPerBox = selectedProduct?.boxQuantity ?? 0;
          const totalPieces = currentBoxes * piecesPerBox;
          const lineSum = totalPieces * (selectedProduct?.factoryPrice ?? 0);

          const isHighlighted = Boolean(currentBarcode) && currentBarcode === highlightedBarcode;

          return (
            <div
              key={row.id}
              style={{
                background: isHighlighted
                  ? 'rgba(82, 196, 26, 0.12)'
                  : 'var(--ant-color-fill-alter)',
                padding: '12px',
                borderRadius: 8,
                border: isHighlighted
                  ? '1px solid #52c41a'
                  : '1px solid var(--ant-color-border-secondary)',
                marginBottom: '12px',
                boxShadow: isHighlighted ? '0 0 8px rgba(82, 196, 26, 0.35)' : 'none',
                transition: 'all 0.35s ease',
              }}
            >
              <Row gutter={[12, 8]} align="middle">
                {/* 1. Товар */}
                <Col xs={24} md={9} style={{ minWidth: 0 }}>
                  <Text
                    type="secondary"
                    className="visible-mobile"
                    style={{ fontSize: 11, marginBottom: 2 }}
                  >
                    {t('receipts.colProductName', 'Наименование товара')}
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
                          placeholder={t('receipts.selectProduct', 'Выберите товар')}
                          optionFilterProp="label"
                          popupMatchSelectWidth={false}
                          style={{ width: '100%', minWidth: 0 }}
                          options={uniqueProducts.map((p, pIndex) => {
                            const batchInfo = p.batchNumber ? ` • ${p.batchNumber}` : '';
                            const expiryInfo = p.expirationDate
                              ? ` (до ${dayjs(p.expirationDate).format('DD.MM.YYYY')})`
                              : '';
                            const fullText = `${p.name} (${p.barcode})${batchInfo}${expiryInfo}`;
                            return {
                              key: p.id ?? `${p.barcode}_${pIndex}`,
                              value: p.barcode,
                              label: fullText,
                              title: fullText,
                            };
                          })}
                        />
                      )}
                    />
                  </Form.Item>
                </Col>

                {/* 2. В коробке (шт) */}
                <Col xs={12} sm={6} md={3} style={{ textAlign: 'center' }}>
                  <Text
                    type="secondary"
                    className="visible-mobile"
                    style={{ fontSize: 11, marginBottom: 2 }}
                  >
                    {t('receipts.colPcsInBox', 'В коробке шт')}
                  </Text>
                  <Tag color="blue" style={{ fontSize: 13, padding: '2px 8px', margin: 0 }}>
                    {selectedProduct ? `${piecesPerBox} ${t('common.pcsUnit', 'шт')}` : '—'}
                  </Tag>
                </Col>

                {/* 3. Количество коробок (шт) */}
                <Col xs={12} sm={6} md={4}>
                  <Text
                    type="secondary"
                    className="visible-mobile"
                    style={{ fontSize: 11, marginBottom: 2 }}
                  >
                    {t('receipts.colBoxQty', 'Количество коробок (шт)')}
                  </Text>
                  <Form.Item
                    style={{ marginBottom: 0 }}
                    validateStatus={errors.items?.[index]?.quantityBoxes ? 'error' : ''}
                    help={errors.items?.[index]?.quantityBoxes?.message}
                  >
                    <Controller
                      name={`items.${index}.quantityBoxes`}
                      control={control}
                      render={({ field }) => (
                        <InputNumber
                          {...field}
                          min={1}
                          placeholder={t('stock.colBoxes', 'Коробок')}
                          style={{ width: '100%', minWidth: 0 }}
                        />
                      )}
                    />
                  </Form.Item>
                </Col>

                {/* 4. Цена за 1 шт */}
                <Col xs={12} sm={6} md={3} style={{ textAlign: 'right' }}>
                  <Text
                    type="secondary"
                    className="visible-mobile"
                    style={{ fontSize: 11, marginBottom: 2 }}
                  >
                    {t('receipts.colUnitPrice', 'Цена за 1 шт')}
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: 500 }}>
                    {selectedProduct
                      ? `${selectedProduct.factoryPrice} ${t('common.currency', 'сом')}`
                      : '—'}
                  </Text>
                </Col>

                {/* 5. Итого стоимость */}
                <Col xs={10} sm={5} md={4} style={{ textAlign: 'right' }}>
                  <Text
                    type="secondary"
                    className="visible-mobile"
                    style={{ fontSize: 11, marginBottom: 2 }}
                  >
                    {t('receipts.colLineTotal', 'Общая сумма')}
                  </Text>
                  <MoneyDisplay
                    amount={selectedProduct ? lineSum : 0}
                    strong
                    style={{ fontSize: 14 }}
                  />
                </Col>

                {/* 6. Кнопка удаления */}
                <Col xs={2} sm={1} md={1} style={{ textAlign: 'center' }}>
                  <Tooltip title={t('common.deleteItem', { defaultValue: 'Удалить позицию' })}>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={t('common.deleteItem', { defaultValue: 'Удалить позицию' })}
                      onClick={() => remove(index)}
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

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 16,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            onClick={() =>
              append({
                barcode: '',
                quantityBoxes: 1,
              })
            }
          >
            {t('common.add', { defaultValue: 'Добавить товар' })}
          </Button>

          <Text strong style={{ fontSize: 16 }}>
            {t('receipts.totalLabel', 'Общая сумма:')}{' '}
            <MoneyDisplay amount={totalSum} strong style={{ fontSize: 18 }} />
          </Text>
        </div>
      </div>
    </Form>
  );
}
