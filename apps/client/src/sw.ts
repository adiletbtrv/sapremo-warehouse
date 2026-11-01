/// <reference lib="webworker" />
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { NetworkOnly } from 'workbox-strategies';

declare let self: ServiceWorkerGlobalScope & { __WB_MANIFEST: string[] };

void self.skipWaiting();
void clientsClaim();

precacheAndRoute(self.__WB_MANIFEST || []);

// Исключаем WebSocket/SockJS маршруты — SW не должен их перехватывать
const isWebSocketRoute = ({ request }: { request: Request }) => {
  const path = new URL(request.url).pathname;
  return path.includes('/ws/') || path.includes('/ws/info') || path.includes('/websocket');
};

const isApiRequest = ({ request }: { request: Request }) => {
  const path = new URL(request.url).pathname;
  return path.startsWith('/api') && !isWebSocketRoute({ request });
};

registerRoute(
  ({ request }) => isApiRequest({ request }) && request.method === 'GET',
  new NetworkOnly(),
);
