import * as Sentry from '@sentry/react';

type LogContext = Record<string, unknown>;

export const logger = {
  info: (message: string, context?: LogContext) => {
    if (import.meta.env.DEV) {
      console.info(`[INFO] ${message}`, context ?? '');
    }
    Sentry.addBreadcrumb({
      category: 'app.info',
      message,
      data: context,
      level: 'info',
    });
  },

  warn: (message: string, context?: LogContext) => {
    console.warn(`[WARN] ${message}`, context ?? '');
    Sentry.addBreadcrumb({
      category: 'app.warn',
      message,
      data: context,
      level: 'warning',
    });
  },

  error: (message: string, error?: unknown, context?: LogContext) => {
    console.error(`[ERROR] ${message}`, error ?? '', context ?? '');

    if (import.meta.env.PROD) {
      if (error instanceof Error) {
        Sentry.withScope((scope) => {
          if (context) {
            scope.setExtras(context);
          }
          scope.setExtra('logMessage', message);
          Sentry.captureException(error);
        });
      } else {
        Sentry.withScope((scope) => {
          if (context) {
            scope.setExtras(context);
          }
          if (error) {
            scope.setExtra('rawError', error);
          }
          Sentry.captureMessage(message, 'error');
        });
      }
    }
  },

  debug: (message: string, context?: LogContext) => {
    if (import.meta.env.DEV) {
      console.debug(`[DEBUG] ${message}`, context ?? '');
    }
  },
};
