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
 * **`sentAt` (lúc GỌI món) đứng trước `timestamp` (lúc PHA XONG)** — và đây là
 * chỗ từng tính tiền hai lần:
 *
 *   09:55 khách gọi trà đào → 10:00 thu ngân xuất hóa đơn, ly đó nằm trong hóa
 *   đơn vì lúc xem trước nó là một `order` mang `sentAt` 09:55 → 10:05 quầy pha
 *   xong, dòng lịch sử mang `timestamp` 10:05.
 *
 * Lấy `timestamp` thì mốc của chính ly ấy nhảy từ 09:55 sang 10:05, tức là ra
 * SAU mốc chốt của hóa đơn vừa trả, nên hóa đơn kế tiếp gom nó lần nữa. Khách
 * trả tiền hai lần cho một ly, và không ai thấy.
 *
 * Lấy `sentAt` thì ly đó thuộc về đúng lượt khách đã gọi nó, bất kể quầy pha
 * xong lúc nào. Dòng cũ không có `sentAt` vẫn rơi về `timestamp` như trước —
 * không phải chuyển đổi dữ liệu.
 *
 * `at` suy ra từ chuỗi "HH:MM" nên phụ thuộc đồng hồ của điện thoại — dùng làm
 * phương án cuối, không dùng để quyết định tiền nếu còn lựa chọn khác.
 *
 * 0 = không biết.
 */
export const mocCua = (it) =>
  Number(it?.sentAt) || Number(it?.timestamp) || Number(it?.at) || 0;

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

/** Giờ đổi ngày kinh doanh. 4 giờ sáng nằm gọn trong khoảng quán đóng cửa,
 *  nên không ca nào bị cắt làm đôi. */
export const GIO_DOI_NGAY = 4;

/**
 * Mốc bắt đầu NGÀY KINH DOANH chứa `luc` — sàn cho món đã pha xong của một bàn
 * chưa từng chốt hóa đơn nào.
 *
 * Bản cũ chặn bằng `h.completedDate === hnay`, tức là theo LỊCH NGÀY. Ly gọi
 * 23:50, pha xong 23:58, khách trả lúc 00:05 thì `hnay` đã sang ngày mới và ly
 * đó **biến mất khỏi hóa đơn**. Khách trả thiếu, không ai biết. Đây là lỗi mất
 * tiền, im lặng, và lặp lại mỗi đêm có khách ngồi qua giao thừa ngày.
 *
 * Ngày kinh doanh sửa đúng chỗ đó: 00:05 vẫn thuộc về ngày hôm trước, nên ly
 * 23:50 nằm cùng phiên. Đổi lại, ly pha lúc 03:00 giờ thuộc ca đêm hôm trước
 * chứ không còn thuộc ca sáng hôm sau — đó là hành vi ĐÚNG, không phải mất mát.
 *
 * Vẫn phải có sàn: `/history` tải về là TOÀN BỘ lịch sử, không giới hạn ngày.
 * Bỏ hẳn sàn thì một bàn chưa từng chốt hóa đơn sẽ gom cả món của tháng trước
 * vào hóa đơn của khách đang ngồi.
 *
 * Dùng giờ MÁY, vì cả app chạy trên máy đặt tại quán.
 */
export function sanPhien(luc = Date.now()) {
  const d = new Date(luc);
  if (d.getHours() < GIO_DOI_NGAY) d.setDate(d.getDate() - 1);
  d.setHours(GIO_DOI_NGAY, 0, 0, 0);
  return d.getTime();
}

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
 * @param {number} [p.luc]    'bây giờ', để test cắm mốc cố định vào được
 */
export function monChuaTinhTien({ orders = [], history = [], bills = [], tbl, hnay, toiLuc = Infinity, luc = Date.now() }) {
  const chot = mocDaChot(bills, tbl);
  const san = sanPhien(luc);

  const hop = (it) => {
    const t = mocCua(it);
    // Bàn chưa từng chốt hóa đơn nào -> lấy từ đầu ngày kinh doanh trở lên.
    // Bỏ sót một ly đã pha là quán mất tiền trong im lặng, mà im lặng thì
    // không ai phát hiện ra.
    if (chot === 0) return t >= san && t <= toiLuc;
    return t > chot && t <= toiLuc;
  };

  // Dòng lịch sử có hai kiểu, và kiểu thứ hai không có cách nào khác:
  //  • có mốc thời gian -> so với sàn / mốc chốt như mọi dòng khác;
  //  • dòng cũ do app web đời trước ghi, KHÔNG có mốc nào (t = 0) -> chỉ còn
  //    `completedDate` để dựa, nên riêng nhóm này vẫn phải chặn theo lịch ngày.
  //    Đây là lý do `hnay` chưa bỏ đi được.
  const hopLichSu = (h) =>
    mocCua(h) ? hop(h) : (chot === 0 && h.completedDate === hnay);

  const cho = orders
    .filter(o => cungBan(o, tbl) && hop(o))
    .map(o => ({ name: o.item, stt: o.stt ?? null, qty: Number(o.quantity) || 1, price: o.price ?? null, status: 'pending' }));

  const xong = history
    .filter(h => cungBan(h, tbl) && hopLichSu(h))
    .map(h => ({ name: h.item, stt: h.stt ?? null, qty: Number(h.quantity) || 1, price: h.price ?? null, status: 'done' }));

  return [...cho, ...xong];
}

/** Trạng thái một bàn — SUY RA từ dữ liệu, không lưu cờ nào. */
export function trangThaiBan({ orders = [], history = [], bills = [], tbl, hnay, luc = Date.now() }) {
  if (hoaDonMoCuaBan(bills, tbl)) return 'choTra';
  if (monChuaTinhTien({ orders, history, bills, tbl, hnay, luc }).length) return 'dangPhucVu';
  // "Đã trả" giữ nhãn cho tới khi bàn có khách mới — lúc đó món mới xuất hiện
  // và nhánh trên tự đưa về "đang phục vụ". Không cần nút dọn bàn, không cần
  // đồng hồ đếm ngược, không có trạng thái nào kẹt lại.
  return mocDaChot(bills, tbl) > 0 ? 'daTra' : 'trong';
}

/** Tổng tiền của một danh sách món. */
export const tongTien = (items) =>
  (items || []).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
