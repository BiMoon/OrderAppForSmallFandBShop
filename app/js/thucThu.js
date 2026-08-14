/* ==========================================================================
   thucThu.js — quy doanh thu NIÊM YẾT về doanh thu THỰC THU

   ── Lỗi nó sửa ──────────────────────────────────────────────────────────────

   `history` ghi giá niêm yết của từng ly (`price`, `revenue = price × qty`).
   Giảm giá thì lại nằm ở HÓA ĐƠN (`bills.discount`, tính % trên cả hóa đơn).
   Tab Thống kê chỉ đọc `history`, nên hóa đơn 100k giảm 50% vẫn báo 100k:
   sai doanh thu, sai "TB mỗi ly", sai cả cột đơn giá trong CSV.

   ── Vì sao phải dựng lại cửa sổ thời gian ───────────────────────────────────

   Không có khóa nào nối một dòng lịch sử với hóa đơn đã thu tiền nó. Hóa đơn
   gom món theo THỜI GIAN — đúng cơ chế của phien.js: mỗi hóa đơn có `tinhToiLuc`,
   và nó gom mọi món của bàn phát sinh sau mốc của hóa đơn ĐÃ TRẢ trước đó.

   Nên ở đây dựng lại đúng dãy cửa sổ ấy: với mỗi bàn, các hóa đơn đã trả xếp
   theo mốc tăng dần chia trục thời gian thành những khoảng (mốc trước, mốc này].
   Một dòng lịch sử rơi vào khoảng nào thì ăn hệ số giảm giá của hóa đơn đó.

   ── Ba điều cố ý ────────────────────────────────────────────────────────────

   • **Chỉ hóa đơn ĐÃ TRẢ mới chia cửa sổ.** Giống `mocDaChot` trong phien.js.
     Hóa đơn treo chưa thu được đồng nào thì chưa phải là tiền, và nó cũng chưa
     đẩy mốc phiên bàn đi.

   • **Hệ số lấy từ `total / subtotal`, không lấy thẳng `discount`.** Đây là số
     tiền THẬT SỰ đã thu chia cho số tiền niêm yết, nên nó đúng cả với hóa đơn
     cũ thiếu trường `discount`, và sau này có kiểu giảm tiền tuyệt đối thì
     không phải sửa lại chỗ này.

   • **Dòng không rơi vào cửa sổ nào thì giữ nguyên giá niêm yết và bị ĐÁNH DẤU.**
     Đó là ly đã pha nhưng bàn chưa thanh toán (hoặc hóa đơn bị xóa). Lặng lẽ
     tính bằng 0 là giấu mất tiền chưa thu; lặng lẽ tính đủ là báo lãi ảo. Nên
     vẫn tính đủ, nhưng trả về `chuaChot: true` để màn Thống kê nói ra.
   ========================================================================== */

/**
 * Phần tiền còn lại sau giảm giá của một hóa đơn, từ 0 tới 1.
 *
 * `1` nghĩa là không giảm. Dữ liệu vô lý (subtotal ≤ 0, total âm, total lớn
 * hơn subtotal) đều quy về 1 — thà báo đúng giá niêm yết còn hơn nhân với một
 * hệ số bịa ra.
 */
export function heSoConLai(b) {
  const tong = Number(b?.total);
  const tam = Number(b?.subtotal);
  if (Number.isFinite(tong) && Number.isFinite(tam) && tam > 0) {
    return Math.min(1, Math.max(0, tong / tam));
  }
  const giam = Number(b?.discount);
  if (Number.isFinite(giam) && giam > 0 && giam <= 100) return 1 - giam / 100;
  return 1;
}

/** Mốc gom món của một hóa đơn. `tinhToiLuc` là giờ máy chủ, đáng tin nhất. */
export const mocHoaDon = (b) => Number(b?.tinhToiLuc) || Number(b?.paidAt) || 0;

/**
 * Dãy cửa sổ thời gian của từng bàn, sắp tăng dần theo mốc.
 *
 * @returns {Map<string, Array<{den:number, heSo:number, code:string|null}>>}
 */
export function cuaSoHoaDon(bills = []) {
  const theoBan = new Map();
  for (const b of bills) {
    if (b?.status !== 'paid') continue;
    const den = mocHoaDon(b);
    if (!den) continue;                       // không có mốc thì không xếp được
    const k = String(b.table);
    if (!theoBan.has(k)) theoBan.set(k, []);
    theoBan.get(k).push({ den, heSo: heSoConLai(b), code: b.code ?? b.key ?? null });
  }
  for (const ds of theoBan.values()) ds.sort((a, b) => a.den - b.den);
  return theoBan;
}

/**
 * Hóa đơn đã thu tiền của một dòng lịch sử, tìm theo mốc thời gian của dòng đó.
 *
 * Cửa sổ là (mốc trước, mốc này], mà dãy đã sắp tăng dần, nên cái đầu tiên bao
 * được `moc` chính là cái đúng.
 *
 * `moc = 0` (dòng cũ không có timestamp) trả về null: không biết thì không đoán.
 */
export function hoaDonCuaDong(cuaSo, tbl, moc) {
  if (!moc) return null;
  const ds = cuaSo?.get(String(tbl));
  if (!ds) return null;
  return ds.find((w) => moc <= w.den) ?? null;
}

/**
 * Gắn thực thu vào từng dòng.
 *
 * Mỗi dòng vào phải có `{ table, moc, revenue }`. Trả về dòng mới kèm:
 *   thucThu   số tiền thật sự thu được của dòng đó
 *   heSo      phần còn lại sau giảm (1 = nguyên giá)
 *   maHD      mã hóa đơn đã thu, hoặc null
 *   chuaChot  true nếu chưa có hóa đơn đã trả nào phủ dòng này
 *
 * Làm tròn từng dòng nên tổng có thể lệch vài đồng so với tổng các hóa đơn —
 * chấp nhận được với báo cáo, và vẫn đúng hơn hẳn con số niêm yết.
 */
export function ganThucThu(rows = [], bills = []) {
  const cuaSo = cuaSoHoaDon(bills);
  return rows.map((r) => {
    const hd = hoaDonCuaDong(cuaSo, r.table, r.moc);
    const heSo = hd ? hd.heSo : 1;
    return {
      ...r,
      heSo,
      maHD: hd ? hd.code : null,
      chuaChot: !hd,
      thucThu: hd && heSo !== 1 ? Math.round(r.revenue * heSo) : r.revenue,
    };
  });
}

/** Cộng sổ nhanh cho phần KPI. */
export function congSo(rows = []) {
  let goc = 0, thuc = 0, chuaChot = 0, soDongGiam = 0;
  for (const r of rows) {
    goc += r.revenue || 0;
    thuc += r.thucThu ?? r.revenue ?? 0;
    if (r.chuaChot) chuaChot += r.revenue || 0;
    else if (r.heSo !== 1) soDongGiam += 1;
  }
  return { goc, thuc, giam: goc - thuc, chuaChot, soDongGiam };
}
