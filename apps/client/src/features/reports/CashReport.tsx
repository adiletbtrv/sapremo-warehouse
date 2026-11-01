import { useMemo } from 'react';
import { Table, Button, Space, Statistic, Tag } from 'antd';
import { FileExcelOutlined, UserOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';
import EmptyState from '@/components/EmptyState';
import { useTransactions } from '@/hooks/useTransactions';
import { exportToExcel } from '@/utils/exportExcel';
import type { Transaction, TransactionType, PaymentMethod } from '@/types';
import { inPeriod, type Period } from './period';
import { useTranslation } from 'react-i18next';
import { DateDisplay } from '@/components/common/DateDisplay';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

const TYPE_META: Record<
  TransactionType,
  { color: string; labelKey: string; defaultLabel: string }
> = {
  driver_payment: {
    color: 'green',
    labelKey: 'reports.cashDriverPayment',
    defaultLabel: 'От водителя',
  },
  factory_payment: { color: 'red', labelKey: 'reports.cashFactoryPayment', defaultLabel: 'Заводу' },
};

const METHOD_META: Record<PaymentMethod, { labelKey: string; defaultLabel: string }> = {
  cash: { labelKey: 'reports.cashMethodCash', defaultLabel: 'Наличные' },
  transfer: { labelKey: 'reports.cashMethodTransfer', defaultLabel: 'Перевод' },
};

export default function CashReport({ period }: { period: Period }) {
  const { t } = useTranslation();
  const transactions = useTransactions();
  const allDrivers = useLiveQuery(() => db.drivers.toArray(), [], []);
  const driversMap = useMemo(() => new Map(allDrivers.map((d) => [String(d.id), d])), [allDrivers]);

  const resolveCounterparty = (record: Transaction) => {
    if (record.type === 'driver_payment') {
      if (record.driverName) return record.driverName;
      if (record.driverId) {
        const driver =
          driversMap.get(String(record.driverId)) ??
          allDrivers.find((d) => String(d.id) === String(record.driverId));
        if (driver?.fullName) return driver.fullName;
      }
      if (record.comment) {
        const match = record.comment.match(/(?:от|водител[яе])\s+([А-Яа-яA-Za-z\s]+)/i);
        if (match?.[1]) return match[1].trim();
      }
      return t('payment.counterparty.driver', { defaultValue: 'Водитель' });
    }
    return t('payment.counterparty.factory', { defaultValue: 'Завод' });
  };

  const rows = useMemo(
    () => transactions.filter((t) => inPeriod(t.date, period)),
    [transactions, period],
  );

  const income = useMemo(
    () => rows.filter((t) => t.type === 'driver_payment').reduce((s, t) => s + t.amount, 0),
    [rows],
  );
  const outflow = useMemo(
    () => rows.filter((t) => t.type === 'factory_payment').reduce((s, t) => s + t.amount, 0),
    [rows],
  );

  const columns: ColumnsType<Transaction> = [
    {
      title: t('reports.colDate', { defaultValue: 'Дата' }),
      dataIndex: 'date',
      key: 'date',
      width: 140,
      render: (d: string) => <DateDisplay date={d} pattern="dateTime" />,
    },
    {
      title: t('reports.colType', { defaultValue: 'Тип' }),
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (type: TransactionType) => (
        <Tag color={TYPE_META[type].color}>
          {t(TYPE_META[type].labelKey, { defaultValue: TYPE_META[type].defaultLabel })}
        </Tag>
      ),
    },
    {
      title: t('history.columns.counterparty', { defaultValue: 'Контрагент / ФИО' }),
      key: 'counterparty',
      render: (_: unknown, record: Transaction) => {
        const name = resolveCounterparty(record);
        if (record.type === 'driver_payment') {
          return (
            <Space size={6}>
              <UserOutlined style={{ color: '#1890ff' }} />
              <span style={{ fontWeight: 500 }}>{name}</span>
            </Space>
          );
        }
        return <Tag color="volcano">{name}</Tag>;
      },
    },
    {
      title: t('reports.colMethod', { defaultValue: 'Способ' }),
      dataIndex: 'paymentMethod',
      key: 'paymentMethod',
      width: 110,
      render: (m: PaymentMethod) =>
        t(METHOD_META[m].labelKey, { defaultValue: METHOD_META[m].defaultLabel }),
    },
    {
      title: t('reports.colAmount', { defaultValue: 'Сумма' }),
      dataIndex: 'amount',
      key: 'amount',
      width: 140,
      align: 'right',
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
    {
      title: t('history.columns.comment', { defaultValue: 'Комментарий' }),
      dataIndex: 'comment',
      key: 'comment',
      ellipsis: true,
      render: (comment: string | undefined) => (comment ? comment : '—'),
    },
  ];

  const handleExport = () =>
    exportToExcel(
      rows,
      [
        {
          header: t('reports.colDate', { defaultValue: 'Дата' }),
          value: (t) => dayjs(t.date).format('DD.MM.YYYY HH:mm'),
        },
        {
          header: t('reports.colType', { defaultValue: 'Тип' }),
          value: (transaction) =>
            t(TYPE_META[transaction.type].labelKey, {
              defaultValue: TYPE_META[transaction.type].defaultLabel,
            }),
        },
        {
          header: t('history.columns.counterparty', { defaultValue: 'Контрагент / ФИО' }),
          value: (t) => resolveCounterparty(t),
        },
        {
          header: t('reports.colMethod', { defaultValue: 'Способ' }),
          value: (transaction) =>
            t(METHOD_META[transaction.paymentMethod].labelKey, {
              defaultValue: METHOD_META[transaction.paymentMethod].defaultLabel,
            }),
        },
        { header: t('reports.colAmount', { defaultValue: 'Сумма, сом' }), value: (t) => t.amount },
        {
          header: t('history.columns.comment', { defaultValue: 'Комментарий' }),
          value: (t) => t.comment ?? '',
        },
      ],
      'kassa',
      t('reports.tabCash', { defaultValue: 'Касса' }),
    );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Space size="large" wrap>
          <Statistic
            title={t('reports.cashIncome', { defaultValue: 'Приход' })}
            value={income}
            suffix={t('common.currency', { defaultValue: 'сом' })}
            valueStyle={{ color: '#3f8600' }}
          />
          <Statistic
            title={t('reports.cashOutflow', { defaultValue: 'Расход' })}
            value={outflow}
            suffix={t('common.currency', { defaultValue: 'сом' })}
            valueStyle={{ color: '#cf1322' }}
          />
          <Statistic
            title={t('reports.cashTotal', { defaultValue: 'Итого в кассе' })}
            value={income - outflow}
            suffix={t('common.currency', { defaultValue: 'сом' })}
          />
        </Space>
        <Button
          icon={<FileExcelOutlined />}
          onClick={() => {
            void handleExport();
          }}
          disabled={rows.length === 0}
        >
          {t('reports.btnExport', { defaultValue: 'Экспорт в Excel' })}
        </Button>
      </Space>
      <Table<Transaction>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState
              description={t('reports.noDataPeriod', {
                defaultValue: 'Нет операций за выбранный период',
              })}
            />
          ),
        }}
      />
    </Space>
  );
}
