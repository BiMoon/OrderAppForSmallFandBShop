/**
 * Chụp dải phân đoạn ở MỌI vị trí tab, cả hai chế độ màu, và ĐO tương phản
 * giữa viên đang chọn với rãnh nền.
 *
 * Lỗi cần canh: bản cũ viên trắng nằm trên rãnh gần trắng, chỉ hơn nhau
 * 1,06:1. Nhìn được là nhờ bóng đổ — mà bóng chỉ đọc được khi viên nằm giữa.
 * Chọn tab đầu hoặc cuối là mép viên trùng góc bo của rãnh, bóng mất chỗ tựa.
 * Nên phép đo phải chạy cho TỪNG vị trí, không chỉ một.
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { chromium } from 'playwright';
import { FAKE_APP, FAKE_AUTH, FAKE_DB } from './gia-firebase.mjs';

const PORT = 4191;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.mjs':'text/javascript',
               '.css':'text/css', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = createServer(async (req,res) => {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  let p = join('.', normalize(decodeURIComponent(u.pathname)).replace(/^(\.\.[/\\])+/, ''));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p,'index.html');
  let b; try { b = await readFile(p); } catch { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, {'content-type': MIME[extname(p)] ?? 'application/octet-stream'});
  res.end(b);
});
await new Promise(r => server.listen(PORT, r));

let hong = 0;
const bao = (ok, chu) => { if (!ok) hong++; console.log(`  ${ok?'✔':'✘'} ${chu}`); };
const MENU = [{ STT:1,'Tên Món':'Espresso','Đơn giá':18000 },
              { STT:2,'Tên Món':'Trà đào cam sả','Đơn giá':30000 }];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

/* Đo tương phản NGAY TRÊN TRANG: lấy màu nền thật đã tính của viên và của
   rãnh. Nền gradient thì `backgroundColor` trả `transparent`, nên phải tự vẽ
   ra canvas rồi lấy pixel — đọc thuộc tính CSS không đủ. */
const DO = `(() => {
  const lum = (r,g,b) => { const f=c=>{c/=255;return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4)};
    return .2126*f(r)+.7152*f(g)+.0722*f(b); };
  const px = (el) => {
    const cs = getComputedStyle(el);
    let bg = cs.backgroundImage;
    if (bg && bg !== 'none') {
      const m = bg.match(/rgba?\\([^)]+\\)/g) || [];
      if (m.length) {                       // gradient -> lấy stop ĐẦU (nhạt nhất về phía rãnh)
        const n = m.map(s => s.match(/[\\d.]+/g).map(Number));
        return n.reduce((a,c) => lum(...a) < lum(...c) ? a : c);
      }
    }
    let e = el;
    while (e) { const c = getComputedStyle(e).backgroundColor;
      if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') return c.match(/[\\d.]+/g).slice(0,3).map(Number);
      e = e.parentElement; }
    return [255,255,255];
  };
  const cr = (a,b) => { const [x,y]=[lum(...a),lum(...b)].sort((p,q)=>q-p); return (x+.05)/(y+.05); };
  const ra = [];
  for (const seg of document.querySelectorAll('.seg')) {
    const on = seg.querySelector('button.active'); if (!on) continue;
    const bs = [...seg.querySelectorAll('button')];
    ra.push({ id: seg.id || '(không id)', viTri: bs.indexOf(on)+1, tong: bs.length,
              nhan: on.textContent.trim().slice(0,18),
              tuongPhan: +cr(px(on), px(seg)).toFixed(2) });
  }
  return ra;
})()`;

for (const mau of ['light','dark']) {
  console.log(`\n── chế độ ${mau === 'light' ? 'SÁNG' : 'TỐI'} ──`);
  const ctx = await browser.newContext({ viewport:{width:390,height:844}, locale:'vi-VN',
    isMobile:true, hasTouch:true, serviceWorkers:'block', colorScheme:mau });
  const page = await ctx.newPage();
  const loi = [], chan = new Set();
  page.on('pageerror', e => loi.push(e.message));
  page.on('requestfailed', r => { if (!chan.has(r.url())) loi.push('không tải được '+r.url()); });
  await page.route(u => !u.hostname.includes('localhost'), r => { chan.add(r.request().url()); return r.abort(); });
  await page.route('**/firebasejs/**/firebase-app.js',      r => r.fulfill({status:200,contentType:'text/javascript',body:FAKE_APP}));
  await page.route('**/firebasejs/**/firebase-auth.js',     r => r.fulfill({status:200,contentType:'text/javascript',body:FAKE_AUTH}));
  await page.route('**/firebasejs/**/firebase-database.js', r => r.fulfill({status:200,contentType:'text/javascript',body:FAKE_DB}));
  await page.route(u => u.hostname === 'script.google.com',
    r => r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MENU)}));
  await page.route(u => u.pathname.endsWith('/api/cau-hinh-quan'), r => r.fulfill({status:200,
    contentType:'application/json', body:JSON.stringify({ok:true,bankId:'970416',accountNo:'0123456789',accountName:'A'})}));

  await page.addInitScript(`localStorage.setItem("phache.v1.role", JSON.stringify("cashier"))`);
  await page.goto(`http://localhost:${PORT}/app/`, { waitUntil:'domcontentloaded' });
  await page.waitForSelector('#posTables .tbtn', { timeout:8000 });

  // dựng ít số liệu để mấy viên đếm có gì mà hiện
  await page.evaluate(() => {
    const g = Date.now();
    window.__db.ghi('orders/o1', { table:3, item:'Espresso', quantity:2, price:18000, time:'09:30', sentAt:g-60000 });
    window.__db.ghi('history/h1', { table:3, item:'Espresso', quantity:1, price:18000,
      completedDate:new Date().toISOString().slice(0,10), timestamp:g-600000 });
  });
  await page.waitForTimeout(500);

  const TAB = [['entry','Chọn món'],['cart','Giỏ'],['pending','Chờ pha'],['bill','Hóa đơn']];
  for (const [v, ten] of TAB) {
    await page.locator(`#posView button[data-v="${v}"]`).click();
    await page.waitForTimeout(300);
    const ra = await page.evaluate(DO);
    const seg = ra.find(x => x.id === 'posView');
    bao(seg && seg.tuongPhan >= 3,
        `${ten} (vị trí ${seg?.viTri}/${seg?.tong}) — viên/rãnh ${seg?.tuongPhan}:1 ${seg?.tuongPhan >= 3 ? '' : '← DƯỚI 3:1, nhìn không ra'}`);
    if (v === 'entry' || v === 'bill') {
      await page.locator('#posView').scrollIntoViewIfNeeded();
      const box = await page.locator('#posView').boundingBox();
      await page.screenshot({ path:`test/anh-seg-${mau}-${v}.png`,
        clip:{ x:box.x-8, y:box.y-8, width:box.width+16, height:box.height+16 } });
    }
  }
  await page.locator('#posView button[data-v="bill"]').click();
  await page.waitForTimeout(300);
  await page.screenshot({ path:`test/anh-seg-${mau}-toanman.png` });
  bao(!loi.length, `không có lỗi JS${loi.length ? ': '+loi[0] : ''}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(hong ? `\n✗ ${hong} chỗ sai\n` : '\n✓ Tất cả đúng\n');
process.exit(hong ? 1 : 0);
