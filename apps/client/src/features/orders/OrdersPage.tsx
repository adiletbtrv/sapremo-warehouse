import { useMemo, useState, useCallback } from 'react';
import { Typography, Table, Input, Select, Button, Space, Tag, Modal, App, Alert } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { Order, OrderStatus } from '@/types';
import { approveOrder, rejectOrder, issueOrder } from '@/hooks/useOrders';
import { useProducts } from '@/hooks/useProducts';
import { useTranslation } from 'react-i18next';
import { usePaginatedQuery } from '@/hooks/usePaginatedQuery';
import OrderDetailsView from './OrderDetailsView';
import { db } from '@/db/schema';
import { kickSync } from '@/store/syncStore';
import { downloadInvoicePdf } from '@/utils/pdfGenerator';
import { printDriverOrder } from '@/utils/printDriverOrder';
import { mapApiError } from '@/utils/errorMapper';
import { DateDisplay } from '@/components/common/DateDisplay';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

const { Title } = Typography;

export default function OrdersPage() {
  const { t } = useTranslation();
  const { message, modal } = App.useApp();
  const products = useProducts();

  const [searchDriver, setSearchDriver] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const STATUS_META: Record<OrderStatus, { color: string; label: string }> = useMemo(
    () => ({
      NEW: { color: 'orange', label: t('orders.statusPending', { defaultValue: 'Ожидает' }) },
      CONFIRMED: {
        color: 'blue',
        label: t('orders.statusApproved', { defaultValue: 'Подтвержден' }),
      },
      REJECTED: { color: 'red', label: t('orders.statusRejected', { defaultValue: 'Отклонен' }) },
      DISPATCHED: { color: 'green', label: t('orders.statusIssued', { defaultValue: 'Выдан' }) },
      MODIFIED: { color: 'blue', label: t('orders.statusModified', { defaultValue: 'Изменен' }) },
    }),
    [t],
  );

  const [pdfLoading, setPdfLoading] = useState(false);

  const handlePrint = useCallback(() => {
    if (!selectedOrder) return;
    try {
      printDriverOrder(selectedOrder, products);
    } catch {
      void message.error(t('orders.printError', 'Ошибка печати'));
    }
  }, [selectedOrder, products, message, t]);

  const handleDownload = useCallback(async () => {
    if (!selectedOrder) return;
    setPdfLoading(true);
    try {
      const filename = `nakladnaya_${selectedOrder.invoiceNumber ?? selectedOrder.id}.pdf`;
      await downloadInvoicePdf(selectedOrder, filename);
    } catch (err) {
      console.error('[PDF Generator] Download failed, opening HTML print fallback:', err);
      void message.error(
        t('orders.pdfGenerationError', {
          defaultValue: 'Ошибка формирования PDF-файла. Открываю печать...',
        }),
      );
      try {
        printDriverOrder(selectedOrder, products);
      } catch (printErr) {
        console.error('[Print Fallback] Error:', printErr);
      }
    } finally {
      setPdfLoading(false);
    }
  }, [selectedOrder, products, message, t]);

  const STATUS_OPTIONS = useMemo(
    () =>
      (Object.keys(STATUS_META) as OrderStatus[]).map((value) => ({
        value,
        label: STATUS_META[value].label,
      })),
    [STATUS_META],
  );

  const filterFn = useMemo(() => {
    const q = searchDriver.trim().toLowerCase();
    return (o: Order) => {
      const matchesDriver = !q || o.driverName.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || o.status === statusFilter;
      return matchesDriver && matchesStatus;
    };
  }, [searchDriver, statusFilter]);

  const {
    data: paginatedOrders,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    isLoading,
    error: paginatedQueryError,
  } = usePaginatedQuery(db.orders, 10, filterFn, 'date', true);

  const handleApprove = useCallback(
    async (orderId: string) => {
      try {
        await approveOrder(orderId);
        kickSync();
        void message.success(
          t('orders.msgApproved', {
            defaultValue: 'Заявка подтверждена и добавлена в очередь синхронизации',
          }),
        );
      } catch (err) {
        void message.error(
          mapApiError(
            err,
            t('orders.msgApproveError', { defaultValue: 'Ошибка при подтверждении' }),
          ),
        );
      }
    },
    [t, message],
  );

  const handleReject = useCallback(
    async (orderId: string) => {
      try {
        await rejectOrder(orderId);
        kickSync();
        void message.success(t('orders.msgRejected', { defaultValue: 'Заявка отклонена' }));
      } catch (err) {
        void message.error(
          mapApiError(err, t('orders.msgRejectError', { defaultValue: 'Ошибка при отклонении' })),
        );
      }
    },
    [t, message],
  );

  const handleIssueClick = useCallback(
    (tableOrder: Order) => {
      // Pre-validate stock availability before showing confirmation
      void (async () => {
        // Always read fresh order from IndexedDB to pick up saved modifications
        const order = (await db.orders.get(tableOrder.id)) ?? tableOrder;

        const shortages: string[] = [];
        for (const item of order.items) {
          let products = await db.products.where('barcode').equals(item.barcode).toArray();
          if (products.length === 0) {
            const byId = await db.products.get(item.barcode);
            if (byId) products = [byId];
          }
          if (products.length === 0 && item.productName) {
            products = await db.products
              .filter((p) => p.name.trim().toLowerCase() === item.productName.trim().toLowerCase())
              .toArray();
          }
          const totalAvailable = products.reduce((sum, p) => sum + (p.stockQuantity ?? 0), 0);
          if (totalAvailable < item.quantity) {
            const pcsPerBox = products[0]?.boxQuantity ? products[0].boxQuantity : 1;
            const needBoxes = Math.ceil(item.quantity / pcsPerBox);
            const haveBoxes = Math.floor(totalAvailable / pcsPerBox);
            shortages.push(
              `${item.productName || item.barcode}: нужно ${needBoxes} кор., в наличии ${haveBoxes} кор. (не хватает ${needBoxes - haveBoxes} кор.)`,
            );
          }
        }

        if (shortages.length > 0) {
          void message.error({
            content: t('orders.stockShortageBlock', {
              shortages: shortages.join('\n'),
              defaultValue: `Невозможно выдать товар! Не хватает на складе:\n${shortages.join('\n')}`,
            }),
            duration: 6,
          });
          return;
        }

        void modal.confirm({
          title: t('orders.msgIssueTitle', { defaultValue: 'Выдать товар по заявке?' }),
          content: t('orders.msgIssueContent', {
            driverName: order.driverName,
            amount: order.totalAmount,
            defaultValue: `Внимание! Будут списаны остатки со склада и увеличен долг водителя ${order.driverName} на сумму ${order.totalAmount} сом. Будет создана новая расходная накладная.`,
          }),
          okText: t('orders.issueConfirm', { defaultValue: 'Выдать' }),
          cancelText: t('common.cancel', { defaultValue: 'Отмена' }),
          onOk: async () => {
            try {
              await issueOrder(order);
              kickSync();
              void message.success(
                t('orders.msgIssuedSuccess', {
                  defaultValue:
                    'Товар успешно выдан. Новая накладная сохранена в IndexedDB и добавлена в syncQueue!',
                }),
              );

              const allOrders = await db.orders
                .filter((o) => o.driverId === order.driverId && !o.isArchived)
                .toArray();
              const latestIssued = allOrders
                .filter((o) => o.status === 'DISPATCHED')
                .sort((a, b) => dayjs(b.date).diff(dayjs(a.date)))[0];

              if (latestIssued) {
                setSelectedOrder(latestIssued);
                setDetailsOpen(true);
              }
            } catch (err) {
              void message.error(
                mapApiError(err, t('orders.msgIssueError', { defaultValue: 'Ошибка при выдаче' })),
              );
            }
          },
        });
      })();
    },
    [t, message, modal],
  );

  const openDetails = (order: Order) => {
    setSelectedOrder(order);
    setDetailsOpen(true);
  };

  const closeDetails = () => {
    setDetailsOpen(false);
    setSelectedOrder(null);
  };

  const columns: ColumnsType<Order> = useMemo(
    () => [
      {
        title: t('orders.colDriver', { defaultValue: 'Водитель' }),
        dataIndex: 'driverName',
        key: 'driverName',
      },
      {
        title: t('orders.colDate', { defaultValue: 'Дата' }),
        dataIndex: 'date',
        key: 'date',
        width: 130,
        render: (d: string) => <DateDisplay date={d} />,
      },
      {
        title: t('orders.colTotal', { defaultValue: 'Сумма заявки' }),
        dataIndex: 'totalAmount',
        key: 'totalAmount',
        width: 140,
        align: 'right',
        render: (v: number) => <MoneyDisplay amount={v} />,
      },
      {
        title: t('orders.colStatus', { defaultValue: 'Статус' }),
        dataIndex: 'status',
        key: 'status',
        width: 140,
        render: (s: OrderStatus) => (
          <Tag color={STATUS_META[s]?.color}>{STATUS_META[s]?.label ?? s}</Tag>
        ),
      },
      {
        title: t('orders.colActions', { defaultValue: 'Действия' }),
        key: 'actions',
        width: 320,
        render: (_, order) => (
          <Space size="middle">
            <Button size="small" onClick={() => openDetails(order)}>
              {t('orders.btnView', { defaultValue: 'Просмотр' })}
            </Button>

            {(order.status === 'NEW' || order.status === 'MODIFIED') && (
              <>
                <Button
                  size="small"
                  type="primary"
                  ghost
                  onClick={() => void handleApprove(order.id)}
                >
                  {t('orders.btnApprove', { defaultValue: 'Подтвердить' })}
                </Button>
                <Button size="small" danger ghost onClick={() => void handleReject(order.id)}>
                  {t('orders.btnReject', { defaultValue: 'Отклонить' })}
                </Button>
              </>
            )}

            {order.status === 'CONFIRMED' && (
              <Button size="small" type="primary" onClick={() => handleIssueClick(order)}>
                {t('orders.btnIssue', { defaultValue: 'Выдать товар' })}
              </Button>
            )}
          </Space>
        ),
      },
    ],
    [t, STATUS_META, handleApprove, handleReject, handleIssueClick],
  );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div className="page-header">
        <Title level={3} style={{ margin: 0 }}>
          {t('orders.title', { defaultValue: 'Заявки водителей' })}
        </Title>
      </div>

      <div className="page-toolbar">
        <Space wrap>
          <Input.Search
            placeholder={t('orders.searchPlaceholder', { defaultValue: 'Поиск по ФИО водителя' })}
            allowClear
            className="filter-input"
            onChange={(e) => {
              setSearchDriver(e.target.value);
              setPage(1);
            }}
          />
          <Select
            value={statusFilter}
            className="filter-select"
            onChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
            options={[
              { value: 'all', label: t('orders.allStatuses', { defaultValue: 'Все статусы' }) },
              ...STATUS_OPTIONS,
            ]}
          />
        </Space>
      </div>

      {paginatedQueryError && (
        <Alert
          message={t('orders.errorLoadingOrders', { defaultValue: 'Ошибка загрузки заявок' })}
          description={paginatedQueryError.message}
          type="error"
          showIcon
        />
      )}

      <Table<Order>
        rowKey="id"
        columns={columns}
        dataSource={paginatedOrders}
        loading={isLoading}
        pagination={{
          current: page,
          pageSize: pageSize,
          total: total,
          showSizeChanger: true,
          onChange: (p, s) => {
            setPage(p);
            setPageSize(s);
          },
        }}
        scroll={{ x: 'max-content' }}
      />

      <Modal
        centered
        title={
          selectedOrder?.status === 'DISPATCHED'
            ? t('orders.modalTitleIssued', { defaultValue: 'Товарная Накладная (А4)' })
            : t('orders.modalTitlePending', {
                name: selectedOrder?.driverName ?? '',
                defaultValue: `Детали заявки водителя: ${selectedOrder?.driverName ?? ''}`,
              })
        }
        open={detailsOpen}
        onCancel={closeDetails}
        footer={[
          selectedOrder?.status !== 'REJECTED' && (
            <Button
              key="print"
              type="default"
              onClick={() => void handlePrint()}
              loading={pdfLoading}
            >
              {t('orders.btnPrint', { defaultValue: 'Печать PDF' })}
            </Button>
          ),
          selectedOrder?.status !== 'REJECTED' && (
            <Button
              key="download"
              type="primary"
              danger
              loading={pdfLoading}
              onClick={() => void handleDownload()}
              style={{ marginLeft: 8 }}
            >
              {pdfLoading
                ? t('orders.btnGenerating', 'Генерация PDF...')
                : t('common.downloadPdf', 'Скачать PDF')}
            </Button>
          ),
          <Button key="close" onClick={closeDetails} style={{ marginLeft: 8 }}>
            {t('orders.btnClose', { defaultValue: 'Закрыть окно' })}
          </Button>,
        ]}
        width="100%"
        style={{ maxWidth: 850 }}
      >
        {selectedOrder && (
          <OrderDetailsView
            order={selectedOrder}
            onOrderUpdated={() => {
              void (async () => {
                const updated = await db.orders.get(selectedOrder.id);
                if (updated) setSelectedOrder(updated);
              })();
            }}
          />
        )}
      </Modal>
    </Space>
  );
}
