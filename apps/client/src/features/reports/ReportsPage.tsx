import { useState } from 'react';
import { Typography, Tabs, DatePicker, Space } from 'antd';
import type { TabsProps } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import ProductMovementReport from './ProductMovementReport';
import DriverDebtsReport from './DriverDebtsReport';
import CashReport from './CashReport';
import IssuedPerDriverReport from './IssuedPerDriverReport';
import ReturnsReport from './ReturnsReport';
import FactoryDebtReport from './FactoryDebtReport';
import LowStockReport from './LowStockReport';
import StockReport from './StockReport';
import type { Period } from './period';
import { useTranslation } from 'react-i18next';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

export default function ReportsPage() {
  const { t } = useTranslation();

  const [range, setRange] = useState<[Dayjs, Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);

  const period: Period = {
    start: range[0].format('YYYY-MM-DD'),
    end: range[1].format('YYYY-MM-DD'),
  };

  const items: TabsProps['items'] = [
    {
      key: 'stock',
      label: t('reports.tabStock', { defaultValue: 'Остатки на складе' }),
      children: <StockReport />,
    },
    {
      key: 'movement',
      label: t('reports.tabMovement', { defaultValue: 'Движение товара' }),
      children: <ProductMovementReport period={period} />,
    },
    {
      key: 'driver-debts',
      label: t('reports.tabDriverDebts', { defaultValue: 'Долги водителей' }),
      children: <DriverDebtsReport />,
    },
    {
      key: 'cash',
      label: t('reports.tabCash', { defaultValue: 'Касса' }),
      children: <CashReport period={period} />,
    },
    {
      key: 'issued',
      label: t('reports.tabIssued', { defaultValue: 'Выдано водителям' }),
      children: <IssuedPerDriverReport period={period} />,
    },
    {
      key: 'returns',
      label: t('reports.tabReturns', { defaultValue: 'Возвраты' }),
      children: <ReturnsReport period={period} />,
    },
    {
      key: 'factory-debt',
      label: t('reports.tabFactoryDebt', { defaultValue: 'Долг заводу' }),
      children: <FactoryDebtReport />,
    },
    {
      key: 'low-stock',
      label: t('reports.tabLowStock', { defaultValue: 'Низкий остаток' }),
      children: <LowStockReport />,
    },
  ];

  return (
    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
      <div className="page-header">
        <Title level={3} style={{ margin: 0 }}>
          {t('reports.title', { defaultValue: 'Отчёты' })}
        </Title>
        <Space wrap>
          <Text type="secondary">{t('reports.lblPeriod', { defaultValue: 'Период:' })}</Text>
          <RangePicker
            value={range}
            format="DD.MM.YYYY"
            allowClear={false}
            onChange={(v) => {
              if (v?.[0] && v?.[1]) setRange([v[0], v[1]]);
            }}
          />
        </Space>
      </div>

      <Tabs items={items} className="responsive-tabs" />
    </Space>
  );
}
