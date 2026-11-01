import { useMemo } from 'react';
import { Table, Tag, Button, Space } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import EmptyState from '@/components/EmptyState';
import { useReceipts } from '@/hooks/useReceipts';
import { useReturns } from '@/hooks/useReturns';
import { useOrders } from '@/hooks/useOrders';
import { useProducts } from '@/hooks/useProducts';
import { exportToExcel } from '@/utils/exportExcel';
import { inPeriod, type Period } from './period';
import { useTranslation } from 'react-i18next';
import { DateDisplay } from '@/components/common/DateDisplay';

type Operation = 'receipt' | 'order' | 'return';

interface MovementRow {
  id: string;
  date: string;
  productName: string;
  operation: Operation;
  incoming?: number;
  outgoing?: number;
}

const OP_META: Record<Operation, { color: string; labelKey: string; defaultLabel: string }> = {
  receipt: { color: 'green', labelKey: 'reports.opReceipt', defaultLabel: 'Поступление' },
  order: { color: 'blue', labelKey: 'reports.opOrder', defaultLabel: 'Выдача' },
  return: { color: 'orange', labelKey: 'reports.opReturn', defaultLabel: 'Возврат' },
};

export default function ProductMovementReport({ period }: { period: Period }) {
  const { t } = useTranslation();
  const products = useProducts();
  const receipts = useReceipts();
  const orders = useOrders();
  const returns = useReturns();

  const productMap = useMemo(() => new Map(products.map((p) => [p.barcode, p.name])), [products]);

  const rows = useMemo<MovementRow[]>(() => {
    const list: MovementRow[] = [];

    receipts
      .filter((r) => inPeriod(r.date, period))
      .forEach((r) => {
        r.items.forEach((it, idx) => {
          list.push({
            id: `receipt-${r.id}-${it.barcode}-${idx}`,
            date: r.date,
            productName: productMap.get(it.barcode) ?? it.barcode,
            operation: 'receipt',
            incoming: it.actualQuantity,
          });
        });
      });

    orders
      .filter((o) => ['CONFIRMED', 'DISPATCHED'].includes(o.status) && inPeriod(o.date, period))
      .forEach((o) => {
        o.items.forEach((it, idx) => {
          list.push({
            id: `order-${o.id}-${it.barcode}-${idx}`,
            date: o.date,
            productName: productMap.get(it.barcode) ?? it.productName ?? it.barcode,
            operation: 'order',
            outgoing: it.quantity,
          });
        });
      });

    returns
      .filter((ret) => inPeriod(ret.date, period))
      .forEach((ret) => {
        ret.items.forEach((it, idx) => {
          list.push({
            id: `return-${ret.id}-${it.barcode}-${idx}`,
            date: ret.date,
            productName: productMap.get(it.barcode) ?? it.productName ?? it.barcode,
            operation: 'return',
            incoming: it.quantity,
          });
        });
      });

    return list.sort((a, b) => (b.date > a.date ? 1 : -1));
  }, [receipts, orders, returns, period, productMap]);

  const columns: ColumnsType<MovementRow> = [
    {
      title: t('reports.colDate', { defaultValue: 'Дата' }),
      dataIndex: 'date',
      key: 'date',
      width: 130,
      render: (d: string) => <DateDisplay date={d} />,
    },
    {
      title: t('reports.colProduct', { defaultValue: 'Товар' }),
      dataIndex: 'productName',
      key: 'productName',
    },
    {
      title: t('reports.colOperation', { defaultValue: 'Операция' }),
      dataIndex: 'operation',
      key: 'operation',
      width: 130,
      render: (op: Operation) => (
        <Tag color={OP_META[op].color}>
          {t(OP_META[op].labelKey, { defaultValue: OP_META[op].defaultLabel })}
        </Tag>
      ),
    },
    {
      title: t('reports.colIncoming', { defaultValue: 'Приход' }),
      dataIndex: 'incoming',
      key: 'incoming',
      width: 110,
      align: 'right',
      render: (v: number) => (v ? `+${v}` : '—'),
    },
    {
      title: t('reports.colOutgoing', { defaultValue: 'Расход' }),
      dataIndex: 'outgoing',
      key: 'outgoing',
      width: 110,
      align: 'right',
      render: (v: number) => (v ? `−${v}` : '—'),
    },
  ];

  const handleExport = () =>
    exportToExcel(
      rows,
      [
        {
          header: t('reports.colDate', { defaultValue: 'Дата' }),
          value: (r) => dayjs(r.date).format('DD.MM.YYYY'),
        },
        { header: t('reports.colProduct', { defaultValue: 'Товар' }), value: (r) => r.productName },
        {
          header: t('reports.colOperation', { defaultValue: 'Операция' }),
          value: (r) =>
            t(OP_META[r.operation].labelKey, { defaultValue: OP_META[r.operation].defaultLabel }),
        },
        {
          header: t('reports.colIncoming', { defaultValue: 'Приход' }),
          value: (r) => r.incoming ?? 0,
        },
        {
          header: t('reports.colOutgoing', { defaultValue: 'Расход' }),
          value: (r) => r.outgoing ?? 0,
        },
      ],
      'dvizhenie_tovara',
      t('reports.tabMovement', { defaultValue: 'Движение товара' }),
    );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Button
        icon={<FileExcelOutlined />}
        onClick={() => {
          void handleExport();
        }}
        disabled={rows.length === 0}
        style={{ alignSelf: 'flex-end' }}
      >
        {t('reports.btnExport', { defaultValue: 'Экспорт в Excel' })}
      </Button>
      <Table<MovementRow>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState
              description={t('reports.noDataPeriod', {
                defaultValue: 'Нет данных за выбранный период',
              })}
            />
          ),
        }}
      />
    </Space>
  );
}
