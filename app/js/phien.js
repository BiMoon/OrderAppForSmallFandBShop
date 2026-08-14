/* ==========================================================================
   phien.js — phiên bàn: món nào của bàn chưa được tính tiền

   Tách riêng khỏi core.js vì đây là LOGIC TIỀN, và logic tiền thì phải test
   được mà không cần trình duyệt hay Firebase. Không import gì cả: mọi thứ nhận
   qua tham số, trả về giá trị thuần.

   ── Vấn đề nó giải ──────────────────────────────────────────────────────────

   Một bàn quay 6–8 lượt khách mỗi ngày. Bản đầu tiên gom "toàn bộ lịch sử hôm
   nay của bàn này", nên lượt khách thứ hai bị tính lại tiền của lượt thứ nhất.
   Đó là tính sai tiền MỖI NGÀY, không phải ca hiếm.

   ── Cách giải ───────────────────────────────────────────────────────────────

   Mỗi hóa đơn ghi `tinhToiLuc` — mốc thời gian nó gom món tới. Món của hóa đơn
   tiếp theo là món phát sinh SAU mốc của hóa đơn ĐÃ TRẢ gần nhất của bàn đó.

   Hai điều khiến cách này sống được với thực tế:

   • Không phải sửa app web cũ (order.html / observeOrder.html). Mốc tính theo
     thời gian chứ không gắn nhãn vào từng dòng đơn, nên đơn do bất cứ máy nào
     gửi cũng rơi vào đúng phiên.
   • Không có node "trạng thái bàn" nào để mà lệch. Mọi thứ suy ra từ `bills`.
     Xóa một hóa đơn chưa trả là mọi thứ tự trở lại như cũ, không phải dọn tay.
   ========================================================================== */

export const TRANG_THAI_BAN = {
  trong:      { nhan: 'Trống' },
  dangPhucVu: { nhan: 'Đang phục vụ' },
  choTra:     { nhan: 'Chờ trả tiền' },
  daTra:      { nhan: 'Đã trả' },
};

const cungBan = (x, tbl) => String(x.table) === String(tbl);

/**
 * Mốc thời gian của một dòng đơn hoặc dòng lịch sử.
 *
 * Ưu tiên giờ MÁY CHỦ (`timestamp` của history, `sentAt` của orders). `at` suy
 * ra từ chuỗi "HH:MM" nên phụ thuộc đồng hồ của điện thoại — dùng làm phương án
 * cuối, không dùng để quyết định tiền nếu còn lựa chọn khác.
 *
 * 0 = không biết.
 */
export const mocCua = (it) =>
  Number(it?.timestamp) || Number(it?.sentAt) || Number(it?.at) || 0;

/** Hóa đơn của một bàn, mới nhất trước. */
export const hoaDonCuaBan = (bills, tbl) =>
  (bills || []).filter(b => cungBan(b, tbl))
    .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));

/** Hóa đơn đang mở (chưa trả) của bàn. Mỗi bàn chỉ nên có đúng một. */
export const hoaDonMoCuaBan = (bills, tbl) =>
  hoaDonCuaBan(bills, tbl).find(b => b.status !== 'paid') || null;

/**
 * Mốc đã chốt: mọi món trước mốc này đã nằm trong một hóa đơn ĐÃ TRẢ.
 *
 * Lấy MAX chứ không lấy hóa đơn mới nhất: hóa đơn có thể được trả không đúng
 * thứ tự tạo (thu ngân tạo hai cái rồi khách trả cái sau trước), và lùi mốc
 * lại là tính tiền hai lần.
 */
export const mocDaChot = (bills, tbl) =>
  hoaDonCuaBan(bills, tbl)
    .filter(b => b.status === 'paid')
    .reduce((m, b) => Math.max(m, Number(b.tinhToiLuc) || Number(b.paidAt) || 0), 0);

/**
 * Món của một bàn chưa nằm trong hóa đơn nào đã trả.
 *
 * @param {object} p
 * @param {Array}  p.orders   đơn đang chờ pha
 * @param {Array}  p.history  đơn đã pha xong
 * @param {Array}  p.bills    hóa đơn
 * @param {*}      p.tbl      số bàn
 * @param {string} p.hnay     'YYYY-MM-DD' hôm nay
 * @param {number} [p.toiLuc] chỉ lấy món trước mốc này
 */
export function monChuaTinhTien({ orders = [], history = [], bills = [], tbl, hnay, toiLuc = Infinity }) {
  const chot = mocDaChot(bills, tbl);

  const hop = (it) => {
    const t = mocCua(it);
    // Bàn chưa từng chốt hóa đơn nào -> lấy hết, kể cả dòng cũ thiếu mốc thời
    // gian (t = 0). Bỏ sót một ly đã pha là quán mất tiền trong im lặng, mà
    // im lặng thì không ai phát hiện ra.
    if (chot === 0) return t <= toiLuc;
    return t > chot && t <= toiLuc;
  };

  const cho = orders
    .filter(o => cungBan(o, tbl) && hop(o))
    .map(o => ({ name: o.item, stt: o.stt ?? null, qty: Number(o.quantity) || 1, price: o.price ?? null, status: 'pending' }));

  const xong = history
    .filter(h => cungBan(h, tbl) && h.completedDate === hnay && hop(h))
    .map(h => ({ name: h.item, stt: h.stt ?? null, qty: Number(h.quantity) || 1, price: h.price ?? null, status: 'done' }));

  return [...cho, ...xong];
}

/** Trạng thái một bàn — SUY RA từ dữ liệu, không lưu cờ nào. */
export function trangThaiBan({ orders = [], history = [], bills = [], tbl, hnay }) {
  if (hoaDonMoCuaBan(bills, tbl)) return 'choTra';
  if (monChuaTinhTien({ orders, history, bills, tbl, hnay }).length) return 'dangPhucVu';
  // "Đã trả" giữ nhãn cho tới khi bàn có khách mới — lúc đó món mới xuất hiện
  // và nhánh trên tự đưa về "đang phục vụ". Không cần nút dọn bàn, không cần
  // đồng hồ đếm ngược, không có trạng thái nào kẹt lại.
  return mocDaChot(bills, tbl) > 0 ? 'daTra' : 'trong';
}

/** Tổng tiền của một danh sách món. */
export const tongTien = (items) =>
  (items || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
