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

import { QUAN, QR_DAT_ONLINE } from './quanInfo.js';

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

  // Hai khối, cố ý tách vai trò:
  //
  //   GHÉ CẬU HAI            <- thương hiệu, cỡ gấp đôi. Thứ khách nhớ.
  //   Góc nhỏ món ngon
  //
  //   Hộ Kinh Doanh Cậu Hai Long   <- pháp nhân, cỡ thường
  //   371/3 Trường Chinh, ...      <- địa chỉ, đi liền pháp nhân
  //
  // Khối dưới là khối người của cơ quan thuế đọc: bán hàng là ai, ở đâu. Để
  // liền nhau thì đọc ra ngay; rải mỗi thứ một nơi thì phải đi tìm. Một dòng
  // trắng ngăn giữa hai khối đủ để mắt hiểu đây là hai chuyện khác nhau, mà
  // không cần kẻ thêm vạch nào.
  kh.push(chu(o.tenQuan || QUAN.ten, { co: 2, dam: true, can: 'giua' }));
  kh.push(chu(QUAN.slogan, { can: 'giua' }));
  kh.push(hong(11));
  if (QUAN.phapNhan) {
    for (const d of ngatDong(QUAN.phapNhan, cot)) kh.push(chu(d, { can: 'giua' }));
  }
  if (QUAN.maSoThue) kh.push(chu('MST: ' + QUAN.maSoThue, { can: 'giua' }));
  for (const d of ngatDong(o.diaChi || QUAN.diaChi, cot)) kh.push(chu(d, { can: 'giua' }));
  // Số điện thoại nằm ở CHÂN hoá đơn cùng với Zalo và wifi, không lặp lại ở
  // đây. Hai lần cùng một số trên một tờ giấy là hai dòng giấy vứt đi — trừ khi
  // quán dùng số Zalo khác số gọi, lúc đó mỗi số đứng một chỗ mới có nghĩa.
  if (QUAN.zalo !== QUAN.dienThoai) kh.push(chu(QUAN.dienThoai, { can: 'giua' }));
  kh.push(hong(6));
  // KHÔNG gọi là "HÓA ĐƠN". Chừng nào quán chưa phát hành hoá đơn điện tử thì
  // tờ giấy này không phải hoá đơn theo nghĩa của cơ quan thuế, và in nhầm chữ
  // đó lên vài nghìn tờ là một rắc rối không đáng có.
  kh.push(chu(daTra ? 'PHIẾU THANH TOÁN' : 'PHIẾU TÍNH TIỀN', { dam: true, can: 'giua' }));
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
    // Khách đối chiếu tiền thối NGAY tại quầy, trước khi rời đi. Đếm lại sau
    // khi đã ra khỏi cửa thì không ai giải quyết được nữa.
    if (Number(b.tienThoi) > 0) {
      kh.push(chu(haiCot('Khách đưa', tien(b.khachDua), cot)));
      kh.push(chu(haiCot('Tiền thối', tien(b.tienThoi), cot), { dam: true }));
    }
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

  // ── tem tích luỹ ──────────────────────────────────────────────────────────
  //
  // In số tem SAU hoá đơn này, không phải số lúc bắt đầu: khách cầm tờ giấy đi
  // ra khỏi quán, con số họ cần biết là con số họ đang có.
  //
  // Máy chủ mới là nơi chốt sổ, nên đây chỉ là dự tính từ ảnh chụp lúc tạo hoá
  // đơn. Lệch được đúng một ca: khách vừa tiêu tem đó ở một hoá đơn khác trong
  // vài phút. Chấp nhận — thà in một con số gần đúng còn hơn không in gì, và
  // dòng chữ nói "sau hoá đơn này" chứ không hứa là số cuối cùng.
  const tem = temSauHoaDon(b);
  if (tem) {
    kh.push(hong(8));
    kh.push(ke());
    kh.push(chu(haiCot('Tem tích luỹ', `${tem.sau}/${tem.moc}`, cot), { dam: true }));
    // Ngắt dòng chứ không in thẳng: câu chúc mừng dài 37 ký tự, quá khổ 58mm
    // (32 cột), và "còn 99 ly nữa" thì dài thêm nữa.
    for (const d of ngatDong(tem.du
      ? 'Đủ tem — lần sau đổi một ly miễn phí!'
      : `Còn ${tem.thieu} ly nữa là được tặng một ly`, cot)) {
      kh.push(chu(d, { can: 'giua' }));
    }
  }

  chanHoaDon(kh, { cot, coQrTra: !daTra && !!o.qr, thuNgan: o.thuNgan ?? b?.thuBoi });
  return kh;
}

/**
 * Chân hoá đơn — thứ khách cầm về nhà.
 *
 * Thứ tự cố ý: lời cảm ơn trước, rồi mới tới chuyện của quán. Ngược lại thì tờ
 * giấy đọc như một tờ rơi quảng cáo có đính kèm số tiền.
 *
 * @param {object} p
 * @param {boolean} p.coQrTra  tờ này ĐÃ có mã QR chuyển khoản rồi
 * @param {string}  [p.thuNgan] email người thu tiền
 */
export function chanHoaDon(kh, { cot, coQrTra = false, thuNgan = null } = {}) {
  // Ai thu tiền. In phần trước @ cho gọn — khách khiếu nại thì chủ quán biết
  // hỏi ai, mà tờ giấy cũng không phơi email đầy đủ của nhân viên ra ngoài.
  const ten = thuNgan ? String(thuNgan).split('@')[0] : null;
  if (ten) {
    kh.push(hong(6));
    kh.push(chu(haiCot('Thu ngân', ten, cot)));
  }

  kh.push(hong(10));
  kh.push(chu('Cảm ơn quý khách!', { dam: true, can: 'giua' }));

  kh.push(hong(8));
  kh.push(ke());

  // MỘT mã QR trên một tờ giấy. Tờ chưa trả tiền đã có mã VietQR rồi; thêm mã
  // thứ hai là khách quét nhầm cái không thu tiền, rồi cả hai bên cùng đứng
  // chờ. Tờ đã thanh toán mới là tờ khách cầm về — chỗ đúng để mời quay lại.
  if (!coQrTra) {
    kh.push(hong(8));
    kh.push(chu('QUÉT ĐỂ ĐẶT ONLINE', { dam: true, can: 'giua' }));
    // 0,45 bề ngang giấy. Mã có 29 ô, máy in 203 dpi (8 điểm/mm), nên mỗi ô ra
    // ~1,1mm ở khổ 80 và ~0,75mm ở khổ 58 — trên ngưỡng ~0,5mm mà điện thoại
    // cầm tay còn bắt được. Nhỏ hơn nữa thì giấy nhiệt in mờ một chút là hỏng.
    kh.push({ kieu: 'anh', src: QR_DAT_ONLINE, rong: 0.45 });
    kh.push(chu(QUAN.web, { dam: true, can: 'giua' }));
    kh.push(chu('Giao tận nơi · Đặt mang đi', { can: 'giua' }));
    kh.push(hong(8));
  } else {
    kh.push(hong(6));
    kh.push(chu('Đặt online: ' + QUAN.web, { can: 'giua' }));
  }

  kh.push(chu(haiCot(QUAN.zalo === QUAN.dienThoai ? 'Zalo / ĐT' : 'Zalo', QUAN.zalo, cot)));
  if (QUAN.zalo !== QUAN.dienThoai) kh.push(chu(haiCot('Điện thoại', QUAN.dienThoai, cot)));
  kh.push(chu(haiCot('Wifi', QUAN.wifi, cot)));
  kh.push(chu(haiCot('Mật khẩu', QUAN.wifiMatKhau, cot)));
  return kh;
}

/**
 * Số tem sau hoá đơn này, tính từ ảnh chụp lưu lúc tạo hoá đơn.
 *
 * Trả `null` khi hoá đơn không gắn số điện thoại, hoặc lúc tạo chưa tra được sổ
 * (mất mạng, chương trình đang tắt) — không đoán bừa một con số lên giấy.
 *
 * @param {object} b  hoá đơn, cần `sdt`, `temTruoc`, `temSe`, `temMoc`, `doiQua`
 */
export function temSauHoaDon(b) {
  if (!b?.sdt) return null;
  const moc = Math.floor(Number(b.temMoc) || 0);
  if (moc < 2) return null;
  // `null` phải bị loại TRƯỚC khi qua Number(): `Number(null)` là 0, một con số
  // hợp lệ hoàn hảo — nên "chưa tra được sổ" sẽ lặng lẽ in ra "0/10 tem" như
  // thể khách chưa mua gì bao giờ.
  if (b.temTruoc === null || b.temTruoc === undefined || b.temTruoc === '') return null;
  const truoc = Number(b.temTruoc);
  if (!Number.isFinite(truoc) || truoc < 0) return null;

  const them = Math.max(0, Math.floor(Number(b.temSe) || 0));
  // Trừ đúng phần thật sự trừ được — hoá đơn hứa đổi quà lúc khách có 10 tem
  // mà tới lúc trả chỉ còn 3 thì máy chủ kẹp lại, và tờ giấy không được in ra
  // một con số âm.
  const tru = b.doiQua ? Math.min(moc, truoc) : 0;
  const sau = Math.max(0, truoc - tru + them);
  return { sau, moc, thieu: Math.max(0, moc - sau), du: sau >= moc };
}
