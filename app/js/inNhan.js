/* ==========================================================================
   inNhan.js — vẽ nhãn dán ly rồi bắn tới máy in

   Dùng lại y nguyên hạ tầng của hoá đơn: cùng canvas → 1-bit, cùng escpos.js,
   cùng hai đường gửi. Khác đúng hai chỗ:

   • **Nhiều nhãn trong MỘT lệnh in.** Đơn năm ly mà bắn năm Intent RawBT thì
     Android hỏi năm lần. Một job: khởi tạo → [ảnh, đẩy giấy, cắt] × N.
   • **Có khung.** Ghi chú của khách được đóng khung để mắt bắt được ngay giữa
     một tờ nhãn toàn chữ.

   ── Giai đoạn này in trên CUỘN DECAL của máy in hoá đơn ─────────────────────

   Không mua máy mới, không thêm ngôn ngữ lệnh. Nhân viên phải bóc lớp lưng vì
   không có khe die-cut — chấp nhận, vì mục tiêu là kiểm chứng nội dung nhãn có
   đúng thứ người pha cần không trước khi bỏ tiền mua máy.

   Khi nào chuyển sang máy die-cut: phần lớn máy in nhãn nói TSPL chứ không nói
   ESC/POS, nên sẽ cần thêm `tspl.js`. Bố cục và phần vẽ raster ở đây dùng lại
   được nguyên vẹn — chỉ lớp phát lệnh là mới.
   ========================================================================== */

import { KHO, KHOI_TAO, anhRaster, dayGiay, catGiay, noi, sangBase64 } from './escpos.js';
import { boCucNhan, chuanHoaKieuIn } from './nhanBoCuc.js';
import { cauHinhIn, guiRawBT, guiCauNoi } from './inHoaDon.js';
import { store } from './core.js';

export const cauHinhNhan = () => ({
  bat: false, kieu: chuanHoaKieuIn(null), tuDong: true,
  ...(store.get('nhan', null) || {}),
});
export const luuCauHinhNhan = (c) => store.set('nhan', { ...cauHinhNhan(), ...c });

const CAO_CHU = 26;
const LE = 8;

/**
 * Sơn một nhãn lên canvas rồi trả ảnh 1-bit.
 *
 * Gần giống `veHoaDon` nhưng có thêm kiểu khối `khung` — và cố ý KHÔNG gộp làm
 * một hàm với nó: hoá đơn và nhãn ly rồi sẽ đi hai hướng khác nhau (nhãn sẽ
 * sang máy die-cut), gộp bây giờ là hẹn một lần tách đau hơn về sau.
 */
export function veMotNhan(khoi, kho = '80') {
  const rong = (KHO[kho] ?? KHO['80']).rong;
  const cv = document.createElement('canvas');
  cv.width = rong;
  const g = cv.getContext('2d');

  const font = (k) => `${k.dam ? '700 ' : ''}${CAO_CHU * (k.co || 1) * 0.72}px system-ui, "Segoe UI", Roboto, sans-serif`;
  const caoCua = (k) => {
    if (k.kieu === 'hong') return k.cao;
    if (k.kieu === 'ke') return 12;
    return Math.round(CAO_CHU * (k.co || 1)) + (k.khung ? 5 : 0);
  };

  const cao = khoi.reduce((s, k) => s + caoCua(k), 0) + LE * 2;
  cv.height = cao;
  g.fillStyle = '#fff'; g.fillRect(0, 0, rong, cao);
  g.textBaseline = 'top';

  // Tính chỗ đứng của mọi khối TRƯỚC, rồi mới vẽ. Cần hai lượt vì cái khung
  // của ghi chú phải bao trọn một CỤM dòng liền nhau: vẽ khung theo từng dòng
  // thì câu dặn dài xuống hai dòng ra hai cái khung rời, trông như hai ghi chú
  // khác nhau — ảnh chụp bắt được đúng chỗ này.
  const cho = [];
  {
    let t = LE;
    for (const k of khoi) { cho.push({ k, y: t, h: caoCua(k) }); t += caoCua(k); }
  }

  g.fillStyle = '#000';
  for (let i = 0; i < cho.length; i++) {
    if (!cho[i].k.khung) continue;
    let j = i;
    while (j + 1 < cho.length && cho[j + 1].k.khung) j++;
    const tren = cho[i].y;
    const duoi = cho[j].y + cho[j].h;
    g.fillRect(LE, tren, rong - LE * 2, duoi - tren);
    g.fillStyle = '#fff';
    g.fillRect(LE + 3, tren + 3, rong - LE * 2 - 6, duoi - tren - 6);
    g.fillStyle = '#000';
    i = j;
  }

  for (const { k, y, h } of cho) {
    if (k.kieu === 'ke') {
      g.fillStyle = '#000';
      g.fillRect(LE, y + 5, rong - LE * 2, 2);
    } else if (k.kieu === 'chu') {
      g.fillStyle = '#000';
      g.font = font(k);
      let w = g.measureText(k.chu).width;
      const vua = rong - LE * 2 - (k.khung ? 14 : 0);
      if (w > vua) {
        // Lưới đếm ký tự không biết bề rộng thật của font — đã mất một lần với
        // dòng TỔNG CỘNG bị rơi mất số tiền. Bóp lại cho vừa.
        g.font = font(k).replace(/^(700 )?[\d.]+px/, (m) => {
          const so = parseFloat(m.replace('700 ', ''));
          return (k.dam ? '700 ' : '') + (so * vua / w).toFixed(1) + 'px';
        });
        w = g.measureText(k.chu).width;
      }
      const x = k.can === 'giua' ? (rong - w) / 2 : LE + (k.khung ? 7 : 0);
      g.fillText(k.chu, Math.max(0, x), y + (k.khung ? 4 : 2));
    }
  }

  const px = g.getImageData(0, 0, rong, cao).data;
  const diem = new Uint8Array(rong * cao);
  for (let i = 0, j = 0; i < diem.length; i++, j += 4) {
    const a = px[j + 3];
    const xam = a === 0 ? 255 : (px[j] * 3 + px[j + 1] * 6 + px[j + 2]) / 10;
    diem[i] = xam < 128 ? 1 : 0;
  }
  return { diem, rong, cao, canvas: cv };
}

/**
 * Cả một đơn → MỘT lệnh in chứa N nhãn.
 *
 * Cắt giấy sau từng nhãn để nhân viên xé rời được từng cái. Khởi tạo đúng một
 * lần ở đầu, không phải mỗi nhãn một lần — máy in nhận ESC @ giữa chừng là mất
 * hết cấu hình đang dùng.
 */
export function lenhInNhan(dsNhan, kho = '80') {
  const manh = [KHOI_TAO];
  for (const n of dsNhan) {
    const { diem, rong } = veMotNhan(n, kho);
    manh.push(anhRaster(diem, rong), dayGiay(2), catGiay());
  }
  return noi(...manh);
}

/**
 * In nhãn cho một đơn.
 *
 * @param {object} don  { items, ma, ten, sdt, kieu }
 * @param {object} [o]  { inLai }
 * @returns {Promise<{soNhan:number, byte:number}>}
 */
export async function inNhan(don, o = {}) {
  const c = cauHinhIn();
  const ds = boCucNhan(don, { kho: c.kho, luc: new Date(), inLai: o.inLai });
  if (!ds.length) throw new Error('Đơn này không có ly nào để in nhãn');

  const bytes = lenhInNhan(ds, c.kho);

  // Đơn nhiều ly ra lệnh in rất dài. RawBT đi qua Android Intent nên có trần
  // thực tế; cầu nối thì không. Nói thẳng ra thay vì để máy in nuốt một nửa.
  if (c.cach !== 'caunoi') {
    const b64 = sangBase64(bytes).length;
    if (b64 > 900_000) {
      throw new Error(`Đơn ${ds.length} ly quá dài để gửi qua RawBT (${Math.round(b64 / 1024)}KB) — dùng cầu nối, hoặc in từng phần.`);
    }
  }

  if (c.cach === 'caunoi') await guiCauNoi(bytes, c.cauNoi);
  else guiRawBT(bytes);
  return { soNhan: ds.length, byte: bytes.length };
}
