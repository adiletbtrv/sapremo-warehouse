import React, { useState } from 'react';
import { Layout, Grid } from 'antd';
import { Outlet } from 'react-router-dom';
import { RouteErrorBoundary } from '@/components/layout/RouteErrorBoundary';
import InitialSyncLoader from '@/components/layout/InitialSyncLoader';
import { useBackgroundSync } from '@/hooks/useBackgroundSync';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Spin, theme } from 'antd';

import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';

const { Content } = Layout;

export default function AppLayout() {
  const screens = Grid.useBreakpoint();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = !screens.lg;
  const { token } = theme.useToken();

  useBackgroundSync();
  useWebSocket();

  return (
    <InitialSyncLoader>
      <Layout style={{ minHeight: '100vh', background: token.colorBgLayout }}>
        <AppSidebar
          isMobile={isMobile}
          mobileMenuOpen={mobileMenuOpen}
          setMobileMenuOpen={setMobileMenuOpen}
        />
        <Layout>
          <AppHeader isMobile={isMobile} setMobileMenuOpen={setMobileMenuOpen} />
          <Content
            style={{
              padding: screens.md ? '16px 24px 24px' : '16px 8px 8px',
              overflowY: 'auto',
              background: token.colorBgLayout,
            }}
          >
            <RouteErrorBoundary>
              <React.Suspense
                fallback={
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      height: '100%',
                      minHeight: 300,
                    }}
                  >
                    <Spin size="large" />
                  </div>
                }
              >
                <Outlet />
              </React.Suspense>
            </RouteErrorBoundary>
          </Content>
        </Layout>
      </Layout>
    </InitialSyncLoader>
  );
}
