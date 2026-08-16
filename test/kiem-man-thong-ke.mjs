/**
 * Kiểm tab Thống kê bằng trình duyệt thật.
 *
 *   node test/kiem-man-thong-ke.mjs
 *
 * ── Lỗi nó canh ─────────────────────────────────────────────────────────────
 *
 * `history` ghi giá NIÊM YẾT. Giảm giá nằm ở hóa đơn. Bản cũ chỉ đọc history
 * nên hóa đơn 100k giảm 50% vẫn báo doanh thu 100k, và "TB mỗi ly" thì sai
 * theo. Bài kiểm này dựng đúng cảnh đó rồi soi từng con số trên màn hình.
 *
 * Chạy bằng CHÍNH report.js/core.js/thucThu.js đang chạy thật — Firebase bị
 * thay bằng bản giả nạp qua page.route (xem gia-firebase.mjs).
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { QUAN } from '../app/js/quanInfo.js';

const QUAN_MST = QUAN.maSoThue;

import { FAKE_APP, FAKE_AUTH, FAKE_DB } from './gia-firebase.mjs';

const PORT = 4188;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json',
};

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
const so = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

const MENU = [
  { STT: 1, 'Tên Món': 'Espresso', 'Đơn giá': 20000 },
  { STT: 2, 'Tên Món': 'Trà đào cam sả', 'Đơn giá': 30000 },
  { STT: 3, 'Tên Món': 'Bạc xỉu', 'Đơn giá': 25000 },
];

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

async function mo(){
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 }, locale: 'vi-VN',
    isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  const loi = [];
  const daChan = new Set();
  page.on('pageerror', e => loi.push(e.message));
  page.on('console', m => {
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) loi.push(m.text());
  });
  page.on('requestfailed', r => { if (!daChan.has(r.url())) loi.push(`không tải được ${r.url()}`); });

  // Chặn-tất-cả phải đăng ký TRƯỚC: Playwright ưu tiên route đăng ký sau cùng.
  await page.route(u => !u.hostname.includes('localhost'), r => { daChan.add(r.request().url()); return r.abort(); });
  await page.route('**/firebasejs/**/firebase-app.js',      r => r.fulfill({ status:200, contentType:'text/javascript', body: FAKE_APP }));
  await page.route('**/firebasejs/**/firebase-auth.js',     r => r.fulfill({ status:200, contentType:'text/javascript', body: FAKE_AUTH }));
  await page.route('**/firebasejs/**/firebase-database.js', r => r.fulfill({ status:200, contentType:'text/javascript', body: FAKE_DB }));
  await page.route(u => u.hostname === 'script.google.com',
    r => r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MENU) }));
  await page.route(u => u.pathname.endsWith('/api/cau-hinh-quan'), r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ ok:true, bankId:'970416', accountNo:'0123456789', accountName:'NGUYEN VAN A' }),
  }));

  await page.addInitScript(`localStorage.setItem("phache.v1.role", JSON.stringify("cashier"));
                            localStorage.setItem("phache.v1.rp.mode", '"day"');`);
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#posTables .tbtn', { timeout: 8000 });
  return { page, ctx, loi };
}

/** Dựng cảnh: bàn 3 uống 100k giảm 50%, bàn 5 uống 50k không giảm. */
async function dungCanh(page){
  await page.evaluate(() => {
    const nay = new Date().toISOString().slice(0, 10);
    const gio = Date.now();
    // Mã hoá đơn PHẢI theo ngày hôm nay: màn Thống kê tải hoá đơn theo khoảng
    // khoá, mà khoá là `QCH` + yymmdd. Ghi cứng một ngày là test xanh hôm viết
    // rồi tự mục sau đó vài hôm, và triệu chứng ("chưa chốt hoá đơn") không hề
    // chỉ về nguyên nhân.
    const MA = (n) => 'QCH' + nay.slice(2).replace(/-/g, '') + String(n).padStart(4, '0');
    const h = (k, tbl, item, qty, price, tru) => window.__db.ghi('history/' + k, {
      table: tbl, item, quantity: qty, price,
      revenue: price * qty, completedDate: nay, timestamp: gio - tru,
    });

    // Bàn 3: 2 Espresso 20k + 2 Trà đào 30k = 100.000₫ niêm yết.
    h('h1', 3, 'Espresso', 2, 20000, 900000);
    h('h2', 3, 'Trà đào cam sả', 2, 30000, 800000);
    // Bàn 5: 2 Bạc xỉu 25k = 50.000₫, không giảm.
    h('h3', 5, 'Bạc xỉu', 2, 25000, 700000);

    // Hóa đơn bàn 3: giảm 50%, ĐÃ THANH TOÁN.
    window.__db.ghi('bills/' + MA(1), {
      code: MA(1), table: 3, status: 'paid',
      subtotal: 100000, discount: 50, discAmt: 50000, total: 50000,
      paidAmount: 50000, payMethod: 'chuyenkhoan', paidBy: 'sepay',
      tinhToiLuc: gio - 700001, createdAt: gio - 700001, paidAt: gio - 690000,
    });
    // Hóa đơn bàn 5: không giảm, ĐÃ THANH TOÁN.
    window.__db.ghi('bills/' + MA(2), {
      code: MA(2), table: 5, status: 'paid',
      subtotal: 50000, discount: 0, discAmt: 0, total: 50000,
      paidAmount: 50000, payMethod: 'tienmat', paidBy: 'nguoi',
      tinhToiLuc: gio - 600000, createdAt: gio - 600000, paidAt: gio - 590000,
    });
  });
  await page.waitForTimeout(400);
  await page.locator('#tabbar button[data-go="report"]').click();
  await page.waitForSelector('#rpRev', { timeout: 8000 });
  await page.waitForTimeout(700);            // chờ taiHoaDonKhoang xong rồi vẽ lại
}

console.log('\nTab Thống kê — giảm giá ở hóa đơn\n');

/* ── 1. LỖI GỐC: doanh thu phải là thực thu ─────────────────────────────── */
{
  const { page, ctx, loi } = await mo();
  await dungCanh(page);

  const rev = so(await page.locator('#rpRev').innerText());
  bao(rev === 100000, `doanh thu = 100.000₫ thực thu, không phải 150.000₫ niêm yết (thấy ${rev.toLocaleString('vi-VN')}₫)`);

  const avg = so(await page.locator('#rpAvg').innerText());
  bao(avg === 16667, `TB mỗi ly = 16.667₫ (100k / 6 ly), không phải 25.000₫ (thấy ${avg.toLocaleString('vi-VN')}₫)`);

  bao(!(await page.locator('#rpDiscCard').getAttribute('class')).includes('hide'),
      'có giảm giá thì hiện hẳn ô "Đã giảm giá"');
  const giam = so(await page.locator('#rpDisc').innerText());
  bao(giam === 50000, `ô giảm giá đúng 50.000₫ (thấy ${giam.toLocaleString('vi-VN')}₫)`);
  const dsub = await page.locator('#rpDiscSub').innerText();
  bao(dsub.includes('150.000'), `ghi rõ niêm yết 150.000₫ để đối chiếu (thấy "${dsub}")`);

  /* đơn giá từng món */
  const dong = await page.locator('#rpItems .irow').allInnerTexts();
  const tim = (ten) => dong.find(d => d.includes(ten)) ?? '';
  bao(/2 ly × 10\.000/.test(tim('Espresso')),
      `Espresso 20k giảm nửa -> đơn giá thực thu 10.000₫ (thấy "${tim('Espresso').replace(/\n/g,' ')}")`);
  bao(tim('Espresso').includes('gốc 20.000'), 'vẫn thấy được giá gốc để đối chiếu');
  bao(/2 ly × 15\.000/.test(tim('Trà đào')),
      `Trà đào 30k giảm nửa -> 15.000₫ (thấy "${tim('Trà đào').replace(/\n/g,' ')}")`);
  bao(/2 ly × 25\.000/.test(tim('Bạc xỉu')) && !tim('Bạc xỉu').includes('gốc'),
      'bàn không giảm giá thì đơn giá giữ nguyên 25.000₫, không gắn nhãn gốc');

  /* món doanh thu cao nhất phải xếp theo thực thu */
  const top = await page.locator('#rpTop').innerText();
  bao(top === 'Bạc xỉu',
      `top món tính theo thực thu: Bạc xỉu 50k > Trà đào 30k (thấy "${top}")`);

  await page.screenshot({ path: 'test/anh-thong-ke.png', fullPage: false });
  await page.locator('#rpItems').scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await page.screenshot({ path: 'test/anh-thong-ke-mon.png', fullPage: false });

  // Bảng món có tên dài + hai nhãn giá trên một hàng — chỗ dễ tràn nhất màn này.
  for (const w of [320, 360]){
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(200);
    const thua = await page.evaluate(() => {
      const m = document.getElementById('main');
      return m.scrollWidth - m.clientWidth;
    });
    bao(thua <= 1, `không tràn ngang ở ${w}px${thua > 1 ? ` (thừa ${thua}px)` : ''}`);
  }
  await page.setViewportSize({ width: 390, height: 900 });
  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

/* ── 2. hóa đơn CHƯA trả thì chưa được trừ, và phải nói ra ──────────────── */
{
  const { page, ctx, loi } = await mo();
  await page.evaluate(() => {
    const nay = new Date().toISOString().slice(0, 10);
    const gio = Date.now();
    // Mã hoá đơn PHẢI theo ngày hôm nay: màn Thống kê tải hoá đơn theo khoảng
    // khoá, mà khoá là `QCH` + yymmdd. Ghi cứng một ngày là test xanh hôm viết
    // rồi tự mục sau đó vài hôm, và triệu chứng ("chưa chốt hoá đơn") không hề
    // chỉ về nguyên nhân.
    const MA = (n) => 'QCH' + nay.slice(2).replace(/-/g, '') + String(n).padStart(4, '0');
    window.__db.ghi('history/h1', { table: 3, item: 'Espresso', quantity: 2, price: 20000,
      revenue: 40000, completedDate: nay, timestamp: gio - 900000 });
    window.__db.ghi('bills/' + MA(1), {
      code: MA(1), table: 3, status: 'unpaid',
      subtotal: 40000, discount: 50, discAmt: 20000, total: 20000,
      paidAmount: 0, tinhToiLuc: gio - 800000, createdAt: gio - 800000,
    });
  });
  await page.waitForTimeout(400);
  await page.locator('#tabbar button[data-go="report"]').click();
  await page.waitForSelector('#rpRev', { timeout: 8000 });
  await page.waitForTimeout(700);

  bao(so(await page.locator('#rpRev').innerText()) === 40000,
      'hóa đơn treo chưa thu đồng nào -> vẫn tính giá niêm yết, không trừ trước');
  const bn = await page.locator('#rpBannerTxt').innerText();
  bao(bn.includes('chưa chốt hóa đơn') && bn.includes('40.000'),
      `biểu ngữ nói rõ 40.000₫ chưa chốt hóa đơn (thấy "${bn.replace(/\n/g,' | ')}")`);

  /* thu ngân bấm "đã trả" -> số phải tụt xuống NGAY, không cần tải lại trang */
  await page.evaluate(() => {
    const nay = new Date().toISOString().slice(0, 10);
    window.__db.traTien('QCH' + nay.slice(2).replace(/-/g, '') + '0001');
  });
  await page.waitForTimeout(900);
  bao(so(await page.locator('#rpRev').innerText()) === 20000,
      'bấm đã trả -> doanh thu tự về 20.000₫, không phải mở lại tab');

  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

/* ── 3. CSV tách được ba cột tiền ───────────────────────────────────────── */
{
  const { page, ctx, loi } = await mo();
  await dungCanh(page);

  // Chặn navigator.share để đi nhánh tải file, rồi bắt lấy nội dung Blob.
  const csv = await page.evaluate(async () => {
    const bat = [];
    const goc = URL.createObjectURL;
    let noiDung = null;
    URL.createObjectURL = (b) => { bat.push(b); return goc.call(URL, b); };
    const share = navigator.canShare; navigator.canShare = () => false;
    document.getElementById('rpCsv').click();
    await new Promise(r => setTimeout(r, 200));
    if (bat.length) noiDung = await bat[0].text();
    URL.createObjectURL = goc; navigator.canShare = share;
    return noiDung;
  });

  bao(!!csv, 'bấm Xuất CSV có ra file');
  if (process.env.DEBUG_CSV) {
    console.log('\n--- CSV ---\n' + csv + '\n--- hết ---\n');
    console.log(JSON.stringify(await page.evaluate(async () => {
      const { cuaSoHoaDon, mocHoaDon } = await import('./js/thucThu.js');
      const bills = Object.values(window.__db.store.bills || {});
      const hs = Object.values(window.__db.store.history || {});
      return {
        bills: bills.map(b => ({ code: b.code, table: b.table, status: b.status, moc: mocHoaDon(b) })),
        cuaSo: [...cuaSoHoaDon(bills)].map(([k, v]) => [k, v]),
        rows: hs.slice(0, 3).map(h => ({ table: h.table, item: h.item, ts: h.timestamp, sentAt: h.sentAt })),
        thu: (await import('./js/thucThu.js')).ganThucThu(
          hs.map(h => ({ table: h.table, moc: h.timestamp, revenue: h.revenue })), bills)
          .map(r => ({ t: r.table, hd: r.maHD, heSo: r.heSo, chuaChot: r.chuaChot, thuc: r.thucThu })),
      };
    }), null, 1));
  }
  bao(/Doanh thu niem yet \(VND\),150000/.test(csv || ''), 'CSV có dòng doanh thu niêm yết 150000');
  bao(/Giam gia \(VND\),50000/.test(csv || ''), 'CSV có dòng giảm giá 50000');
  bao(/Doanh thu thuc thu \(VND\),100000/.test(csv || ''), 'CSV có dòng thực thu 100000');
  bao(/Espresso",2,20000,10000,40000,20000,20000,/.test(csv || ''),
      'dòng Espresso tách đủ: niêm yết 20000 / thực thu 10000 / giảm 20000');
  bao(/TONG CONG,6,,,150000,50000,100000,100.0/.test(csv || ''), 'dòng tổng cộng khớp');

  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

/* ── sổ S1a-HKD ──────────────────────────────────────────────────────────────

   Để RIÊNG một phiên trình duyệt, không ghép vào mục nào ở trên: bấm nút xuất
   sổ kéo theo một lượt tải hoá đơn của kỳ rồi vẽ lại màn hình, và cái đó làm
   nhiễu mọi khẳng định đứng sau nó trong cùng một phiên.                     */
{
  const { page, ctx, loi } = await mo();
  await dungCanh(page);

  const coNut = await page.locator('#rpS1a').count();
  bao(coNut === 1, 'có nút xuất sổ S1a-HKD trên màn Thống kê');

  if (coNut) {
    // Chặn tải về, giữ lại nội dung tệp để soi.
    await page.evaluate(() => {
      window.__tep = null;
      const goc = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) { window.__tep = this.download; return; }
        return goc.call(this);
      };
      // `navigator.share` có trên máy giả lập di động -> ép về đường tải file.
      if (navigator.canShare) navigator.canShare = () => false;
    });

    await page.locator('#rpS1a').scrollIntoViewIfNeeded();
    await page.locator('#rpS1a').click();
    await page.waitForTimeout(500);

    const ten = await page.evaluate(() => window.__tep);
    bao(!!ten && /^so-S1a-HKD-.*\.csv$/.test(ten), `tệp xuất ra đúng tên: ${ten || 'KHÔNG TẢI'}`);

    // Dựng lại nội dung sổ ngay trong trang, từ đúng hoá đơn màn hình đang xem.
    const soi = await page.evaluate(async () => {
      const { csvS1a } = await import('./js/soS1a.js');
      const { QUAN } = await import('./js/quanInfo.js');
      const bills = Object.values(window.__db.store.bills || {});
      const { noiDung, soChungTu, tong } = csvS1a(bills, QUAN, { from: '2026-01-01', to: '2026-12-31' });
      return { noiDung, soChungTu, tong };
    });

    bao(soi.noiDung.includes('Mẫu số S1a-HKD'), 'sổ ghi rõ tên mẫu');
    bao(soi.noiDung.includes(QUAN_MST), `sổ có mã số thuế (${QUAN_MST})`);
    bao(/chỉ gồm doanh thu BÁN TẠI QUÁN/i.test(soi.noiDung),
      'sổ CẢNH BÁO là chỉ có doanh thu tại quán — thiếu doanh thu mà trông như đủ là tệ nhất');
    bao(soi.noiDung.indexOf('BÁN TẠI QUÁN') < soi.noiDung.indexOf('Ngày, tháng ghi sổ'),
      'cảnh báo nằm TRÊN bảng số, không nhét xuống cuối');
    bao(/TỔNG CỘNG/.test(soi.noiDung), 'có dòng tổng cộng');
    console.log(`     sổ dựng được: ${soi.soChungTu} chứng từ · tổng ${soi.tong.toLocaleString('vi-VN')}đ`);

    await page.screenshot({ path: 'test/anh-thong-ke-s1a.png' });
    console.log('  ✓ test/anh-thong-ke-s1a.png');
  }

  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(hong ? `\n✗ ${hong} chỗ sai\n` : '\n✓ Tất cả đúng\n');
process.exit(hong ? 1 : 0);
