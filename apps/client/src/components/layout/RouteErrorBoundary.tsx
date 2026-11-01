import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Result, Button } from 'antd';
import * as Sentry from '@sentry/react';
import { useAuthStore } from '@/store/authStore';
import { useSyncStore } from '@/store/syncStore';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const user = useAuthStore.getState().user;
    const isOnline = useSyncStore.getState().isOnline;

    if (import.meta.env.PROD) {
      Sentry.withScope((scope) => {
        scope.setTag('error_boundary', 'RouteErrorBoundary');
        scope.setTag('is_online', String(isOnline));
        if (user) {
          scope.setUser({
            id: user.id,
            username: user.username,
            warehouseId: user.warehouseId,
          });
        }
        scope.setExtra('componentStack', errorInfo.componentStack);
        if (typeof window !== 'undefined' && window.location) {
          scope.setExtra('route', window.location.pathname);
        }
        Sentry.captureException(error);
      });
    }

    if (import.meta.env.DEV) {
      console.error('[RouteErrorBoundary] Uncaught route error:', error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '48px 24px', display: 'flex', justifyContent: 'center' }}>
          <Result
            status="error"
            title="Ошибка загрузки раздела"
            subTitle={this.state.error?.message ?? 'Произошла непредвиденная ошибка компонента'}
            extra={[
              <Button type="primary" key="reload" onClick={this.handleReset}>
                Повторить попытку
              </Button>,
              <Button key="back" onClick={() => window.location.assign('/dashboard')}>
                На главную
              </Button>,
            ]}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
