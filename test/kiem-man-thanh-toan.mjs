/**
 * Kiểm màn thanh toán bằng trình duyệt thật.
 *
 *   node test/kiem-man-thanh-toan.mjs
 *
 * Firebase bị thay bằng một bản giả nạp thẳng qua `page.route`: app import SDK
 * từ gstatic.com nên chặn đúng ba URL đó là đủ, không phải sửa một dòng mã sản
 * phẩm nào. Nhờ vậy màn hình được dựng bằng CHÍNH pos.js/core.js đang chạy
 * thật, chứ không phải một bản mô phỏng.
 *
 * Bốn chuyện cần tận mắt thấy, vì không test đơn vị nào thấy được:
 *   1. Tạo hóa đơn ra đúng một mã QCH… và một mã QR có nội dung là mã đó.
 *   2. Tiền về (webhook đổi status trong RTDB) thì thẻ TỰ đổi sang xanh.
 *   3. Bàn trên dải bàn đổi màu theo trạng thái.
 *   4. Chưa lấy được số tài khoản thì KHÔNG vẽ QR hỏng mà nói rõ.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

const PORT = 4187;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  let p = join('.', normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, ''));
  // join() nuốt mất dấu / cuối, nên '/app/' ra 'app' — một THƯ MỤC đang tồn
  // tại. Chỉ hỏi existsSync là tưởng có file rồi readFile ném EISDIR.
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  // Đọc trước rồi mới ghi header — ghi trước mà readFile ném lỗi là cả tool chết.
  let body;
  try { body = await readFile(p); } catch { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
  res.end(body);
});
await new Promise(r => server.listen(PORT, r));

let hong = 0;
const bao = (ok, chu) => { if (!ok) hong++; console.log(`  ${ok ? '✔' : '✘'} ${chu}`); };

/* ─────────────────── Firebase giả, nạp qua page.route ─────────────────── */

const FAKE_APP = `
export const initializeApp = () => ({ name: 'gia' });
`;

// App bắt buộc đăng nhập Google: chưa đăng nhập là app.js đá về ../index.html.
// Bản giả phải trả về một người dùng, nếu không bài kiểm chỉ đo được trang 404.
const NGUOI = { uid: 'u_thungan', email: 'thu-ngan@quan.vn', displayName: 'Thu ngân', photoURL: '' };
const FAKE_AUTH = `
const nguoi = ${JSON.stringify(NGUOI)};
export const getAuth = () => ({ currentUser: nguoi });
export class GoogleAuthProvider {}
export const signInWithPopup = async () => ({ user: nguoi });
export const signOut = async () => {};
export const onAuthStateChanged = (a, cb) => { cb(nguoi); return () => {}; };
`;

/**
 * RTDB giả: một object trong bộ nhớ + danh sách người nghe. Đủ cho onValue,
 * set, update, remove, push, runTransaction — và quan trọng nhất là cho phép
 * bài kiểm TỰ TAY đổi status như thể webhook vừa ghi vào.
 */
const FAKE_DB = `
const store = { orders: {}, history: {}, cancelled: {}, bills: {}, counters: {} };
const nghe = new Map();          // path -> Set<cb>
let seq = 0;

const parts = p => String(p).split('/').filter(Boolean);
function doc(p){
  let cur = store;
  for (const k of parts(p)){
    if (cur === null || typeof cur !== 'object' || !(k in cur)) return null;
    cur = cur[k];
  }
  return cur === undefined ? null : cur;
}
function ghi(p, v){
  const ps = parts(p); let cur = store;
  for (const k of ps.slice(0,-1)){
    if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {};
    cur = cur[k];
  }
  if (v === null) delete cur[ps.at(-1)]; else cur[ps.at(-1)] = v;
  ban();
}
function snap(p){
  const v = doc(p);
  return {
    val: () => v,
    exists: () => v !== null,
    forEach: (cb) => { for (const k of Object.keys(v || {})) cb({ key: k, val: () => v[k] }); },
  };
}
function ban(){
  for (const [p, set] of nghe) for (const cb of set) cb(snap(p));
}

export const getDatabase = () => ({});
export const ref = (_db, path) => ({ _p: path === undefined ? '' : path });
export const serverTimestamp = () => Date.now();

export function onValue(r, cb){
  const p = r._p;
  if (p === '.info/connected'){ cb({ val: () => true }); return () => {}; }
  if (!nghe.has(p)) nghe.set(p, new Set());
  nghe.get(p).add(cb);
  cb(snap(p));
  return () => nghe.get(p).delete(cb);
}
export const set    = async (r, v) => ghi(r._p, v);
export const update = async (r, patch) => ghi(r._p, { ...(doc(r._p) || {}), ...patch });
export const remove = async (r) => ghi(r._p, null);
export const push   = async (r, v) => { const k = 'k' + (++seq); ghi(r._p + '/' + k, v); return { key: k }; };
export async function runTransaction(r, fn){
  const v = fn(doc(r._p));
  if (v !== undefined) ghi(r._p, v);
  return { committed: v !== undefined, snapshot: { val: () => doc(r._p), exists: () => doc(r._p) !== null } };
}
/* query/orderByKey/limitToLast: bản giả bỏ qua phần giới hạn, chỉ cần trả về
   đúng ref để onValue nghe được cả nhánh. Số lượng không phải thứ bài kiểm này
   đo. */
export const query = (r) => r;
export const orderByKey = () => ({});
export const limitToLast = () => ({});
export const onChildAdded = () => () => {};
export const onChildChanged = () => () => {};
export const onChildRemoved = () => () => {};

/* cửa sau cho bài kiểm */
window.__db = {
  store,
  ghi,
  // giả bộ webhook SePay vừa ghi tiền về
  traTien(code, soTien){
    const b = doc('bills/' + code);
    ghi('bills/' + code, { ...b, status: 'paid', paidAmount: soTien ?? b.total,
      payMethod: 'chuyenkhoan', paidBy: 'sepay', paidAt: Date.now() });
  },
};
`;

const MENU = [
  { STT: 1, 'Tên Món': 'Espresso', 'Đơn giá': 18000 },
  { STT: 2, 'Tên Món': 'Trà đào cam sả', 'Đơn giá': 30000 },
  { STT: 3, 'Tên Món': 'Bạc xỉu', 'Đơn giá': 25000 },
];

async function mo({ cauHinhOK = true } = {}){
  // Chặn service worker: nó cache vỏ app và tự trả lời thay máy chủ, nên bài
  // kiểm sẽ đo bản đã cache của lần chạy trước chứ không phải mã vừa sửa.
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, locale: 'vi-VN',
    isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const loi = [];
  const daChan = new Set();          // URL do CHÍNH bài kiểm chặn
  page.on('pageerror', e => loi.push(e.message));
  page.on('console', m => {
    // "Failed to load resource" không kèm URL nên không phân biệt được với
    // mấy lời gọi mà bài kiểm cố tình chặn. Bắt lỗi tải tài nguyên bằng
    // requestfailed ở dưới, chính xác hơn nhiều.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) loi.push(m.text());
  });
  page.on('requestfailed', r => {
    if (!daChan.has(r.url())) loi.push(`không tải được ${r.url()}`);
  });

  // Playwright ưu tiên route ĐĂNG KÝ SAU CÙNG, nên cái chặn-tất-cả phải nằm
  // TRƯỚC mấy cái cụ thể — đăng ký sau là nó nuốt luôn cả Firebase giả.
  await page.route(u => !u.hostname.includes('localhost'), r => {
    daChan.add(r.request().url());
    return r.abort();
  });
  await page.route('**/firebasejs/**/firebase-app.js',      r => r.fulfill({ status:200, contentType:'text/javascript', body: FAKE_APP }));
  await page.route('**/firebasejs/**/firebase-auth.js',     r => r.fulfill({ status:200, contentType:'text/javascript', body: FAKE_AUTH }));
  await page.route('**/firebasejs/**/firebase-database.js', r => r.fulfill({ status:200, contentType:'text/javascript', body: FAKE_DB }));
  await page.route(u => u.hostname === 'script.google.com',
    r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MENU) }));
  await page.route(u => u.pathname.endsWith('/api/cau-hinh-quan'), r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(cauHinhOK
      ? { ok: true, bankId: '970416', accountNo: '0123456789', accountName: 'NGUYEN VAN A' }
      : { ok: false, message: 'chưa cấu hình' }),
  }));
  await page.route(u => u.hostname === 'img.vietqr.io',
    r => r.fulfill({ status:200, contentType:'image/png', body: Buffer.from('89504e470d0a1a0a','hex') }));

  // Chọn sẵn vai trò thu ngân để app vào thẳng màn Đặt món.
  await page.addInitScript(`localStorage.setItem("phache.v1.role", JSON.stringify("cashier"));
                            localStorage.setItem('phache.v1.pos.view', '"entry"');`);

  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  if (!(await page.locator('#posTables .tbtn').count())){
    console.log('    [gỡ rối] url:', page.url());
    console.log('    [gỡ rối] html:', (await page.content()).slice(0,600).replace(/\n+/g,' '));
    console.log('    [gỡ rối] lỗi:', loi.slice(0,3));
  }
  await page.waitForSelector('#posTables .tbtn', { timeout: 8000 });
  await page.waitForTimeout(400);
  return { page, ctx, loi };
}

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

console.log('\nMàn thanh toán trong quán\n');

/* ── 1. tạo hóa đơn, nhận mã và QR ─────────────────────────────────────── */
{
  const { page, ctx, loi } = await mo();

  // Bàn 3 gọi hai món: một đã pha xong, một đang chờ.
  await page.evaluate(() => {
    const gio = Date.now();
    window.__db.ghi('history/h1', { table: 3, item: 'Espresso', quantity: 2, price: 18000,
      completedDate: new Date().toISOString().slice(0,10), timestamp: gio - 600000 });
    window.__db.ghi('orders/o1', { table: 3, item: 'Trà đào cam sả', quantity: 1, price: 30000,
      time: '09:30', sentAt: gio - 60000 });
  });
  await page.waitForTimeout(300);

  bao(await page.locator('.tbtn[data-t="3"]').getAttribute('data-tt') === 'dangPhucVu',
      'bàn có món chưa tính tiền -> đang phục vụ');

  await page.locator('.tbtn[data-t="3"]').click();
  await page.locator('#posView button[data-v="bill"]').click();
  await page.locator('#posBillNew').click();
  await page.waitForSelector('#nbPreview .bill-row', { timeout: 5000 });

  const soDong = await page.locator('#nbPreview .bill-row').count();
  bao(soDong === 2, `xem trước gom đủ 2 món (thấy ${soDong})`);
  bao((await page.locator('#nbPreview .bill-foot-row.total').innerText()).includes('66.000'),
      'tổng đúng 66.000₫ (2×18.000 + 30.000)');

  await page.locator('#shFoot .btn.solid').click();
  await page.waitForSelector('.bill-card', { timeout: 5000 });

  const ma = (await page.locator('.bill-head .time').innerText()).match(/QCH\d{10}/)?.[0];
  bao(!!ma, `hóa đơn có mã đúng dạng QCH+10 số (${ma || 'KHÔNG CÓ'})`);

  const src = await page.locator('.bill-qr img').getAttribute('src');
  bao(!!src && src.includes('970416-0123456789'), 'QR dùng đúng số tài khoản lấy từ máy chủ');
  bao(!!src && src.includes(`addInfo=${ma}`), 'nội dung chuyển khoản CHÍNH LÀ mã hóa đơn');
  bao(!!src && src.includes('amount=66000'), 'QR mang đúng số tiền');

  bao(await page.locator('.tbtn[data-t="3"]').getAttribute('data-tt') === 'choTra',
      'bàn chuyển sang chờ trả tiền');
  await page.screenshot({ path: 'test/anh-cho-tra.png' });

  // Bấm tạo lần nữa -> phải bị chặn, không đẻ hóa đơn thứ hai cho cùng bàn.
  await page.locator('#posBillNew').click();
  await page.waitForTimeout(300);
  bao(await page.locator('.bill-card').count() === 1, 'không tạo được hóa đơn thứ hai cho cùng một bàn');

  /* ── 2. webhook báo tiền về ── */
  await page.evaluate((m) => window.__db.traTien(m), ma);
  await page.waitForTimeout(400);

  bao(await page.locator('.bill-card.paid').count() === 1, 'tiền về -> thẻ tự đổi sang đã thanh toán');
  bao((await page.locator('.bill-note.ok').innerText()).includes('SePay'),
      'ghi rõ là SePay tự nhận, không phải người bấm');
  bao(await page.locator('.tbtn[data-t="3"]').getAttribute('data-tt') === 'daTra',
      'bàn chuyển sang đã trả');

  /* ── 3. khách mới ngồi vào ── */
  await page.evaluate(() => {
    window.__db.ghi('orders/o2', { table: 3, item: 'Bạc xỉu', quantity: 1, price: 25000,
      time: '11:00', sentAt: Date.now() });
  });
  await page.waitForTimeout(300);
  bao(await page.locator('.tbtn[data-t="3"]').getAttribute('data-tt') === 'dangPhucVu',
      'khách mới gọi món -> bàn tự về đang phục vụ, không phải bấm dọn bàn');

  await page.locator('#posBillNew').click();
  await page.waitForSelector('#nbPreview .bill-row', { timeout: 5000 });
  const dong2 = await page.locator('#nbPreview .bill-row').allInnerTexts();
  bao(dong2.length === 1 && dong2[0].includes('Bạc xỉu'),
      `hóa đơn lượt hai CHỈ có món mới (thấy ${dong2.length} dòng)`);
  await page.locator('#shFoot .btn:not(.solid)').click();

  await page.screenshot({ path: 'test/anh-thanh-toan.png', fullPage: false });
  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

/* ── 4. chưa có cấu hình tài khoản ─────────────────────────────────────── */
{
  const { page, ctx, loi } = await mo({ cauHinhOK: false });
  await page.evaluate(() => {
    window.__db.ghi('orders/o1', { table: 2, item: 'Espresso', quantity: 1, price: 18000,
      time: '09:00', sentAt: Date.now() });
  });
  await page.waitForTimeout(300);
  await page.locator('.tbtn[data-t="2"]').click();
  await page.locator('#posView button[data-v="bill"]').click();
  await page.locator('#posBillNew').click();
  await page.waitForSelector('#nbPreview', { timeout: 5000 });
  await page.locator('#shFoot .btn.solid').click();
  await page.waitForSelector('.bill-card', { timeout: 5000 });

  bao(await page.locator('.bill-qr img').count() === 0, 'không vẽ mã QR hỏng');
  bao(await page.locator('.qr-thieu').count() === 1, 'nói rõ là chưa lấy được số tài khoản');
  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await page.screenshot({ path: 'test/anh-thieu-cau-hinh.png' });
  await ctx.close();
}

await browser.close();
server.close();
console.log(hong ? `\n✗ ${hong} chỗ sai\n` : '\n✓ Tất cả đúng\n');
process.exit(hong ? 1 : 0);
