import { useMemo } from 'react';
import { Table, Button, Space, Statistic } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useLiveQuery } from 'dexie-react-hooks';
import EmptyState from '@/components/EmptyState';
import { db } from '@/db/schema';
import { exportToExcel } from '@/utils/exportExcel';
import { inPeriod, type Period } from './period';
import type { Order } from '@/types';

interface IssuedRow {
  driverId: string;
  driverName: string;
  ordersCount: number;
  itemsCount: number;
  totalAmount: number;
}

import { useTranslation } from 'react-i18next';

export default function IssuedPerDriverReport({ period }: { period: Period }) {
  const { t } = useTranslation();
  const orders = useLiveQuery(
    () => db.orders.filter((o) => o.status === 'DISPATCHED' && !o.isArchived).toArray(),
    [],
    [] as Order[],
  );

  const rows = useMemo<IssuedRow[]>(() => {
    const byDriver = new Map<string, IssuedRow>();
    for (const o of orders) {
      if (o.status !== 'DISPATCHED' || !inPeriod(o.date, period)) continue;
      const acc = byDriver.get(o.driverId) ?? {
        driverId: o.driverId,
        driverName: o.driverName,
        ordersCount: 0,
        itemsCount: 0,
        totalAmount: 0,
      };
      acc.ordersCount += 1;
      acc.itemsCount += o.items.reduce((s, it) => s + it.quantity, 0);
      acc.totalAmount += o.totalAmount;
      byDriver.set(o.driverId, acc);
    }
    return [...byDriver.values()].sort((a, b) => b.totalAmount - a.totalAmount);
  }, [orders, period]);

  const total = useMemo(() => rows.reduce((s, r) => s + r.totalAmount, 0), [rows]);

  const columns: ColumnsType<IssuedRow> = [
    { title: t('reports.colDriver', 'Водитель'), dataIndex: 'driverName', key: 'driverName' },
    {
      title: t('reports.colInvoices', 'Накладных'),
      dataIndex: 'ordersCount',
      key: 'ordersCount',
      width: 130,
      align: 'right',
    },
    {
      title: t('reports.colItems', 'Единиц товара'),
      dataIndex: 'itemsCount',
      key: 'itemsCount',
      width: 140,
      align: 'right',
    },
    {
      title: t('reports.colTotal', 'Сумма'),
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 150,
      align: 'right',
      render: (v: number) => `${v} ${t('common.currency', { defaultValue: 'сом' })}`,
    },
  ];

  const handleExport = () =>
    exportToExcel(
      rows,
      [
        { header: t('reports.colDriver', 'Водитель'), value: (r) => r.driverName },
        { header: t('reports.colInvoices', 'Накладных'), value: (r) => r.ordersCount },
        { header: t('reports.colItems', 'Единиц товара'), value: (r) => r.itemsCount },
        {
          header: `${t('reports.colTotal', 'Сумма')}, ${t('common.currency', { defaultValue: 'сом' })}`,
          value: (r) => r.totalAmount,
        },
      ],
      'vydano_voditelyam',
      t('reports.issuedPeriod', 'Выдано за период'),
    );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Statistic
          title={t('reports.issuedPeriod', 'Выдано за период')}
          value={total}
          suffix={t('common.currency', { defaultValue: 'сом' })}
        />
        <Button
          icon={<FileExcelOutlined />}
          onClick={() => {
            void handleExport();
          }}
          disabled={rows.length === 0}
        >
          {t('reports.btnExport', 'Экспорт в Excel')}
        </Button>
      </Space>
      <Table<IssuedRow>
        rowKey="driverId"
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: <EmptyState description="Нет выданных накладных за выбранный период" />,
        }}
      />
    </Space>
  );
}
