/* ==========================================================================
   tienMat.js — khách đưa bao nhiêu, thối lại bao nhiêu

   Module THUẦN. Trước đây `traTay` gán cứng `paidAmount = b.total` và sheet
   nhận tiền chỉ có nút Xác nhận, nên thu ngân phải nhẩm tiền thối trong đầu
   đúng lúc đông nhất. Nhẩm sai thì không có chỗ nào phát hiện ra.
   ========================================================================== */

/** Mệnh giá đang lưu hành, từ lớn xuống nhỏ. */
export const MENH_GIA = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];

/** Làm tròn LÊN tới bội số gần nhất. */
const tronLen = (v, b) => Math.ceil(v / b) * b;

/**
 * Vài con số khách hay đưa, để thu ngân bấm một phát thay vì gõ.
 *
 * Ba nguồn, gộp lại rồi bỏ trùng:
 *   • đúng số tiền — khách trả lẻ đủ, ca phổ biến nhất;
 *   • tròn lên 10k / 50k / 100k — "đưa hai trăm cho tròn";
 *   • một tờ mệnh giá lớn hơn hóa đơn — "chỉ có tờ năm trăm".
 *
 * Cắt còn `soLuong` cái đầu: dải nút dài quá thì bấm nhầm còn chậm hơn gõ tay.
 */
export function goiYTien(tong, soLuong = 4) {
  const t = Math.max(0, Math.round(Number(tong) || 0));
  if (!t) return [];
  const ds = [t, tronLen(t, 10000), tronLen(t, 50000), tronLen(t, 100000),
              ...MENH_GIA.filter((m) => m > t).reverse()];
  return [...new Set(ds)].filter((v) => v >= t).sort((a, b) => a - b).slice(0, soLuong);
}

/**
 * Tiền thối.
 *
 * @returns {{thoi:number, thieu:number, du:boolean}}
 *   `thieu` > 0 nghĩa là khách đưa CHƯA ĐỦ — không phải lỗi nhập liệu, khách
 *   trả một phần là chuyện có thật, nên trả về con số thay vì chặn.
 */
export function tienThoi(dua, tong) {
  const d = Math.max(0, Math.round(Number(dua) || 0));
  const t = Math.max(0, Math.round(Number(tong) || 0));
  return { thoi: Math.max(0, d - t), thieu: Math.max(0, t - d), du: d >= t };
}

/**
 * Trả về mấy tờ mấy đồng — để thu ngân đếm ra khỏi két mà không phải nhẩm.
 *
 * @returns {Array<{menh:number, so:number}>}
 */
export function chiaTo(thoi) {
  let con = Math.max(0, Math.round(Number(thoi) || 0));
  const ra = [];
  for (const m of MENH_GIA) {
    const so = Math.floor(con / m);
    if (so) { ra.push({ menh: m, so }); con -= so * m; }
  }
  return ra;
}
