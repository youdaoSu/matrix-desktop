// Three disposable databases and two desktop HTTP instances. No installed
// profile, account, activation code, SMTP or public service is used.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import https from 'node:https';
import http from 'node:http';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';

const run = promisify(execFile);
const pgBin = process.env.MATRIX_QA_POSTGRES_BIN;
const openssl = process.env.MATRIX_QA_OPENSSL;
assert(pgBin && openssl, 'Specify test PostgreSQL binaries and openssl');
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-shared-accounts-'));
const data = path.join(root, 'database');
const cert = path.join(root, 'test.crt');
const key = path.join(root, 'test.key');
const db = new Map();
const processes = [];
const logs = [];
const setupPassword = 'Fixture-' + randomBytes(16).toString('hex');
const regularPassword = 'Fixture-' + randomBytes(16).toString('hex');
const secret = () => randomBytes(48).toString('hex');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let postgresStarted = false, bridge;

async function freePort() {
  const socket = net.createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}

async function startServer(database, extra = {}) {
  const port = await freePort();
  const base = 'http://127.0.0.1:' + port;
  const record = { tail: '' };
  logs.push(record);
  const child = spawn(process.execPath, ['dist/server/main.js'], {
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    env: {
      ...process.env, NODE_ENV: 'production', SERVER_HOST: '127.0.0.1', SERVER_PORT: String(port),
      SUDA_DATABASE_URL: database, MIAODA_APP_TYPE: '3', MIAODA_LOCAL_DEV: '1', MIAODA_CACHE_URL: '',
      MATRIX_DESKTOP: '1', MATRIX_ACCOUNT_SERVICE: '', MATRIX_ACCOUNT_ORIGIN: '',
      JWT_SECRET: secret(), TOKEN_ENCRYPTION_KEY: secret(), OAUTH_STATE_SECRET: secret(),
      FORCE_AUTHN_INNERAPI_DOMAIN: base, NODE_EXTRA_CA_CERTS: cert, ...extra,
    },
  });
  processes.push(child);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { record.tail = (record.tail + chunk).slice(-2000); });
  for (let i = 0; i < 160 && child.exitCode === null; i++) {
    try {
      const response = await fetch(base + '/app/', { signal: AbortSignal.timeout(1000) });
      const csrf = /suda-csrf-token=([a-f0-9]{48});/.exec(response.headers.get('set-cookie') || '')?.[1];
      if (response.ok && csrf) return { base, csrf };
    } catch { /* startup */ }
    await pause(100);
  }
  throw Error('Isolated server did not start: ' + record.tail.replace(/postgres(?:ql)?:[^\s]+/gi, '[test database]'));
}

async function api(server, method, route, body, token, expected = 200) {
  const response = await fetch(server.base + route, {
    method, signal: AbortSignal.timeout(10000),
    headers: {
      cookie: 'suda-csrf-token=' + server.csrf, 'x-suda-csrf-token': server.csrf,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = response.headers.get('content-type')?.includes('application/json') ? await response.json() : undefined;
  const diagnostic = [result?.error?.message, result?.error?.cause, result?.message].filter(value => typeof value === 'string').join(' ').slice(0, 600);
  assert.equal(response.status, expected, method + ' ' + route + ' ' + diagnostic);
  return result?.data;
}

const pgPort = await freePort();
const uri = name => 'postgresql://matrix_fixture@127.0.0.1:' + pgPort + '/' + name;
const executable = name => path.join(pgBin, name + (process.platform === 'win32' ? '.exe' : ''));
try {
  await run(openssl, ['req', '-x509', '-nodes', '-newkey', 'rsa:2048', '-days', '1',
    '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cert], { windowsHide: true });
  const encoding = process.platform === 'win32' ? 'SQL_ASCII' : 'UTF8';
  await run(executable('initdb'), ['-D', data, '-U', 'matrix_fixture', '--auth=trust', '--encoding=' + encoding, '--locale=C'], { windowsHide: true });
  const pg = spawn(executable('pg_ctl'), ['-D', data, '-l', path.join(root, 'postgres.log'), '-w', '-t', '20', 'start', '-o', '-h 127.0.0.1 -p ' + pgPort], { windowsHide: true, stdio: 'ignore' });
  assert.equal((await once(pg, 'exit'))[0], 0);
  postgresStarted = true;
  const admin = postgres(uri('postgres'), { max: 1, onnotice: () => {} });
  try {
    await admin.unsafe('CREATE ROLE anon_; CREATE ROLE authenticated_; CREATE ROLE service_role_');
    for (const name of ['authority', 'desktop_a', 'desktop_b']) await admin.unsafe('CREATE DATABASE ' + name);
  } finally { await admin.end(); }
  const schema = (await fs.readFile('desktop/database-schema.sql', 'utf8')).replace(/^\\.*$/gm, '');
  for (const name of ['authority', 'desktop_a', 'desktop_b']) {
    const sql = postgres(uri(name), { max: 2, onnotice: () => {} });
    db.set(name, sql);
    await sql.unsafe(schema);
    await sql.unsafe('GRANT USAGE ON SCHEMA public TO anon_, authenticated_, service_role_; GRANT ALL ON ALL TABLES IN SCHEMA public TO anon_, authenticated_, service_role_; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon_, authenticated_, service_role_');
  }
  const cloud = db.get('authority'), left = db.get('desktop_a'), right = db.get('desktop_b');
  await cloud`INSERT INTO public.admin_users (username, password_hash, must_change_pwd) VALUES ('fixture_admin', ${await bcrypt.hash(setupPassword, 10)}, true)`;
  const [plan] = await cloud`INSERT INTO public.vip_plans (name, code, duration_days, max_accounts, price, status)
    VALUES ('Fixture', 'fixture', 30, 3, 0, 'active') RETURNING id`;
  const authority = await startServer(uri('authority'), { MATRIX_DESKTOP: '', MATRIX_ACCOUNT_SERVICE: '1' });
  bridge = https.createServer({ key: await fs.readFile(key), cert: await fs.readFile(cert) }, (req, res) => {
    const target = new URL(req.url, authority.base);
    const upstream = http.request(target, { method: req.method, headers: req.headers }, reply => {
      res.writeHead(reply.statusCode, reply.headers);
      reply.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(upstream);
  }).listen(0, '127.0.0.1');
  await once(bridge, 'listening');
  const upstream = 'https://127.0.0.1:' + bridge.address().port;
  const a = await startServer(uri('desktop_a'), { MATRIX_ACCOUNT_ORIGIN: upstream });
  const b = await startServer(uri('desktop_b'), { MATRIX_ACCOUNT_ORIGIN: upstream });
  const adminPage = await fetch(authority.base + '/admin/login');
  assert.equal(adminPage.status, 200);
  assert.match(adminPage.headers.get('set-cookie') || '', /Secure/i);
  const legacyDesktop = { ...a, csrf: randomBytes(20).toString('hex') + '-1793878000' };
  const badDesktop = { ...a, csrf: 'invalid-old-value' };
  const repairPage = await fetch(a.base + '/app/', { headers: { cookie: 'suda-csrf-token=' + badDesktop.csrf } });
  assert.match(repairPage.headers.get('set-cookie') || '', /suda-csrf-token=[a-f0-9]{48};/);
  const adminCredentials = { username: 'fixture_admin', password: setupPassword };
  await api(badDesktop, 'POST', '/api/admin/login', adminCredentials, undefined, 403);
  const mismatched = await fetch(a.base + '/api/admin/login', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: 'suda-csrf-token=' + legacyDesktop.csrf,
      'x-suda-csrf-token': a.csrf,
    },
    body: JSON.stringify(adminCredentials),
  });
  assert.equal(mismatched.status, 403);
  const firstLogin = await api(legacyDesktop, 'POST', '/api/admin/login', adminCredentials);
  assert.equal(firstLogin.user.mustChangePwd, true);
  await api(a, 'GET', '/api/admin/codes', undefined, firstLogin.token, 403);
  const adminPassword = randomBytes(4).toString('hex');
  const change = { oldPassword: setupPassword, newPassword: adminPassword };
  await api(a, 'POST', '/api/admin/change-password', change, firstLogin.token, 400);
  await api(a, 'POST', '/api/admin/change-password', { ...change, confirmPassword: adminPassword + 'x' }, firstLogin.token, 400);
  const tooShort = adminPassword.slice(0, 7);
  await api(a, 'POST', '/api/admin/change-password', { ...change, newPassword: tooShort, confirmPassword: tooShort }, firstLogin.token, 400);
  const tooLong = adminPassword.repeat(10);
  await api(a, 'POST', '/api/admin/change-password', { ...change, newPassword: tooLong, confirmPassword: tooLong }, firstLogin.token, 400);
  await api(a, 'POST', '/api/admin/change-password', { ...change, confirmPassword: adminPassword }, firstLogin.token);
  await api(a, 'GET', '/api/admin/codes', undefined, firstLogin.token, 401);
  const adminLogin = await api(a, 'POST', '/api/admin/login', { username: 'fixture_admin', password: adminPassword });
  assert.equal(adminLogin.user.mustChangePwd, false);
  const codes = await api(a, 'POST', '/api/admin/codes/generate', {
    planId: plan.id, count: 1, prefix: 'QA', durationDays: 30, maxAccounts: 3,
  }, adminLogin.token, 201);
  const first = { username: 'fixture_user', password: regularPassword };
  await api(b, 'POST', '/api/auth/register', first, undefined, 201);
  const bLogin = await api(b, 'POST', '/api/auth/login', first);
  const aLogin = await api(a, 'POST', '/api/auth/login', first);
  assert.equal(aLogin.user.id, bLogin.user.id);
  await api(b, 'POST', '/api/auth/activate', { code: codes[0].code }, bLogin.token, 201);
  await api(a, 'POST', '/api/auth/activate', { code: codes[0].code }, aLogin.token, 400);
  const aVip = await api(a, 'GET', '/api/vip/status', undefined, aLogin.token);
  assert.equal(aVip.status, 'active');
  assert.equal(aVip.planName, 'Fixture');
  assert.equal(aVip.maxAccounts, 3);
  await api(b, 'GET', '/api/vip/status', undefined, bLogin.token);
  await right`INSERT INTO public.platform_accounts (user_id, platform, nickname) VALUES (${bLogin.user.id}, 'douyin', 'Device local')`;
  assert.equal((await api(b, 'GET', '/api/vip/status', undefined, bLogin.token)).currentAccounts, 1);
  assert.equal((await api(a, 'GET', '/api/vip/status', undefined, aLogin.token)).currentAccounts, 0);
  for (const sql of [left, right]) {
    const [shadow] = await sql`SELECT id, password_hash FROM public.app_users`;
    assert.equal(shadow.id, bLogin.user.id);
    assert.equal(shadow.password_hash, 'cloud-account');
    assert.equal((await sql`SELECT count(*) AS count FROM public.activation_codes`)[0].count, '0');
  }
  assert.equal((await cloud`SELECT count(*) AS count FROM public.platform_accounts`)[0].count, '0');
  const unknown = await fetch(authority.base + '/api/platform/accounts');
  assert.equal(unknown.status, 404);
  await cloud`UPDATE public.app_users SET status='disabled' WHERE id=${bLogin.user.id}`;
  await api(b, 'GET', '/api/vip/status', undefined, bLogin.token, 401);
  await new Promise(resolve => bridge.close(resolve));
  bridge = undefined;
  await api(b, 'POST', '/api/auth/login', first, undefined, 503);
  console.log(JSON.stringify({ passed: true, realNestInstances: 3, syntheticDatabases: 3, activationSharedOnce: true, vipShared: true, platformAccountsDeviceLocal: true, outageFailsClosed: true }));
} catch (error) {
  for (const { tail } of logs) console.error(tail.replace(/postgres(?:ql)?:[^\s]+/gi, '[test database]').replaceAll(setupPassword, '[fixture password]').replaceAll(regularPassword, '[fixture password]'));
  throw error;
} finally {
  if (bridge) await new Promise(resolve => bridge.close(resolve));
  for (const child of processes) if (child.exitCode === null && child.signalCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await exited;
  }
  await Promise.all([...db.values()].map(sql => sql.end()));
  if (postgresStarted) await run(executable('pg_ctl'), ['-D', data, '-w', 'stop', '-m', 'fast'], { windowsHide: true });
  const resolved = await fs.realpath(root);
  const expected = await fs.realpath(os.tmpdir());
  assert.equal(path.dirname(resolved), expected);
  assert(path.basename(resolved).startsWith('matrix-shared-accounts-'));
  await fs.rm(resolved, { recursive: true, force: true });
}
