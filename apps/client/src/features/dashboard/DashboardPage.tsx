import { useMemo, useState } from 'react';
import { Typography, Button, Table, Spin, Select, Row, Col, Alert } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { Order, Product } from '@/types';
import type { ColumnsType } from 'antd/es/table';

import StatCard from '@/components/dashboard/StatCard';
import { IconStock, IconDebt, IconCash, IconFactory } from '@/components/icons/DashboardIcons';

const { Title } = Typography;

import { mapApiError } from '@/utils/errorMapper';
import { useDashboardStats } from './hooks/useDashboardStats';
import { useDashboardColumns } from './hooks/useDashboardColumns';
import type { TopProduct, TopDriver } from './types';
import './dashboard.css';

function SectionCard({
  title,
  extra,
  children,
}: {
  title: string;
  extra?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="dashboard-section-card">
      <div className="dashboard-section-header">
        <span className="dashboard-section-title">{title}</span>
        {extra}
      </div>
      <div className="dashboard-section-body">{children}</div>
    </div>
  );
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const [topN, setTopN] = useState(5);
  const navigate = useNavigate();
  const stats = useDashboardStats();

  const isLoading = !stats?.isInitialized;

  const { pendingOrderColumns, topProductColumns, topDriverColumns, lowStockColumns } =
    useDashboardColumns(t);

  const pendingOrderColumnsWithAction: ColumnsType<Order> = useMemo(
    () => [
      ...pendingOrderColumns,
      {
        title: t('dashboard.actions', { defaultValue: 'Действия' }),
        key: 'actions',
        render: () => (
          <Button
            type="primary"
            size="small"
            onClick={() => {
              void navigate('/orders');
            }}
          >
            {t('dashboard.goToIssue', { defaultValue: 'Перейти к выдаче' })}
          </Button>
        ),
      },
    ],
    [navigate, pendingOrderColumns, t],
  );

  const slicedProducts = useMemo(
    () => (stats?.topProducts ?? []).slice(0, topN),
    [stats?.topProducts, topN],
  );

  const slicedDrivers = useMemo(
    () => (stats?.topDrivers ?? []).slice(0, topN),
    [stats?.topDrivers, topN],
  );

  return (
    <div className="dashboard-page">
      <div className="dashboard-page__header">
        <div>
          <Title level={3} className="dashboard-page__title">
            {t('dashboard.title')}
          </Title>
          <Typography.Text type="secondary" className="dashboard-page__subtitle">
            {t('dashboard.subtitle', 'Контроль склада, заявок и финансовых показателей')}
          </Typography.Text>
        </div>
        <div className="dashboard-page__status">
          <span className="dashboard-page__status-dot" />
          {t('dashboard.updatedLive', { defaultValue: 'Данные обновляются автоматически' })}
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={t('dashboard.statStock', 'Остатки товара')}
            value={stats?.stockItems ?? 0}
            icon={<IconStock />}
            suffix={t('common.boxesUnit', { defaultValue: 'коробок' })}
            isLoading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={
              (stats?.totalDriverDebt ?? 0) < 0
                ? t('dashboard.statDriverOverpay', 'Переплата водителей')
                : t('dashboard.statDriverDebt', 'Долги водителей')
            }
            value={Math.abs(stats?.totalDriverDebt ?? 0)}
            icon={<IconDebt />}
            suffix={t('common.currency', { defaultValue: 'с' })}
            isLoading={isLoading}
            valueColor={(stats?.totalDriverDebt ?? 0) < 0 ? '#389e0d' : undefined}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={t('dashboard.statCash', 'Касса')}
            value={stats?.cashBalance ?? 0}
            icon={<IconCash />}
            suffix={t('common.currency', { defaultValue: 'с' })}
            isLoading={isLoading}
          />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard
            title={
              (stats?.factoryDebt ?? 0) < 0
                ? t('dashboard.statFactoryOverpay', 'Переплата заводу')
                : t('dashboard.statFactoryDebt', 'Долг перед заводом')
            }
            value={Math.abs(stats?.factoryDebt ?? 0)}
            icon={<IconFactory />}
            suffix={t('common.currency', { defaultValue: 'с' })}
            isLoading={isLoading}
            valueColor={(stats?.factoryDebt ?? 0) < 0 ? '#389e0d' : undefined}
          />
        </Col>
      </Row>

      {isLoading && (
        <div className="dashboard-page__loading">
          <Spin size="large" />
          <span>{t('dashboard.loadingAnalytics', { defaultValue: 'Загрузка аналитики...' })}</span>
        </div>
      )}

      {!isLoading && stats?.error && (
        <div className="dashboard-page__error">
          <Alert
            message={t('errors.dashboardLoadError', {
              defaultValue: 'Ошибка загрузки данных дашборда',
            })}
            description={mapApiError(stats.error as unknown)}
            type="error"
            showIcon
          />
        </div>
      )}

      {!isLoading && !stats?.error && (
        <>
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <SectionCard title={t('dashboard.recentOrders')}>
                <div className="dashboard-activity-table">
                  <Table<Order>
                    className="dashboard-activity-table__table"
                    rowKey="id"
                    dataSource={stats?.pendingOrders ?? []}
                    pagination={false}
                    columns={pendingOrderColumnsWithAction}
                    locale={{
                      emptyText: t('dashboard.emptyOrders', { defaultValue: 'Нет новых заявок' }),
                    }}
                    scroll={{ x: 'max-content' }}
                  />
                </div>
              </SectionCard>
            </Col>

            <Col xs={24} xl={12}>
              <SectionCard
                title={t('dashboard.topProducts')}
                extra={
                  <Select
                    value={topN}
                    onChange={setTopN}
                    options={[
                      { value: 5, label: t('dashboard.top5', 'Топ 5') },
                      { value: 10, label: t('dashboard.top10', 'Топ 10') },
                      { value: 20, label: t('dashboard.top20', 'Топ 20') },
                    ]}
                    style={{ width: 100 }}
                  />
                }
              >
                <div className="dashboard-activity-table">
                  <Table<TopProduct>
                    className="dashboard-activity-table__table"
                    rowKey="rank"
                    dataSource={slicedProducts}
                    pagination={false}
                    columns={topProductColumns}
                    locale={{
                      emptyText: t('dashboard.emptyProducts', {
                        defaultValue: 'Нет данных о товарах',
                      }),
                    }}
                    scroll={{ x: 'max-content' }}
                  />
                </div>
              </SectionCard>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} xl={12}>
              <SectionCard title={t('dashboard.topDrivers')}>
                <div className="dashboard-activity-table drivers-table">
                  <Table<TopDriver>
                    className="dashboard-activity-table__table"
                    rowKey="driverId"
                    dataSource={slicedDrivers}
                    pagination={false}
                    columns={topDriverColumns}
                    locale={{
                      emptyText: t('dashboard.emptyDrivers', {
                        defaultValue: 'Нет данных о водителях',
                      }),
                    }}
                    scroll={{ x: 'max-content' }}
                  />
                </div>
              </SectionCard>
            </Col>

            <Col xs={24} xl={12}>
              <SectionCard
                title={t('dashboard.lowStock')}
                extra={
                  <span style={{ fontSize: 16, color: '#CF1322', fontWeight: 600 }}>
                    {stats?.lowStockAlerts ?? 0}{' '}
                    {t('dashboard.positions', { defaultValue: 'позиций' })}
                  </span>
                }
              >
                <div className="dashboard-activity-table">
                  <Table<Product>
                    className="dashboard-activity-table__table"
                    rowKey="id"
                    dataSource={stats?.lowStockProducts ?? []}
                    pagination={false}
                    columns={lowStockColumns}
                    locale={{
                      emptyText: t('dashboard.emptyLowStock', {
                        defaultValue: 'Все товары в норме',
                      }),
                    }}
                    scroll={{ x: 'max-content' }}
                  />
                </div>
              </SectionCard>
            </Col>
          </Row>
        </>
      )}
    </div>
  );
}
