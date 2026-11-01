import { useState, useMemo } from 'react';
import { App, Typography, Table, Button, Space, Tag, Modal, Alert, Tooltip } from 'antd';
import {
  FileExcelOutlined,
  PrinterOutlined,
  PlusOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import dayjs from 'dayjs';
import { addReceipt } from '@/hooks/useReceipts';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import { useProducts } from '@/hooks/useProducts';
import { db } from '@/db/schema';
import type { GoodsReceipt, ReceiptItem } from '@/types';
import { exportToExcel } from '@/utils/exportExcel';
import { printReceipt } from '@/utils/printReceipt';
import EmptyState from '@/components/EmptyState';
import './receipts.css';
import { useTranslation } from 'react-i18next';
import ReceiptForm from './ReceiptForm';
import { getReceiptSchema, type ReceiptFormValues } from './receiptForm.schema';
import { mapApiError } from '@/utils/errorMapper';
import { DateDisplay } from '@/components/common/DateDisplay';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import { roundCurrency } from '@/utils/money';

const { Title, Text } = Typography;

export default function ReceiptsPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const {
    data: paginatedReceipts,
    page,
    pageSize,
    setPage,
    setPageSize,
    isLoading,
    error: paginatedQueryError,
  } = usePaginatedQuery(db.receipts, 10, undefined, 'date', true);

  const receipts = paginatedReceipts;
  const products = useProducts();
  const productsByBarcode = useMemo(() => new Map(products.map((p) => [p.barcode, p])), [products]);

  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const STATUS_META: Record<GoodsReceipt['status'], { color: string; label: string }> = useMemo(
    () => ({
      draft: { color: 'default', label: t('receipts.statusDraft', 'Черновик') },
      completed: { color: 'green', label: t('receipts.statusCompleted', 'Принята') },
    }),
    [t],
  );

  const schema = useMemo(() => getReceiptSchema(t), [t]);

  const methods = useForm<ReceiptFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: dayjs(), invoiceNumber: '', items: [] },
  });

  const openCreate = () => {
    methods.reset({ date: dayjs(), invoiceNumber: '', items: [] });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    methods.reset({ date: dayjs(), invoiceNumber: '', items: [] });
  };

  const onValid = async (values: ReceiptFormValues) => {
    setSaving(true);
    try {
      const items: ReceiptItem[] = values.items.map((it) => {
        const product = productsByBarcode.get(it.barcode);
        const piecesPerBox = product?.boxQuantity ?? 0;
        const totalPieces = it.quantityBoxes * piecesPerBox;
        return {
          barcode: it.barcode,
          productName: product?.name ?? it.barcode,
          expectedQuantity: totalPieces,
          actualQuantity: totalPieces,
          discrepancyType: 'none',
          factoryPrice: product?.factoryPrice ?? 0,
        };
      });

      const invalidBoxItems = items.filter((it) => {
        const product = productsByBarcode.get(it.barcode);
        return !product?.boxQuantity || product.boxQuantity <= 0;
      });
      if (invalidBoxItems.length > 0) {
        const names = invalidBoxItems.map((it) => it.productName).join(', ');
        void message.error(
          t('receipts.errorInvalidBoxQuantity', {
            names,
            defaultValue: `Для следующих товаров не указано количество в коробке: ${names}. Обновите карточку товара.`,
          }),
        );
        return;
      }

      const itemsWithoutPrice = items.filter((it) => !it.factoryPrice || it.factoryPrice <= 0);
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

      const totalAmount = roundCurrency(
        items.reduce((sum, it) => sum + it.actualQuantity * it.factoryPrice, 0),
      );

      const dateStr = dayjs(values.date).format('YYYYMMDD-HHmmss');
      const invoiceNumber = values.invoiceNumber?.trim()
        ? values.invoiceNumber.trim()
        : `${dateStr}-${values.supplierName}`;

      const receipt: GoodsReceipt = {
        id: invoiceNumber,
        date: dayjs(values.date).format('YYYY-MM-DD'),
        items,
        totalAmount,
        status: 'completed',
        supplierName: values.supplierName,
      };

      await addReceipt(receipt);

      void message.success(t('receipts.msgSuccess', 'Поставка успешно оформлена'));
      closeModal();
    } catch (err) {
      void message.error(
        mapApiError(
          err,
          t('receipts.msgCreateError', { defaultValue: 'Ошибка при создании поступления' }),
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    const allReceipts = await db.receipts
      .orderBy('date')
      .reverse()
      .filter((r) => !r.isArchived)
      .toArray();
    if (allReceipts.length === 0) {
      void message.info(t('receipts.msgNoData', 'Нет поставок для экспорта'));
      return;
    }
    void exportToExcel(
      allReceipts,
      [
        {
          header: 'Дата',
          value: (r) => dayjs(r.date).format('DD.MM.YYYY'),
        },
        {
          header: 'Номер накладной',
          value: (r) => r.id,
        },
        {
          header: 'Товаров',
          value: (r) => r.items.length,
        },
        { header: 'Сумма (сом)', value: (r) => r.totalAmount },
        {
          header: 'Статус',
          value: (r) => STATUS_META[r.status]?.label ?? r.status,
        },
      ],
      'postavki',
      'Поставки',
    );
  };

  const columns: ColumnsType<GoodsReceipt> = useMemo(
    () => [
      {
        title: t('receipts.colDate', 'Дата'),
        dataIndex: 'date',
        key: 'date',
        width: 130,
        render: (d: string) => <DateDisplay date={d} />,
      },
      {
        title: t('receipts.colInvoice', 'Номер накладной'),
        dataIndex: 'id',
        key: 'id',
        width: 180,
        render: (id: string) => (
          <Text style={{ fontFamily: 'monospace', fontWeight: 600 }}>
            {id.length > 20 ? `${id.slice(0, 16)}...` : id}
          </Text>
        ),
      },
      {
        title: t('receipts.colItems', 'Товаров'),
        key: 'itemsCount',
        width: 100,
        align: 'right',
        render: (_, r) => r.items.length,
      },
      {
        title: t('receipts.colTotal', 'Сумма'),
        dataIndex: 'totalAmount',
        key: 'totalAmount',
        width: 140,
        align: 'right',
        render: (v: number) => <MoneyDisplay amount={v} />,
      },
      {
        title: t('receipts.colStatus', 'Статус'),
        dataIndex: 'status',
        key: 'status',
        width: 120,
        render: (s: GoodsReceipt['status']) => (
          <Tag color={STATUS_META[s]?.color}>{STATUS_META[s]?.label ?? s}</Tag>
        ),
      },
      {
        title: t('common.actions', 'Действия'),
        key: 'actions',
        width: 200,
        render: (_, receipt) => (
          <Tooltip title={t('receipts.btnPrint', 'Распечатать накладную')}>
            <Button
              size="small"
              icon={<PrinterOutlined />}
              aria-label={t('receipts.btnPrint', 'Распечатать накладную')}
              onClick={() => printReceipt(receipt, products)}
            >
              {t('receipts.btnPrint', 'Распечатать накладную')}
            </Button>
          </Tooltip>
        ),
      },
    ],
    [STATUS_META, products, t],
  );

  const expandedRowRender = (receipt: GoodsReceipt) => (
    <Table<ReceiptItem>
      className="nested-table"
      rowKey="barcode"
      size="small"
      pagination={false}
      dataSource={receipt.items}
      columns={[
        {
          title: t('common.product', 'Товар'),
          dataIndex: 'productName',
          key: 'productName',
        },
        {
          title: t('stock.colBoxes', 'Коробок'),
          key: 'boxes',
          align: 'right',
          render: (_, item) => {
            const product = productsByBarcode.get(item.barcode);
            const piecesPerBox = product?.boxQuantity ?? 1;
            const boxes = Math.floor(item.actualQuantity / piecesPerBox);
            return boxes > 0 ? boxes : item.actualQuantity;
          },
        },
        {
          title: t('stock.colPcsPerBox', 'Шт/кор'),
          key: 'piecesPerBox',
          align: 'right',
          render: (_, item) => {
            const product = productsByBarcode.get(item.barcode);
            return product?.boxQuantity ?? '—';
          },
        },
        {
          title: t('stock.colTotalPcs', 'Итого штук'),
          dataIndex: 'actualQuantity',
          key: 'actualQuantity',
          align: 'right',
        },
        {
          title: t('receipts.colTotal', 'Сумма'),
          key: 'sum',
          align: 'right',
          render: (_, item) => <MoneyDisplay amount={item.actualQuantity * item.factoryPrice} />,
        },
      ]}
    />
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Title level={2} style={{ margin: 0, fontSize: 24, fontWeight: 700 }}>
          {t('receipts.title', { defaultValue: 'Поставки' })}
        </Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            loading={syncing}
            onClick={() => {
              void (async () => {
                setSyncing(true);
                try {
                  const { pullSync } = await import('@/hooks/useBackgroundSync');
                  await pullSync();
                  void message.success(
                    t('receipts.msgSyncSuccess', { defaultValue: 'Поставки синхронизированы' }),
                  );
                } catch {
                  void message.error(
                    t('receipts.msgSyncError', { defaultValue: 'Ошибка синхронизации' }),
                  );
                } finally {
                  setSyncing(false);
                }
              })();
            }}
          >
            {t('common.sync', { defaultValue: 'Синхронизировать' })}
          </Button>
          <Button icon={<FileExcelOutlined />} onClick={() => void handleExport()}>
            {t('receipts.btnExport', { defaultValue: 'Экспорт в Excel' })}
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            className="shadow-btn"
          >
            {t('receipts.btnCreate', { defaultValue: 'Новая поставка' })}
          </Button>
        </Space>
      </div>

      {paginatedQueryError && (
        <Alert
          message={t('receipts.errorLoad', 'Ошибка загрузки поставок')}
          description={paginatedQueryError.message}
          type="error"
          showIcon
        />
      )}

      <Table<GoodsReceipt>
        rowKey="id"
        columns={columns}
        dataSource={receipts}
        loading={isLoading}
        expandable={{ expandedRowRender }}
        pagination={{
          current: page,
          pageSize: pageSize,
          showSizeChanger: true,
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
        }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState
              description={t('receipts.emptyText', 'Поставок пока нет')}
              action={
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                  {t('receipts.btnCreate', 'Новая поставка')}
                </Button>
              }
            />
          ),
        }}
      />

      <Modal
        centered
        title={t('receipts.btnCreate', 'Новая поставка')}
        open={modalOpen}
        onOk={() => {
          if (saving) return;
          void methods.handleSubmit(onValid)();
        }}
        onCancel={closeModal}
        confirmLoading={saving}
        okButtonProps={{ disabled: saving }}
        okText={t('common.save', 'Сохранить')}
        cancelText={t('common.cancel', 'Отмена')}
        width="90%"
        style={{ maxWidth: 960 }}
      >
        {products.length === 0 ? (
          <Text type="secondary">
            {t('receipts.emptyProducts', 'Сначала добавьте товары в справочник.')}
          </Text>
        ) : (
          <FormProvider {...methods}>
            <ReceiptForm products={products} scannerEnabled={modalOpen} />
          </FormProvider>
        )}
      </Modal>
    </Space>
  );
}
