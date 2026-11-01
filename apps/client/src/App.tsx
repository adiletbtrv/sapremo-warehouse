import React, { Suspense, useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from '@/components/layout/ProtectedRoute';
import AppLayout from '@/components/layout/AppLayout';
import { ConfigProvider, App as AntApp, theme, Spin } from 'antd';

const LoginPage = React.lazy(() => import('@/features/auth/LoginPage'));
const RegisterPage = React.lazy(() => import('@/features/auth/RegisterPage'));
const Dashboard = React.lazy(() => import('@/features/dashboard/DashboardPage'));
const Products = React.lazy(() => import('@/features/products/ProductsPage'));
const Drivers = React.lazy(() => import('@/features/drivers/DriversPage'));
const Orders = React.lazy(() => import('@/features/orders/OrdersPage'));
const Receipts = React.lazy(() => import('@/features/receipts/ReceiptsPage'));
const Returns = React.lazy(() => import('@/features/returns/ReturnsPage'));
const Payments = React.lazy(() => import('@/features/payments/PaymentsPage'));
const Reports = React.lazy(() => import('@/features/reports/ReportsPage'));
const FactoryOrders = React.lazy(() => import('@/features/factoryOrders/FactoryOrdersPage'));
const StockPage = React.lazy(() => import('@/features/stock/StockPage'));

import enUS from 'antd/locale/en_US';
import ruRU from 'antd/locale/ru_RU';

const kyKG = {
  ...ruRU,
  locale: 'ky',
  Pagination: {
    ...ruRU.Pagination,
    items_per_page: '/ барак',
    jump_to: 'Өтүү',
    jump_to_confirm: 'ырастоо',
    page: 'барак',
    prev_page: 'Арткы барак',
    next_page: 'Кийинки барак',
    prev_5: 'Арткы 5 барак',
    next_5: 'Кийинки 5 барак',
    prev_3: 'Арткы 3 барак',
    next_3: 'Кийинки 3 барак',
    page_size: 'барак көлөмү',
  },
  Table: {
    ...ruRU.Table,
    filterTitle: 'Фильтр',
    filterConfirm: 'OK',
    filterReset: 'Тазалоо',
    selectAll: 'Баарын тандоо',
    selectInvert: 'Тескери тандоо',
    emptyText: 'Маалымат жок',
  },
  Empty: {
    description: 'Маалымат жок',
  },
  Modal: {
    okText: 'OK',
    cancelText: 'Жокко чыгаруу',
    justOkText: 'OK',
  },
  Popconfirm: {
    okText: 'Ооба',
    cancelText: 'Жок',
  },
  Select: {
    ...ruRU.Select,
    notFoundContent: 'Маалымат жок',
  },
};

import ErrorBoundary from '@/components/layout/ErrorBoundary';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from 'react-i18next';

import EmptyState from '@/components/EmptyState';

const getFigmaTheme = (isDark: boolean) => ({
  algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: {
    colorPrimary: '#096DD9',
    colorLink: '#096DD9',
    colorInfo: '#096DD9',
    colorError: '#CF1322',
    colorWarning: '#FAAD14',
    colorSuccess: '#52C41A',

    // Switch tokens based on theme
    colorBgLayout: isDark ? '#0f1720' : '#FAFAFA',
    colorBgContainer: isDark ? '#141e2b' : '#FFFFFF',
    colorBgElevated: isDark ? '#141e2b' : '#FFFFFF',
    colorBorder: isDark ? 'rgba(255, 255, 255, 0.08)' : '#D9D9D9',
    colorBorderSecondary: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F0F0F0',
    colorTextBase: isDark ? '#e8f2ff' : '#181B23',
    colorTextSecondary: isDark ? '#a8c0d6' : '#595959',

    fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
    fontSize: 14,
    fontSizeHeading1: 38,
    fontSizeHeading2: 30,
    fontSizeHeading3: 24,
    fontSizeHeading4: 20,
    fontSizeHeading5: 16,

    borderRadius: 8,
    borderRadiusLG: 8,
    borderRadiusSM: 4,

    padding: 16,
    paddingLG: 24,
    paddingSM: 8,

    motionDurationSlow: '0.3s',
    motionDurationMid: '0.2s',
    motionDurationFast: '0.1s',
  },
  components: {
    Menu: {
      itemBorderRadius: 8,
      itemHeight: 40,
      itemMarginBlock: 2,
      itemMarginInline: 8,
      itemBg: isDark ? '#141e2b' : '#FFFFFF',
      subMenuItemBg: isDark ? '#141e2b' : '#FFFFFF',
    },
    Table: {
      borderColor: isDark ? 'rgba(255, 255, 255, 0.05)' : '#F0F0F0',
      headerBg: isDark ? '#0b1220' : '#FAFAFA',
    },
    Card: {
      borderRadiusLG: 8,
      colorBgContainer: isDark ? '#141e2b' : '#FFFFFF',
    },
    Button: {
      borderRadius: 8,
      colorPrimary: '#1677ff',
      algorithm: true,
    },
    Input: {
      borderRadius: 8,
    },
    Select: {
      borderRadius: 8,
    },
    Layout: {
      siderBg: isDark ? '#141e2b' : '#FFFFFF',
      headerBg: isDark ? '#141e2b' : '#FFFFFF',
    },
  },
});

export default function App() {
  const isDark = useThemeStore((state) => state.isDark);
  const { t, i18n } = useTranslation();

  useEffect(() => {
    document.title = t('app.title', { defaultValue: 'Sapremo Склад' });
    void import('@/db/schema').then(({ pruneOldAuditLogs }) => {
      void pruneOldAuditLogs(30);
    });
  }, [i18n.language, t]);

  const antdLocale = useMemo(() => {
    switch (i18n.language) {
      case 'en':
        return enUS;
      case 'ru':
        return ruRU;
      case 'ky':
        return kyKG as typeof ruRU;
      default:
        return ruRU;
    }
  }, [i18n.language]);

  const figmaTheme = useMemo(() => getFigmaTheme(isDark), [isDark]);

  return (
    <ConfigProvider locale={antdLocale} renderEmpty={() => <EmptyState />} theme={figmaTheme}>
      <ErrorBoundary>
        <AntApp
          message={{ getContainer: () => document.body }}
          notification={{ getContainer: () => document.body }}
        >
          <BrowserRouter>
            <Suspense
              fallback={
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    height: '100vh',
                    width: '100vw',
                  }}
                >
                  <Spin size="large" />
                </div>
              }
            >
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/" element={<Navigate to="/dashboard" replace />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/stock" element={<StockPage />} />
                    <Route path="/drivers" element={<Drivers />} />
                    <Route path="/orders" element={<Orders />} />
                    <Route path="/receipts" element={<Receipts />} />
                    <Route path="/returns" element={<Returns />} />
                    <Route path="/payments" element={<Payments />} />
                    <Route path="/factory-orders" element={<FactoryOrders />} />
                    <Route path="/reports" element={<Reports />} />
                  </Route>
                </Route>
                <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
        </AntApp>
      </ErrorBoundary>
    </ConfigProvider>
  );
}
