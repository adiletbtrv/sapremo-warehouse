import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  App,
  Alert,
  Button,
  InputNumber,
  Table,
  Space,
  Row,
  Col,
  Typography,
  Progress,
  Tag,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import dayjs from 'dayjs';
import { CheckCircleOutlined, ScanOutlined } from '@ant-design/icons';
import { db } from '@/db/schema';
import { useSyncStore } from '@/store/syncStore';
import type { Order, OrderItem } from '@/types';
import { roundCurrency } from '@/utils/money';
import { useProducts } from '@/hooks/useProducts';
import { useBarcodeScanner } from '@/hooks/useBarcodeScanner';
import { playFeedbackSound } from '@/utils/soundFeedback';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

const { Text } = Typography;

const getOrderDetailsSchema = (t: TFunction) => {
  const orderItemSchema = z.object({
    barcode: z.string(),
    productName: z.string(),
    quantity: z
      .number()
      .min(0.01, t('validation.mustBeGreaterThanZero', { defaultValue: 'Должно быть больше 0' })),
    boxCount: z
      .number()
      .min(0, t('validation.cannotBeNegative', { defaultValue: 'Не может быть меньше 0' })),
    unitPrice: z
      .number()
      .min(0.01, t('validation.mustBeGreaterThanZero', { defaultValue: 'Должно быть больше 0' })),
    amount: z
      .number()
      .min(0.01, t('validation.mustBeGreaterThanZero', { defaultValue: 'Должно быть больше 0' })),
  });

  return z.object({
    items: z.array(orderItemSchema),
  });
};

type FormValues = z.infer<ReturnType<typeof getOrderDetailsSchema>>;

interface OrderDetailsViewProps {
  order: Order;
  onOrderUpdated?: () => void;
}

export default function OrderDetailsView({ order, onOrderUpdated }: OrderDetailsViewProps) {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const products = useProducts();

  const [scannedCounts, setScannedCounts] = useState<Record<string, number>>({});
  const [lastScannedBarcode, setLastScannedBarcode] = useState<string | null>(null);
  const savingRef = useRef(false);
  const lastAppliedOrderSnapshotRef = useRef('');

  useEffect(() => {
    if (!lastScannedBarcode) return;
    const timer = setTimeout(() => setLastScannedBarcode(null), 1500);
    return () => clearTimeout(timer);
  }, [lastScannedBarcode]);

  const productsByBarcode = useMemo(() => new Map(products.map((p) => [p.barcode, p])), [products]);
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const sanitizedItems = useMemo(() => {
    return (order.items || []).map((item) => {
      const prod =
        productsByBarcode.get(item.barcode) ??
        productsById.get(item.barcode) ??
        products.find(
          (p) =>
            p.barcode === item.barcode ||
            p.id === item.barcode ||
            (item.productName && p.name.toLowerCase() === item.productName.toLowerCase()),
        );
      const pcsPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;

      let boxCount = item.boxCount ?? 0;
      let quantity = item.quantity ?? 0;
      let amount = item.amount ?? 0;

      // Если в старых данных базы boxCount был 0 (было сохранено 3 штуки вместо 3 коробок)
      if (boxCount <= 0 && quantity > 0) {
        boxCount = Math.round(quantity);
        quantity = boxCount * pcsPerBox;
        amount = roundCurrency(quantity * item.unitPrice);
      } else if (boxCount > 0) {
        quantity = boxCount * pcsPerBox;
        amount = roundCurrency(quantity * item.unitPrice);
      }

      return {
        ...item,
        boxCount: boxCount > 0 ? boxCount : 1,
        quantity: quantity > 0 ? quantity : boxCount > 0 ? boxCount * pcsPerBox : pcsPerBox,
        amount: amount > 0 ? amount : roundCurrency((quantity || pcsPerBox) * item.unitPrice),
      };
    });
  }, [order.items, productsByBarcode, productsById, products]);

  const orderSnapshot = useMemo(
    () =>
      JSON.stringify({
        id: order.id,
        items: order.items,
        totalAmount: order.totalAmount,
      }),
    [order.id, order.items, order.totalAmount],
  );

  // Самовосстановление старых поврежденных записей в IndexedDB
  useEffect(() => {
    const hasDefects = (order.items || []).some((it) => {
      const prod =
        productsByBarcode.get(it.barcode) ??
        productsById.get(it.barcode) ??
        products.find(
          (p) =>
            p.barcode === it.barcode ||
            p.id === it.barcode ||
            (it.productName && p.name.toLowerCase() === it.productName.toLowerCase()),
        );
      const pcsPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
      return (
        !it.boxCount ||
        it.boxCount <= 0 ||
        (pcsPerBox > 1 && it.boxCount > 0 && it.quantity === it.boxCount) ||
        (it.boxCount > 0 && it.quantity !== it.boxCount * pcsPerBox)
      );
    });
    if (hasDefects && sanitizedItems.length > 0) {
      const fixedTotal = roundCurrency(sanitizedItems.reduce((sum, it) => sum + it.amount, 0));
      void db.orders.update(order.id, {
        items: sanitizedItems,
        totalAmount: fixedTotal > 0 ? fixedTotal : order.totalAmount,
      });
    }
  }, [
    order.id,
    order.items,
    order.totalAmount,
    sanitizedItems,
    productsByBarcode,
    productsById,
    products,
  ]);

  const schema = useMemo(() => getOrderDetailsSchema(t), [t]);

  const {
    control,
    reset,
    handleSubmit,
    setValue,
    formState: { isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      items: sanitizedItems,
    },
  });

  useEffect(() => {
    lastAppliedOrderSnapshotRef.current = '';
  }, [order.id]);

  useEffect(() => {
    if (lastAppliedOrderSnapshotRef.current === orderSnapshot || isDirty) return;

    lastAppliedOrderSnapshotRef.current = orderSnapshot;
    reset({ items: sanitizedItems });
    setScannedCounts({});
  }, [orderSnapshot, sanitizedItems, reset, isDirty]);

  const rawWatchedItems = useWatch({ control, name: 'items' });
  const watchedItems = useMemo(() => rawWatchedItems ?? [], [rawWatchedItems]);

  const isReadOnly = order.status === 'DISPATCHED' || order.status === 'REJECTED';

  const totalAmount = useMemo(() => {
    if (isReadOnly) {
      const sum = roundCurrency(sanitizedItems.reduce((acc, it) => acc + (it.amount ?? 0), 0));
      return sum > 0 ? sum : order.totalAmount || 0;
    }
    const watchedSum = roundCurrency(
      watchedItems.reduce((sum, item) => sum + (item?.amount ?? 0), 0),
    );
    if (watchedSum > 0) return watchedSum;
    const sanitizedSum = roundCurrency(
      sanitizedItems.reduce((acc, it) => acc + (it.amount ?? 0), 0),
    );
    return sanitizedSum > 0 ? sanitizedSum : order.totalAmount || 0;
  }, [isReadOnly, sanitizedItems, watchedItems, order.totalAmount]);

  // Stock shortage detection
  const stockShortages = useMemo(() => {
    if (isReadOnly) return [];
    const shortages: { name: string; needBoxes: number; haveBoxes: number; deficit: number }[] = [];
    for (const item of watchedItems) {
      const prod = productsByBarcode.get(item?.barcode) ?? productsById.get(item?.barcode);
      const pcsPerBox = prod?.boxQuantity ? prod.boxQuantity : 1;
      const requestedBoxes = Math.ceil((item?.quantity ?? 0) / pcsPerBox);
      const availablePcs = prod?.stockQuantity ?? 0;
      const availableBoxes = Math.floor(availablePcs / pcsPerBox);
      if (requestedBoxes > availableBoxes) {
        shortages.push({
          name: item?.productName || item?.barcode || 'Неизвестный товар',
          needBoxes: requestedBoxes,
          haveBoxes: availableBoxes,
          deficit: requestedBoxes - availableBoxes,
        });
      }
    }
    return shortages;
  }, [watchedItems, productsByBarcode, productsById, isReadOnly]);

  // Compute required boxes per item
  const itemTargetBoxes = useMemo(() => {
    const sourceItems = !isReadOnly && watchedItems.length > 0 ? watchedItems : sanitizedItems;
    return (sourceItems || []).map((item) => {
      return Math.max(1, Math.round(item?.boxCount ?? 1));
    });
  }, [isReadOnly, watchedItems, sanitizedItems]);

  const totalRequiredBoxes = useMemo(() => {
    return itemTargetBoxes.reduce((sum, b) => sum + b, 0);
  }, [itemTargetBoxes]);

  const totalScannedBoxes = useMemo(() => {
    return (sanitizedItems || []).reduce((sum, item, idx) => {
      const target = itemTargetBoxes[idx] ?? 1;
      const scanned = scannedCounts[item.barcode] ?? 0;
      return sum + Math.min(scanned, target);
    }, 0);
  }, [sanitizedItems, itemTargetBoxes, scannedCounts]);

  const isFullyPicked = totalRequiredBoxes > 0 && totalScannedBoxes >= totalRequiredBoxes;
  const progressPercent =
    totalRequiredBoxes > 0
      ? Math.min(100, Math.round((totalScannedBoxes / totalRequiredBoxes) * 100))
      : 100;

  // Real-time scanner integration: match barcode or productId
  const handleBarcodeScan = useCallback(
    (scannedBarcode: string) => {
      const clean = scannedBarcode.trim();
      if (!clean) return;

      const scannedProduct = productsByBarcode.get(clean) ?? productsById.get(clean);

      // Match item by direct barcode, productId or catalog reverse mapping
      const matchedIndex = sanitizedItems.findIndex((item) => {
        if (item.barcode === clean) return true;
        if (
          scannedProduct &&
          (item.barcode === scannedProduct.id || item.barcode === scannedProduct.barcode)
        ) {
          return true;
        }
        const itemProd = productsByBarcode.get(item.barcode) ?? productsById.get(item.barcode);
        if (itemProd && (itemProd.barcode === clean || itemProd.id === clean)) {
          return true;
        }
        return false;
      });

      if (matchedIndex === -1) {
        playFeedbackSound('error');
        void message.error(
          t('scanner.itemNotInOrder', {
            defaultValue: 'Этот товар отсутствует в заявке водителя!',
          }),
        );
        return;
      }

      const matchedItem = sanitizedItems[matchedIndex];
      const targetBoxes = itemTargetBoxes[matchedIndex] ?? 1;
      const currentScanned = scannedCounts[matchedItem.barcode] ?? 0;

      if (currentScanned >= targetBoxes) {
        playFeedbackSound('warning');
        void message.warning(
          t('scanner.overQuantity', { defaultValue: 'Количество превышает требуемое в заказе!' }),
        );
        return;
      }

      const nextScanned = currentScanned + 1;
      setScannedCounts((prev) => ({
        ...prev,
        [matchedItem.barcode]: nextScanned,
      }));
      setLastScannedBarcode(matchedItem.barcode);
      playFeedbackSound('success');

      if (totalScannedBoxes + 1 >= totalRequiredBoxes) {
        void message.success(
          t('scanner.orderFullyPicked', { defaultValue: 'Все позиции собраны!' }),
        );
      } else {
        void message.info(
          t('scanner.incrementedBox', {
            name: matchedItem.productName,
            count: `${nextScanned}/${targetBoxes}`,
            defaultValue: `${matchedItem.productName}: ${nextScanned}/${targetBoxes} кор.`,
          }),
        );
      }
    },
    [
      productsByBarcode,
      productsById,
      sanitizedItems,
      itemTargetBoxes,
      scannedCounts,
      totalScannedBoxes,
      totalRequiredBoxes,
      t,
      message,
    ],
  );

  useBarcodeScanner({
    enabled: !isReadOnly,
    onScan: handleBarcodeScan,
  });

  const onValidSubmit = async (data: FormValues) => {
    if (savingRef.current) return;
    savingRef.current = true;
    try {
      const fixedItems = data.items.map((item) => {
        const prod = productsByBarcode.get(item.barcode) ?? productsById.get(item.barcode);
        const pcsPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
        const boxCount =
          item.boxCount != null && item.boxCount >= 0 ? Math.round(item.boxCount) : 1;
        const quantity = boxCount * pcsPerBox;
        const amount = roundCurrency(quantity * item.unitPrice);
        return {
          ...item,
          boxCount,
          quantity,
          amount,
        };
      });
      const calculatedTotal = roundCurrency(fixedItems.reduce((sum, it) => sum + it.amount, 0));

      await db.transaction('rw', [db.orders, db.syncQueue], async () => {
        await db.orders.update(order.id, {
          items: fixedItems,
          totalAmount: calculatedTotal,
          status: order.status === 'NEW' ? 'MODIFIED' : order.status,
          localUpdatedAt: dayjs().toISOString(),
        });

        await useSyncStore.getState().addToQueue({
          action: 'MODIFY_ORDER',
          payload: {
            id: order.id,
            items: fixedItems,
            totalAmount: calculatedTotal,
            status: order.status === 'NEW' ? 'MODIFIED' : order.status,
          },
        });
      });

      void message.success(
        t('orders.msgUpdateSuccess', {
          defaultValue: 'Количество изменено локально и добавлено в syncQueue',
        }),
      );
      reset({ items: fixedItems });
      lastAppliedOrderSnapshotRef.current = JSON.stringify({
        id: order.id,
        items: fixedItems,
        totalAmount: calculatedTotal,
      });
      onOrderUpdated?.();
    } catch {
      void message.error(
        t('orders.msgUpdateError', { defaultValue: 'Не удалось сохранить изменения количества' }),
      );
    } finally {
      savingRef.current = false;
    }
  };

  const onInvalidSubmit = () => {
    void message.error(
      t('orders.msgInvalidForm', {
        defaultValue: 'Пожалуйста, проверьте форму на наличие ошибок заполнения',
      }),
    );
  };

  const editableColumns: ColumnsType<OrderItem> = [
    {
      title: t('orders.colProduct', { defaultValue: 'Товар' }),
      dataIndex: 'productName',
      key: 'productName',
      render: (name: string, record, index) => {
        const originalItem = sanitizedItems[index] ?? record;
        const prod =
          productsByBarcode.get(record.barcode) ??
          productsById.get(record.barcode) ??
          productsById.get(name) ??
          products.find(
            (p) =>
              p.barcode === record.barcode ||
              p.id === record.barcode ||
              (name && p.name.toLowerCase() === name.toLowerCase()),
          );
        const pcsPerBox = prod?.boxQuantity ? prod.boxQuantity : 1;
        const origBoxes = Math.max(1, Math.round(originalItem?.boxCount ?? 1));
        const origPcs = Math.round(originalItem?.quantity ?? origBoxes * pcsPerBox);

        const availablePcs = prod?.stockQuantity ?? 0;
        const availableBoxes = Math.floor(availablePcs / pcsPerBox);
        const currentToIssueBoxes = Math.round(
          watchedItems[index]?.boxCount ?? record.boxCount ?? 0,
        );
        const isShort = !isReadOnly && currentToIssueBoxes > availableBoxes;
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}/i.test(name);
        const displayName = prod?.name ?? (!isUuid && name ? name : (prod?.name ?? name));

        return (
          <Space direction="vertical" size={0}>
            <span style={{ fontWeight: 500 }}>{displayName}</span>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {t('orders.orderedByDriver', {
                boxes: origBoxes,
                pieces: origPcs,
                defaultValue: 'Заказано водителем: {{boxes}} кор. ({{pieces}} шт.)',
              })}
            </Text>
            <Text
              type={isShort ? 'danger' : 'secondary'}
              style={{ fontSize: 11, fontWeight: isShort ? 600 : 400 }}
            >
              {isShort
                ? t('orders.inStockShortage', {
                    boxes: availableBoxes,
                    deficit: currentToIssueBoxes - availableBoxes,
                    defaultValue: 'На складе: {{boxes}} кор. (не хватает {{deficit}} кор.)',
                  })
                : t('orders.inStock', {
                    boxes: availableBoxes,
                    defaultValue: 'На складе: {{boxes}} кор.',
                  })}
            </Text>
          </Space>
        );
      },
    },
    {
      title: t('orders.colBoxCountToIssue', { defaultValue: 'Коробок к выдаче' }),
      dataIndex: 'boxCount',
      key: 'boxCount',
      width: 150,
      render: (_, record, index) => (
        <Controller
          control={control}
          name={`items.${index}.boxCount`}
          render={({ field, fieldState: { error } }) => {
            const prod = productsByBarcode.get(record.barcode) ?? productsById.get(record.barcode);
            const pcsPerBox = prod?.boxQuantity
              ? prod.boxQuantity
              : sanitizedItems[index] && sanitizedItems[index].boxCount > 0
                ? Math.round(sanitizedItems[index].quantity / sanitizedItems[index].boxCount)
                : 12;
            const currentBoxCount =
              field.value != null && !isNaN(field.value)
                ? Math.round(field.value)
                : record.boxCount != null && !isNaN(record.boxCount)
                  ? Math.round(record.boxCount)
                  : 0;

            return (
              <Space direction="vertical" size={0}>
                <InputNumber
                  disabled={isReadOnly}
                  min={0}
                  precision={0}
                  size="small"
                  status={error ? 'error' : ''}
                  value={currentBoxCount}
                  onChange={(value) => {
                    const newBoxCount = value != null ? Math.max(0, Math.round(value)) : 0;
                    field.onChange(newBoxCount);

                    const newQuantity = newBoxCount * pcsPerBox;
                    setValue(`items.${index}.quantity`, newQuantity, { shouldDirty: true });

                    const newAmount = roundCurrency(newQuantity * record.unitPrice);
                    setValue(`items.${index}.amount`, newAmount, { shouldDirty: true });
                  }}
                />
                {error && (
                  <Text type="danger" style={{ fontSize: 11 }}>
                    {error.message}
                  </Text>
                )}
              </Space>
            );
          }}
        />
      ),
    },
    {
      title: t('orders.colPcsPerBox', { defaultValue: 'В 1 коробке' }),
      key: 'pcsPerBox',
      align: 'right',
      render: (_, record) => {
        const prod = productsByBarcode.get(record.barcode) ?? productsById.get(record.barcode);
        return (
          prod?.boxQuantity ??
          (record.boxCount > 0 ? Math.round(record.quantity / record.boxCount) : '—')
        );
      },
    },
    {
      title: t('orders.colQuantity', { defaultValue: 'Штук всего' }),
      dataIndex: 'quantity',
      key: 'quantity',
      align: 'right',
      width: 100,
      render: (_, record, index) => {
        const prod = productsByBarcode.get(record.barcode) ?? productsById.get(record.barcode);
        const pcsPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
        const currentQty = isReadOnly
          ? record.boxCount != null && record.boxCount > 0
            ? record.boxCount * pcsPerBox
            : record.quantity
          : (watchedItems[index]?.quantity ??
            (record.boxCount ? record.boxCount * pcsPerBox : record.quantity));
        return Math.round(currentQty);
      },
    },
    {
      title: t('orders.colUnitPrice', { defaultValue: 'Цена за шт.' }),
      dataIndex: 'unitPrice',
      key: 'unitPrice',
      align: 'right',
      render: (v: number | undefined) => <MoneyDisplay amount={v ?? 0} currencyFormat="short" />,
    },
    {
      title: t('scanner.colScanned', { defaultValue: 'Отсканировано' }),
      key: 'scanned',
      align: 'center',
      width: 170,
      render: (_, record, index) => {
        const target = itemTargetBoxes[index] ?? 1;
        const scanned = scannedCounts[record.barcode] ?? 0;
        const isDone = scanned >= target;
        const isRecent = record.barcode === lastScannedBarcode;

        return (
          <Space size={4}>
            <Tag
              color={isDone ? 'success' : scanned > 0 ? 'processing' : 'default'}
              style={{
                fontWeight: 600,
                transform: isRecent ? 'scale(1.08)' : 'scale(1)',
                transition: 'all 0.3s ease',
              }}
            >
              {scanned} / {target} {t('stock.colBoxes', 'кор.')}
            </Tag>
            {isDone && (
              <Tag color="success" icon={<CheckCircleOutlined />}>
                {t('scanner.badgeComplete', 'Готово')}
              </Tag>
            )}
          </Space>
        );
      },
    },
    {
      title: t('orders.colAmount', { defaultValue: 'Итог' }),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      render: (_, record, index) => {
        const prod = productsByBarcode.get(record.barcode) ?? productsById.get(record.barcode);
        const pcsPerBox = prod?.boxQuantity && prod.boxQuantity > 0 ? prod.boxQuantity : 1;
        const currentBoxes = isReadOnly
          ? record.boxCount != null && record.boxCount > 0
            ? record.boxCount
            : 1
          : (watchedItems[index]?.boxCount ?? record.boxCount ?? 1);
        const currentQty = currentBoxes * pcsPerBox;
        const itemAmount = isReadOnly
          ? record.boxCount
            ? roundCurrency(currentQty * record.unitPrice)
            : (record.amount ?? roundCurrency(record.quantity * record.unitPrice))
          : (watchedItems[index]?.amount ?? roundCurrency(currentQty * record.unitPrice));
        return <MoneyDisplay amount={itemAmount} currencyFormat="short" strong />;
      },
    },
  ];

  return (
    <Space
      direction="vertical"
      size="middle"
      style={{ width: '100%' }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
          e.preventDefault();
          if (isDirty) {
            void handleSubmit(onValidSubmit, onInvalidSubmit)();
          }
        }
      }}
    >
      {/* Read-only Alert Notification */}
      {isReadOnly && (
        <Alert
          message={
            order.status === 'CONFIRMED'
              ? t(
                  'orders.alertConfirmedOrder',
                  'Заявка подтверждена. Корректировка позиций завершена, выполняется сборка и выдача товара.',
                )
              : t(
                  'orders.alertCompletedOrder',
                  'Заказ завершен или отменен. Редактирование заблокировано.',
                )
          }
          type={order.status === 'CONFIRMED' ? 'info' : 'warning'}
          showIcon
          style={{ marginBottom: 4 }}
        />
      )}

      {/* Stock shortage alert */}
      {stockShortages.length > 0 && (
        <Alert
          type="error"
          showIcon
          message={t('orders.stockShortageTitle', { defaultValue: 'Не хватает товара на складе!' })}
          description={
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {stockShortages.map((s) => (
                <li key={s.name} style={{ color: '#cf1322', fontWeight: 600 }}>
                  {t('orders.shortageItemDesc', {
                    name: s.name,
                    need: s.needBoxes,
                    have: s.haveBoxes,
                    defaultValue: '{{name}}: нужно {{need}} кор., в наличии {{have}} кор.',
                  })}
                  <Tag color="error" style={{ marginLeft: 8 }}>
                    {t('orders.shortageDeficitTag', {
                      deficit: s.deficit,
                      defaultValue: 'не хватает {{deficit}} кор.',
                    })}
                  </Tag>
                </li>
              ))}
            </ul>
          }
          style={{ borderColor: '#ff4d4f' }}
        />
      )}

      {/* Visual Assembly & Picking Progress Bar */}
      <div
        style={{
          background: 'var(--ant-color-fill-alter)',
          border: '1px solid var(--ant-color-border-secondary)',
          borderRadius: 8,
          padding: '12px 16px',
        }}
      >
        <Row justify="space-between" align="middle" style={{ marginBottom: 6 }}>
          <Col>
            <Space>
              <ScanOutlined
                style={{ color: isFullyPicked ? '#52c41a' : '#1890ff', fontSize: 16 }}
              />
              <Text strong style={{ fontSize: 14 }}>
                {t('scanner.pickedProgress', {
                  picked: totalScannedBoxes,
                  total: totalRequiredBoxes,
                  percent: progressPercent,
                  defaultValue: `Собрано: ${totalScannedBoxes} / ${totalRequiredBoxes} кор. (${progressPercent}%)`,
                })}
              </Text>
            </Space>
          </Col>
          <Col>
            {isFullyPicked ? (
              <Tag
                color="success"
                icon={<CheckCircleOutlined />}
                style={{ fontSize: 13, padding: '2px 8px' }}
              >
                {t('scanner.orderFullyPicked', 'Все позиции собраны!')}
              </Tag>
            ) : (
              <Text type="secondary" style={{ fontSize: 12 }}>
                {!isReadOnly
                  ? t('orders.scanPrompt', {
                      defaultValue: 'Сканируйте штрих-код товара для сборки',
                    })
                  : t('orders.viewCompletedOrder', {
                      defaultValue: 'Просмотр завершенного заказа',
                    })}
              </Text>
            )}
          </Col>
        </Row>
        <Progress
          percent={progressPercent}
          status={isFullyPicked ? 'success' : 'active'}
          strokeColor={isFullyPicked ? '#52c41a' : '#1890ff'}
          showInfo={false}
        />
      </div>

      <Table<OrderItem>
        className="nested-table"
        rowKey="barcode"
        dataSource={sanitizedItems}
        columns={editableColumns}
        pagination={false}
        size="small"
        rowClassName={(record) =>
          record.barcode === lastScannedBarcode ? 'scan-highlight-row' : ''
        }
      />

      <Row justify="space-between" align="middle" style={{ marginTop: 10 }}>
        <Col>
          {isDirty && (
            <Button
              type="primary"
              danger
              onClick={() => {
                void handleSubmit(onValidSubmit, onInvalidSubmit)();
              }}
            >
              {t('orders.btnSaveQuantity', { defaultValue: 'Сохранить изменения количества' })}
            </Button>
          )}
        </Col>
        <Col style={{ marginLeft: 'auto' }}>
          <strong>
            {t('orders.totalAmountLabel', { defaultValue: 'Общая сумма:' })}{' '}
            <MoneyDisplay amount={totalAmount} currencyFormat="short" strong />
          </strong>
        </Col>
      </Row>
    </Space>
  );
}
