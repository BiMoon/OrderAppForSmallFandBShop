/**
 * kiem-tuong-phan.mjs — đo độ tương phản chữ/nền của MỌI nút trong app
 *
 * ── Vì sao cần cái này ──────────────────────────────────────────────────────
 *
 * App có chế độ tối (`prefers-color-scheme: dark`). Một quy tắc CSS đặt nền
 * bằng `var(--ink)` và chữ bằng `#fff` trông hoàn hảo ở chế độ sáng — nhưng ở
 * chế độ tối `--ink` lật thành gần trắng, và nút thành chữ trắng trên nền
 * trắng. Không ai đọc được, mà cũng không ai phát hiện nếu máy của người viết
 * code đang để chế độ sáng.
 *
 * Nhìn bằng mắt không bắt được kiểu lỗi này: phải mở đúng chế độ tối, đúng màn
 * hình đó, đúng lúc cái nút hiện ra. Đo thì bắt được hết trong một lượt chạy.
 *
 * Ngưỡng: WCAG AA — 4.5:1 cho chữ thường, 3:1 cho chữ lớn (≥18.66px đậm hoặc
 * ≥24px). Đây là ngưỡng cho người mắt bình thường đọc trong điều kiện bình
 * thường; quầy pha chế còn có hơi nước, tay ướt và ánh đèn vàng.
 *
 *   node test/kiem-tuong-phan.mjs
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';

import { FAKE_APP, FAKE_AUTH, FAKE_DB } from './gia-firebase.mjs';

const MENU = [
  { STT: 1, 'Tên Món': 'Espresso', 'Đơn giá': 20000 },
  { STT: 2, 'Tên Món': 'Trà sữa socola bánh oreo vụn', 'Đơn giá': 45000 },
];

const PORT = 4183;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

// Chạy từ gốc repo. `/app/` là thư mục nên phải tự trỏ vào index.html — thiếu
// dòng đó là trang trắng và mọi phép đo ra rỗng mà không báo gì.
const server = createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  let p = join('.', normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, ''));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  let body;
  try { body = await readFile(p); } catch { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, { 'content-type': MIME[extname(p)] ?? 'application/octet-stream' });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, r));

let hong = 0;
const bao = (ok, msg) => { if (!ok) hong++; console.log(`  ${ok ? '✔' : '✘'} ${msg}`); };

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);

/* Hàm đo chạy TRONG trang — xem test/do-tuong-phan.js. */
const DO = await readFile(new URL('./do-tuong-phan.js', import.meta.url), 'utf8');

/** Mở app ở một chế độ màu, đi qua các màn, gom mọi nút nhìn thấy được. */
async function quet(cheDo) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 }, locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh', isMobile: true, hasTouch: true,
    serviceWorkers: 'block', colorScheme: cheDo,
  });
  const page = await ctx.newPage();
  if (process.env.DEBUG_TP) {
    page.on('pageerror', (e) => console.log('  [pe]', e.message));
    page.on('console', (m) => m.type() === 'error' && console.log('  [c]', m.text().slice(0, 200)));
  }

  await page.route((u) => !u.hostname.includes('localhost'), (r) => r.abort());
  await page.route('**/firebasejs/**/firebase-app.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_APP }));
  await page.route('**/firebasejs/**/firebase-auth.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_AUTH }));
  await page.route('**/firebasejs/**/firebase-database.js', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: FAKE_DB }));
  await page.route((u) => u.hostname === 'script.google.com', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MENU) }));
  await page.route((u) => u.pathname.endsWith('/api/cau-hinh-quan'), (r) => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok: true, bankId: '970416', accountNo: '0123456789', accountName: 'NGUYEN VAN A' }),
  }));

  await page.addInitScript(`localStorage.setItem("phache.v1.role", JSON.stringify("cashier"));
                            localStorage.setItem("phache.v1.pos.view", '"bill"');`);
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#posTables .tbtn', { timeout: 8000 });

  // Một hóa đơn chưa trả để lộ ra nút Tiền mặt / Chuyển khoản / Xóa / In.
  await page.evaluate(() => window.__db.ghi('bills/QCH2608140007', {
    code: 'QCH2608140007', table: 3, status: 'unpaid', createdAt: Date.now(),
    items: [{ name: 'Espresso', qty: 2, price: 20000 }],
    subtotal: 40000, discount: 0, discAmt: 0, total: 40000, paidAmount: 0,
  }));
  await page.waitForTimeout(500);

  const gom = new Map();
  const nhat = async (o) => {
    for (const x of await page.evaluate(DO)) {
      const k = `${o} · ${x.chu} · ${x.lop}`;
      if (!gom.has(k)) gom.set(k, { ...x, o });
    }
  };

  await nhat('màn Hóa đơn');
  // Hai cái nút mà người dùng báo là không đọc được: "Tiền mặt" trên thẻ hóa
  // đơn và "Lưu" trong sheet cài đặt. Chụp lại để còn soi bằng mắt.
  if (cheDo === 'dark') {
    await page.screenshot({ path: 'test/anh-mau-hoadon-dark.png' });
    console.log('  ✓ test/anh-mau-hoadon-dark.png');
  }

  // Sheet cài đặt: đây là chỗ có nút "Lưu".
  await page.locator('#posBillIn').click();
  await page.waitForSelector('#inBat', { timeout: 5000 });
  await nhat('sheet Cài đặt');
  if (cheDo === 'dark') {
    await page.locator('#shFoot .btn.solid').scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await page.screenshot({ path: 'test/anh-mau-caidat-dark.png' });
    console.log('  ✓ test/anh-mau-caidat-dark.png');
  }
  // Đóng bằng DOM chứ không bấm: sheet đang trong lúc trượt thì Playwright
  // báo bị lớp phủ chắn, và nó chờ tới hết giờ.
  await page.evaluate(() => document.getElementById('sheet')?.classList.remove('open'));
  await page.waitForTimeout(400);

  for (const [nut, cho] of [['#posView [data-v="entry"]', '#posPad'], ['#posView [data-v="cart"]', '#posCart']]) {
    if (await page.locator(nut).count()) {
      await page.locator(nut).click();
      await page.waitForSelector(cho, { timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(250);
      await nhat('màn ' + (await page.locator(nut).innerText()).trim());
    }
  }

  for (const [nut, ten] of [['[data-go="kds"]', 'Pha chế'], ['[data-go="prep"]', 'Sơ chế'], ['[data-go="report"]', 'Thống kê']]) {
    if (await page.locator(nut).count()) {
      await page.locator(nut).click();
      await page.waitForTimeout(600);
      await nhat('màn ' + ten);
    }
  }

  await page.evaluate(() => { document.querySelector('[data-go="pos"]')?.click(); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `test/anh-mau-${cheDo}.png`, fullPage: false });
  console.log(`  ✓ test/anh-mau-${cheDo}.png`);

  await ctx.close();
  return [...gom.values()];
}

console.log('\nĐộ tương phản chữ trên nút — WCAG AA\n');

for (const cheDo of ['light', 'dark']) {
  const ds = await quet(cheDo);
  const te = ds.filter((x) => x.tp < x.can).sort((a, b) => a.tp - b.tp);
  console.log(`\n── chế độ ${cheDo === 'dark' ? 'TỐI' : 'SÁNG'} — đo ${ds.length} nút ──`);
  for (const x of te) {
    console.log(`     ${x.tp.toFixed(2)}:1 (cần ${x.can}) — "${x.chu}"  [${x.lop}]  ${x.o}`);
  }
  bao(!te.length, `chế độ ${cheDo === 'dark' ? 'tối' : 'sáng'}: ${te.length ? `${te.length} nút đọc không nổi` : 'mọi nút đều đọc được'}`);
}

await browser.close();
server.close();
console.log(hong ? `\n✗ ${hong} chỗ sai\n` : '\n✓ Tất cả đúng\n');
process.exit(hong ? 1 : 0);
