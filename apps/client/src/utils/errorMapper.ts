import type { AxiosError } from 'axios';
import i18n from '@/i18n';

interface BackendError {
  error?: { message?: string; code?: string };
  message?: string;
  detail?: string;
}

export function mapApiError(error: unknown, fallback?: string): string {
  const defaultFallback =
    fallback ?? i18n.t('errors.networkError', { defaultValue: 'Произошла ошибка' });
  if (!error) return defaultFallback;

  // 1. Regular JavaScript / Domain Error
  if (error instanceof Error && !('isAxiosError' in error)) {
    if (
      error.message.includes('409') &&
      (error.message.includes('Request failed') || error.message.includes('Client Error'))
    ) {
      return i18n.t('payment.errors.insufficient_funds', {
        defaultValue: 'Недостаточно средств в кассе',
      });
    }
    return error.message || defaultFallback;
  }

  // 2. Axios HTTP Error
  const axErr = error as AxiosError<BackendError>;
  if (axErr?.isAxiosError) {
    if (!axErr.response) {
      return i18n.t('errors.noConnection', { defaultValue: 'Нет соединения с сервером' });
    }

    const data = axErr.response.data as
      | {
          error?: string | { message?: string; code?: string };
          errorDetail?: string | { message?: string; code?: string };
          message?: string;
          detail?: string;
        }
      | string
      | undefined;

    let message: string | undefined;
    if (typeof data === 'string' && data.trim().length > 0) {
      message = data;
    } else if (typeof data === 'object' && data !== null) {
      if (typeof data.error === 'string') {
        message = data.error;
      } else if (data.error?.message) {
        message = data.error.message;
      } else if (typeof data.errorDetail === 'string') {
        message = data.errorDetail;
      } else if (data.errorDetail?.message) {
        message = data.errorDetail.message;
      } else if (data.message) {
        message = data.message;
      } else if (data.detail) {
        message = data.detail;
      }
    }

    const errorCode =
      typeof data === 'object' && data !== null
        ? ((typeof data.error === 'object' ? data.error?.code : undefined) ??
          (typeof data.errorDetail === 'object' ? data.errorDetail?.code : undefined) ??
          (data as { code?: string }).code)
        : undefined;

    const isDuplicateConflict =
      errorCode === 'data_integrity_violation' ||
      Boolean(message?.includes('A record with this value already exists')) ||
      Boolean(message?.includes('already exists'));

    if (isDuplicateConflict) {
      return i18n.t('errors.conflict', {
        defaultValue: 'Запись с такими данными (телефон или номер машины) уже существует',
      });
    }

    if (message) {
      if (
        message.includes('drivers-service отклонил платеж, HTTP 400') ||
        (message.includes('drivers-service') && message.includes('400'))
      ) {
        return i18n.t('errors.driversDebt400', {
          defaultValue:
            'Сервис водителей отклонил платеж (HTTP 400): проверьте задолженность водителя',
        });
      }
      if (
        message.includes('drivers-service отклонил платеж, HTTP 404') ||
        message.includes('debt_not_found') ||
        (message.includes('drivers-service') && message.includes('404'))
      ) {
        return i18n.t('errors.driversDebt404', {
          defaultValue: 'Водитель не найден в сервисе взаиморасчетов (HTTP 404)',
        });
      }
      return message;
    }

    const STATUS_MESSAGES: Record<number, string> = {
      400: i18n.t('errors.badRequest', { defaultValue: 'Некорректные данные' }),
      401: i18n.t('errors.unauthorized', { defaultValue: 'Сессия истекла, войдите снова' }),
      403: i18n.t('errors.forbidden', { defaultValue: 'Недостаточно прав доступа' }),
      404: i18n.t('errors.notFound', { defaultValue: 'Данные не найдены' }),
      409: i18n.t('errors.conflict', {
        defaultValue: 'Конфликт данных (409): операция отклонена сервером',
      }),
      422: i18n.t('errors.badRequest', { defaultValue: 'Ошибка валидации' }),
      500: i18n.t('errors.serverError', { defaultValue: 'Ошибка сервера, попробуйте позже' }),
      502: i18n.t('errors.serviceUnavailable', { defaultValue: 'Сервис временно недоступен' }),
      503: i18n.t('errors.serviceUnavailable', { defaultValue: 'Сервис на обслуживании' }),
    };

    return (
      (axErr.response.status ? STATUS_MESSAGES[axErr.response.status] : null) ?? defaultFallback
    );
  }

  // 3. Object with message string
  if (typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: unknown }).message);
    if (msg) return msg;
  }

  if (typeof error === 'string') {
    if (
      error.includes('409') &&
      (error.includes('Request failed') || error.includes('Client Error'))
    ) {
      return i18n.t('payment.errors.insufficient_funds', {
        defaultValue: 'Недостаточно средств в кассе',
      });
    }
    return error;
  }

  return defaultFallback;
}
