import type { Request, Response } from 'express';

// @ts-ignore
import serverApp from '../dist/server.cjs';

const app = (serverApp as any)?.default || serverApp;

export default function handler(req: Request, res: Response) {
  return app(req, res);
}


