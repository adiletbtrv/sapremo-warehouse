import { Space, Statistic, Card, Typography } from 'antd';
import { useFactoryDebtSummary } from '@/hooks/useFactoryDebtSummary';
import { useTranslation } from 'react-i18next';

const { Text } = Typography;

export default function FactoryDebtReport() {
  const { t } = useTranslation();
  const { receivedAmount, paidAmount, debt, isOverpaid, displayAmount, isLoading } =
    useFactoryDebtSummary();

  const debtTitle = isOverpaid
    ? t('dashboard.statFactoryOverpay', 'Переплата заводу')
    : t('dashboard.statFactoryDebt', 'Долг перед заводом');

  const debtValueColor = isOverpaid ? '#389e0d' : debt > 0 ? '#cf1322' : undefined;

  return (
    <Card loading={isLoading}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space size="large" wrap align="baseline">
          <Statistic
            title={t('reports.factoryDebtReceived', 'Принято товара (на сумму)')}
            value={receivedAmount}
            suffix={t('common.currency', { defaultValue: 'сом' })}
          />
          <Statistic
            title={t('reports.factoryDebtPaid', 'Оплачено заводу')}
            value={paidAmount}
            suffix={t('common.currency', { defaultValue: 'сом' })}
          />
          <Statistic
            title={debtTitle}
            value={displayAmount}
            suffix={t('common.currency', { defaultValue: 'сом' })}
            valueStyle={{ color: debtValueColor, fontWeight: 600 }}
          />
        </Space>

        <Text type="secondary">
          {t(
            'reports.factoryDebtDesc',
            'Задолженность = стоимость принятых товаров − оплаты заводу (тип «Оплата заводу»).',
          )}
        </Text>
      </Space>
    </Card>
  );
}
