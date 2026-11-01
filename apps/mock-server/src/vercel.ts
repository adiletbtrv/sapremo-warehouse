import { createMockServer } from './index.js';

const { app } = createMockServer();

export default function handler(req: any, res: any) {
  return app(req, res);
}
