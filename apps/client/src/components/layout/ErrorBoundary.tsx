import { Component } from 'react';
import * as Sentry from '@sentry/react';
import type { ErrorInfo, ReactNode } from 'react';
import { Result, Button, Space, message } from 'antd';
import { ReloadOutlined, DownloadOutlined, ClearOutlined } from '@ant-design/icons';
import i18n from '@/i18n';
import dayjs from 'dayjs';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    if (import.meta.env.PROD) {
      Sentry.captureException(error, { extra: { componentStack: errorInfo.componentStack } });
    }
    if (import.meta.env.DEV) {
      console.error('Uncaught component error:', error, errorInfo);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    window.location.reload();
  };

  private handleExportCrashLog = () => {
    const diagnostic = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      url: window.location.href,
      errorName: this.state.error?.name,
      errorMessage: this.state.error?.message,
      errorStack: this.state.error?.stack,
      componentStack: this.state.errorInfo?.componentStack,
    };

    const blob = new Blob([JSON.stringify(diagnostic, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `crash_report_${dayjs().format('YYYYMMDD_HHmmss')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    void message.success(
      i18n.t('common.crashLogExported', {
        defaultValue: 'Лог ошибки успешно сохранен',
      }),
    );
  };

  private handleResetCache = async () => {
    try {
      const { db } = await import('@/db/schema');
      await db.delete();
      sessionStorage.clear();
      localStorage.clear();
      window.location.href = '/login';
    } catch {
      window.location.reload();
    }
  };

  public render() {
    if (this.state.hasError) {
      const errorMsg = this.state.error?.message ?? '';
      const isChunkLoadError =
        errorMsg.includes('dynamically imported module') ||
        errorMsg.includes('Failed to fetch dynamically imported') ||
        errorMsg.includes('Loading chunk') ||
        errorMsg.includes('NS_BINDING_ABORTED') ||
        errorMsg.includes('Loading failed for the module');

      const title = isChunkLoadError
        ? i18n.t('common.chunkErrorTitle', { defaultValue: 'Обновление модулей приложения' })
        : i18n.t('common.errorTitle', { defaultValue: 'Что-то пошло не так' });

      const subTitle = isChunkLoadError
        ? i18n.t('common.chunkErrorSubtitle', {
            defaultValue:
              'Файлы интерфейса обновились или соединение было прервано при перезагрузке. Нажмите кнопку ниже для обновления.',
          })
        : (this.state.error?.message ??
          i18n.t('common.errorSubtitle', {
            defaultValue: 'Произошла непредвиденная ошибка компонента.',
          }));

      return (
        <div
          style={{
            padding: 32,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '80vh',
            width: '100%',
          }}
        >
          <Result
            status={isChunkLoadError ? 'warning' : '500'}
            title={title}
            subTitle={subTitle}
            extra={
              <Space wrap size="middle">
                <Button type="primary" icon={<ReloadOutlined />} onClick={this.handleRetry}>
                  {i18n.t('common.reload', { defaultValue: 'Перезагрузить страницу' })}
                </Button>
                <Button icon={<DownloadOutlined />} onClick={this.handleExportCrashLog}>
                  {i18n.t('common.exportCrashLog', 'Экспорт лога ошибки')}
                </Button>
                <Button
                  danger
                  icon={<ClearOutlined />}
                  onClick={() => {
                    void this.handleResetCache();
                  }}
                >
                  {i18n.t('common.resetCache', 'Очистить кэш и перезагрузить')}
                </Button>
              </Space>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
