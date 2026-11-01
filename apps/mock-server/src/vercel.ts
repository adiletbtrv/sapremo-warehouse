import app from './index.js';

export default function handler(req: any, res: any) {
  return app(req, res);
}
