/* ==========================================================================
   sw.js — service worker
   • Vỏ ứng dụng: cache-first (mở app tức thì, chạy được khi mất mạng)
   • Hai bảng Google Sheet: stale-while-revalidate (xem được thực đơn/công thức
     ngay cả khi offline, đồng thời tự làm mới ở nền)
   • Firebase Realtime Database: KHÔNG cache — dữ liệu phải luôn tươi và
     bản thân SDK đã tự xử lý hàng đợi khi mất mạng.
   ========================================================================== */
const VERSION = 'v1.6.0';
const SHELL   = 'phache-shell-' + VERSION;
const SHEETS  = 'phache-sheets-' + VERSION;
const SDK     = 'phache-sdk-' + VERSION;

/* Mọi file trong app/js PHẢI có mặt ở đây. Thiếu một cái là app vẫn chạy khi
   online (rơi xuống mạng) nhưng chết câm khi mất sóng — kiểu lỗi chỉ lộ ra ở
   quán, đúng lúc wifi chập. test/sw.test.mjs canh danh sách này khỏi lệch. */
const SHELL_FILES = [
  './',
  './index.html',
  './app.css',
  './manifest.webmanifest',
  './js/app.js',
  './js/core.js',
  './js/pos.js',
  './js/kds.js',
  './js/prep.js',
  './js/report.js',
  './js/phien.js',
  './js/thucThu.js',
  './js/escpos.js',
  './js/hoaDonBoCuc.js',
  './js/inHoaDon.js',
  './js/tem.js',
  './js/gioHang.js',
  './js/nhanBoCuc.js',
  './js/inNhan.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-96.png'
];

/* SDK Firebase nằm trên gstatic — có CORS nên cache được đầy đủ */
const SDK_FILES = [
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js'
];

const isSheet = url => url.hostname === 'script.google.com'
                    || url.hostname === 'script.googleusercontent.com';
const isRtdb  = url => url.hostname.endsWith('.firebasedatabase.app')
                    || url.hostname.endsWith('.firebaseio.com')
                    || url.hostname === 'www.googleapis.com';

/* ─────────────────── cài đặt ─────────────────── */
self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // thêm từng file để một file lỗi không làm hỏng toàn bộ quá trình cài
    await Promise.all(SHELL_FILES.map(f =>
      c.add(new Request(f, { cache:'reload' })).catch(err =>
        console.warn('[sw] không cache được', f, err))));
    const s = await caches.open(SDK);
    await Promise.all(SDK_FILES.map(f =>
      s.add(new Request(f, { cache:'reload' })).catch(err =>
        console.warn('[sw] không cache được SDK', f, err))));
    self.skipWaiting();
  })());
});

/* ─────────────────── kích hoạt: dọn cache cũ ─────────────────── */
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keep = new Set([SHELL, SHEETS, SDK]);
    const names = await caches.keys();
    await Promise.all(names.filter(n => n.startsWith('phache-') && !keep.has(n))
                           .map(n => caches.delete(n)));
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable(); } catch {}
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});

/* ─────────────────── điều phối request ─────────────────── */
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                 // POST/PUT của Firebase: bỏ qua

  let url;
  try { url = new URL(req.url); } catch { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;
  if (isRtdb(url)) return;                          // realtime: luôn đi mạng

  /* Điều hướng trang (mở app / bấm shortcut) -> luôn trả vỏ app.
     Nhờ vậy #/kds, #/pos… vẫn mở được khi offline. */
  if (req.mode === 'navigate'){
    e.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const c = await caches.open(SHELL);
        c.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const c = await caches.open(SHELL);
        return (await c.match('./index.html')) || Response.error();
      }
    })());
    return;
  }

  /* Google Sheet: trả cache ngay, đồng thời làm mới ở nền */
  if (isSheet(url)){
    e.respondWith((async () => {
      const c = await caches.open(SHEETS);
      const hit = await c.match(req, { ignoreSearch:false });
      const net = fetch(req).then(r => {
        if (r && r.ok) c.put(req, r.clone());
        return r;
      }).catch(() => null);
      if (hit){ e.waitUntil(net); return hit; }
      const r = await net;
      return r || new Response('[]', { headers:{ 'Content-Type':'application/json' } });
    })());
    return;
  }

  /* SDK Firebase trên gstatic: cache-first (phiên bản đã ghim nên an toàn) */
  if (url.hostname === 'www.gstatic.com'){
    e.respondWith((async () => {
      const c = await caches.open(SDK);
      const hit = await c.match(req);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r && r.ok) c.put(req, r.clone());
        return r;
      } catch { return Response.error(); }
    })());
    return;
  }

  /* Cùng nguồn (vỏ app): cache-first, có cập nhật ở nền */
  if (url.origin === location.origin){
    e.respondWith((async () => {
      const c = await caches.open(SHELL);
      const hit = await c.match(req, { ignoreSearch:true });
      if (hit){
        e.waitUntil(fetch(req).then(r => { if (r && r.ok) c.put(req, r.clone()); }).catch(()=>{}));
        return hit;
      }
      try {
        const r = await fetch(req);
        if (r && r.ok && r.type === 'basic') c.put(req, r.clone());
        return r;
      } catch { return Response.error(); }
    })());
  }
});
