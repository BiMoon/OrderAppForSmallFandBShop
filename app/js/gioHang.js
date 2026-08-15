/* ==========================================================================
   gioHang.js — luật gộp dòng trong giỏ hàng

   Module THUẦN. Tách riêng vì đây là một luật ĐÚNG/SAI, không phải chuyện giao
   diện: gộp nhầm hai dòng là pha sai món cho khách.

   ── Vì sao khoá gộp phải gồm cả ghi chú ────────────────────────────────────

   Bản cũ gộp theo `stt + bàn`. Khách gọi "hai trà đào, một ly ít đường" thì thu
   ngân bấm hai lần và giỏ ra MỘT dòng "Trà đào ×2" — ghi chú của ly thứ hai đè
   lên ly thứ nhất, hoặc biến mất. Quầy pha ra hai ly giống hệt nhau.

   Nên hai ly chỉ được gộp khi **mọi thứ người pha cần biết đều giống nhau**:
   cùng món, cùng bàn, cùng tuỳ chọn, cùng ghi chú. Khác một chữ là một dòng
   riêng — nhìn thì thừa, nhưng đó chính là hai ly khác nhau.
   ========================================================================== */

/** Tuỳ chọn bấm một chạm. Cố ý ngắn và phủ hết mấy câu khách hay nói nhất. */
export const TUY_CHON_NHANH = [
  'Ít đá', 'Không đá', 'Nhiều đá',
  'Ít đường', 'Không đường',
  'Nóng', 'Ít sữa',
];

const sach = (v, max = 120) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** Chuẩn hoá phần mô tả của một dòng giỏ. */
export const chuanHoaMoTa = (m) => ({
  tuyChon: sach(m?.tuyChon, 120),
  ghiChu: sach(m?.ghiChu, 200),
});

/**
 * Khoá gộp. Hai dòng cùng khoá thì là cùng một ly, cộng số lượng lại được.
 *
 * Ghi chú so sánh sau khi đã bỏ dấu cách thừa và không phân biệt hoa thường:
 * "ít đường" và "Ít đường " là một, và tách chúng ra thành hai dòng chỉ tổ làm
 * phiếu pha chế dài thêm mà chẳng nói được gì mới.
 */
export function khoaGop(m) {
  const { tuyChon, ghiChu } = chuanHoaMoTa(m);
  return [
    String(m?.stt ?? ''),
    String(m?.table ?? ''),
    tuyChon.toLowerCase(),
    ghiChu.toLowerCase(),
  ].join('');
}

/**
 * Thêm một món vào giỏ, gộp nếu trùng khoá.
 *
 * Trả về giỏ MỚI (không sửa tại chỗ) để chỗ gọi khỏi phải nhớ thứ tự thao tác.
 *
 * @param {Array} cart
 * @param {object} mon   { stt, name, table, price, tuyChon, ghiChu }
 * @param {number} n     số lượng thêm
 * @param {number} idKe  id cho dòng mới
 * @param {string} gio   giờ 'HH:MM' để hiện trong giỏ
 */
export function themVaoGio(cart = [], mon, n = 1, idKe = 1, gio = '') {
  const them = Math.max(1, Math.floor(Number(n) || 1));
  const khoa = khoaGop(mon);
  const { tuyChon, ghiChu } = chuanHoaMoTa(mon);

  const i = cart.findIndex((o) => khoaGop(o) === khoa);
  if (i >= 0) {
    const moi = cart.slice();
    moi[i] = { ...moi[i], qty: (Number(moi[i].qty) || 0) + them, time: gio || moi[i].time };
    return { cart: moi, idKe, gopVao: moi[i].id };
  }

  return {
    cart: [...cart, {
      id: idKe, stt: mon?.stt ?? null, name: mon?.name ?? '',
      qty: them, table: mon?.table ?? null, price: mon?.price ?? null,
      tuyChon, ghiChu, time: gio,
    }],
    idKe: idKe + 1,
    gopVao: null,
  };
}

/**
 * Sửa tuỳ chọn / ghi chú của một dòng.
 *
 * Sửa xong mà trùng khoá với một dòng khác thì **gộp lại** — nếu không, thu
 * ngân sửa dòng A thành giống hệt dòng B rồi giỏ có hai dòng y hệt nhau, và
 * quầy pha đọc thành hai lần.
 */
export function suaMoTa(cart = [], id, moTa) {
  const i = cart.findIndex((o) => o.id === id);
  if (i < 0) return cart;

  const sua = { ...cart[i], ...chuanHoaMoTa(moTa) };
  const khoa = khoaGop(sua);
  const j = cart.findIndex((o, k) => k !== i && khoaGop(o) === khoa);

  if (j < 0) return cart.map((o, k) => (k === i ? sua : o));

  return cart
    .map((o, k) => (k === j ? { ...o, qty: (Number(o.qty) || 0) + (Number(sua.qty) || 0) } : o))
    .filter((_, k) => k !== i);
}

/** Một dòng mô tả gọn để hiện trong giỏ, trên phiếu pha chế và trên nhãn ly. */
export function moTaMon(m) {
  const { tuyChon, ghiChu } = chuanHoaMoTa(m);
  return [tuyChon, ghiChu].filter(Boolean).join(' · ');
}

/** Có gì đáng cho người pha đọc không? */
export const coMoTa = (m) => !!moTaMon(m);
