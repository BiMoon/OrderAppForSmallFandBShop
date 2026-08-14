/**
 * Kiểm cổng đăng nhập cho ba trang máy tính (order / observeOrder / summary).
 *
 *   node test/kiem-cong-dang-nhap.mjs
 *
 * Ba trang đó chỉ import firebase-app + firebase-database, không import auth,
 * nên Database mở kết nối trắng và rules từ chối — trang trắng, không báo gì.
 * `auth-guard.js` vá đúng chỗ đó. Bài kiểm này canh bốn chuyện:
 *
 *   1. Đã đăng nhập  -> ở lại trang, hiện huy hiệu tài khoản.
 *   2. Chưa đăng nhập -> về ./index.html?tiep=<đường quay lại>.
 *   3. Vào cổng có ?tiep= và đã đăng nhập -> trả về ĐÚNG trang cũ.
 *   4. ?tiep=//evil.com -> KHÔNG đi theo (chống chuyển hướng ra ngoài).
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4188;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  let p = join('.', normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, ''));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  let body;
  try { body = await readFile(p); } catch { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
  res.end(body);
});
await new Promise(r => server.listen(PORT, r));

let hong = 0;
const bao = (ok, chu) => { if (!ok) hong++; console.log(`  ${ok ? '✔' : '✘'} ${chu}`); };

const NGUOI = { uid: 'u1', email: 'quan@ghecauhai.vn', displayName: 'Quán', photoURL: '' };

const fakeApp = `
let _app = null;
export const initializeApp = (c) => (_app = { name: '[DEFAULT]', options: c });
export const getApps = () => (_app ? [_app] : []);
export const getApp = () => _app;
`;

const fakeAuth = (user) => `
const nguoi = ${JSON.stringify(user)};
export const getAuth = () => ({ currentUser: nguoi });
export class GoogleAuthProvider {}
export const signInWithPopup = async () => ({ user: nguoi });
export const signOut = async () => {};
export const onAuthStateChanged = (a, cb) => { setTimeout(() => cb(nguoi), 10); return () => {}; };
`;

/* Database giả: đủ để trang cũ khởi tạo mà không ra ngoài mạng. */
const fakeDb = `
export const getDatabase = () => ({});
export const ref = () => ({});
export const onValue = (r, cb) => { cb({ val: () => null, forEach: () => {} }); return () => {}; };
export const onChildAdded = () => () => {};
export const onChildChanged = () => () => {};
export const onChildRemoved = () => () => {};
export const push = async () => ({ key: 'k1' });
export const set = async () => {};
export const remove = async () => {};
export const update = async () => {};
export const runTransaction = async () => ({ committed: true, snapshot: { val: () => 1, exists: () => true } });
export const query = (r) => r;
export const orderByKey = () => ({});
export const limitToLast = () => ({});
export const serverTimestamp = () => Date.now();
`;

async function mo(duong, { user = NGUOI } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'vi-VN', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const loi = [];
  page.on('pageerror', e => loi.push(e.message));

  await page.route(u => !u.hostname.includes('localhost'), r => r.abort());
  await page.route('**/firebasejs/**/firebase-app.js',      r => r.fulfill({ status:200, contentType:'text/javascript', body: fakeApp }));
  await page.route('**/firebasejs/**/firebase-auth.js',     r => r.fulfill({ status:200, contentType:'text/javascript', body: fakeAuth(user) }));
  await page.route('**/firebasejs/**/firebase-database.js', r => r.fulfill({ status:200, contentType:'text/javascript', body: fakeDb }));

  await page.goto(`http://localhost:${PORT}${duong}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  return { page, ctx, loi };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

console.log('\nCổng đăng nhập cho ba trang máy tính\n');

/* ── 1. đã đăng nhập ───────────────────────────────────────────────────── */
for (const trang of ['/order.html', '/observeOrder.html', '/summary.html']) {
  const { page, ctx } = await mo(trang);
  const oLai = new URL(page.url()).pathname === trang;
  const coHuyHieu = await page.locator('#authBadge').count() === 1;
  const ten = coHuyHieu ? await page.locator('#authBadge span').nth(1).innerText() : '';
  bao(oLai && coHuyHieu && ten === NGUOI.email,
      `${trang} — đã đăng nhập thì ở lại và hiện tài khoản (${ten || 'KHÔNG CÓ'})`);
  await ctx.close();
}

/* ── 2. chưa đăng nhập ─────────────────────────────────────────────────── */
{
  const { page, ctx } = await mo('/observeOrder.html', { user: null });
  const u = new URL(page.url());
  bao(u.pathname === '/index.html', `chưa đăng nhập -> về cổng (${u.pathname})`);
  bao(u.searchParams.get('tiep') === '/observeOrder.html',
      `cổng nhận được đường quay lại (${u.searchParams.get('tiep')})`);
  await ctx.close();
}

/* ── 3. cổng trả về đúng chỗ cũ ────────────────────────────────────────── */
{
  const { page, ctx } = await mo('/index.html?tiep=' + encodeURIComponent('/observeOrder.html'));
  bao(new URL(page.url()).pathname === '/observeOrder.html',
      `cổng trả về đúng trang cũ (${new URL(page.url()).pathname})`);
  await ctx.close();
}

{
  const { page, ctx } = await mo('/index.html');
  bao(new URL(page.url()).pathname === '/app/index.html',
      `không có ?tiep thì vào PWA như cũ (${new URL(page.url()).pathname})`);
  await ctx.close();
}

/* ── 4. chống chuyển hướng ra ngoài ────────────────────────────────────── */
for (const xau of ['//evil.com', 'https://evil.com', 'evil.html', '///evil.com']) {
  const { page, ctx } = await mo('/index.html?tiep=' + encodeURIComponent(xau));
  const u = new URL(page.url());
  const antoan = u.hostname.includes('localhost') && u.pathname === '/app/index.html';
  bao(antoan, `?tiep=${xau} -> không đi theo (${u.host}${u.pathname})`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(hong ? `\n✗ ${hong} chỗ sai\n` : '\n✓ Tất cả đúng\n');
process.exit(hong ? 1 : 0);
