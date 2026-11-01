import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Button, Table, Typography, Space, Tag, App, Tooltip } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, ReloadOutlined, PrinterOutlined, InboxOutlined } from '@ant-design/icons';
import { printFactoryOrder } from '@/utils/printFactoryOrder';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import type { FactoryOrder, FactoryOrderStatus } from '@/types';
import { factoryClient } from '@/api/client';
import { useTranslation } from 'react-i18next';
import EmptyState from '@/components/EmptyState';
import FactoryOrderForm from './FactoryOrderForm';
import FactoryOrderDeliveryForm from './FactoryOrderDeliveryForm';
import { DateDisplay } from '@/components/common/DateDisplay';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';
import {
  canCreateDeliveryFromOrder,
  mergeFactoryOrders,
  mapApiFactoryOrder,
  getDeliveredFactoryOrderIds,
  enrichFactoryOrderItems,
  type ApiFactoryOrderInput,
} from '@/utils/factoryOrderStatus';

const { Title, Text } = Typography;

const POLL_INTERVAL_MS = 30_000;

export default function FactoryOrdersPage() {
  const { t } = useTranslation();
  const { message } = App.useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deliveryOrder, setDeliveryOrder] = useState<FactoryOrder | null>(null);
  const [loading, setLoading] = useState(false);

  const products = useLiveQuery(() => db.products.filter((p) => !p.isArchived).toArray(), [], []);

  const STATUS_MAP: Record<FactoryOrderStatus, { color: string; text: string }> = useMemo(
    () => ({
      pending: {
        color: 'gold',
        text: t('factoryOrders.statusPending', { defaultValue: 'В обработке' }),
      },
      approved: {
        color: 'green',
        text: t('factoryOrders.statusApproved', { defaultValue: 'Одобрено' }),
      },
      rejected: {
        color: 'red',
        text: t('factoryOrders.statusRejected', { defaultValue: 'Отклонено' }),
      },
      delivered: {
        color: 'blue',
        text: t('factoryOrders.statusDelivered', { defaultValue: 'Поставлено' }),
      },
    }),
    [t],
  );

  const renderStatus = useCallback(
    (status: FactoryOrderStatus) => {
      const mapped = STATUS_MAP[status] ?? { color: 'default', text: status };
      return <Tag color={mapped.color}>{mapped.text}</Tag>;
    },
    [STATUS_MAP],
  );

  const productsById = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  const columns: ColumnsType<FactoryOrder> = useMemo(
    () => [
      {
        title: t('factoryOrders.colDate', { defaultValue: 'Дата создания' }),
        dataIndex: 'date',
        key: 'date',
        render: (val: string) => <DateDisplay date={val} pattern="dateTime" />,
      },
      {
        title: t('factoryOrders.colItemsCount', { defaultValue: 'Товаров (позиций)' }),
        dataIndex: 'items',
        key: 'items',
        render: (items: FactoryOrder['items']) => items?.length ?? 0,
      },
      {
        title: t('factoryOrders.colComment', { defaultValue: 'Комментарий' }),
        dataIndex: 'comment',
        key: 'comment',
      },
      {
        title: t('factoryOrders.colStatus', { defaultValue: 'Статус' }),
        dataIndex: 'status',
        key: 'status',
        render: renderStatus,
      },
      {
        title: t('factoryOrders.colActions', { defaultValue: 'Действия' }),
        key: 'actions',
        width: 220,
        fixed: 'right',
        render: (_: unknown, record: FactoryOrder) => (
          <Space size="small" wrap>
            {canCreateDeliveryFromOrder(record.status) && (
              <Tooltip
                title={t('factoryOrders.btnCreateDelivery', { defaultValue: 'Создать поставку' })}
              >
                <Button
                  type="primary"
                  size="small"
                  icon={<InboxOutlined />}
                  aria-label={t('factoryOrders.btnCreateDelivery', {
                    defaultValue: 'Создать поставку',
                  })}
                  onClick={() => setDeliveryOrder(record)}
                >
                  {t('factoryOrders.btnCreateDelivery', { defaultValue: 'Создать поставку' })}
                </Button>
              </Tooltip>
            )}
            <Tooltip title={t('factoryOrders.btnPrint', { defaultValue: 'Распечатать накладную' })}>
              <Button
                size="small"
                icon={<PrinterOutlined />}
                aria-label={t('factoryOrders.btnPrint', { defaultValue: 'Распечатать накладную' })}
                onClick={() => void printFactoryOrder(record)}
              >
                {t('factoryOrders.btnPrint', { defaultValue: 'Распечатать накладную' })}
              </Button>
            </Tooltip>
          </Space>
        ),
      },
    ],
    [renderStatus, t],
  );

  const expandedRowRender = (order: FactoryOrder) => (
    <Table
      rowKey="id"
      dataSource={order.items}
      pagination={false}
      size="small"
      columns={[
        {
          title: t('factoryOrders.colProduct', { defaultValue: 'Товар' }),
          key: 'product',
          render: (_: unknown, record) => {
            const product = productsById.get(record.productId);
            return (
              <Space direction="vertical" size={0}>
                <Text strong>{product?.name ?? record.productName ?? record.productId}</Text>
                {product?.barcode && <Text type="secondary">{product.barcode}</Text>}
              </Space>
            );
          },
        },
        {
          title: t('factoryOrders.colBoxes', { defaultValue: 'Количество (коробок)' }),
          dataIndex: 'qty',
          key: 'qty',
          align: 'right',
          render: (val: number) => `${val ?? 0} кор.`,
        },
        {
          title: t('factoryOrders.colPiecesPerBox', { defaultValue: 'Штук в коробке' }),
          key: 'boxQuantity',
          align: 'right',
          render: (_: unknown, record) => {
            const product = productsById.get(record.productId);
            return `${product?.boxQuantity ?? 1} шт.`;
          },
        },
        {
          title: t('factoryOrders.colTotalPieces', { defaultValue: 'Всего штук' }),
          key: 'totalPieces',
          align: 'right',
          render: (_: unknown, record) => {
            const product = productsById.get(record.productId);
            const pieces = (record.qty ?? 0) * (product?.boxQuantity ?? 1);
            return `${pieces} шт.`;
          },
        },
        {
          title: t('factoryOrders.colPrice', { defaultValue: 'Цена за шт.' }),
          key: 'price',
          align: 'right',
          render: (_: unknown, record) => {
            const product = productsById.get(record.productId);
            const price = product?.factoryPrice ?? 0;
            return <MoneyDisplay amount={price} />;
          },
        },
        {
          title: t('factoryOrders.colSum', { defaultValue: 'Сумма' }),
          key: 'sum',
          align: 'right',
          render: (_: unknown, record) => {
            const product = productsById.get(record.productId);
            const pieces = (record.qty ?? 0) * (product?.boxQuantity ?? 1);
            const sum = pieces * (product?.factoryPrice ?? 0);
            return <MoneyDisplay amount={sum} />;
          },
        },
      ]}
    />
  );

  const orders = useLiveQuery(
    () =>
      db.factoryOrders
        .orderBy('date')
        .reverse()
        .toArray()
        .then((localOrders) => {
          const productList = products ?? [];
          return localOrders.map((o) => ({
            ...o,
            items: enrichFactoryOrderItems(o.items, productList),
          }));
        }),
    [products],
  );

  const isPollingRef = useRef(false);

  const syncFactoryOrders = useCallback(
    async (isManual = false) => {
      if (isPollingRef.current) return;
      isPollingRef.current = true;
      if (isManual) setLoading(true);

      try {
        const res = await factoryClient.get<
          | ApiFactoryOrderInput[]
          | {
              results?: ApiFactoryOrderInput[];
              content?: ApiFactoryOrderInput[];
              data?: ApiFactoryOrderInput[];
            }
        >('/warehouse-orders/');
        const data = res?.data ?? res;
        const rawOrders: ApiFactoryOrderInput[] = Array.isArray(data)
          ? data
          : Array.isArray((data as { results?: ApiFactoryOrderInput[] })?.results)
            ? (data as { results: ApiFactoryOrderInput[] }).results
            : Array.isArray((data as { content?: ApiFactoryOrderInput[] })?.content)
              ? (data as { content: ApiFactoryOrderInput[] }).content
              : Array.isArray((data as { data?: ApiFactoryOrderInput[] })?.data)
                ? (data as { data: ApiFactoryOrderInput[] }).data
                : [];

        const serverOrders = rawOrders.map((o) => mapApiFactoryOrder(o, products ?? []));
        const localOrders = await db.factoryOrders.toArray();
        const receipts = await db.receipts.toArray();
        const deliveredIds = getDeliveredFactoryOrderIds(localOrders, receipts, serverOrders);

        const merged = mergeFactoryOrders(serverOrders, localOrders, deliveredIds);

        await db.factoryOrders.clear();
        await db.factoryOrders.bulkPut(merged);

        if (isManual) {
          void message.success(
            t('factoryOrders.msgSyncSuccess', { defaultValue: 'Заявки успешно синхронизированы' }),
          );
        }
      } catch {
        if (isManual) {
          void message.error(
            t('factoryOrders.msgSyncError', { defaultValue: 'Ошибка синхронизации заявок' }),
          );
        }
      } finally {
        isPollingRef.current = false;
        if (isManual) setLoading(false);
      }
    },
    [message, t, products],
  );

  useEffect(() => {
    const interval = setInterval(() => {
      void syncFactoryOrders(false);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [syncFactoryOrders]);

  const isOrdersLoading = orders === undefined;

  return (
    <div>
      <div className="page-header">
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {t('factoryOrders.title', { defaultValue: 'Заявки к заводу' })}
          </Title>
          <Text type="secondary">
            {t('factoryOrders.subtitle', { defaultValue: 'Запрос продукции со склада на завод' })}
          </Text>
        </div>
        <Space wrap>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => {
              void syncFactoryOrders(true);
            }}
            loading={loading}
          >
            {t('factoryOrders.btnSync', { defaultValue: 'Синхронизировать' })}
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
            {t('factoryOrders.btnCreate', { defaultValue: 'Создать заявку' })}
          </Button>
        </Space>
      </div>

      <Table<FactoryOrder>
        rowKey="id"
        dataSource={orders ?? []}
        columns={columns}
        loading={isOrdersLoading}
        expandable={{ expandedRowRender }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: isOrdersLoading ? (
            <span />
          ) : (
            <EmptyState
              description={t('factoryOrders.emptyNoOrders', {
                defaultValue: 'Заявок к заводу пока нет',
              })}
              action={
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsModalOpen(true)}>
                  {t('factoryOrders.btnCreate', { defaultValue: 'Создать заявку' })}
                </Button>
              }
            />
          ),
        }}
      />

      <FactoryOrderForm open={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <FactoryOrderDeliveryForm
        open={deliveryOrder !== null}
        order={deliveryOrder}
        onClose={() => setDeliveryOrder(null)}
      />
    </div>
  );
}
