import { useMemo } from 'react';
import { Table, Button, Space, Statistic, Typography } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import EmptyState from '@/components/EmptyState';
import { db } from '@/db/schema';
import { useLiveQuery } from 'dexie-react-hooks';
import { exportToExcel } from '@/utils/exportExcel';
import type { Driver } from '@/types';
import { useTranslation } from 'react-i18next';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

export default function DriverDebtsReport() {
  const { t } = useTranslation();
  const drivers = useLiveQuery(
    async () => {
      const [allDrivers, orders, transactions, returns] = await Promise.all([
        db.drivers
          .orderBy('fullName')
          .filter((d) => !d.isArchived)
          .toArray(),
        db.orders
          .filter((o) => ['CONFIRMED', 'DISPATCHED'].includes(o.status) && !o.isArchived)
          .toArray(),
        db.transactions.filter((tr) => tr.type === 'driver_payment' && !tr.isArchived).toArray(),
        db.returns.filter((r) => r.returnType === 'from_driver' && !r.isArchived).toArray(),
      ]);

      return allDrivers.map((d) => {
        if (d.currentDebt > 0) return d;
        const driverOrdersTotal = orders
          .filter((o) => o.driverId === d.id)
          .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
        const driverPaymentsTotal = transactions
          .filter((tr) => String(tr.driverId) === d.id)
          .reduce((sum, tr) => sum + (tr.amount || 0), 0);
        const driverReturnsTotal = returns
          .filter((r) => String(r.driverId) === d.id)
          .reduce((sum, r) => sum + (r.totalAmount || 0), 0);
        const calcDebt = Math.max(0, driverOrdersTotal - driverPaymentsTotal - driverReturnsTotal);
        return {
          ...d,
          currentDebt: calcDebt > 0 ? calcDebt : d.currentDebt,
        };
      });
    },
    [],
    [],
  );

  const sorted = useMemo(() => [...drivers], [drivers]);
  const total = useMemo(() => drivers.reduce((s, d) => s + d.currentDebt, 0), [drivers]);

  const columns: ColumnsType<Driver> = [
    {
      title: t('drivers.colFullName', { defaultValue: 'Водитель' }),
      dataIndex: 'fullName',
      key: 'fullName',
    },
    {
      title: t('drivers.colVehicleNumber', { defaultValue: 'Транспорт' }),
      dataIndex: 'vehicleNumber',
      key: 'vehicleNumber',
      render: (v: string | undefined) => v ?? '—',
    },
    {
      title: t('reports.colDebt', { defaultValue: 'Долг' }),
      dataIndex: 'currentDebt',
      key: 'currentDebt',
      width: 160,
      align: 'right',
      defaultSortOrder: 'descend',
      sorter: (a, b) => a.currentDebt - b.currentDebt,
      render: (v: number) => {
        const debt = v ?? 0;
        if (debt < 0) {
          return (
            <Typography.Text type="success">
              {t('drivers.overpayment', { defaultValue: 'Переплата' })}:{' '}
              <MoneyDisplay amount={Math.abs(debt)} />
            </Typography.Text>
          );
        }
        return <MoneyDisplay amount={debt} />;
      },
    },
  ];

  const handleExport = () =>
    exportToExcel(
      sorted,
      [
        {
          header: t('drivers.colFullName', { defaultValue: 'Водитель' }),
          value: (d) => d.fullName,
        },
        {
          header: t('drivers.colVehicleNumber', { defaultValue: 'Транспорт' }),
          value: (d) => d.vehicleNumber ?? '',
        },
        {
          header: t('reports.colDebt', { defaultValue: 'Долг, сом' }),
          value: (d) => d.currentDebt,
        },
      ],
      'dolgi_voditeley',
      t('reports.tabDriverDebts', { defaultValue: 'Долги водителей' }),
    );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Statistic
          title={t('reports.totalDriverDebts', { defaultValue: 'Суммарный долг водителей' })}
          value={total}
          suffix={t('common.currency', { defaultValue: 'сом' })}
        />
        <Button
          icon={<FileExcelOutlined />}
          onClick={() => {
            void handleExport();
          }}
          disabled={sorted.length === 0}
        >
          {t('reports.btnExport', { defaultValue: 'Экспорт в Excel' })}
        </Button>
      </Space>
      <Table<Driver>
        rowKey="id"
        columns={columns}
        dataSource={sorted}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState
              description={t('drivers.emptyNoDrivers', { defaultValue: 'Водителей пока нет' })}
            />
          ),
        }}
      />
    </Space>
  );
}
