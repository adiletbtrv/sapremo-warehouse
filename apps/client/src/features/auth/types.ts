export interface AuthUser {
  id: string | number;
  username: string;
  email?: string;
  full_name?: string;
  role: string;
  warehouse_id?: string | null;
  is_superuser?: boolean;
}

export interface AuthResponse {
  access: string;
  refresh?: string;
  user?: AuthUser;
}

export interface ApiErrorData {
  error?: { message?: string; code?: string } | string;
  message?: string;
  detail?: string;
  code?: string;
}

export interface ApiErrorResponse {
  isOffline?: boolean;
  response?: {
    status?: number;
    data?: ApiErrorData;
  };
}

export function getErrorMessage(error: unknown, fallback = 'Произошла ошибка'): string {
  if (!error) return fallback;
  const err = error as ApiErrorResponse;

  if (err.isOffline) {
    return 'Сервер недоступен. Пожалуйста проверьте подключение к сети.';
  }

  const data = err.response?.data;
  if (!data) return fallback;

  if (
    typeof data.error === 'object' &&
    data.error &&
    'message' in data.error &&
    typeof data.error.message === 'string'
  ) {
    return data.error.message;
  }
  if (typeof data.error === 'string') {
    return data.error;
  }
  if (typeof data.message === 'string') {
    return data.message;
  }
  if (typeof data.detail === 'string') {
    return data.detail;
  }

  return fallback;
}
