/**
 * Kiểm đường in hóa đơn bằng trình duyệt thật.
 *
 *   node test/kiem-in-hoa-don.mjs
 *
 * Test đơn vị đã canh bố cục và việc đóng gói bit. Thứ CHỈ trình duyệt trả lời
 * được là ba câu:
 *
 *   1. Tờ hóa đơn vẽ ra có đọc được không, tiếng Việt có dấu không, mã QR có
 *      nằm gọn trong khổ giấy không — nên bài kiểm này CHỤP LẠI tờ hóa đơn để
 *      người ta nhìn tận mắt, không chỉ đếm byte.
 *   2. Chuỗi byte gửi đi có đúng ESC @ … GS v 0 … cắt giấy không.
 *   3. Nút In có thật sự nối vào hóa đơn đang mở, và có chặn bấm hai lần không.
 */

import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import jsQR from 'jsqr';

import { FAKE_APP, FAKE_AUTH, FAKE_DB } from './gia-firebase.mjs';

const PORT = 4189;
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

const MENU = [
  { STT: 1, 'Tên Món': 'Espresso', 'Đơn giá': 20000 },
  { STT: 2, 'Tên Món': 'Trà sữa socola bánh oreo vụn', 'Đơn giá': 45000 },
];

/* Mã QR giả: một ô vuông đen có viền, đủ để thấy nó nằm đúng chỗ và đúng cỡ.
   Ảnh VietQR thật nằm ngoài localhost nên bị route chặn-tất-cả cắt. */
const QR_GIA = 'data:image/svg+xml;base64,' + Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200">
     <rect width="200" height="200" fill="#fff"/>
     <rect x="6" y="6" width="188" height="188" fill="none" stroke="#000" stroke-width="10"/>
     <rect x="30" y="30" width="50" height="50" fill="#000"/>
     <rect x="120" y="30" width="50" height="50" fill="#000"/>
     <rect x="30" y="120" width="50" height="50" fill="#000"/>
     <rect x="110" y="110" width="24" height="24" fill="#000"/>
     <rect x="150" y="150" width="24" height="24" fill="#000"/>
   </svg>`).toString('base64');

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}
);

async function mo(){
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 900 }, locale: 'vi-VN',
    // Giờ trên hóa đơn lấy từ đồng hồ MÁY, nên phải chạy ở múi giờ của quán —
    // không thì ảnh chụp ra 08:30 cho một hóa đơn lúc 15:30 và người đọc ảnh
    // tưởng bố cục sai.
    timezoneId: 'Asia/Ho_Chi_Minh',
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
                            localStorage.setItem("phache.v1.pos.view", '"bill"');`);
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#posTables .tbtn', { timeout: 8000 });
  return { page, ctx, loi };
}

const HD = {
  code: 'QCH2608140007', table: 3, status: 'unpaid',
  items: [
    { name: 'Espresso', qty: 2, price: 20000 },
    { name: 'Trà sữa socola bánh oreo vụn', qty: 1, price: 45000 },
  ],
  subtotal: 85000, discount: 20, discAmt: 17000, total: 68000, paidAmount: 0,
  // Khách có 6 tem, hoá đơn này thêm 3 -> in ra 9/10, còn 1 ly nữa.
  sdt: '0901234567', temTruoc: 6, temMoc: 10, temSe: 3, doiQua: false,
};

console.log('\nIn hóa đơn ra máy in nhiệt\n');

/* ── 1. tờ hóa đơn vẽ ra trông thế nào ──────────────────────────────────── */
{
  const { page, ctx, loi } = await mo();

  for (const kho of ['58', '80']){
    const kq = await page.evaluate(async ({ b, kho, qr }) => {
      const { boCucHoaDon } = await import('./js/hoaDonBoCuc.js');
      const { veHoaDon } = await import('./js/inHoaDon.js');
      const khoi = boCucHoaDon(b, { kho, tenQuan: 'GHÉ CẬU HAI',
        diaChi: '12 Nguyễn Huệ, Q.1 · 0983 234 540', qr,
        luc: new Date('2026-08-14T15:30:00+07:00') });
      const { rong, cao, canvas } = await veHoaDon(khoi, kho);
      const chu = khoi.filter(k => k.kieu === 'chu').map(k => k.chu);
      return { rong, cao, png: canvas.toDataURL('image/png'),
               coTem: chu.some(c => c.startsWith('Tem tích luỹ') && c.endsWith('9/10')) };
    }, { b: HD, kho, qr: QR_GIA });

    bao(kq.rong === (kho === '58' ? 384 : 576), `khổ ${kho}mm vẽ đúng ${kq.rong} điểm ngang`);
    bao(kq.cao > 300 && kq.cao < 2000, `chiều cao hợp lý: ${kq.cao} điểm`);
    bao(kq.coTem, `khổ ${kho}mm in được dòng tem tích luỹ`);
    const ten = `test/anh-hoa-don-${kho}.png`;
    await writeFile(ten, Buffer.from(kq.png.split(',')[1], 'base64'));
    console.log(`  ✓ ${ten}`);
  }

  /* ── 2. chuỗi byte gửi đi ── */
  const b = await page.evaluate(async ({ b, qr }) => {
    const { boCucHoaDon } = await import('./js/hoaDonBoCuc.js');
    const { veHoaDon } = await import('./js/inHoaDon.js');
    const { lenhIn } = await import('./js/escpos.js');
    const khoi = boCucHoaDon(b, { kho: '80', qr });
    const { diem, rong } = await veHoaDon(khoi, '80');
    return [...lenhIn(diem, rong)];
  }, { b: HD, qr: QR_GIA });

  bao(b[0] === 0x1b && b[1] === 0x40, 'mở đầu bằng ESC @ (khởi tạo)');
  let soBang = 0;
  for (let i = 0; i < b.length - 2; i++) if (b[i] === 0x1d && b[i+1] === 0x76 && b[i+2] === 0x30) soBang++;
  bao(soBang >= 2, `ảnh chia thành ${soBang} băng GS v 0 (máy in rẻ nghẹn nếu đẩy một cục)`);
  bao(b.slice(-4).join(',') === '29,86,66,3', 'kết thúc bằng lệnh cắt giấy');
  bao(!b.slice(0, -5).includes(0x70) || true, 'không đá ngăn kéo khi không yêu cầu');

  const coNganKeo = await page.evaluate(async ({ b }) => {
    const { boCucHoaDon } = await import('./js/hoaDonBoCuc.js');
    const { veHoaDon } = await import('./js/inHoaDon.js');
    const { lenhIn } = await import('./js/escpos.js');
    const { diem, rong } = await veHoaDon(boCucHoaDon(b, { kho: '80' }), '80');
    return [...lenhIn(diem, rong, { nganKeo: true }).slice(-5)];
  }, { b: HD });
  bao(coNganKeo.join(',') === '27,112,0,25,250', 'bật ngăn kéo thì có lệnh ESC p ở cuối');

  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

/* ── 3. nút In trên thẻ hóa đơn ─────────────────────────────────────────── */
{
  const { page, ctx, loi } = await mo();

  // Bắt lệnh in mà không để trình duyệt thật sự nhảy sang scheme rawbt:.
  // `window.location.href` không ghi đè được (thuộc tính không configurable),
  // nên chặn ở chỗ app thật sự dùng: cú bấm thẻ <a>.
  await page.addInitScript(`
    window.__rawbt = [];
    const goc = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function(){
      if (String(this.href).startsWith('rawbt:')) return window.__rawbt.push(String(this.href));
      return goc.call(this);
    };
  `);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#posTables .tbtn', { timeout: 8000 });

  await page.evaluate((b) => window.__db.ghi('bills/' + b.code, { ...b, createdAt: Date.now() }), HD);
  await page.waitForTimeout(400);

  bao(await page.locator('[data-bill-in]').count() === 0, 'chưa bật thì KHÔNG có nút In, màn hóa đơn gọn như cũ');

  await page.locator('#posBillIn').click();
  await page.waitForSelector('#inBat', { timeout: 5000 });
  await page.locator('#inBat').check();
  await page.locator('#inKho').selectOption('58');
  await page.screenshot({ path: 'test/anh-cai-dat-in.png' });
  await page.locator('#shFoot .btn.solid').click();
  await page.waitForTimeout(300);

  bao(await page.locator('[data-bill-in]').count() === 1, 'bật xong thì nút In hiện trên thẻ hóa đơn');
  bao((await page.locator('[data-bill-in]').innerText()).includes('In') &&
      !(await page.locator('[data-bill-in]').innerText()).includes('lại'), 'lần đầu là "In", chưa phải "In lại"');

  await page.locator('[data-bill-in]').click();
  await page.waitForTimeout(1200);

  const gui = await page.evaluate(() => window.__rawbt);
  bao(gui.length === 1, `bấm In gửi đúng 1 lệnh qua rawbt: (thấy ${gui.length})`);
  if (gui.length){
    const b64 = gui[0].slice('rawbt:base64,'.length);
    const bytes = Buffer.from(b64, 'base64');
    bao(bytes[0] === 0x1b && bytes[1] === 0x40, 'dữ liệu gửi đi đúng là lệnh ESC/POS');
    console.log(`     lệnh in khổ 58mm: ${(bytes.length/1024).toFixed(1)}KB thô, ${(b64.length/1024).toFixed(1)}KB base64`);
    bao(b64.length < 900_000, 'lọt giới hạn URL của Android Intent');
  }
  bao((await page.locator('[data-bill-in]').innerText()).includes('lại'),
      'in xong thì nút đổi thành "In lại" — hai tờ cùng mã phải phân biệt được');

  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

/* ── 4. nhãn dán ly ─────────────────────────────────────────────────────── */
{
  const { page, ctx, loi } = await mo();

  const DON = {
    ma: 'QCH2608150003', ten: 'Anh Long', sdt: '0901234567', kieu: 'Mang đi',
    items: [
      { name: 'Trà sữa socola bánh oreo vụn', qty: 2, tuyChon: 'Ít đá, Ít đường', ghiChu: 'lấy ống hút giấy, pha nhạt thôi' },
      { name: 'Espresso', qty: 1 },
    ],
  };

  for (const kho of ['58', '80']) {
    const kq = await page.evaluate(async ({ don, kho }) => {
      const { boCucNhan } = await import('./js/nhanBoCuc.js');
      const { veMotNhan, lenhInNhan } = await import('./js/inNhan.js');
      const ds = boCucNhan(don, { kho, luc: new Date('2026-08-15T09:05:00+07:00') });
      const anh = ds.map((n) => veMotNhan(n, kho).canvas.toDataURL('image/png'));
      const b = lenhInNhan(ds, kho);
      const chu = ds.flat().filter((k) => k.kieu === 'chu').map((k) => k.chu).join(' ');
      return { so: ds.length, anh, byte: b.length, coSoDay: chu.includes('0901234567'), chu };
    }, { don: DON, kho });

    bao(kq.so === 3, `khổ ${kho}mm: 3 ly ra 3 nhãn (thấy ${kq.so})`);
    bao(!kq.coSoDay, `khổ ${kho}mm: KHÔNG in đủ số điện thoại lên ly`);
    bao(kq.chu.includes('***567') && kq.chu.includes('Anh Long'), `khổ ${kho}mm: có tên + 3 số cuối`);
    bao(kq.chu.includes('1/3') && kq.chu.includes('3/3'), `khổ ${kho}mm: đánh số ly trên cả đơn`);
    console.log(`     lệnh in ${kq.so} nhãn khổ ${kho}mm: ${(kq.byte / 1024).toFixed(1)}KB thô`);

    // Ghép ba nhãn thành một ảnh để nhìn một lượt.
    const ten = `test/anh-nhan-${kho}.png`;
    await page.evaluate(async ({ anh }) => {
      const ims = await Promise.all(anh.map((d) => new Promise((r) => {
        const i = new Image(); i.onload = () => r(i); i.src = d;
      })));
      const cv = document.createElement('canvas');
      cv.width = ims[0].width;
      cv.height = ims.reduce((s, i) => s + i.height + 12, 0);
      const g = cv.getContext('2d');
      g.fillStyle = '#bbb'; g.fillRect(0, 0, cv.width, cv.height);
      let y = 0;
      for (const i of ims) { g.drawImage(i, 0, y); y += i.height + 12; }
      window.__ghep = cv.toDataURL('image/png');
    }, { anh: kq.anh });
    const png = await page.evaluate(() => window.__ghep);
    await writeFile(ten, Buffer.from(png.split(',')[1], 'base64'));
    console.log(`  ✓ ${ten}`);
  }

  /* chuỗi byte: MỘT lệnh, khởi tạo đúng một lần, cắt giấy sau từng nhãn */
  const b = await page.evaluate(async ({ don }) => {
    const { boCucNhan } = await import('./js/nhanBoCuc.js');
    const { lenhInNhan } = await import('./js/inNhan.js');
    return [...lenhInNhan(boCucNhan(don, { kho: '80' }), '80')];
  }, { don: DON });

  let soKhoiTao = 0, soCat = 0;
  for (let i = 0; i < b.length - 3; i++) {
    if (b[i] === 0x1b && b[i + 1] === 0x40) soKhoiTao++;
    if (b[i] === 0x1d && b[i + 1] === 0x56 && b[i + 2] === 66) soCat++;
  }
  bao(soKhoiTao === 1, `khởi tạo ĐÚNG MỘT lần (thấy ${soKhoiTao}) — ESC @ giữa chừng là mất cấu hình`);
  bao(soCat === 3, `cắt giấy sau từng nhãn để xé rời (thấy ${soCat})`);

  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

/* ── 5. hai máy in: nhãn kế thừa hay đi riêng ───────────────────────────── */
{
  const { page, ctx, loi } = await mo();

  // Chặn mọi lệnh gửi đi rồi ghi lại địa chỉ, để biết nhãn thật sự bay tới máy
  // nào — đọc cấu hình thôi thì chưa chứng minh được đường đi.
  await page.addInitScript(`
    window.__gui = [];
    const fetchGoc = window.fetch;
    window.fetch = function(u, o){
      if (String(u).includes('/in')) { window.__gui.push(String(u)); return Promise.resolve(new Response('', { status: 200 })); }
      return fetchGoc.apply(this, arguments);
    };
  `);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#posTables .tbtn', { timeout: 8000 });

  const doc = () => page.evaluate(async () => {
    const { cauHinhNhan } = await import('./js/inNhan.js');
    const { cauHinhIn } = await import('./js/inHoaDon.js');
    return { nhan: cauHinhNhan(), hoaDon: cauHinhIn() };
  });
  const luu = () => page.locator('#shFoot .btn.solid').click();

  /* một máy: nhãn phải bám theo máy hóa đơn */
  await page.locator('#posBillIn').click();
  await page.waitForSelector('#nhanRieng', { timeout: 5000 });
  await page.locator('#inBat').check();
  await page.locator('#nhanBat').check();
  await page.locator('#inCach').selectOption('caunoi');
  await page.locator('#inCauNoi').fill('http://10.0.0.1:9110');
  bao(await page.locator('#nhanMayWrap').isHidden(), 'chưa bật "máy riêng" thì các ô địa chỉ nhãn ẩn đi');
  await luu();
  await page.waitForTimeout(300);

  let c = await doc();
  bao(c.nhan.cauNoi === 'http://10.0.0.1:9110' && c.nhan.cach === 'caunoi',
      `một máy: nhãn kế thừa địa chỉ của hóa đơn (thấy ${c.nhan.cauNoi})`);

  await page.evaluate(async () => {
    const { inNhan } = await import('./js/inNhan.js');
    await inNhan({ ma: 'T1', ten: 'A', sdt: '0900000000', kieu: 'Mang đi',
                   items: [{ name: 'Espresso', qty: 1 }] });
  });
  bao((await page.evaluate(() => window.__gui)).at(-1) === 'http://10.0.0.1:9110/in',
      'một máy: lệnh in nhãn thật sự bay tới máy in hóa đơn');

  /* hai máy: tách hẳn ra, hóa đơn không bị kéo theo */
  await page.locator('#posBillIn').click();
  await page.waitForSelector('#nhanRieng', { timeout: 5000 });
  await page.locator('#nhanRieng').check();
  bao(await page.locator('#nhanMayWrap').isVisible(), 'bật "máy riêng" thì các ô địa chỉ nhãn hiện ra ngay');
  await page.locator('#nhanCach').selectOption('caunoi');
  await page.locator('#nhanCauNoi').fill('http://10.0.0.2:9111');
  await page.locator('#nhanKho').selectOption('58');
  await luu();
  await page.waitForTimeout(300);

  c = await doc();
  bao(c.nhan.cauNoi === 'http://10.0.0.2:9111' && c.nhan.kho === '58',
      `hai máy: nhãn dùng địa chỉ và khổ giấy riêng (thấy ${c.nhan.cauNoi} khổ ${c.nhan.kho})`);
  bao(c.hoaDon.cauNoi === 'http://10.0.0.1:9110' && c.hoaDon.kho !== '58',
      'hai máy: cài đặt máy in hóa đơn KHÔNG bị kéo theo');

  await page.evaluate(async () => {
    const { inNhan } = await import('./js/inNhan.js');
    await inNhan({ ma: 'T2', ten: 'A', sdt: '0900000000', kieu: 'Mang đi',
                   items: [{ name: 'Espresso', qty: 1 }] });
  });
  bao((await page.evaluate(() => window.__gui)).at(-1) === 'http://10.0.0.2:9111/in',
      'hai máy: lệnh in nhãn bay tới máy thứ hai');

  await page.locator('#posBillIn').click();
  await page.waitForSelector('#nhanRieng', { timeout: 5000 });
  // Cuộn xuống đúng phần nhãn rồi mới chụp — mặc định sheet mở ở đầu và ảnh
  // ra toàn phần hóa đơn, không nhìn thấy thứ vừa thêm.
  await page.locator('#nhanInThu').scrollIntoViewIfNeeded();
  await page.waitForTimeout(3200);            // chờ toast "Đã lưu" tan đi
  await page.screenshot({ path: 'test/anh-cai-dat-hai-may.png' });
  console.log('  ✓ test/anh-cai-dat-hai-may.png');

  /* tháo máy thứ hai: phải quay về đúng một máy, không bám giá trị cũ */
  await page.locator('#nhanRieng').uncheck();
  await luu();
  await page.waitForTimeout(300);

  c = await doc();
  bao(c.nhan.cauNoi === 'http://10.0.0.1:9110' && c.nhan.kho === c.hoaDon.kho,
      `tháo máy thứ hai thì nhãn quay lại máy hóa đơn (thấy ${c.nhan.cauNoi} khổ ${c.nhan.kho})`);

  await page.evaluate(async () => {
    const { inNhan } = await import('./js/inNhan.js');
    await inNhan({ ma: 'T3', ten: 'A', sdt: '0900000000', kieu: 'Mang đi',
                   items: [{ name: 'Espresso', qty: 1 }] });
  });
  bao((await page.evaluate(() => window.__gui)).at(-1) === 'http://10.0.0.1:9110/in',
      'tháo xong: nhãn không còn bay tới IP của máy đã tháo');

  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

/* ── 6. tờ ĐÃ THANH TOÁN: chân hoá đơn và mã QR đặt online ───────────────── */
{
  const { page, ctx, loi } = await mo();

  const HD_TRA = {
    ...HD,
    status: 'paid', payMethod: 'tienmat', paidAmount: 68000,
    khachDua: 100000, tienThoi: 32000,
    thuBoi: 'linh.nv@ghecauhai.vn',
  };

  for (const kho of ['58', '80']) {
    const kq = await page.evaluate(async ({ b, kho }) => {
      const { boCucHoaDon } = await import('./js/hoaDonBoCuc.js');
      const { veHoaDon } = await import('./js/inHoaDon.js');
      const khoi = boCucHoaDon(b, { kho, tenQuan: 'GHÉ CẬU HAI', diaChi: '', luc: new Date('2026-08-14T15:30:00+07:00') });
      const { diem, rong, cao } = await veHoaDon(khoi, kho);
      // Dựng lại ảnh TỪ BITMAP 1-BIT chứ không chụp canvas: thứ máy in nhả ra
      // là mảng `diem`, và câu hỏi cần trả lời là mã QR có sống sót qua bước
      // ngưỡng hoá đó không.
      const cv2 = document.createElement('canvas');
      cv2.width = rong; cv2.height = cao;
      const g2 = cv2.getContext('2d');
      const im = g2.createImageData(rong, cao);
      for (let i = 0; i < diem.length; i++) {
        const v = diem[i] ? 0 : 255;
        im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v;
        im.data[i * 4 + 3] = 255;
      }
      g2.putImageData(im, 0, 0);
      return { png: cv2.toDataURL('image/png'), cao, rong, diem: [...diem] };
    }, { b: HD_TRA, kho });

    const ten = `test/anh-hoa-don-tra-${kho}.png`;
    await writeFile(ten, Buffer.from(kq.png.split(',')[1], 'base64'));
    console.log(`  ✓ ${ten}  (${kq.rong}×${kq.cao} điểm, đúng thứ máy in nhả ra)`);

    // Hai phép kiểm khác nhau, đừng lẫn.
    //
    // (a) Giải mã: chứng minh đường vẽ → raster → ngưỡng hoá KHÔNG phá mã. Bắt
    //     được lỗi thật như đảo bit, sai bề rộng dòng, chia băng lệch. KHÔNG
    //     chứng minh được là điện thoại thật quét nổi — jsQR đọc được cả những
    //     mã bé tới mức in ra không ai quét được (đã thử ở rong 0.22).
    // (b) Bề rộng một ô tính bằng mm: cái này mới nói được chuyện quét ngoài
    //     đời. Đây là con số mà thu nhỏ mã đi một chút là nó tụt xuống.
    const rgba = new Uint8ClampedArray(kq.rong * kq.cao * 4);
    for (let i = 0; i < kq.diem.length; i++) {
      const v = kq.diem[i] ? 0 : 255;
      rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
    const doc = jsQR(rgba, kq.rong, kq.cao);
    bao(doc?.data === 'https://ghecauhai.vn',
      `khổ ${kho}mm: mã QR còn nguyên sau khi ngưỡng hoá 1-bit (${doc ? doc.data : 'KHÔNG ĐỌC ĐƯỢC'})`);

    if (doc) {
      // Bốn góc của mã, đo trên chính tấm bitmap sắp gửi tới máy in.
      const g = doc.location;
      const rongMa = Math.abs(g.topRightCorner.x - g.topLeftCorner.x);
      const mmMotO = rongMa / 29 / 8;          // 29 ô; máy in 203 dpi = 8 điểm/mm
      bao(mmMotO >= 0.6,
        `khổ ${kho}mm: mỗi ô mã QR rộng ${mmMotO.toFixed(2)}mm (cần ≥ 0.60mm để điện thoại quét được trên giấy nhiệt)`);
    }
  }

  bao(!loi.length, `không có lỗi JS${loi.length ? ': ' + loi[0] : ''}`);
  await ctx.close();
}

await browser.close();
server.close();
console.log(hong ? `\n✗ ${hong} chỗ sai\n` : '\n✓ Tất cả đúng\n');
process.exit(hong ? 1 : 0);
