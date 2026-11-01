import { useMemo, useState, useEffect } from 'react';
import { Layout, Menu, Drawer } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  FileTextOutlined,
  RollbackOutlined,
  DollarOutlined,
  BarChartOutlined,
  BookOutlined,
  AppstoreOutlined,
  ImportOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const { Sider } = Layout;

function SidebarBrand({ collapsed }: { collapsed: boolean }) {
  return (
    <div
      style={{
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        marginTop: 16,
        marginBottom: 16,
        padding: '0 16px',
      }}
    >
      <img
        src={collapsed ? '/logo-icon.svg' : '/logo.svg'}
        alt="Sapremo Logo"
        style={{
          height: collapsed ? 32 : 48,
          maxWidth: '100%',
          transition: 'all 0.2s',
          objectFit: 'contain',
        }}
      />
    </div>
  );
}

interface AppSidebarProps {
  isMobile: boolean;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (open: boolean) => void;
}

export default function AppSidebar({
  isMobile,
  mobileMenuOpen,
  setMobileMenuOpen,
}: AppSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const NAV_ITEMS = useMemo(
    () => [
      {
        key: '/dashboard',
        icon: <DashboardOutlined />,
        label: t('sidebar.dashboard', { defaultValue: 'Дашборд' }),
      },
      {
        key: '/stock',
        icon: <AppstoreOutlined />,
        label: t('sidebar.stock', { defaultValue: 'Склад' }),
      },
      {
        key: '/orders',
        icon: <FileTextOutlined />,
        label: t('sidebar.orders', { defaultValue: 'Заявки водителей' }),
      },
      {
        key: '/receipts',
        icon: <ImportOutlined />,
        label: t('sidebar.receipts', { defaultValue: 'Поставки' }),
      },
      {
        key: '/returns',
        icon: <RollbackOutlined />,
        label: t('sidebar.returns', { defaultValue: 'Возвраты' }),
      },
      {
        key: '/payments',
        icon: <DollarOutlined />,
        label: t('sidebar.payments', { defaultValue: 'Касса' }),
      },
      {
        key: '/factory-orders',
        icon: <FileTextOutlined />,
        label: t('sidebar.factory', { defaultValue: 'Заявки к заводу' }),
      },
      {
        key: '/reports',
        icon: <BarChartOutlined />,
        label: t('sidebar.reports', { defaultValue: 'Отчеты' }),
      },
      {
        key: 'system',
        icon: <SettingOutlined />,
        label: t('sidebar.system', { defaultValue: 'Системные' }),
        children: [
          {
            key: '/products',
            icon: <BookOutlined />,
            label: t('sidebar.productsCatalog', { defaultValue: 'Справочник товаров' }),
          },
          {
            key: '/drivers',
            icon: <TeamOutlined />,
            label: t('sidebar.drivers', { defaultValue: 'Водители' }),
          },
        ],
      },
    ],
    [t],
  );

  const getActiveKey = () => {
    for (const item of NAV_ITEMS) {
      if (item.key && location.pathname.startsWith(item.key)) {
        return item.key;
      }
      if (item.children) {
        const childMatch = item.children.find((child) => location.pathname.startsWith(child.key));
        if (childMatch) return childMatch.key;
      }
    }
    return '/dashboard';
  };

  const defaultOpenKeys = useMemo(() => {
    const systemChild = NAV_ITEMS.find((item) => item.key === 'system')?.children;
    if (systemChild?.some((child) => location.pathname.startsWith(child.key))) {
      return ['system'];
    }
    return [];
  }, [location.pathname, NAV_ITEMS]);

  const activeKey = getActiveKey();

  const handleNavigate = (key: string) => {
    void navigate(key);
    setMobileMenuOpen(false);
  };

  useEffect(() => {
    const width = isMobile ? '0px' : collapsed ? '80px' : '256px';
    document.body.style.setProperty('--sidebar-width', width);
    return () => {
      document.body.style.removeProperty('--sidebar-width');
    };
  }, [isMobile, collapsed]);

  const sidebarMenu = (
    <Menu
      mode="inline"
      selectedKeys={[activeKey]}
      defaultOpenKeys={defaultOpenKeys}
      items={NAV_ITEMS}
      onClick={({ key }) => handleNavigate(key)}
      style={{ borderRight: 'none', padding: '0 8px' }}
    />
  );

  return (
    <>
      {!isMobile && (
        <Sider
          width={256}
          collapsible
          collapsed={collapsed}
          onCollapse={(val) => setCollapsed(val)}
          style={{
            background: 'var(--ant-color-bg-container)',
            borderRight: '1px solid var(--ant-color-border)',
            zIndex: 10,
          }}
        >
          <SidebarBrand collapsed={collapsed} />
          {sidebarMenu}
        </Sider>
      )}
      <Drawer
        placement="left"
        open={isMobile && mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        width={280}
        styles={{ body: { padding: 0 } }}
        title={null}
        closable={false}
      >
        <SidebarBrand collapsed={false} />
        {sidebarMenu}
      </Drawer>
    </>
  );
}
