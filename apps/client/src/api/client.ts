import axios, { type InternalAxiosRequestConfig, type AxiosResponse, type AxiosError } from 'axios';
import { useAuthStore } from '@/store/authStore';
import { isNativeTauri, nativeFetch } from '@/adapters/nativeAdapter';

export const isTauri = isNativeTauri();

function resolveApiBaseRoot(): string {
  const configured =
    (import.meta.env.VITE_API_URL as string | undefined) ??
    (isTauri ? 'http://localhost:3001/api' : '/api');

  const trimmed = configured.replace(/\/$/, '').replace(/\/warehouse$/, '');
  if (trimmed.endsWith('/api')) {
    return trimmed;
  }
  return `${trimmed}/api`;
}

const API_ROOT = resolveApiBaseRoot();

const WAREHOUSE_BASE =
  (import.meta.env.VITE_WAREHOUSE_API_URL as string | undefined) ?? `${API_ROOT}/warehouse`;

const DRIVERS_BASE =
  (import.meta.env.VITE_DRIVERS_API_URL as string | undefined) ?? `${API_ROOT}/drivers`;

const FACTORY_BASE =
  (import.meta.env.VITE_FACTORY_API_URL as string | undefined) ?? `${API_ROOT}/factory`;

const API_TIMEOUT = Number(import.meta.env.VITE_API_TIMEOUT as string | undefined) || 60_000;

const tauriAdapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
  let fullUrl = (() => {
    const base = (config.baseURL ?? '').replace(/\/$/, '');
    const path = (config.url ?? '').replace(/^([^/])/, '/$1');
    if (config.url?.startsWith('http')) return config.url;
    return `${base}${path}`;
  })();

  if (config.params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(config.params as Record<string, unknown>)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      fullUrl += (fullUrl.includes('?') ? '&' : '?') + queryString;
    }
  }

  const headers = new Headers();
  if (config.headers) {
    for (const [key, value] of Object.entries(config.headers as Record<string, unknown>)) {
      if (value !== undefined && value !== null && typeof value !== 'object') {
        headers.set(key, String(value));
      }
    }
  }

  const method = (config.method ?? 'GET').toUpperCase();
  let body: BodyInit | undefined;
  if (config.data !== undefined && config.data !== null && method !== 'GET' && method !== 'HEAD') {
    body = typeof config.data === 'string' ? config.data : JSON.stringify(config.data);
  }

  const abortController = new AbortController();
  let timeoutId: number | undefined;
  if (config.timeout) {
    timeoutId = window.setTimeout(() => abortController.abort(), config.timeout);
  }

  const signal = config.signal ? (config.signal as AbortSignal) : abortController.signal;

  let response: Response;
  try {
    const fetchOptions: RequestInit = {
      method,
      headers,
      signal,
    };
    if (body !== undefined) fetchOptions.body = body;

    response = await nativeFetch(fullUrl, fetchOptions);
    if (timeoutId) clearTimeout(timeoutId);
  } catch (err) {
    const errStr = String(err).toLowerCase();
    if (errStr.includes('canceled') || errStr.includes('aborted')) {
      return Promise.reject(new axios.CanceledError(String(err)));
    }
    const error: AxiosError = new axios.AxiosError(
      `Network Error: ${String(err)}`,
      'ERR_NETWORK',
      config,
      null,
      undefined,
    );
    return Promise.reject(error);
  }

  const rawText = await response.text();
  let data: unknown = rawText;
  try {
    data = JSON.parse(rawText);
  } catch {
    // Non-JSON payload preserved as string
  }

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const axiosResponse: AxiosResponse = {
    data,
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    config,
    request: {},
  };

  if (response.status >= 200 && response.status < 300) {
    return axiosResponse;
  }

  const axiosError = new axios.AxiosError(
    `Request failed with status code ${response.status}`,
    `ERR_BAD_RESPONSE`,
    config,
    {},
    axiosResponse,
  );
  return Promise.reject(axiosError);
};

function createClient(baseURL: string) {
  return axios.create({
    baseURL,
    timeout: API_TIMEOUT,
    headers: { 'Content-Type': 'application/json' },
    ...(isTauri ? { adapter: tauriAdapter as unknown as typeof axios.defaults.adapter } : {}),
  });
}

export const warehouseClient = createClient(WAREHOUSE_BASE);
export const driversClient = createClient(DRIVERS_BASE);
export const factoryClient = createClient(FACTORY_BASE);

export const apiClient = warehouseClient;

let isRefreshing = false;
let failedQueue: {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
}[] = [];

const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token!);
    }
  });
  failedQueue = [];
};

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window
        .atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join(''),
    );
    return JSON.parse(jsonPayload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

[warehouseClient, driversClient, factoryClient].forEach((client) => {
  client.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
      config.headers = config.headers || {};
      const token = useAuthStore.getState().token;
      if (token) {
        if (typeof config.headers.set === 'function') {
          config.headers.set('Authorization', `Bearer ${token}`);
        } else {
          (config.headers as Record<string, unknown>).Authorization = `Bearer ${token}`;
        }

        try {
          const payload = parseJwt(token);
          let warehouseId = payload?.warehouse_id || payload?.warehouseId;

          if (!warehouseId) {
            warehouseId = useAuthStore.getState().user?.warehouseId;
          }

          if (warehouseId) {
            if (typeof config.headers.set === 'function') {
              config.headers.set('X-Warehouse-Id', String(warehouseId));
            } else {
              (config.headers as Record<string, unknown>)['X-Warehouse-Id'] = String(warehouseId);
            }
          }
        } catch {
          // X-Warehouse-Id header is optional
        }
      }

      return config;
    },
    (error: AxiosError) => Promise.reject(error),
  );

  client.interceptors.response.use(
    (response: AxiosResponse) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

      const isNetworkError =
        !error.response &&
        (error.code === 'ERR_NETWORK' ||
          error.code === 'ECONNABORTED' ||
          error.message?.startsWith('Network Error'));

      const isServiceDown =
        error.response?.status === 502 ||
        error.response?.status === 503 ||
        error.response?.status === 504;

      if (isNetworkError || isServiceDown) {
        if (isNetworkError) {
          const isDriversService =
            error.config?.baseURL?.includes('/api/drivers') ??
            error.config?.url?.includes('drivers');

          if (!isDriversService) {
            const { useSyncStore } = await import('@/store/syncStore');
            const syncStore = useSyncStore.getState();
            if (syncStore.isOnline) syncStore.setOnlineStatus(false);
          }
        }

        const customError = error as AxiosError & { isOffline?: boolean };
        customError.isOffline = true;
        return Promise.reject(customError);
      }

      if (
        error.response?.status === 401 &&
        !originalRequest.url?.includes('/auth/login') &&
        !originalRequest.url?.includes('/auth/refresh')
      ) {
        if (
          originalRequest.baseURL?.includes('/api/drivers') ??
          originalRequest.url?.includes('drivers')
        ) {
          return Promise.reject(error);
        }

        const token = useAuthStore.getState().token;

        if (import.meta.env.DEV && token === 'dev-access-token') {
          const { useSyncStore } = await import('@/store/syncStore');
          const syncStore = useSyncStore.getState();
          if (syncStore.isOnline) syncStore.setOnlineStatus(false);
          const customError = error as AxiosError & { isOffline?: boolean };
          customError.isOffline = true;
          return Promise.reject(customError);
        }

        if (originalRequest._retry) {
          await useAuthStore.getState().logout(true);
          window.location.href = '/login';
          return Promise.reject(error);
        }

        if (isRefreshing) {
          try {
            const newToken = await new Promise<string>((resolve, reject) => {
              failedQueue.push({ resolve, reject });
            });
            if (typeof originalRequest.headers.set === 'function') {
              originalRequest.headers.set('Authorization', `Bearer ${newToken}`);
            } else {
              (originalRequest.headers as Record<string, unknown>).Authorization =
                `Bearer ${newToken}`;
            }
            return client(originalRequest);
          } catch (err) {
            return Promise.reject(err);
          }
        }

        originalRequest._retry = true;
        isRefreshing = true;

        const refreshToken = useAuthStore.getState().refreshToken;
        if (!refreshToken) {
          await useAuthStore.getState().logout(true);
          window.location.href = '/login';
          return Promise.reject(error);
        }

        try {
          const response = await axios.post<{ access: string; refresh?: string }>(
            `${FACTORY_BASE}/auth/refresh`,
            {
              refresh: refreshToken,
            },
          );

          const { access, refresh } = response.data;

          useAuthStore.getState().updateTokens(access, refresh ?? refreshToken);

          processQueue(null, access);
          isRefreshing = false;

          if (typeof originalRequest.headers.set === 'function') {
            originalRequest.headers.set('Authorization', `Bearer ${access}`);
          } else {
            (originalRequest.headers as Record<string, unknown>).Authorization = `Bearer ${access}`;
          }
          return client(originalRequest);
        } catch (refreshError) {
          processQueue(refreshError as Error, null);
          isRefreshing = false;
          await useAuthStore.getState().logout(true);
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }

      return Promise.reject(error);
    },
  );
});

export default apiClient;
