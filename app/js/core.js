/* ==========================================================================
   core.js — nền tảng dùng chung cho cả 4 màn hình
   Giữ NGUYÊN hợp đồng dữ liệu với bản web (order/observeOrder/summary.html)
   để hai bản dùng song song trên cùng một Firebase mà không lệch nhau.
   ========================================================================== */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getDatabase, ref, push, set, remove, update, onValue, runTransaction,
  query, orderByKey, limitToLast,
  onChildAdded, onChildChanged, onChildRemoved, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  hoaDonCuaBan   as _hoaDonCuaBan,
  hoaDonMoCuaBan as _hoaDonMoCuaBan,
  mocDaChot      as _mocDaChot,
  monChuaTinhTien as _monChuaTinhTien,
  trangThaiBan   as _trangThaiBan,
} from './phien.js';

const firebaseConfig = {
  apiKey: "AIzaSyAWgDT99kbQlTzOG76xVImqtu3tRGPfstI",
  authDomain: "quanlyphachequan.firebaseapp.com",
  databaseURL: "https://quanlyphachequan-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "quanlyphachequan",
  storageBucket: "quanlyphachequan.firebasestorage.app",
  messagingSenderId: "522540933651",
  appId: "1:522540933651:web:acbe8224f1db47b2d895e6"
};

export const app  = initializeApp(firebaseConfig);
export const db   = getDatabase(app);
export const auth = getAuth(app);

export function signInWithGoogle(){
  return signInWithPopup(auth, new GoogleAuthProvider());
}
export function signOutUser(){
  return fbSignOut(auth);
}
export function onAuthChange(cb){
  return onAuthStateChanged(auth, cb);
}
export const FB  = { ref, push, set, remove, update, onValue, runTransaction, onChildAdded, onChildChanged, onChildRemoved, serverTimestamp };

export const ordersRef    = ref(db, 'orders');
export const historyRef   = ref(db, 'history');
export const cancelledRef = ref(db, 'cancelled');
export const billsRef     = ref(db, 'bills');

/* Hai bảng Google Sheet: thực đơn (có cột Đơn giá) và công thức sơ chế */
export const MENU_API = 'https://script.google.com/macros/s/AKfycbxRdkktSsPqkkiYUE9_lJfvqpnzQaKzn7xZ597jPpXaEfJWwWsy1xjgN9pCkRZSOCJl/exec';
export const PREP_API = 'https://script.google.com/macros/s/AKfycbzLLmvxGlSl3ZKLgjuYihI9faci-7JlWHkC-SnOlPJf4xqEwYJ8Ns_MGhUbgydMt0en/exec';

export const TABLES = 10;
export const CANCEL_REASONS = ['Khách đổi ý','Đặt nhầm món','Nhầm bàn','Hết nguyên liệu','Lý do khác'];

/* ─────────────────── tiện ích DOM ─────────────────── */
export const $  = s => document.querySelector(s);
export const $$ = s => [...document.querySelectorAll(s)];
export const el = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const rxEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

/* ─────────────────── số & tiền ─────────────────── */
export const nf = new Intl.NumberFormat('vi-VN');
export const money = n => nf.format(Math.round(n || 0)) + '₫';
export function moneyShort(n){
  n = Math.round(n || 0);
  if (n >= 1e9) return (n/1e9).toFixed(n % 1e9 ? 1 : 0).replace('.',',') + ' tỷ';
  if (n >= 1e6) return (n/1e6).toFixed(n % 1e6 ? 1 : 0).replace('.',',') + ' tr';
  if (n >= 1e3) return Math.round(n/1e3) + 'k';
  return String(n);
}

/* ─────────────────── ngày giờ (LUÔN theo giờ địa phương) ─────────────────── */
export function ymd(d = new Date()){
  return d.getFullYear() + '-' +
         String(d.getMonth()+1).padStart(2,'0') + '-' +
         String(d.getDate()).padStart(2,'0');
}
export const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
export const dmy = s => s ? s.slice(8,10) + '/' + s.slice(5,7) : '';
export function hm(d = new Date()){
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}
/* "HH:MM" -> mốc thời gian; nếu lệch về tương lai quá 2h thì coi là hôm qua */
export function parseClock(str){
  const m = /^(\d{1,2}):(\d{2})/.exec(String(str || ''));
  if (!m) return Date.now();
  const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
  if (d.getTime() - Date.now() > 2*3600e3) d.setDate(d.getDate()-1);
  return d.getTime();
}
export function fmtElapsed(ms){
  const s = Math.max(0, Math.floor(ms/1000)), m = Math.floor(s/60);
  return m < 60 ? m + "′" + String(s%60).padStart(2,'0') + "″"
                : Math.floor(m/60) + "h" + String(m%60).padStart(2,'0');
}
export const ageClass = ms => ms/60000 >= 10 ? 'age-late' : ms/60000 >= 5 ? 'age-warn' : '';

/* ─────────────────── đọc cột "Đơn giá" từ Sheet ───────────────────
   Header có thể là "Đơn giá" / "Đơn Giá" / "Giá" / "Price"… nên so khớp
   theo dạng đã bỏ dấu thay vì gán cứng một chuỗi. */
export const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
                         .replace(/đ/gi,'d').toLowerCase().replace(/[^a-z0-9]/g,'');
const PRICE_SLUGS = new Set(['dongia','gia','price','dongiavnd','dongiaban','giaban','donggia']);
const NAME_SLUGS  = new Set(['tenmon','ten','name','tensanpham','monnuoc','mon']);

export function parsePrice(v){
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[^\d.,-]/g,'');
  if (!s) return null;
  const dec = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (dec > -1){
    const tail = s.length - dec - 1;
    if (tail === 3 || tail === 0) s = s.replace(/[.,]/g,'');             // dấu phân nhóm
    else s = s.slice(0,dec).replace(/[.,]/g,'') + '.' + s.slice(dec+1);  // dấu thập phân
  }
  const n = Number(s);
  return isFinite(n) ? n : null;
}
const pickBySlug = (row, slugs) => {
  for (const k of Object.keys(row || {})) if (slugs.has(slug(k))) return row[k];
  return undefined;
};
export const priceOf = row => parsePrice(pickBySlug(row, PRICE_SLUGS));
export const nameOf  = row => row['Tên Món'] || pickBySlug(row, NAME_SLUGS) || ('Món #' + row['STT']);

/* ─────────────────── lưu cấu hình cục bộ ─────────────────── */
const LS = 'phache.v1.';
export const store = {
  get(k, dflt){ try { const v = localStorage.getItem(LS+k); return v === null ? dflt : JSON.parse(v); }
                catch { return dflt; } },
  set(k, v){ try { localStorage.setItem(LS+k, JSON.stringify(v)); } catch {} }
};

/* ─────────────────── thông báo nổi ─────────────────── */
export function toast(msg, kind){
  const t = el('toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'toast show' + (kind ? ' ' + kind : '');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.className = 'toast', 2800);
}

/* ─────────────────── sheet trượt dùng chung ─────────────────── */
export function sheet({ title, desc, body, actions }){
  el('shTitle').textContent = title || '';
  const d = el('shDesc');
  d.classList.toggle('hide', !desc);
  d.textContent = desc || '';
  el('shBody').innerHTML = body || '';
  el('shFoot').innerHTML = (actions || [])
    .map((a,i) => `<button class="btn ${a.cls||''}" data-act="${i}">${esc(a.label)}</button>`).join('');
  el('shFoot').onclick = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const a = actions[+b.dataset.act];
    if (!a.keepOpen) closeSheet();
    a.onClick && a.onClick();
  };
  el('sheet').classList.add('open');
  return el('shBody');
}
export const closeSheet = () => el('sheet').classList.remove('open');

/* ─────────────────── âm báo (WebAudio, không cần file ngoài) ─────────────────── */
let audioCtx = null;
export const audio = {
  on: store.get('sound', false),
  enable(){
    this.on = true; store.set('sound', true);
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    audioCtx.resume(); this.ding();
  },
  disable(){ this.on = false; store.set('sound', false); },
  _tone(freq, start, dur, type = 'sine', gain = .22){
    if (!this.on || !audioCtx) return;
    const t0 = audioCtx.currentTime + start;
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  },
  ding(){ this._tone(880, 0, .12); this._tone(1320, .13, .12); },          // đơn mới
  alarm(){ for (let i=0;i<3;i++) this._tone(440, i*.22, .17, 'square', .16); }, // xin hủy
  // Tiền về: ba nốt đi lên, dài và êm hơn hẳn hai tiếng báo đơn mới. Thu ngân
  // phải phân biệt được ngay mà không cần nhìn màn hình.
  tienVe(){ [523,659,784].forEach((f,i) => this._tone(f, i*.15, .28, 'triangle', .2)); },
  buzz(){ if (navigator.vibrate) navigator.vibrate([30,40,30]); }
};

/* ─────────────────── kho dữ liệu realtime ───────────────────
   Một chỗ đăng ký duy nhất, các màn hình chỉ việc lắng nghe.
   LƯU Ý QUAN TRỌNG: snapshot.forEach của Firebase DỪNG lại khi callback trả về
   giá trị truthy. Array.push() trả về độ dài (>=1) nên BẮT BUỘC phải bọc { }. */
function snapToArray(snap){
  const out = [];
  snap.forEach(c => { out.push({ key: c.key, val: c.val() || {} }); });
  return out;
}

const listeners = new Set();
export const data = {
  orders: [],
  history: [],
  cancelled: [],
  bills: [],
  menu: [],
  prep: [],
  online: false,
  menuLoaded: false,
  prepLoaded: false,
  priceByStt: new Map(),
  priceByName: new Map()
};

export function onData(fn){ listeners.add(fn); return () => listeners.delete(fn); }
function emit(what){ listeners.forEach(fn => { try { fn(what); } catch(e){ console.error(e); } }); }
export { emit as emitData };

/* đơn giá: ưu tiên giá đã chốt lúc bán -> tra STT -> tra tên -> không có */
export function resolvePrice(d){
  const stored = parsePrice(d.price);
  if (stored !== null) return { price: stored, live: false };
  if (d.stt != null && data.priceByStt.has(String(d.stt)))
    return { price: data.priceByStt.get(String(d.stt)), live: true };
  const k = slug(d.item);
  if (data.priceByName.has(k)) return { price: data.priceByName.get(k), live: true };
  return { price: null, live: false };
}

export function initData(){
  onValue(ref(db, '.info/connected'), s => {
    data.online = s.val() === true;
    const c = el('conn'), o = el('offbar');
    if (c){ c.className = 'conn ' + (data.online ? 'online' : 'offline'); }
    if (o) o.classList.toggle('show', !data.online);
    emit('conn');
  });

  onValue(ordersRef, snap => {
    const prev = new Map(data.orders.map(o => [o.key, o.cancel && o.cancel.state]));
    data.orders = snapToArray(snap).map(({key, val:d}) => ({
      key, item: d.item, quantity: d.quantity, table: d.table, time: d.time,
      stt: d.stt ?? null, price: d.price ?? null,
      cancel: d.cancel || null, at: parseClock(d.time),
      // Giờ máy chủ — dùng để cắt phiên bàn. `at` suy từ "HH:MM" nên phụ thuộc
      // đồng hồ của máy, không đủ tin để quyết định tiền.
      sentAt: Number(d.sentAt) || null
    }));
    data.orders._prevCancel = prev;
    emit('orders');
  }, err => { console.error(err); toast('Không đọc được danh sách chờ (.read)', 'err'); });

  onValue(historyRef, snap => {
    data.history = snapToArray(snap).map(x => x.val);
    emit('history');
  }, err => { console.error(err); toast('Không đọc được lịch sử (.read)', 'err'); });

  onValue(cancelledRef, snap => {
    data.cancelled = snapToArray(snap).map(x => x.val);
    emit('cancelled');
  }, () => { data.cancelled = []; emit('cancelled'); });

  // CHỈ lấy 200 hóa đơn gần nhất, không lấy cả nhánh.
  // Khóa có dạng QCH{yymmdd}{seq} nên xếp theo khóa CHÍNH LÀ xếp theo ngày —
  // `limitToLast` cho ra mấy hóa đơn mới nhất mà không cần `.indexOn` nào.
  // Không giới hạn thì sau ba tháng mỗi lần mở app là tải về vài nghìn hóa đơn
  // cũ, và cái chậm đó lớn dần đến mức không ai nhớ vì sao.
  onValue(query(billsRef, orderByKey(), limitToLast(200)), snap => {
    data.bills = snapToArray(snap).map(({key, val:v}) => ({ key, ...v }));
    emit('bills');
  }, () => { data.bills = []; emit('bills'); });

  loadMenu(); loadPrep(); taiCauHinhQR();
}

/* ─────────────────── tải hai bảng Sheet ─────────────────── */
export async function loadMenu(){
  try{
    const j = await (await fetch(MENU_API)).json();
    data.menu = (Array.isArray(j) ? j : []).map(row => {
      // normalise whatever casing the sheet uses → always 'STT' and 'Tên Món'
      const out = {};
      for (const k of Object.keys(row)) out[k] = row[k];
      const sttKey = Object.keys(row).find(k => k.toLowerCase() === 'stt');
      if (sttKey && sttKey !== 'STT') { out['STT'] = row[sttKey]; delete out[sttKey]; }
      return out;
    });
    data.priceByStt.clear(); data.priceByName.clear();
    data.menu.forEach(row => {
      const p = priceOf(row);
      if (p === null) return;
      if (row['STT'] != null) data.priceByStt.set(String(row['STT']), p);
      data.priceByName.set(slug(nameOf(row)), p);
    });
    data.menuLoaded = true;
  }catch(e){
    console.error('Lỗi tải thực đơn', e);
    data.menuLoaded = false;
  }
  emit('menu');
}
export async function loadPrep(){
  try{
    const j = await (await fetch(PREP_API)).json();
    data.prep = Array.isArray(j) ? j : [];
    data.prepLoaded = true;
  }catch(e){
    console.error('Lỗi tải công thức sơ chế', e);
    data.prepLoaded = false;
  }
  emit('prep');
}
export const findMenuItem = n =>
  data.menu.find(d => parseInt(d['STT'],10) === parseInt(n,10));

/* ─────────────────── ghi dữ liệu (giống hệt bản web) ─────────────────── */
export function sendOrders(cart){
  return Promise.all(cart.map(o => push(ordersRef, {
    item: o.name, quantity: o.qty, table: o.table,
    stt: o.stt ?? null, price: o.price ?? null,
    time: hm(), status: 'Chờ pha', sentAt: serverTimestamp()
  })));
}

export function completeOrder(o){
  const now = new Date(), d = ymd(now);
  return push(historyRef, {
    item: o.item,
    quantity: Number(o.quantity) || 1,
    table: o.table ?? null,
    stt: o.stt ?? null,
    price: o.price ?? null,
    revenue: o.price != null ? o.price * (Number(o.quantity) || 1) : null,
    completedDate: d,
    completedMonth: d.substring(0,7),
    completedYear: d.substring(0,4),
    timestamp: serverTimestamp()
  }).then(() => remove(ref(db, 'orders/' + o.key)));
}

export function requestCancel(key, reason, note){
  return update(ref(db, 'orders/' + key), {
    cancel: { state:'requested', reason, note: note || null, at: serverTimestamp() }
  });
}
export const clearCancel = key => update(ref(db, 'orders/' + key), { cancel: null });

export function rejectCancel(o, barNote){
  return update(ref(db, 'orders/' + o.key), {
    cancel: {
      state: 'rejected',
      reason: (o.cancel && o.cancel.reason) || null,
      barNote: barNote || 'Món đã/đang được pha.',
      at: serverTimestamp()
    }
  });
}

export function approveCancel(o){
  const d = ymd();
  return push(cancelledRef, {
    item: o.item,
    quantity: Number(o.quantity) || 1,
    table: o.table ?? null,
    stt: o.stt ?? null,
    price: o.price ?? null,
    lostRevenue: o.price != null ? o.price * (Number(o.quantity) || 1) : null,
    reason: (o.cancel && o.cancel.reason) || null,
    note: (o.cancel && o.cancel.note) || null,
    orderedTime: o.time ?? null,
    cancelledDate: d,
    cancelledMonth: d.substring(0,7),
    cancelledYear: d.substring(0,4),
    timestamp: serverTimestamp()
  }).then(() => remove(ref(db, 'orders/' + o.key)));
}

/* ══════════════════════════════════════════════════════════════════════════
   THANH TOÁN — VietQR, mã hóa đơn, phiên bàn
   ══════════════════════════════════════════════════════════════════════════ */

/* ─────────────────── tài khoản nhận tiền ───────────────────
   KHÔNG chép tay số tài khoản vào đây. Nó đã nằm trong biến môi trường của
   Netlify cho app đặt món online; chép sang repo thứ hai là dựng đúng cái bẫy
   đã dính hai lần ở dự án bên kia — và ở đây chép sai một chữ số là tiền chảy
   sang tài khoản người lạ.

   Hỏi máy chủ một lần rồi nhớ vào máy. Mất mạng thì dùng bản đã nhớ; chưa từng
   hỏi được lần nào thì KHÔNG vẽ QR, hiện lời nhắc — một mã QR sai còn tệ hơn
   không có mã nào. */
const CAU_HINH_API = 'https://ghecauhai.netlify.app/api/cau-hinh-quan';

export let VIETQR = store.get('vietqr', null);

export async function taiCauHinhQR(){
  try{
    const j = await (await fetch(CAU_HINH_API)).json();
    if (j && j.ok && j.bankId && j.accountNo){
      VIETQR = { bankId: j.bankId, accountNo: j.accountNo, accountName: j.accountName || '' };
      store.set('vietqr', VIETQR);
      emit('vietqr');
    }
  }catch{
    /* mất mạng — giữ bản đã nhớ trong máy */
  }
  return VIETQR;
}

/** Bỏ dấu và mọi ký tự ngân hàng có thể nuốt mất. Nội dung chỉ nên còn [A-Z0-9 ]. */
export function sachNoiDung(t){
  return String(t).normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/đ/g,'d').replace(/Đ/g,'D')
    .replace(/[^A-Za-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().toUpperCase().slice(0,50);
}

/** URL ảnh VietQR, hoặc null nếu chưa biết tài khoản nhận. */
export function vietQRUrl(amount, desc){
  if (!VIETQR || !VIETQR.bankId || !VIETQR.accountNo) return null;
  const { bankId, accountNo, accountName } = VIETQR;
  const qs = new URLSearchParams({ amount: String(Math.round(amount)), addInfo: sachNoiDung(desc) });
  if (accountName) qs.set('accountName', sachNoiDung(accountName));
  return `https://img.vietqr.io/image/${bankId}-${accountNo}-compact2.png?${qs}`;
}

/* ─────────────────── mã hóa đơn ───────────────────
   QCH + yymmdd + 4 số. CÙNG hình dạng với mã đơn online (GCH…) nhưng khác tiền
   tố, vì hai app đổ tiền vào CÙNG một tài khoản ACB: webhook SePay nhận cả hai
   và phân biệt bằng đúng ba chữ cái này. Định dạng phải khớp với
   lib/maHoaDon.mjs bên repo ghecauhai-website — đổi một bên là tiền không khớp
   được vào hóa đơn nào.

   Bộ đếm chạy bằng transaction của RTDB nên nguyên tử thật, và vẫn sinh được mã
   khi mất mạng (Firebase xếp hàng gửi lại). Thu ngân giữa ca không chờ được một
   lượt gọi mạng chỉ để có cái mã. */
export const vnDateKey = (d = new Date()) => ymd(d).slice(2).replace(/-/g,'');

export async function taoMaHoaDon(){
  const ngay = vnDateKey();
  const res = await runTransaction(ref(db, `counters/bills/${ngay}`), n => (Number(n) || 0) + 1);
  const seq = Math.min(Math.max(Number(res.snapshot.val()) || 1, 1), 9999);
  return `QCH${ngay}${String(seq).padStart(4,'0')}`;
}

/* ─────────────────── phiên bàn ───────────────────
   Logic nằm ở phien.js — module thuần, không import Firebase, test được bằng
   node --test. Ở đây chỉ buộc nó vào kho dữ liệu realtime `data`. */

export { TRANG_THAI_BAN, mocCua } from './phien.js';

export const hoaDonCuaBan   = tbl => _hoaDonCuaBan(data.bills, tbl);
export const hoaDonMoCuaBan = tbl => _hoaDonMoCuaBan(data.bills, tbl);
export const mocDaChot      = tbl => _mocDaChot(data.bills, tbl);

export const monChuaTinhTien = (tbl, toiLuc = Infinity) =>
  _monChuaTinhTien({ orders: data.orders, history: data.history, bills: data.bills, tbl, hnay: ymd(), toiLuc });

export const trangThaiBan = tbl =>
  _trangThaiBan({ orders: data.orders, history: data.history, bills: data.bills, tbl, hnay: ymd() });

/* ─────────────────── ghi hóa đơn ─────────────────── */

/**
 * Tạo hóa đơn. Khóa của node CHÍNH LÀ mã hóa đơn (không dùng push):
 * webhook tra cứu O(1) không cần `.indexOn`, và không thể có hai hóa đơn trùng mã.
 */
export async function saveBill(bill){
  const code = await taoMaHoaDon();
  await set(ref(db, 'bills/' + code), {
    ...bill,
    code,
    status: 'unpaid',
    paidAmount: 0,
    // Mốc gom món. Lấy giờ MÁY CHỦ chứ không lấy giờ máy: mốc này đem so với
    // `timestamp` của các dòng đơn (cũng là giờ máy chủ), lệch đồng hồ một
    // chiếc điện thoại là phiên bàn tính sai.
    tinhToiLuc: serverTimestamp(),
    createdAt: serverTimestamp(),
    paidAt: null,
    paidBy: null,
    payMethod: null,
  });
  return code;
}

/** Thu ngân nhận tiền mặt — hoặc tự đối chiếu app ngân hàng rồi bấm tay. */
export function traTay(code, payMethod = 'tienmat'){
  const b = data.bills.find(x => x.key === code);
  return update(ref(db, 'bills/' + code), {
    status: 'paid',
    payMethod,
    paidBy: 'nguoi',          // người bấm, không phải webhook — để còn đối soát
    paidAmount: Number(b?.total) || 0,
    paidAt: serverTimestamp(),
  });
}

/** Mở lại hóa đơn đã đóng nhầm. Xóa sạch dấu vết đã trả để khỏi lệch sổ. */
export function moLaiHoaDon(code){
  return update(ref(db, 'bills/' + code), {
    status: 'unpaid', payMethod: null, paidBy: null, paidAt: null, paidAmount: 0,
  });
}

export const xoaHoaDon = code => remove(ref(db, 'bills/' + code));

/* ─────────────────── giữ màn hình không tắt (cho quầy pha chế) ─────────────────── */
let wakeLock = null;
export async function keepAwake(on){
  try{
    if (on && 'wakeLock' in navigator){
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (wakeLock){ await wakeLock.release(); wakeLock = null; }
  }catch(e){ /* pin yếu hoặc trình duyệt không hỗ trợ — bỏ qua */ }
  return !!wakeLock;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && store.get('awake', false)) keepAwake(true);
});
