/* ==========================================================================
   app.js — vỏ ứng dụng: chọn vai trò, điều hướng, cài đặt, service worker
   ========================================================================== */
import { el, esc, store, toast, sheet, closeSheet, initData, onData, data,
         audio, keepAwake, loadMenu, loadPrep, onAuthChange, signOutUser } from './core.js';
import { mountPos, posBadge }        from './pos.js';
import { mountKds, kdsBadge }        from './kds.js';
import { mountPrep, closeDetail, isDetailOpen } from './prep.js';
import { mountReport }               from './report.js';

const SCREENS = {
  pos:    { title:'Đặt món',      sub:'Thu ngân',        mount:mountPos },
  kds:    { title:'Quầy pha chế', sub:'Màn hình pha chế', mount:mountKds },
  prep:   { title:'Sơ chế',       sub:'Công thức & định lượng', mount:mountPrep },
  report: { title:'Thống kê',     sub:'Doanh thu',       mount:mountReport }
};
const ROLE_HOME = { cashier:'pos', barista:'kds', prep:'prep', manager:'report' };
const ROLE_NAME = { cashier:'Thu ngân', barista:'Quầy pha chế', prep:'Sơ chế', manager:'Quản lý' };

let current = null;

/* ─────────────────── điều hướng ─────────────────── */
function go(name, push = true){
  if (!SCREENS[name]) name = 'pos';
  if (current === 'prep' && name !== 'prep') closeDetail();
  current = name;

  const root = el('sc-' + name);
  SCREENS[name].mount(root);
  document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s === root));
  [...el('tabbar').children].forEach(b => b.classList.toggle('active', b.dataset.go === name));

  el('scTitle').textContent = SCREENS[name].title;
  el('scSub').textContent   = SCREENS[name].sub;
  el('btnSound').hidden = (name !== 'kds' && name !== 'pos');
  el('main').scrollTop = 0;
  if (push && location.hash !== '#/' + name) location.hash = '#/' + name;
  syncBack();
}
const routeFromHash = () => (location.hash.match(/^#\/(\w+)/) || [,''])[1];

window.addEventListener('hashchange', () => {
  const r = routeFromHash();
  if (r && SCREENS[r] && r !== current) go(r, false);
});

/* nút quay lại: chỉ dùng cho chi tiết công thức */
function syncBack(){
  el('btnBack').hidden = !(current === 'prep' && isDetailOpen());
}
window.addEventListener('prep:detail', e => {
  syncBack();
  el('scTitle').textContent = e.detail.open ? e.detail.title : SCREENS.prep.title;
  el('scSub').textContent   = e.detail.open ? 'Công thức' : SCREENS.prep.sub;
});
el('btnBack').onclick = () => { closeDetail(); };
el('tabbar').onclick = e => {
  const b = e.target.closest('button[data-go]'); if (!b) return;
  go(b.dataset.go);
};
/* nút back của Android khi đang xem chi tiết công thức */
window.addEventListener('popstate', () => { if (isDetailOpen()) closeDetail(); });

/* ─────────────────── huy hiệu trên thanh dưới ─────────────────── */
function badges(){
  const p = posBadge(), k = kdsBadge(), w = data.orders.length;
  const set = (id, n, cls) => {
    const x = el(id); if (!x) return;
    x.classList.toggle('hide', !n);
    x.textContent = n > 99 ? '99+' : n;
    x.style.background = cls;
  };
  set('pipPos', p, 'var(--brand)');
  set('pipKds', k || w, k ? 'var(--late)' : 'var(--warn)');
}
onData(() => badges());

/* ─────────────────── chọn vai trò ─────────────────── */
function openGate(){ el('roleGate').classList.add('open'); }
function closeGate(){ el('roleGate').classList.remove('open'); }

document.querySelectorAll('.role').forEach(b => b.onclick = () => {
  const role = b.dataset.role;
  store.set('role', role);
  closeGate();
  go(ROLE_HOME[role]);
  if (role === 'barista'){ store.set('awake', true); keepAwake(true); }
});

/* ─────────────────── âm báo ─────────────────── */
function paintSound(){
  const b = el('btnSound');
  b.textContent = audio.on ? '🔔' : '🔕';
  b.classList.toggle('on', audio.on);
}
el('btnSound').onclick = () => {
  if (audio.on){ audio.disable(); toast('Đã tắt âm báo'); }
  else { audio.enable(); toast('Đã bật âm báo','ok'); }
  paintSound();
};

/* ─────────────────── menu cài đặt ─────────────────── */
el('btnMore').onclick = () => {
  const role = store.get('role','cashier');
  const awake = store.get('awake', false);
  sheet({
    title:'Cài đặt',
    body:`
      <div class="sec-label" style="margin-top:0">Vai trò hiện tại</div>
      <button class="btn block" id="stRole" style="justify-content:space-between">
        <span>${esc(ROLE_NAME[role] || role)}</span><span class="muted">Đổi ›</span></button>

      <div class="sec-label">Màn hình</div>
      <button class="btn block" id="stAwake" style="justify-content:space-between">
        <span>Giữ màn hình luôn sáng</span>
        <span class="muted">${awake ? 'Đang bật' : 'Đang tắt'}</span></button>

      <div class="sec-label">Dữ liệu</div>
      <button class="btn block" id="stReload" style="justify-content:space-between">
        <span>Tải lại thực đơn &amp; công thức</span>
        <span class="muted">${data.menu.length} · ${data.prep.length}</span></button>

      <div class="sec-label">Ứng dụng</div>
      <div class="lblbox" style="font-size:12.5px;line-height:1.6;color:var(--ink-2);
           background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:12px 14px">
        Bản mobile · dùng chung dữ liệu với bản web.<br>
        Kết nối: <b>${data.online ? 'trực tuyến' : 'mất mạng'}</b><br>
        Chế độ: <b>${matchMedia('(display-mode: standalone)').matches ? 'đã cài như app' : 'đang mở trong trình duyệt'}</b>
      </div>
      <div id="stInstallWrap"></div>`,
    actions:[{ label:'Đóng' }]
  });

  el('stRole').onclick = () => { closeSheet(); openGate(); };
  el('stAwake').onclick = async () => {
    const next = !store.get('awake', false);
    store.set('awake', next);
    const ok = await keepAwake(next);
    closeSheet();
    toast(next ? (ok ? 'Màn hình sẽ không tự tắt' : 'Máy không hỗ trợ giữ sáng') : 'Đã tắt giữ sáng');
  };
  el('stReload').onclick = () => {
    closeSheet(); toast('Đang tải lại…');
    Promise.all([loadMenu(), loadPrep()]).then(() =>
      toast(`Đã tải ${data.menu.length} món · ${data.prep.length} công thức`,'ok'));
  };
  el('stInstallWrap').innerHTML = installHTML();
};

function installHTML(){
  const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (isStandalone)
    return '<div class="lblbox mt12" style="font-size:12.5px;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:12px 14px">✅ App đã được cài trên thiết bị này.</div>';
  if (deferredPrompt)
    return '<button class="btn solid block mt12" data-install>📲 Cài lên máy như một app</button>';
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  if (isIOS)
    return '<div class="lblbox mt12" style="font-size:12.5px;line-height:1.7;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:12px 14px">📲 <b>Cài trên iOS:</b> Bấm nút <b>Chia sẻ ⎙</b> ở thanh Safari, rồi chọn <b>"Thêm vào Màn hình chính"</b>.</div>';
  return '<div class="lblbox mt12" style="font-size:12.5px;line-height:1.7;color:var(--ink-2);background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:12px 14px">📲 <b>Cài trên Android / Chrome:</b> Mở menu <b>⋮</b> của trình duyệt, chọn <b>"Thêm vào Màn hình chính"</b> hoặc <b>"Cài đặt ứng dụng"</b>.</div>';
}

/* ─────────────────── cài đặt PWA ─────────────────── */
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  el('installGate').classList.add('show');
});
document.addEventListener('click', async e => {
  if (!e.target.closest('[data-install]')) return;
  if (!deferredPrompt){
    toast('Mở menu ⋮ của Chrome rồi chọn “Thêm vào Màn hình chính”');
    return;
  }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  el('installGate').classList.remove('show');
  closeSheet();
  if (outcome === 'accepted') toast('Đang cài đặt…','ok');
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  el('installGate').classList.remove('show');
  toast('Đã cài xong! Mở app từ màn hình chính nhé.','ok');
});

/* ─────────────────── service worker ───────────────────
   Không dùng `'serviceWorker' in navigator`: thuộc tính vẫn tồn tại nhưng bằng
   undefined khi trang chạy trên http:// hoặc trong webview của Zalo/Messenger —
   gọi .register() lúc đó sẽ ném lỗi và làm đứng cả app. */
el('btnReload').onclick = () => location.reload();

const swReady = (() => {
  try { return !!(navigator.serviceWorker && typeof navigator.serviceWorker.register === 'function'); }
  catch { return false; }
})();

if (swReady){
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('./sw.js').then(reg => {
        reg.addEventListener('updatefound', () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', () => {
            if (sw.state === 'installed' && navigator.serviceWorker.controller)
              el('updbar').classList.add('show');
          });
        });
      }).catch(err => console.warn('SW không đăng ký được:', err));
    } catch (err){ console.warn('SW bị chặn:', err); }
  });
} else {
  console.info('Không có service worker — app vẫn chạy, chỉ không dùng được offline.');
}

/* ─────────────────── xác thực ─────────────────── */
el('btnLogout').onclick = () =>
  signOutUser().then(() => location.replace('../index.html'));

onAuthChange(user => {
  if (!user){ location.replace('../index.html'); return; }
  el('userAvatar').src = user.photoURL || '';
  el('userAvatar').hidden = !user.photoURL;
  el('btnLogout').hidden = false;
});

/* ─────────────────── chạy ─────────────────── */
paintSound();
initData();

const route = routeFromHash();
const role  = store.get('role', null);
if (route && SCREENS[route]){ closeGate(); go(route, false); }
else if (role){ closeGate(); go(ROLE_HOME[role] || 'pos'); }
else { openGate(); go('pos', false); }

if (store.get('awake', false)) keepAwake(true);
