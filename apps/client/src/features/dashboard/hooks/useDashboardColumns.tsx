import type { TFunction } from 'i18next';
import type { ColumnsType } from 'antd/es/table';
import { Typography } from 'antd';
import type { Order, Product } from '@/types';
import type { TopProduct, TopDriver } from '../types';
import { DateDisplay } from '@/components/common/DateDisplay';
import { MoneyDisplay } from '@/components/common/MoneyDisplay';

export const useDashboardColumns = (t: TFunction) => {
  const pendingOrderColumns: ColumnsType<Order> = [
    {
      title: t('dashboard.orderCol.date', 'Дата'),
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => <DateDisplay date={date} pattern="dateTime" />,
    },
    {
      title: t('dashboard.orderCol.driver'),
      dataIndex: 'driverName',
      key: 'driverName',
    },
    {
      title: t('dashboard.totalSum'),
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (val: number) => <MoneyDisplay amount={val} strong />,
    },
  ];

  const topProductColumns: ColumnsType<TopProduct> = [
    {
      title: t('dashboard.orderCol.id'),
      dataIndex: 'rank',
      key: 'rank',
      width: 48,
      render: (v: number) => <span style={{ fontSize: 16 }}>{v}</span>,
    },
    {
      title: t('dashboard.productCol.name'),
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span style={{ fontSize: 16 }}>{v}</span>,
    },
    {
      title: t('dashboard.totalVolumeBoxes', { defaultValue: 'Общий объем (коробок)' }),
      dataIndex: 'qty',
      key: 'qty',
      render: (v: number) => (
        <span style={{ fontSize: 16 }}>
          {v.toLocaleString('ru-RU')} {t('common.boxesUnit', 'кор.')}
        </span>
      ),
    },
    {
      title: t('dashboard.totalSum'),
      dataIndex: 'amount',
      key: 'amount',
      render: (v: number) => <MoneyDisplay amount={v} strong style={{ fontSize: 16 }} />,
    },
  ];

  const topDriverColumns: ColumnsType<TopDriver> = [
    {
      title: t('dashboard.driverCol.name'),
      dataIndex: 'name',
      key: 'name',
      render: (v: string) => <span className="driver-name-cell">{v}</span>,
    },
    {
      title: t('dashboard.driverCol.vehicle'),
      dataIndex: 'vehicleNumber',
      key: 'vehicleNumber',
      render: (v: string) => <span className="vehicle-badge">{v}</span>,
    },
    {
      title: t('dashboard.totalVolumeBoxes', { defaultValue: 'Общий объем (коробок)' }),
      dataIndex: 'qty',
      key: 'qty',
      render: (v: number) => (
        <span style={{ fontSize: 16 }}>
          {v.toLocaleString('ru-RU')} {t('common.boxesUnit', 'кор.')}
        </span>
      ),
    },
    {
      title: t('dashboard.driverCol.sum'),
      dataIndex: 'amount',
      key: 'amount',
      render: (v: number) => (
        <Typography.Text type="success" strong style={{ fontSize: 16 }}>
          <MoneyDisplay amount={v} />
        </Typography.Text>
      ),
    },
  ];

  const lowStockColumns: ColumnsType<Product> = [
    {
      title: t('products.barcode', 'Штрих-код'),
      dataIndex: 'barcode',
      key: 'barcode',
    },
    {
      title: t('dashboard.productCol.name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('dashboard.productCol.qty', { defaultValue: 'Остаток' }),
      key: 'stockQuantity',
      render: (_, r: Product) => {
        const boxes = r.boxQuantity > 0 ? Math.floor(r.stockQuantity / r.boxQuantity) : 0;
        return (
          <Typography.Text type="danger" strong style={{ fontSize: 14 }}>
            {boxes.toLocaleString('ru-RU')} {t('common.boxesUnit', 'кор.')}
          </Typography.Text>
        );
      },
    },
  ];

  return { pendingOrderColumns, topProductColumns, topDriverColumns, lowStockColumns };
};
