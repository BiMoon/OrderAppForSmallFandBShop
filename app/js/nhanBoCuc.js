/* ==========================================================================
   nhanBoCuc.js — một đơn → danh sách NHÃN DÁN LY

   Module THUẦN. Vào là đơn + món, ra là mảng nhãn, mỗi nhãn là một mảng khối
   giống hệt khuôn của hoaDonBoCuc.js. Phần sơn lên canvas là việc của inNhan.js.

   ── Nhãn ly để làm gì ───────────────────────────────────────────────────────

   Chặn hai lỗi, và chỉ hai lỗi đó:

   • **Pha nhầm tuỳ chọn.** "Ít đường, nhiều đá" nằm trong đầu người pha chứ
     không nằm trên ly. Đơn năm ly là năm cấu hình khác nhau.
   • **Trao nhầm ly TRONG cùng một đơn.** Hai ly giống hệt nhau bên ngoài, một
     ly không đường cho người tiểu đường.

   Nó KHÔNG chặn được lỗi trao nhầm cả túi cho khách khác — việc đó cần nhãn
   túi, chưa làm.

   ── Một ly một nhãn ─────────────────────────────────────────────────────────

   Món ×3 ra 3 nhãn, đánh số 1/3, 2/3, 3/3. Người pha nhìn số là biết bộ đã đủ
   chưa; thiếu một ly trong đơn năm ly là chuyện đếm nhầm rất dễ xảy ra lúc đông.
   ========================================================================== */

import { SO_COT, ngatDong, haiCot } from './hoaDonBoCuc.js';

/** Ghi chú dài quá thì cắt — nhưng phải NÓI ra là đã cắt. */
export const TRAN_GHI_CHU = 80;

const sach = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

/**
 * Ba số cuối của số điện thoại, dạng `***567`.
 *
 * **Không in đủ số lên ly.** Ly ngồi trên quầy chờ lấy, ai đi ngang cũng đọc
 * được — in `0901234567` lên đó là phát số điện thoại của khách cho cả quán.
 * Ba số cuối đủ để đối chiếu khi khách tới nhận, không đủ để người lạ nhắn tin.
 */
export function baSoCuoi(sdt) {
  const s = String(sdt ?? '').replace(/\D/g, '');
  return s.length >= 3 ? '***' + s.slice(-3) : '';
}

/**
 * Cắt ghi chú cho vừa nhãn, và cho biết có bị cắt hay không.
 *
 * Người pha thấy dấu `…` là biết còn nữa mà mở đơn ra xem — im lặng cắt mất
 * nửa câu dặn của khách thì tệ hơn hẳn không in gì.
 */
export function catGhiChu(chu, tran = TRAN_GHI_CHU) {
  const s = sach(chu);
  if (s.length <= tran) return { chu: s, biCat: false };
  // Cắt ở khoảng trắng gần nhất để không đứt giữa một từ.
  const cat = s.slice(0, tran);
  const cho = cat.lastIndexOf(' ');
  return { chu: (cho > tran * 0.6 ? cat.slice(0, cho) : cat) + '…', biCat: true };
}

/**
 * Một dòng món → mấy nhãn.
 *
 * Chấp nhận cả hai kiểu tên trường: đơn online (`dishName`, `quantity`,
 * `selectedOptions`) và đơn tại quán (`item`, `tuyChon`, `ghiChu`).
 */
function nhanCuaDong(dong) {
  const sl = Math.max(1, Math.floor(Number(dong?.qty ?? dong?.quantity) || 1));
  const tuyChon = sach(dong?.tuyChon
    ?? (Array.isArray(dong?.selectedOptions)
      ? dong.selectedOptions.map((o) => o?.choiceName).filter(Boolean).join(', ')
      : ''));
  return {
    ten: sach(dong?.name ?? dong?.item ?? dong?.dishName) || 'Món',
    tuyChon,
    ghiChu: sach(dong?.ghiChu ?? dong?.note),
    sl,
  };
}

/**
 * Đơn → danh sách nhãn, mỗi ly một nhãn.
 *
 * @param {object} don
 * @param {Array}  don.items    dòng món
 * @param {string} [don.ma]     mã đơn / hoá đơn
 * @param {string} [don.ten]    tên khách
 * @param {string} [don.sdt]
 * @param {string} [don.kieu]   'mang đi' | 'giao hàng' | 'tại bàn'…
 * @param {object} [o]
 * @param {string} [o.kho='80']
 * @param {Date}   [o.luc]
 * @param {boolean}[o.inLai]
 * @returns {Array<Array<object>>} mảng nhãn; mỗi nhãn là mảng khối để vẽ
 */
export function boCucNhan(don, o = {}) {
  const cot = SO_COT[o.kho] ?? SO_COT['80'];
  const luc = o.luc instanceof Date ? o.luc : new Date();
  const gio = luc.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

  const dong = (don?.items ?? []).map(nhanCuaDong);
  const tongLy = dong.reduce((s, d) => s + d.sl, 0);
  if (!tongLy) return [];

  const khach = [sach(don?.ten), baSoCuoi(don?.sdt)].filter(Boolean).join(' · ');
  const nhan = [];
  let thuTu = 0;

  for (const d of dong) {
    for (let i = 0; i < d.sl; i++) {
      thuTu += 1;
      const kh = [];

      // Số ly + hình thức nhận, hàng trên cùng, cỡ nhỏ.
      kh.push({ kieu: 'chu', chu: haiCot(sach(don?.kieu) || 'Mang đi', `${thuTu}/${tongLy}`, cot), co: 1, dam: true, can: 'trai' });
      kh.push({ kieu: 'ke' });

      // Tên món — to nhất. Ngắt dòng ở nửa số cột vì đang in cỡ 2.
      for (const l of ngatDong(d.ten, Math.floor(cot / 2))) {
        kh.push({ kieu: 'chu', chu: l, co: 2, dam: true, can: 'trai' });
      }

      if (d.tuyChon) {
        for (const l of ngatDong(d.tuyChon, cot)) {
          kh.push({ kieu: 'chu', chu: l, co: 1, dam: true, can: 'trai' });
        }
      }

      if (d.ghiChu) {
        const { chu, biCat } = catGhiChu(d.ghiChu);
        kh.push({ kieu: 'hong', cao: 4 });
        for (const l of ngatDong('✎ ' + chu, cot)) {
          kh.push({ kieu: 'chu', chu: l, co: 1, dam: true, can: 'trai', khung: true });
        }
        if (biCat) {
          kh.push({ kieu: 'chu', chu: '(còn nữa — mở đơn xem)', co: 1, dam: false, can: 'trai' });
        }
      }

      kh.push({ kieu: 'hong', cao: 6 });
      kh.push({ kieu: 'ke' });
      const chan = [khach, sach(don?.ma), gio].filter(Boolean).join(' · ');
      for (const l of ngatDong(chan, cot)) {
        kh.push({ kieu: 'chu', chu: l, co: 1, dam: false, can: 'trai' });
      }
      // Nhãn in lại phải nhìn ra ngay: hai nhãn giống hệt trên quầy mà không
      // phân biệt được thì lại đúng cái bẫy đã gặp với hoá đơn.
      if (o.inLai) kh.push({ kieu: 'chu', chu: '— IN LẠI —', co: 1, dam: true, can: 'giua' });

      nhan.push(kh);
    }
  }

  return nhan;
}

/** Có nên in nhãn cho đơn kiểu này không. */
export const MAC_DINH_KIEU = { mangDi: true, giaoHang: true, taiBan: false };

export function chuanHoaKieuIn(raw) {
  return {
    mangDi: raw?.mangDi !== false,
    giaoHang: raw?.giaoHang !== false,
    // Ly ở lại bàn, không lẫn đi đâu — mặc định TẮT để khỏi tốn decal.
    taiBan: raw?.taiBan === true,
  };
}
