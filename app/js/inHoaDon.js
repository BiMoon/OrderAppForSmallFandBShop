/* ==========================================================================
   inHoaDon.js — sơn hóa đơn lên canvas, đổi ra raster, bắn tới máy in

   Phần duy nhất của đường in cần tới trình duyệt. Bố cục (nội dung, số tiền,
   ngắt dòng) nằm ở hoaDonBoCuc.js và các lệnh máy in nằm ở escpos.js — cả hai
   đều thuần và có test. Ở đây chỉ có cây cọ và cái ống dẫn.

   ── Vì sao trình duyệt không nói thẳng với máy in ───────────────────────────

   Máy in nhiệt WiFi nghe ESC/POS THÔ ở cổng TCP 9100. Trình duyệt không mở
   được socket TCP — không có API nào làm việc đó, và sẽ không có. Nên luôn
   phải có một kẻ trung gian mở socket hộ. Hai kẻ trung gian đó là hai hàm
   `guiRawBT` và `guiCauNoi` bên dưới; chúng thay thế được cho nhau, đổi cách
   gửi không đụng tới một dòng nào của phần vẽ.
   ========================================================================== */

import { KHO, lenhIn, sangBase64 } from './escpos.js';
import { boCucHoaDon } from './hoaDonBoCuc.js';
import { store } from './core.js';

export const CACH_GUI = {
  rawbt:  { nhan: 'RawBT (Android)', ta: 'Cài app RawBT trên máy ở quầy. Chạy được với máy in WiFi, Bluetooth lẫn USB.' },
  caunoi: { nhan: 'Cầu nối trong quán', ta: 'Một máy luôn bật chạy tools/cau-noi-in.mjs. In được từ mọi máy ở quầy.' },
};

export const cauHinhIn = () => ({
  bat: false, kho: '80', cach: 'rawbt', cauNoi: 'http://192.168.1.50:9110',
  tenQuan: 'GHÉ CẬU HAI', diaChi: '', nganKeo: false,
  ...(store.get('in', null) || {}),
});
export const luuCauHinhIn = (c) => store.set('in', { ...cauHinhIn(), ...c });

/* ─────────────────── sơn lên canvas ─────────────────── */

const CAO_CHU = 26;          // cỡ 1, tính bằng điểm ảnh
const LE = 8;

/**
 * Vẽ danh sách khối ra canvas rồi trả về ảnh 1-bit.
 *
 * Ngưỡng hóa thẳng ở 50% xám, không khử răng cưa: đầu in nhiệt chỉ có đen và
 * trắng, giữ lại mức xám thì chữ ra lem nhem chứ không mịn hơn.
 */
export async function veHoaDon(khoi, kho = '80'){
  const rong = (KHO[kho] ?? KHO['80']).rong;
  const cv = document.createElement('canvas');
  cv.width = rong;
  const g = cv.getContext('2d');

  // Ảnh phải nạp xong TRƯỚC khi đo chiều cao, nếu không tờ hóa đơn bị hụt đúng
  // chỗ mã QR và mã bị cắt mất một nửa.
  const anh = new Map();
  await Promise.all(khoi.filter(k => k.kieu === 'anh').map(k => new Promise((xong) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => { anh.set(k, im); xong(); };
    im.onerror = () => xong();                 // mất mạng thì in hóa đơn không QR
    im.src = k.src;
  })));

  const font = (k) => `${k.dam ? '700 ' : ''}${CAO_CHU * (k.co || 1) * 0.72}px system-ui, "Segoe UI", Roboto, sans-serif`;
  const caoCua = (k) => {
    if (k.kieu === 'hong') return k.cao;
    if (k.kieu === 'ke') return 14;
    if (k.kieu === 'anh'){
      const im = anh.get(k);
      if (!im) return 0;
      const w = Math.round(rong * (k.rong || 0.6));
      return Math.round(w * im.height / im.width) + 8;
    }
    return Math.round(CAO_CHU * (k.co || 1));
  };

  const cao = khoi.reduce((s, k) => s + caoCua(k), 0) + LE * 2;
  cv.height = cao;
  g.fillStyle = '#fff'; g.fillRect(0, 0, rong, cao);
  g.fillStyle = '#000'; g.textBaseline = 'top';

  let y = LE;
  for (const k of khoi){
    const h = caoCua(k);
    if (k.kieu === 'chu'){
      g.font = font(k);
      let w = g.measureText(k.chu).width;
      // Lưới ước lượng theo số ký tự (hoaDonBoCuc.js) không thể biết trước bề
      // rộng thật của font. Dòng nào vẫn quá khổ thì BÓP lại cho vừa, đừng để
      // nó chạy ra ngoài mép — thứ rơi khỏi giấy luôn là phần bên phải, tức là
      // số tiền.
      const vua = rong - LE * 2;
      if (w > vua){
        g.font = font(k).replace(/^(700 )?[\d.]+px/, (m) => {
          const so = parseFloat(m.replace('700 ', ''));
          return (k.dam ? '700 ' : '') + (so * vua / w).toFixed(1) + 'px';
        });
        w = g.measureText(k.chu).width;
      }
      const x = k.can === 'giua' ? (rong - w) / 2 : k.can === 'phai' ? rong - LE - w : LE;
      g.fillText(k.chu, Math.max(0, x), y + 2);
    } else if (k.kieu === 'ke'){
      g.fillRect(LE, y + 6, rong - LE * 2, 2);
    } else if (k.kieu === 'anh'){
      const im = anh.get(k);
      if (im){
        const w = Math.round(rong * (k.rong || 0.6));
        g.drawImage(im, Math.round((rong - w) / 2), y + 4, w, h - 8);
      }
    }
    y += h;
  }

  const px = g.getImageData(0, 0, rong, cao).data;
  const diem = new Uint8Array(rong * cao);
  for (let i = 0, j = 0; i < diem.length; i++, j += 4){
    // Xám hóa thô (đủ dùng vì hóa đơn vốn chỉ có đen trên trắng), rồi cắt ở
    // giữa. Điểm trong suốt coi như giấy trắng.
    const a = px[j + 3];
    const xam = a === 0 ? 255 : (px[j] * 3 + px[j + 1] * 6 + px[j + 2]) / 10;
    diem[i] = xam < 128 ? 1 : 0;
  }
  return { diem, rong, cao, canvas: cv };
}

/* ─────────────────── hai đường gửi ─────────────────── */

/**
 * RawBT — app Android giữ socket hộ. Không cần hạ tầng gì trong quán.
 *
 * Dữ liệu đi qua URL scheme `rawbt:base64,…`, tức là qua Android Intent. Hóa
 * đơn khổ 80mm dài chừng 800 dòng ra ~75KB base64 — vẫn lọt, nhưng đây là lý
 * do khổ 58mm an toàn hơn nếu hóa đơn nhiều món, và là lý do cầu nối tồn tại.
 */
export function guiRawBT(bytes){
  const b64 = sangBase64(bytes);
  if (b64.length > 900_000) throw new Error('Hóa đơn quá dài để gửi qua RawBT — dùng cầu nối, hoặc chuyển khổ 58mm.');
  // Bấm một thẻ <a> chứ không gán `location.href`: gán thẳng vào location với
  // một scheme lạ khiến trình duyệt coi đó là điều hướng thất bại và app PWA
  // có thể bị đá ra ngoài. Thẻ <a> thì Android nhận Intent rồi để trang yên.
  const a = document.createElement('a');
  a.href = 'rawbt:base64,' + b64;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Cầu nối — một máy luôn bật trong quán mở socket TCP hộ (tools/cau-noi-in.mjs).
 *
 * Trang chạy HTTPS mà gọi `http://192.168.x.x` thì trước đây bị chặn vì mixed
 * content. Từ Chrome 142, "Local Network Access" cho phép, có hỏi quyền một
 * lần, khi Chrome nhận ra đích đến là IP nội mạng. Máy ở quầy phải đủ mới.
 */
export async function guiCauNoi(bytes, url){
  const res = await fetch(String(url).replace(/\/+$/, '') + '/in', {
    method: 'POST',
    headers: { 'content-type': 'application/octet-stream' },
    body: bytes,
  });
  if (!res.ok) throw new Error(`Cầu nối trả về ${res.status}`);
}

/* ─────────────────── ghép lại ─────────────────── */

/**
 * In một hóa đơn.
 *
 * @param {object} b        hóa đơn
 * @param {object} [o]
 * @param {string} [o.qr]   URL ảnh VietQR (bỏ trống thì không in mã)
 * @param {boolean}[o.inLai]
 * @param {boolean}[o.nganKeo] đá ngăn kéo — chỉ nên bật khi thu tiền mặt
 */
export async function inHoaDon(b, o = {}){
  const c = cauHinhIn();
  const khoi = boCucHoaDon(b, {
    kho: c.kho, tenQuan: c.tenQuan, diaChi: c.diaChi,
    qr: o.qr, inLai: o.inLai, luc: new Date(),
  });
  const { diem, rong } = await veHoaDon(khoi, c.kho);
  const bytes = lenhIn(diem, rong, { nganKeo: !!(o.nganKeo && c.nganKeo) });
  if (c.cach === 'caunoi') await guiCauNoi(bytes, c.cauNoi);
  else guiRawBT(bytes);
  return bytes.length;
}
