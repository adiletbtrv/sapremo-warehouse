import { createMockServer } from './gateway.js';
import { store } from './data/seed.js';

const PORT = Number(process.env.PORT ?? 3001);
const { server } = createMockServer();

server.listen(PORT, () => {
  console.log(
    `[Sapremo Mock Gateway] Running on http://localhost:${PORT} (SKUs: ${store.skus.size}, Bins: ${store.bins.size}, STOMP WS: ws://localhost:${PORT}/api/warehouse/ws)`
  );
});
