/* ==========================================================================
   auth-guard.js — cổng đăng nhập cho BA trang web cũ chạy trên máy tính:
   order.html · observeOrder.html · summary.html

   ── Vì sao cần ──────────────────────────────────────────────────────────────

   Rules của Realtime Database đòi đăng nhập. Ba trang đó chỉ import
   `firebase-app.js` và `firebase-database.js`, KHÔNG import `firebase-auth.js`.

   Phiên đăng nhập vẫn còn nguyên trong IndexedDB của trình duyệt (Firebase Auth
   lưu theo origin, sống qua mọi lần chuyển trang) — nhưng **không có gì trên ba
   trang đó đọc nó ra**. `getDatabase(app)` lấy token qua component
   `auth-internal`, mà component ấy chỉ được đăng ký khi module auth được NẠP
   trên chính trang đó. Không nạp thì Database mở kết nối trắng, và rules từ
   chối. Trang trắng, không báo gì.

   Đó cũng là lý do PWA `/app/index.html` không dính: cả bốn màn hình của nó là
   MỘT trang duy nhất (điều hướng bằng `#/pos`, `#/kds`…), nạp auth đúng một lần
   nên thanh trên chỗ nào cũng thấy tài khoản.

   ── Vì sao là một file dùng chung ───────────────────────────────────────────

   Ba lần chép cùng một đoạn mã vào ba file HTML là ba bản sẽ lệch nhau. Dự án
   này đã dính đúng chuyện đó hai lần (địa chỉ quán trong HTML lệch với
   lib/quanInfo.mjs; danh sách file lib/ chép sang trang tĩnh thiếu mất một
   file). Một file, ba thẻ script.

   ── Cách gắn ────────────────────────────────────────────────────────────────

   Thêm đúng một dòng vào cuối <body> của mỗi trang, SAU đoạn script sẵn có:

       <script type="module" src="./auth-guard.js"></script>

   Không phải sửa gì khác. Guard tự tìm lại app Firebase mà trang đã khởi tạo.
   ========================================================================== */

import { getApps, getApp, initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

/* Chỉ dùng khi guard chạy TRƯỚC đoạn script của trang. Bình thường thẻ script
   nằm cuối <body> nên app đã có sẵn và nhánh này không đụng tới. */
const CAU_HINH_DU_PHONG = {
  apiKey: 'AIzaSyAWgDT99kbQlTzOG76xVImqtu3tRGPfstI',
  authDomain: 'quanlyphachequan.firebaseapp.com',
  databaseURL: 'https://quanlyphachequan-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'quanlyphachequan',
  storageBucket: 'quanlyphachequan.firebasestorage.app',
  messagingSenderId: '522540933651',
  appId: '1:522540933651:web:acbe8224f1db47b2d895e6',
};

const app = getApps().length ? getApp() : initializeApp(CAU_HINH_DU_PHONG);

/* Chính lời gọi này mới là bản vá.
   Nạp module auth + khởi tạo nó trên CÙNG một FirebaseApp là Database có chỗ
   lấy token. Nó tự gắn token vào kết nối đang mở và chạy lại các listener, nên
   dữ liệu hiện ra ngay mà không cần tải lại trang. */
const auth = getAuth(app);

/* ─────────────────── huy hiệu tài khoản ─────────────────── */

function veHuyHieu(user) {
  let box = document.getElementById('authBadge');
  if (!box) {
    box = document.createElement('div');
    box.id = 'authBadge';
    box.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'z-index:9999',
      'display:flex', 'align-items:center', 'gap:8px',
      'padding:6px 10px', 'border-radius:999px',
      'background:rgba(20,24,32,.86)', 'color:#eef2f7',
      'font:500 12px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'box-shadow:0 4px 16px rgba(0,0,0,.25)', 'backdrop-filter:blur(8px)',
      'max-width:min(90vw,320px)',
    ].join(';');
    document.body.appendChild(box);
  }

  const ten = user.email || user.displayName || 'đã đăng nhập';
  box.textContent = '';

  const cham = document.createElement('span');
  cham.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#34d399;flex:0 0 auto';
  const chu = document.createElement('span');
  chu.textContent = ten;
  chu.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap';

  const ra = document.createElement('button');
  ra.type = 'button';
  ra.textContent = 'Thoát';
  ra.style.cssText = [
    'border:0', 'background:rgba(255,255,255,.14)', 'color:inherit',
    'font:inherit', 'padding:3px 9px', 'border-radius:999px', 'cursor:pointer',
    'flex:0 0 auto',
  ].join(';');
  ra.onclick = () => signOut(auth).then(() => location.replace('./index.html'));

  box.append(cham, chu, ra);
}

/* ─────────────────── canh cổng ─────────────────── */

let daVao = false;

onAuthStateChanged(auth, (user) => {
  if (user) {
    daVao = true;
    veHuyHieu(user);
    return;
  }

  // Chưa đăng nhập -> về cổng, KÈM đường quay lại. Không có tham số này thì
  // index.html thấy đã đăng nhập là đẩy thẳng sang PWA điện thoại, và người
  // đứng ở máy tính quầy phải gõ lại địa chỉ bằng tay.
  const quayLai = location.pathname + location.search;
  location.replace('./index.html?tiep=' + encodeURIComponent(quayLai));
});

/* Firebase mất một nhịp để khôi phục phiên từ IndexedDB. Nếu sau 8 giây vẫn
   chưa có ai thì nói thành lời, thay vì để người dùng nhìn một trang trống và
   đoán là mạng chậm. */
setTimeout(() => {
  if (daVao) return;
  const bao = document.createElement('div');
  bao.textContent = 'Chưa đăng nhập — đang đưa về trang đăng nhập…';
  bao.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:99999',
    'display:flex', 'align-items:center', 'justify-content:center',
    'background:rgba(12,16,22,.92)', 'color:#eef2f7',
    'font:600 15px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
    'text-align:center', 'padding:24px',
  ].join(';');
  document.body.appendChild(bao);
}, 8000);
