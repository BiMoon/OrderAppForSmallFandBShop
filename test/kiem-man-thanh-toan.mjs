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

import { FAKE_APP, FAKE_AUTH, FAKE_DB } from './gia-firebase.mjs';

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

const MENU = [
  { STT: 1, 'Tên Món': 'Espresso', 'Đơn giá': 18000 },
  { STT: 2, 'Tên Món': 'Trà đào cam sả', 'Đơn giá': 30000 },
  { STT: 3, 'Tên Món': 'Bạc xỉu', 'Đơn giá': 25000 },
];

/** Mọi lần app gọi /api/tich-diem, ghi lại ở đây để bài kiểm soi. */
let daGuiTem = [];

async function mo({ cauHinhOK = true, maTem = 'ma-may-quay' } = {}){
  daGuiTem = [];
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

  // Sổ tem: 0901234567 đang có 7/10, 0909999999 đủ 10. Bản giả ghi lại mọi lần
  // `ghi` để bài kiểm soi được thu ngân đã gửi lên đúng cái gì.
  await page.route(u => u.pathname.endsWith('/api/tich-diem'), (r) => {
    let t = {};
    try { t = JSON.parse(r.request().postData() ?? '{}'); } catch { /* thôi */ }
    const so = String(t.sdt ?? '').replace(/\D/g, '');
    const co = { '0901234567': 7, '0909999999': 10 }[so] ?? 0;
    daGuiTem.push({ ...t, maThietBi: r.request().headers()['x-thiet-bi'] ?? '' });
    const tem = t.action === 'ghi'
      ? Math.max(0, co - (t.doiQua ? 10 : 0)) + (t.items ?? []).filter(i => (i.price || 0) > 0)
          .reduce((s, i) => s + (Number(i.qty) || 0), 0)
      : co;
    r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ ok: true, bat: true, tem, moc: 10, thieu: Math.max(0, 10 - tem), doiDuoc: co >= 10, daGhi: false, thieuTem: 0 }) });
  });

  // Chọn sẵn vai trò thu ngân để app vào thẳng màn Đặt món.
  await page.addInitScript(`localStorage.setItem("phache.v1.role", JSON.stringify("cashier"));
                            localStorage.setItem('phache.v1.pos.view', '"entry"');
                            localStorage.setItem('phache.v1.tem', ${JSON.stringify(JSON.stringify({ ma: maTem }))});`);

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

/* ── 5. tích tem theo số điện thoại ─────────────────────────────────────── */
{
  const { page, ctx, loi } = await mo();
  await page.evaluate(() => {
    window.__db.ghi('history/h1', { table: 4, item: 'Espresso', quantity: 2, price: 18000,
      completedDate: new Date().toISOString().slice(0,10), timestamp: Date.now() - 600000 });
  });
  await page.waitForTimeout(300);
  await page.locator('.tbtn[data-t="4"]').click();
  await page.locator('#posView button[data-v="bill"]').click();
  await page.locator('#posBillNew').click();
  // Chờ xem trước vẽ xong: đó là dấu hiệu newBillSheet đã gắn xong trình xử lý
  // sự kiện (nó gắn trong setTimeout sau khi sheet dựng DOM). Gõ trước lúc đó
  // thì sự kiện `input` rơi vào khoảng trống — bài kiểm đỏ mà app thì đúng.
  await page.waitForSelector('#nbPreview .bill-row', { timeout: 5000 });
  await page.waitForSelector('#nbSdt', { timeout: 5000 });

  bao(true, 'có mã thiết bị thì màn tạo hóa đơn hiện ô số điện thoại');

  // Khách đang tích dở: hiện hạt tem, KHÔNG mời đổi quà.
  await page.locator('#nbSdt').fill('0901234567');
  await page.waitForSelector('.nb-tem-hat i[data-co]', { timeout: 5000 });
  const to = await page.locator('.nb-tem-hat i[data-co]').count();
  bao(to === 7, `7/10 hạt tem đã tô (thấy ${to})`);
  bao(await page.locator('#nbDoiQua').count() === 0, 'chưa đủ tem thì KHÔNG mời đổi quà');
  bao(daGuiTem.at(-1)?.maThietBi === 'ma-may-quay', 'gửi kèm mã thiết bị ở header x-thiet-bi');
  await page.screenshot({ path: 'test/anh-tem-quan.png' });

  // Khách đủ tem: bấm đổi thì tổng tiền tụt đúng giá ly đắt nhất.
  await page.locator('#nbSdt').fill('0909999999');
  await page.waitForSelector('#nbDoiQua', { timeout: 5000 });
  const truoc = await page.locator('#nbPreview .bill-foot-row.total span:last-child').innerText();
  await page.locator('#nbDoiQua').check();
  await page.waitForTimeout(300);
  const sau = await page.locator('#nbPreview .bill-foot-row.total span:last-child').innerText();
  bao(truoc.includes('36.000') && sau.includes('18.000'),
      `đổi tem trừ đúng giá một ly: ${truoc} -> ${sau}`);
  await page.screenshot({ path: 'test/anh-tem-doi-qua.png' });

  await page.locator('#shFoot .btn.solid').click();
  await page.waitForSelector('.bill-card', { timeout: 5000 });
  const ma = (await page.locator('.bill-head .time').innerText()).match(/QCH\d{10}/)?.[0];

  bao(daGuiTem.every(t => t.action !== 'ghi'),
      'TẠO hóa đơn chưa ghi tem — hóa đơn bị xóa trước khi trả thì không có tem nào phải đòi lại');

  // Tiền về -> lúc đó mới ghi sổ.
  await page.evaluate((m) => window.__db.traTien(m), ma);
  await page.waitForTimeout(900);
  const ghi = daGuiTem.filter(t => t.action === 'ghi');
  bao(ghi.length === 1, `thanh toán xong mới ghi sổ, đúng 1 lần (thấy ${ghi.length})`);
  bao(ghi[0]?.ma === ma, 'ghi theo MÃ HÓA ĐƠN — cũng là khóa chống ghi hai lần ở máy chủ');
  bao(ghi[0]?.doiQua === true, 'gửi kèm ý định đổi quà đã chốt trên hóa đơn');
  bao(ghi[0]?.tem === undefined && ghi[0]?.temCong === undefined,
      'KHÔNG tự gửi số tem lên — máy chủ đếm lấy từ danh sách món');
  bao(Array.isArray(ghi[0]?.items) && ghi[0].items.length > 0, 'gửi danh sách món để máy chủ đếm');

  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

/* ── 6. chưa nhập mã thiết bị thì màn hóa đơn gọn như cũ ────────────────── */
{
  const { page, ctx, loi } = await mo({ maTem: '' });
  await page.evaluate(() => {
    window.__db.ghi('orders/o1', { table: 6, item: 'Espresso', quantity: 1, price: 18000,
      time: '09:00', sentAt: Date.now() });
  });
  await page.waitForTimeout(300);
  await page.locator('.tbtn[data-t="6"]').click();
  await page.locator('#posView button[data-v="bill"]').click();
  await page.locator('#posBillNew').click();
  await page.waitForSelector('#nbPreview', { timeout: 5000 });
  bao(await page.locator('#nbSdt').count() === 0, 'chưa có mã thiết bị -> không có ô số điện thoại');
  bao(daGuiTem.length === 0, 'và không gọi máy chủ tích điểm lần nào');
  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(hong ? `\n✗ ${hong} chỗ sai\n` : '\n✓ Tất cả đúng\n');
process.exit(hong ? 1 : 0);
