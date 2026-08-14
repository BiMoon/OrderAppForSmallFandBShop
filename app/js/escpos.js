/* ==========================================================================
   escpos.js — dựng chuỗi byte ESC/POS cho máy in nhiệt

   Module THUẦN: không DOM, không Firebase, không canvas. Vào là số, ra là
   `Uint8Array`. Nhờ vậy phần dễ sai nhất — đóng gói bit của ảnh raster — kiểm
   được bằng `node --test`, không cần cắm máy in.

   ── Vì sao in bằng ẢNH chứ không in chữ ─────────────────────────────────────

   Máy in nhiệt giá rẻ hầu như không có bảng mã tiếng Việt. In chữ thẳng ra thì
   "Trà đào cam sả" thành "Tr o cam s" hoặc mất sạch dấu — không ai đọc được
   hóa đơn của quán mình. Nên cả tờ hóa đơn được vẽ ra ảnh đen trắng rồi bắn đi
   bằng `GS v 0`. Chậm hơn vài trăm mili giây, đổi lại dấu chuẩn 100%, font tùy
   ý, và in được luôn mã VietQR lên giấy.

   Đổi lại: ở đây KHÔNG có hàm in chữ. Chữ nghĩa nằm hết ở hoaDonBoCuc.js
   (bố cục) và inHoaDon.js (sơn lên canvas).
   ========================================================================== */

const ESC = 0x1b, GS = 0x1d;

/** Khổ giấy → số điểm ảnh ngang. Đây là con số vật lý của đầu in, không đổi được. */
export const KHO = {
  '58': { rong: 384, nhan: '58mm (384 điểm)' },
  '80': { rong: 576, nhan: '80mm (576 điểm)' },
};

/** ESC @ — về mặc định. Luôn gửi đầu tiên, kẻo ăn cấu hình còn sót của lần in trước. */
export const KHOI_TAO = Uint8Array.from([ESC, 0x40]);

/** ESC d n — đẩy n dòng giấy. */
export const dayGiay = (n = 4) => Uint8Array.from([ESC, 0x64, Math.max(0, Math.min(255, n | 0))]);

/** GS V 66 n — cắt gần đứt, chừa n dòng. Máy không có dao thì lệnh này vô hại. */
export const catGiay = (n = 3) => Uint8Array.from([GS, 0x56, 66, Math.max(0, Math.min(255, n | 0))]);

/**
 * ESC p — đá ngăn kéo tiền.
 *
 * Ngăn kéo cắm vào cổng RJ11 sau máy in, không phải thiết bị riêng. Chỉ đá khi
 * thu TIỀN MẶT: đá lúc khách chuyển khoản là ngăn kéo bật ra vô cớ giữa quầy.
 */
export const daNganKeo = (chan = 0) =>
  Uint8Array.from([ESC, 0x70, chan === 1 ? 1 : 0, 25, 250]);

/** Nối nhiều mảnh byte thành một. */
export function noi(...manh){
  const ds = manh.flat().filter(Boolean);
  const tong = ds.reduce((s, x) => s + x.length, 0);
  const ra = new Uint8Array(tong);
  let i = 0;
  for (const x of ds){ ra.set(x, i); i += x.length; }
  return ra;
}

/**
 * Đóng gói một ảnh đen trắng thành các lệnh `GS v 0`.
 *
 * @param {Uint8Array|number[]} diem  1 byte cho mỗi điểm: khác 0 = ĐEN (có mực)
 * @param {number} rong               số điểm ngang, nên khớp KHO[...].rong
 * @param {number} [caoBang=128]      số dòng mỗi lệnh, xem ghi chú bên dưới
 *
 * Ba chỗ dễ sai, đều có test canh:
 *
 * • **8 điểm dồn vào 1 byte, bit cao nằm bên TRÁI.** Đảo bit là ảnh ra như
 *   gương soi.
 * • **Chiều rộng phải làm tròn LÊN bội số của 8.** Máy in đọc đúng `xL+xH*256`
 *   byte mỗi dòng; tính thiếu một byte là cả ảnh xô chéo dần xuống dưới, một
 *   lỗi trông như phần cứng hỏng.
 * • **Chia thành băng.** Máy in rẻ có bộ đệm vài KB; đẩy nguyên tờ hóa đơn dài
 *   trong một lệnh là nó in được nửa trên rồi đứng. Mỗi băng là một `GS v 0`
 *   độc lập nên máy in tiêu hóa xong băng nào là nhả giấy băng đó.
 */
export function anhRaster(diem, rong, caoBang = 128){
  if (!rong || rong < 1) throw new Error('anhRaster: thiếu chiều rộng');
  const soByteDong = Math.ceil(rong / 8);
  const cao = Math.floor(diem.length / rong);
  if (cao < 1) throw new Error('anhRaster: ảnh không có dòng nào');

  const manh = [];
  for (let y0 = 0; y0 < cao; y0 += caoBang){
    const caoNay = Math.min(caoBang, cao - y0);
    const than = new Uint8Array(soByteDong * caoNay);
    for (let y = 0; y < caoNay; y++){
      const nguon = (y0 + y) * rong;
      const dich = y * soByteDong;
      for (let x = 0; x < rong; x++){
        if (diem[nguon + x]) than[dich + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
    manh.push(Uint8Array.from([
      GS, 0x76, 0x30, 0,
      soByteDong & 0xff, (soByteDong >> 8) & 0xff,
      caoNay & 0xff, (caoNay >> 8) & 0xff,
    ]), than);
  }
  return noi(...manh);
}

/**
 * Cả một lệnh in hoàn chỉnh: khởi tạo → ảnh → đẩy giấy → cắt (→ đá ngăn kéo).
 */
export function lenhIn(diem, rong, { day = 4, cat = true, nganKeo = false } = {}){
  return noi(
    KHOI_TAO,
    anhRaster(diem, rong),
    dayGiay(day),
    cat ? catGiay() : null,
    nganKeo ? daNganKeo() : null,
  );
}

/** Uint8Array → base64. Dùng cho đường gửi qua RawBT. */
export function sangBase64(bytes){
  let s = '';
  // Cắt khúc 8KB: `String.fromCharCode(...mảng)` với mảng vài chục nghìn phần
  // tử làm tràn ngăn xếp lời gọi, và lỗi đó chỉ hiện ra với hóa đơn DÀI.
  for (let i = 0; i < bytes.length; i += 8192){
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}
