import type { Request, Response } from 'express';
import app from '../server';

export default function handler(req: Request, res: Response) {
  const matchedPath = (req.headers['x-matched-path'] || req.headers['x-invoke-path'] || req.headers['x-vercel-matched-path']) as string | undefined;
  if (matchedPath && req.url === '/api' && matchedPath !== '/api') {
    req.url = matchedPath;
  }
  return app(req, res);
}



