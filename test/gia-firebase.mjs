/**
 * Firebase giả dùng chung cho các bài kiểm chạy trình duyệt thật.
 *
 * App import SDK thẳng từ gstatic.com, nên chặn đúng ba URL đó bằng `page.route`
 * là đủ để chạy CHÍNH core.js/pos.js/report.js đang chạy thật mà không sửa một
 * dòng mã sản phẩm nào.
 *
 * Để ở một file riêng vì đã có hai bài kiểm dùng tới. Hai bản sao chép tay là
 * hai bản sẽ lệch nhau, và một phép giả lập "tử tế hơn thật" thì làm test xanh
 * trên mã hỏng — chuyện đã xảy ra một lần với transaction của RTDB.
 */


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
/* query: bản giả PHẢI tôn trọng startAt/endAt theo khóa.

   Tab Thống kê tải hóa đơn của kỳ báo cáo bằng đúng khoảng khóa đó. Một bản
   giả trả về sạch cả nhánh là bản giả tử tế hơn thật: nó sẽ xanh kể cả khi
   khoảng khóa dựng sai, và lỗi chỉ lộ ra trên máy quán vào cuối tháng.

   limitToLast thì vẫn bỏ qua — số lượng không phải thứ mấy bài kiểm này đo. */
export const query = (r, ...mods) => {
  const gh = {};
  for (const m of mods) Object.assign(gh, m || {});
  return { ...r, _tu: gh.tu, _den: gh.den };
};
export const orderByKey = () => ({});
export const limitToLast = () => ({});
export const startAt = (v) => ({ tu: v });
export const endAt = (v) => ({ den: v });

export async function get(r){
  const v = doc(r._p);
  const loc = (k) => (r._tu === undefined || k >= r._tu) && (r._den === undefined || k <= r._den);
  return {
    val: () => v,
    exists: () => v !== null,
    forEach: (cb) => { for (const k of Object.keys(v || {})) if (loc(k)) cb({ key: k, val: () => v[k] }); },
  };
}
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

export { FAKE_APP, FAKE_AUTH, FAKE_DB, NGUOI };
