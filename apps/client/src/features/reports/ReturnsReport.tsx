import { useMemo } from 'react';
import { Table, Button, Space, Statistic, Tag } from 'antd';
import { FileExcelOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import EmptyState from '@/components/EmptyState';
import { useReturns } from '@/hooks/useReturns';
import { exportToExcel } from '@/utils/exportExcel';
import type { ProductReturn, ReturnItem, ReturnReason } from '@/types';
import { REASON_LABEL } from '../returns/reasons';
import { inPeriod, type Period } from './period';
import { useTranslation } from 'react-i18next';
import { DateDisplay } from '@/components/common/DateDisplay';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

export default function ReturnsReport({ period }: { period: Period }) {
  const { t } = useTranslation();
  const returns = useReturns();

  const rows = useMemo(() => returns.filter((r) => inPeriod(r.date, period)), [returns, period]);
  const total = useMemo(() => rows.reduce((s, r) => s + r.totalAmount, 0), [rows]);

  const columns: ColumnsType<ProductReturn> = [
    {
      title: t('reports.colDate', { defaultValue: 'Дата' }),
      dataIndex: 'date',
      key: 'date',
      width: 130,
      render: (d: string) => <DateDisplay date={d} />,
    },
    {
      title: t('drivers.colFullName', { defaultValue: 'Водитель' }),
      dataIndex: 'driverName',
      key: 'driverName',
    },
    {
      title: t('receipts.colItemsCount', { defaultValue: 'Товаров' }),
      key: 'itemsCount',
      width: 110,
      align: 'right',
      render: (_, r) => r.items.length,
    },
    {
      title: t('reports.colAmount', { defaultValue: 'Сумма' }),
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 140,
      align: 'right',
      render: (v: number) => <MoneyDisplay amount={v} />,
    },
  ];

  const expandedRowRender = (productReturn: ProductReturn) => (
    <Table<ReturnItem>
      className="nested-table"
      rowKey="barcode"
      size="small"
      pagination={false}
      dataSource={productReturn.items}
      columns={[
        {
          title: t('reports.colProduct', { defaultValue: 'Товар' }),
          dataIndex: 'productName',
          key: 'productName',
        },
        {
          title: t('returns.colQuantity', { defaultValue: 'Кол-во' }),
          dataIndex: 'quantity',
          key: 'quantity',
          align: 'right',
        },
        {
          title: t('returns.colReason', { defaultValue: 'Причина' }),
          dataIndex: 'reason',
          key: 'reason',
          render: (r: ReturnReason) => (
            <Tag>{t(`returns.reason_${r}`, { defaultValue: REASON_LABEL[r] ?? r })}</Tag>
          ),
        },
      ]}
    />
  );

  const handleExport = () =>
    exportToExcel(
      rows,
      [
        {
          header: t('reports.colDate', { defaultValue: 'Дата' }),
          value: (r) => dayjs(r.date).format('DD.MM.YYYY'),
        },
        {
          header: t('drivers.colFullName', { defaultValue: 'Водитель' }),
          value: (r) => r.driverName ?? 'Завод',
        },
        {
          header: t('receipts.colItemsCount', { defaultValue: 'Товаров' }),
          value: (r) => r.items.length,
        },
        {
          header: t('reports.colAmount', { defaultValue: 'Сумма, сом' }),
          value: (r) => r.totalAmount,
        },
      ],
      'vozvraty',
      t('returns.title', { defaultValue: 'Возвраты' }),
    );

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
        <Statistic
          title={t('reports.totalReturns', { defaultValue: 'Сумма возвратов за период' })}
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
          {t('reports.btnExport', { defaultValue: 'Экспорт в Excel' })}
        </Button>
      </Space>
      <Table<ProductReturn>
        rowKey="id"
        columns={columns}
        dataSource={rows}
        expandable={{ expandedRowRender }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 'max-content' }}
        locale={{
          emptyText: (
            <EmptyState
              description={t('reports.noDataPeriod', {
                defaultValue: 'Нет возвратов за выбранный период',
              })}
            />
          ),
        }}
      />
    </Space>
  );
}
