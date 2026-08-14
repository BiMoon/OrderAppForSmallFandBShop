/* ==========================================================================
   hoaDonBoCuc.js — biến một hóa đơn thành danh sách khối để vẽ

   Module THUẦN. Không canvas, không DOM. Ra một mảng khối kiểu
   `{ kieu:'chu', chu, co, dam, can }` — phần sơn lên giấy là việc của
   inHoaDon.js.

   ── Vì sao tách ─────────────────────────────────────────────────────────────

   Thứ đáng kiểm ở một tờ hóa đơn là NỘI DUNG: có đúng dòng giảm giá không, số
   tiền có khớp không, tên món dài thì ngắt ở đâu, hóa đơn đã trả có ghi trả
   bằng gì không. Toàn những thứ kiểm được bằng `node --test` nếu chúng không
   dính vào canvas. Nên bố cục là hàm thuần, còn canvas chỉ là cây cọ.

   Ngắt dòng đếm theo SỐ KÝ TỰ chứ không đo font: hóa đơn nhiệt vốn là lưới chữ
   đều (32 ký tự khổ 58mm, 48 ký tự khổ 80mm), và đếm ký tự thì thuần, tất định,
   test được. Đo font sẽ kéo cả canvas vào đây.
   ========================================================================== */

/** Số ký tự một dòng, theo khổ giấy. */
export const SO_COT = { '58': 32, '80': 48 };

const tien = (n) => new Intl.NumberFormat('vi-VN').format(Math.round(Number(n) || 0)) + 'đ';

/**
 * Ngắt một chuỗi thành nhiều dòng không quá `cot` ký tự, ưu tiên cắt ở khoảng
 * trắng. Từ dài hơn cả dòng (link, mã) thì cắt cứng chứ không để tràn.
 */
export function ngatDong(chu, cot){
  const tu = String(chu ?? '').trim().split(/\s+/).filter(Boolean);
  if (!tu.length) return [''];
  const ra = [];
  let dong = '';
  for (let t of tu){
    while (t.length > cot){
      if (dong){ ra.push(dong); dong = ''; }
      ra.push(t.slice(0, cot));
      t = t.slice(cot);
    }
    if (!dong) dong = t;
    else if (dong.length + 1 + t.length <= cot) dong += ' ' + t;
    else { ra.push(dong); dong = t; }
  }
  if (dong) ra.push(dong);
  return ra;
}

/**
 * Một dòng hai cột: nhãn bên trái, số tiền bên phải, chấm nối ở giữa.
 *
 * Canh bằng khoảng trắng chứ không dùng hai khối riêng — vẽ hai khối rồi canh
 * lề trái/phải sẽ lệch nhau khi font không phải monospace, mà hóa đơn lệch cột
 * tiền thì khách nhìn là mất tin ngay.
 */
export function haiCot(trai, phai, cot){
  const t = String(trai ?? ''), p = String(phai ?? '');
  const trong = cot - t.length - p.length;
  if (trong >= 1) return t + ' '.repeat(trong) + p;
  // Không đủ chỗ thì cắt bớt NHÃN, không bao giờ cắt số tiền.
  const conLai = Math.max(0, cot - p.length - 1);
  return (conLai ? t.slice(0, conLai) : '') + ' ' + p;
}

const chu = (c, o = {}) => ({ kieu: 'chu', chu: c, co: o.co ?? 1, dam: !!o.dam, can: o.can ?? 'trai' });
const ke = () => ({ kieu: 'ke' });
const hong = (cao = 8) => ({ kieu: 'hong', cao });

/**
 * @param {object} b       hóa đơn như trong RTDB
 * @param {object} [o]
 * @param {string} [o.kho='80']      '58' | '80'
 * @param {string} [o.tenQuan]
 * @param {string} [o.diaChi]
 * @param {string} [o.qr]            data URL / URL ảnh VietQR, bỏ trống thì không in QR
 * @param {Date}   [o.luc]           giờ in, mặc định bây giờ
 * @param {boolean}[o.inLai=false]   đóng dấu "IN LẠI" để khỏi nhầm hai tờ cùng mã
 */
export function boCucHoaDon(b, o = {}){
  const cot = SO_COT[o.kho] ?? SO_COT['80'];
  const kh = [];
  const daTra = b?.status === 'paid';

  kh.push(chu(o.tenQuan || 'GHÉ CẬU HAI', { co: 2, dam: true, can: 'giua' }));
  if (o.diaChi) for (const d of ngatDong(o.diaChi, cot)) kh.push(chu(d, { can: 'giua' }));
  kh.push(hong(6));
  kh.push(chu(daTra ? 'HÓA ĐƠN THANH TOÁN' : 'PHIẾU TÍNH TIỀN', { dam: true, can: 'giua' }));
  // Tờ in lại phải nhìn ra ngay. Hai tờ cùng mã nằm trên quầy mà không phân
  // biệt được là có ngày thu tiền hai lần.
  if (o.inLai) kh.push(chu('— IN LẠI —', { can: 'giua' }));
  kh.push(hong(6));

  const luc = o.luc instanceof Date ? o.luc : new Date();
  kh.push(chu(haiCot('Bàn ' + (b?.table ?? '—'), b?.code ?? '', cot)));
  kh.push(chu(haiCot(
    luc.toLocaleDateString('vi-VN'),
    luc.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    cot)));
  kh.push(ke());

  for (const i of (b?.items ?? [])){
    const sl = Number(i.qty) || 0;
    const gia = Number(i.price) || 0;
    const dong = ngatDong(i.name, cot);
    for (const d of dong) kh.push(chu(d));
    // Dòng số lùi vào hai ô: mắt lướt dọc mép trái là thấy ngay đâu là tên món.
    kh.push(chu(haiCot(`  ${sl} x ${tien(gia)}`, tien(gia * sl), cot)));
  }

  kh.push(ke());
  const tam = Number(b?.subtotal) || 0;
  const giam = Number(b?.discAmt) || 0;
  if (giam) {
    kh.push(chu(haiCot('Tạm tính', tien(tam), cot)));
    kh.push(chu(haiCot(`Giảm giá ${Number(b.discount) || 0}%`, '-' + tien(giam), cot)));
  }
  // Dòng tổng: to gấp đôi nếu còn vừa, không thì về cỡ thường.
  //
  // Chữ cỡ 2 rộng gấp đôi nên chỉ được dùng MỘT NỬA số cột. Dùng cả `cot` như
  // dòng thường thì chuỗi vẫn đúng 48 ký tự nhưng vẽ ra dài gấp đôi khổ giấy,
  // và thứ rơi khỏi mép chính là SỐ TIỀN — tờ hóa đơn có chữ "TỔNG CỘNG" mà
  // không có tổng. Test đếm ký tự không thấy; ảnh chụp mới thấy.
  //
  // Còn khi số tiền dài quá (giấy 58mm, hóa đơn tiền triệu) thì thà in cỡ
  // thường mà đủ chữ, hơn là cỡ to mà nhãn bị cắt cụt thành "TỔNG 1.234.567đ".
  const soTong = tien(b?.total ?? tam - giam);
  const vuaCoLon = ('TỔNG CỘNG'.length + soTong.length + 1) <= Math.floor(cot / 2);
  kh.push(chu(
    haiCot('TỔNG CỘNG', soTong, vuaCoLon ? Math.floor(cot / 2) : cot),
    { co: vuaCoLon ? 2 : 1, dam: true }));

  if (daTra){
    const cach = b.payMethod === 'tienmat' ? 'Tiền mặt'
      : b.payMethod === 'chuyenkhoan' ? 'Chuyển khoản' : 'Đã thu';
    kh.push(chu(haiCot(cach, tien(b.paidAmount ?? b.total), cot)));
    if (b.overpaid && b.overpaidAmount) kh.push(chu(haiCot('Khách chuyển thừa', tien(b.overpaidAmount), cot)));
  } else {
    const thieu = Math.max(0, (Number(b?.total) || 0) - (Number(b?.paidAmount) || 0));
    if (Number(b?.paidAmount) > 0) kh.push(chu(haiCot('Đã nhận', tien(b.paidAmount), cot)));
    if (o.qr){
      kh.push(hong(10));
      kh.push({ kieu: 'anh', src: o.qr, rong: 0.62 });
      kh.push(chu('Quét mã để chuyển ' + tien(thieu), { can: 'giua' }));
      // Nội dung chuyển khoản CHÍNH LÀ mã hóa đơn — SePay bóc mã từ đó rồi tự
      // đóng hóa đơn. Khách gõ tay thì phải gõ đúng chuỗi này.
      kh.push(chu('Nội dung: ' + (b?.code ?? ''), { dam: true, can: 'giua' }));
    }
  }

  kh.push(hong(10));
  kh.push(chu('Cảm ơn quý khách!', { can: 'giua' }));
  return kh;
}
