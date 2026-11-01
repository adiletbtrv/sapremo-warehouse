import { describe, it, expect, beforeEach } from 'vitest';
import { mapApiError } from '@/utils/errorMapper';
import i18n from '@/i18n';

describe('mapApiError', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('ru');
  });

  it('handles standard Error instances', () => {
    const err = new Error('Custom domain error');
    expect(mapApiError(err)).toBe('Custom domain error');
  });

  it('maps drivers-service rejection errors to human-readable format in Russian and English', async () => {
    const axErr404 = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          error: 'Внутренняя ошибка: drivers-service отклонил платеж, HTTP 404',
        },
      },
    };
    expect(mapApiError(axErr404)).toBe('Водитель не найден в сервисе взаиморасчетов (HTTP 404)');

    await i18n.changeLanguage('en');
    expect(mapApiError(axErr404)).toBe('Driver not found in settlement service (HTTP 404)');

    await i18n.changeLanguage('ru');
    const axErr400 = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {
          error: 'Внутренняя ошибка: drivers-service отклонил платеж, HTTP 400',
        },
      },
    };
    expect(mapApiError(axErr400)).toBe(
      'Сервис водителей отклонил платеж (HTTP 400): проверьте задолженность водителя',
    );
  });

  it('extracts nested object error from axios response data.error.message', () => {
    const axErr = {
      isAxiosError: true,
      response: {
        status: 400,
        data: {
          error: {
            message: 'Неверный формат суммы',
            code: 'invalid_amount',
          },
        },
      },
    };
    expect(mapApiError(axErr)).toBe('Неверный формат суммы');
  });

  it('extracts errorDetail string or message', () => {
    const axErr = {
      isAxiosError: true,
      response: {
        status: 404,
        data: {
          errorDetail: {
            message: 'Долг не найден',
          },
        },
      },
    };
    expect(mapApiError(axErr)).toBe('Долг не найден');
  });

  it('falls back to status message when data is empty', () => {
    const axErr = {
      isAxiosError: true,
      response: {
        status: 500,
        data: {},
      },
    };
    expect(mapApiError(axErr)).toBe('Ошибка сервера, попробуйте позже');
  });

  it('handles 409 Conflict with custom error message (e.g. insufficient funds)', () => {
    const axErr409 = {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          error: 'Недостаточно средств в кассе',
        },
      },
    };
    expect(mapApiError(axErr409)).toBe('Недостаточно средств в кассе');
  });

  it('handles raw technical 409 string and Error instances', () => {
    expect(mapApiError('Client Error 409: Request failed with status code 409')).toBe(
      'Недостаточно средств в кассе',
    );
    expect(mapApiError(new Error('Client Error 409: Request failed with status code 409'))).toBe(
      'Недостаточно средств в кассе',
    );
  });

  it('handles network error without response', () => {
    const axErr = {
      isAxiosError: true,
    };
    expect(mapApiError(axErr)).toBe('Нет соединения с сервером');
  });
});
