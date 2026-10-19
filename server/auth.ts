// Minimal auth for a 2-person team.
//
// Users are configured with the AUTH_USERS env var:
//   AUTH_USERS="simon@ejemplo.com:Simón:<hash>,edison@ejemplo.com:Edison:<hash>"
// Generate each <hash> with:  npm run hash-password -- 'tu-contraseña'
//
// Local development only: AUTH_DISABLED=1 skips login (refused in production).
import crypto from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import session from 'express-session';
import createMemoryStore from 'memorystore';
import { z } from 'zod';

declare module 'express-session' {
  interface SessionData {
    user?: { email: string; name: string };
  }
}

type AuthUser = { email: string; name: string; hash: string };

const IS_PROD = process.env.NODE_ENV === 'production';
export const AUTH_DISABLED = !IS_PROD && process.env.AUTH_DISABLED === '1';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64url');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64url'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function loadUsers(): AuthUser[] {
  return (process.env.AUTH_USERS ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
    .map(entry => {
      const [email, name, ...rest] = entry.split(':');
      return { email: email.trim().toLowerCase(), name: (name || email).trim(), hash: rest.join(':').trim() };
    })
    .filter(user => user.email && user.hash.startsWith('scrypt$'));
}

// Simple in-memory brute-force guard: 8 failed attempts per IP per 15 min.
const failures = new Map<string, { count: number; resetAt: number }>();
function tooManyAttempts(ip: string) {
  const entry = failures.get(ip);
  if (!entry || entry.resetAt < Date.now()) return false;
  return entry.count >= 8;
}
function recordFailure(ip: string) {
  const now = Date.now();
  const entry = failures.get(ip);
  if (!entry || entry.resetAt < now) failures.set(ip, { count: 1, resetAt: now + 15 * 60_000 });
  else entry.count += 1;
}

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });

// Paths under /api that don't need a session.
const PUBLIC_API = new Set(['/api/auth/login', '/api/auth/logout', '/api/auth/me', '/api/health']);

export function setupAuth(app: Express) {
  const users = loadUsers();
  const secret = process.env.SESSION_SECRET;
  if (IS_PROD && (!secret || secret.length < 32)) {
    throw new Error('SESSION_SECRET (min. 32 caracteres) es obligatorio en producción.');
  }
  if (IS_PROD && users.length === 0) {
    console.warn('[auth] AUTH_USERS vacío: nadie podrá iniciar sesión.');
  }
  if (process.env.AUTH_DISABLED === '1' && IS_PROD) {
    console.warn('[auth] AUTH_DISABLED=1 ignorado en producción.');
  }
  if (AUTH_DISABLED) console.warn('[auth] Login desactivado (AUTH_DISABLED=1, solo desarrollo).');

  if (IS_PROD) app.set('trust proxy', 1);
  const MemoryStore = createMemoryStore(session);
  app.use(session({
    name: 'aos.sid',
    secret: secret || crypto.randomBytes(32).toString('hex'),
    resave: false,
    saveUninitialized: false,
    store: new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000 }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // Secure cookies need HTTPS. COOKIE_SECURE=0 only for testing a prod build over http://localhost.
      secure: IS_PROD && process.env.COOKIE_SECURE !== '0',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  app.get('/api/auth/me', (req, res) => {
    if (AUTH_DISABLED) return res.json({ email: 'dev@local', name: 'Dev', authDisabled: true });
    if (!req.session.user) return res.status(401).json({ error: 'unauthenticated' });
    res.json(req.session.user);
  });

  app.post('/api/auth/login', (req, res) => {
    const ip = req.ip || 'unknown';
    if (tooManyAttempts(ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Correo o contraseña inválidos.' });
    const user = users.find(item => item.email === parsed.data.email.trim().toLowerCase());
    if (!user || !verifyPassword(parsed.data.password, user.hash)) {
      recordFailure(ip);
      return res.status(401).json({ error: 'Correo o contraseña incorrectos.' });
    }
    failures.delete(ip);
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'session_error' });
      req.session.user = { email: user.email, name: user.name };
      res.json(req.session.user);
    });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('aos.sid');
      res.json({ ok: true });
    });
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    if (AUTH_DISABLED || PUBLIC_API.has(req.originalUrl.split('?')[0])) return next();
    if (!req.session.user) return res.status(401).json({ error: 'unauthenticated' });
    next();
  });
}

export function currentUserName(req: Request): string | undefined {
  return req.session?.user?.name ?? (AUTH_DISABLED ? 'Dev' : undefined);
}
