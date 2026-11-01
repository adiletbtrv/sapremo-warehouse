import { createMockServer } from './gateway';

const { app } = createMockServer();
(app as any).default = app;

export default app;
