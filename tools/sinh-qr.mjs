/**
 * sinh-qr.mjs — sinh lại mã QR "đặt online" nhúng trong app/js/quanInfo.js
 *
 * Chỉ chạy khi ĐỔI TÊN MIỀN. Mã QR là hằng số trong mã nguồn chứ không sinh
 * lúc chạy, để in được cả khi quán rớt mạng — nhưng thế thì phải có đường sinh
 * lại, không thì lần sau không ai biết cái chuỗi base64 kia ở đâu ra.
 *
 *   node tools/sinh-qr.mjs                      # đọc QUAN.webDayDu
 *   node tools/sinh-qr.mjs https://abc.vn       # ép một địa chỉ khác
 *
 * Cần `qrcode`:  npm i -D qrcode
 */

import { readFile, writeFile } from 'node:fs/promises';
import { QUAN } from '../app/js/quanInfo.js';

const URL_QR = process.argv[2] || QUAN.webDayDu;
const DICH = new URL('../app/js/quanInfo.js', import.meta.url);

let QRCode;
try {
  QRCode = (await import('qrcode')).default;
} catch {
  console.error('Thiếu gói qrcode. Chạy:  npm i -D qrcode');
  process.exit(1);
}

// `margin: 2` là vùng lặng tối thiểu của chuẩn QR — cắt sát viền là nhiều máy
// quét không bắt được. `scale: 8` cho mỗi module 8 điểm ảnh, đủ nét ở cả khổ
// 58mm lẫn 80mm sau khi ngưỡng hoá 1-bit.
const dataUrl = await QRCode.toDataURL(URL_QR, {
  errorCorrectionLevel: 'M',
  margin: 2,
  scale: 8,
  color: { dark: '#000000ff', light: '#ffffffff' },
});

const goc = await readFile(DICH, 'utf8');
const moi = goc.replace(
  /export const QR_DAT_ONLINE = '[^']*';/,
  `export const QR_DAT_ONLINE = '${dataUrl}';`,
);
if (moi === goc) {
  console.error('Không tìm thấy dòng QR_DAT_ONLINE trong quanInfo.js');
  process.exit(1);
}
await writeFile(DICH, moi);
console.log(`✓ Đã sinh QR cho ${URL_QR} — ${Math.round(dataUrl.length / 1024 * 10) / 10}KB`);
console.log('  Nhớ soi lại ảnh: npm run kiem:in  →  test/anh-hoa-don-80.png');
