import { randomBytes } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { AppUser } from '@shared/api.interface';

const accountRoute = /^\/api\/(?:auth|users|vip|admin)(?:\/|$)/;
const sessionToken = /^Bearer [A-Za-z0-9_.-]{1,8192}$/;
const requestTimeout = 8000;
const maxReplyBytes = 8 * 1024 * 1024;

export function isAccountCsrfToken(value: unknown): value is string {
  // Existing profiles may still carry the platform middleware's SHA-1 and timestamp format.
  return typeof value === 'string' && /^(?:[a-f0-9]{48}|[a-f0-9]{40}-[0-9]{10})$/.test(value);
}

export function accountAuthorityOrigin(value = process.env.MATRIX_ACCOUNT_ORIGIN): string | undefined {
  if (!value?.trim()) return undefined;
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MATRIX_ACCOUNT_ORIGIN must be an HTTPS origin');
  }
  return url.origin;
}

export function validateAccountServiceConfiguration(env = process.env) {
  const origin = accountAuthorityOrigin(env.MATRIX_ACCOUNT_ORIGIN ?? '');
  if (env.MATRIX_ACCOUNT_SERVICE !== '1') return origin;
  if (origin || env.MATRIX_DESKTOP === '1') throw new Error('Account service and desktop gateway must run separately');
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32 || !env.SUDA_DATABASE_URL) {
    throw new Error('Account service requires a dedicated database and a strong JWT secret');
  }
  return undefined;
}

export function accountServiceIngress() {
  const attempts = new Map<string, { count: number; expires: number }>();
  const rateLimits: Record<string, number> = {
    '/auth/register': 12,
    '/auth/login': 40,
    '/auth/activate': 20,
    '/admin/login': 12,
  };
  return (req: Request, res: Response, next: NextFunction) => {
    if (!/^\/(?:auth|users|vip|admin)(?:\/|$)/.test(req.path)) return res.sendStatus(404);
    if (req.method !== 'POST') return next();
    const route = req.path.replace(/\/$/, '');
    const limit = rateLimits[route];
    if (!limit) return next();
    const now = Date.now();
    const key = route + ':' + (req.ip || req.socket.remoteAddress || 'unknown');
    let attempt = attempts.get(key);
    if (!attempt || attempt.expires <= now) {
      if (attempts.size >= 4096) {
        for (const [id, value] of attempts) if (value.expires <= now) attempts.delete(id);
        if (attempts.size >= 4096) {
          res.setHeader('Retry-After', '60');
          return res.status(429).json({ error: { message: '请求过多，请稍后重试' } });
        }
      }
      attempt = { count: 0, expires: now + 60000 };
      attempts.set(key, attempt);
    }
    if (++attempt.count > limit) {
      res.setHeader('Retry-After', String(Math.ceil((attempt.expires - now) / 1000)));
      return res.status(429).json({ error: { message: '请求过多，请稍后重试' } });
    }
    return next();
  };
}

async function limitedBody(response: globalThis.Response, limit: number): Promise<Buffer> {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Account service response exceeded the limit');
      chunks.push(Buffer.from(value));
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export function accountGateway(origin: string, request = fetch) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Reject noncanonical paths inside the account namespace instead of
    // accidentally falling through to the old local account controllers.
    const raw = req.originalUrl.split('?', 1)[0];
    const decoded = (() => { try { return decodeURIComponent(raw); } catch { return raw; } })();
    if (!accountRoute.test(decoded.toLowerCase().replace(/\\/g, '/').replace(/\/{2,}/g, '/'))) return next();
    if (!accountRoute.test(raw) || !/^\/[A-Za-z0-9/_-]+$/.test(raw) || raw.includes('//')) return res.sendStatus(400);
    if (req.method === 'GET' && raw.replace(/\/$/, '') === '/api/vip/status') return next();
    const csrf = req.cookies?.['suda-csrf-token'];
    if (!isAccountCsrfToken(csrf) || req.get('x-suda-csrf-token') !== csrf) {
      return res.status(403).json({ error: { message: '登录安全校验已失效，请重新打开远效后再试' } });
    }
    const authorization = req.get('authorization');
    if (authorization && !sessionToken.test(authorization)) return res.sendStatus(401);
    const headers: Record<string, string> = {
      cookie: `suda-csrf-token=${csrf}`,
      'x-suda-csrf-token': csrf,
      accept: 'application/json',
    };
    if (authorization) headers.authorization = authorization;
    const body = ['GET', 'HEAD'].includes(req.method) || req.body === undefined ? undefined : JSON.stringify(req.body);
    if (body !== undefined) headers['content-type'] = 'application/json';
    try {
      const upstream = await request(origin + req.originalUrl, {
        method: req.method, headers, body, redirect: 'error', signal: AbortSignal.timeout(requestTimeout),
      });
      const payload = await limitedBody(upstream, maxReplyBytes);
      const type = upstream.headers.get('content-type') || '';
      if (payload.length && !/^application\/json(?:;|$)/i.test(type)) throw new Error('Account service returned a non-JSON response');
      const retryAfter = upstream.headers.get('retry-after');
      if (retryAfter && /^\d{1,4}$/.test(retryAfter)) res.setHeader('Retry-After', retryAfter);
      res.setHeader('Cache-Control', 'no-store');
      if (type) res.type('application/json');
      return res.status(upstream.status).send(payload);
    } catch {
      return res.status(503).json({ error: { message: '统一账号服务暂不可用，请稍后重试' } });
    }
  };
}

export async function readAuthorityAccount(origin: string, route: '/api/auth/me' | '/api/vip/status', authorization: string, request = fetch) {
  if (!sessionToken.test(authorization)) return undefined;
  const csrf = randomBytes(24).toString('hex');
  const response = await request(origin + route, {
    headers: { authorization, cookie: `suda-csrf-token=${csrf}`, 'x-suda-csrf-token': csrf },
    redirect: 'error', signal: AbortSignal.timeout(requestTimeout),
  });
  if ([401, 403, 404].includes(response.status)) return undefined;
  if (!response.ok) throw new Error('Account service validation unavailable');
  return JSON.parse((await limitedBody(response, 32 * 1024)).toString('utf8')).data as unknown;
}

export async function readAuthorityUser(origin: string, authorization: string, request = fetch): Promise<AppUser | undefined> {
  const user = await readAuthorityAccount(origin, '/api/auth/me', authorization, request) as AppUser | undefined;
  if (!user || user.status !== 'active' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(user.id) ||
      typeof user.username !== 'string' || !user.username || user.username.length > 50 ||
      !['active', 'inactive', 'expired'].includes(user.vipStatus) ||
      (user.vipExpiresAt && !Number.isFinite(Date.parse(user.vipExpiresAt))) ||
      !Number.isSafeInteger(user.maxAccounts) || user.maxAccounts < 0) return undefined;
  return user;
}
