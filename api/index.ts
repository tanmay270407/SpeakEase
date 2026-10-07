import type { Request, Response } from 'express';

let cachedApp: any = null;

async function getApp() {
  if (cachedApp) return cachedApp;
  try {
    // @ts-ignore
    const mod = await import('../dist/server.cjs');
    cachedApp = (mod as any)?.default?.default || (mod as any)?.default || mod;
  } catch (_err) {
    // @ts-ignore
    const mod = await import('../server.ts');
    cachedApp = (mod as any)?.default?.default || (mod as any)?.default || mod;
  }
  return cachedApp;
}

export default async function handler(req: Request, res: Response) {
  const app = await getApp();
  return app(req, res);
}


