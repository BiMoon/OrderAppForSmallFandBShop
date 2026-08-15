/* ==========================================================================
   tem.js — sổ tem tích luỹ, phía app trong quán

   Sổ nằm ở Firestore của dự án `ghecauhai` (app khách), KHÔNG nằm trong RTDB
   của app này. Cố ý: khách uống 9 ly ở quán rồi đặt 1 ly online phải đủ 10 tem,
   nên chỉ được có một sổ, và sổ ấy đặt ở nơi app khách đọc được.

   ── Vì sao có mã thiết bị ───────────────────────────────────────────────────

   Hai app nằm ở HAI dự án Firebase khác nhau, nên token Google của máy ở quầy
   không xác minh được ở máy chủ bên kia. Đường vào là header `x-thiet-bi` —
   chủ quán dán một chuỗi bí mật vào màn Cài đặt của TỪNG máy ở quầy. Chuỗi đó
   nằm trong localStorage của máy, không nằm trong mã nguồn công khai.

   Mã này cố ý chỉ mở đúng sổ tem: lộ ra thì kẻ cầm nó cộng/trừ được tem, không
   đụng được vào đơn hàng, tiền, hay thực đơn.
   ========================================================================== */

import { store } from './core.js';

const API = 'https://ghecauhai.netlify.app/api/tich-diem';

export const cauHinhTem = () => ({ ma: '', api: API, ...(store.get('tem', null) || {}) });
export const luuCauHinhTem = (c) => store.set('tem', { ...cauHinhTem(), ...c });
export const temBatChua = () => !!cauHinhTem().ma;

export const chuanHoaSdt = (raw) => {
  const s = String(raw ?? '').replace(/[\s.\-()]/g, '');
  if (/^0\d{9}$/.test(s)) return s;
  if (/^\+?84\d{9}$/.test(s)) return '0' + s.replace(/^\+?84/, '');
  return null;
};

async function goi(than){
  const c = cauHinhTem();
  if (!c.ma) throw new Error('Chưa nhập mã thiết bị ở màn Cài đặt tem');
  let res;
  try {
    res = await fetch(c.api || API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-thiet-bi': c.ma },
      body: JSON.stringify(than),
    });
  } catch {
    throw new Error('Không nối được máy chủ tích điểm — kiểm tra mạng');
  }
  const chu = await res.text();
  let d;
  try { d = JSON.parse(chu); }
  catch { throw new Error(`Máy chủ trả về dữ liệu lạ (HTTP ${res.status})`); }
  if (!res.ok || d?.ok === false) throw new Error(d?.message ?? `Lỗi ${res.status}`);
  return d;
}

/** Xem sổ của một số điện thoại. Trả null nếu số sai hoặc chương trình đang tắt. */
export async function xemTem(sdt){
  const so = chuanHoaSdt(sdt);
  if (!so) return null;
  const d = await goi({ action: 'xem', sdt: so });
  return d.bat ? d : null;
}

/**
 * Ghi sổ cho một hoá đơn ĐÃ THANH TOÁN.
 *
 * `ma` là mã hoá đơn QCH… — cũng chính là khoá chống ghi hai lần ở máy chủ, nên
 * thu ngân bấm lại, mạng chập rồi thử lại, hay webhook SePay bắn tám lần đều
 * chỉ tính một lượt.
 *
 * Số tem do MÁY CHỦ đếm từ danh sách món gửi lên; ở đây không tự tính rồi gửi
 * một con số — tin client ở chỗ này là mở cửa cho một dòng fetch trong DevTools
 * tự tặng mình 500 tem.
 */
export function ghiTem({ ma, sdt, items, doiQua = false, ten = '' }){
  return goi({ action: 'ghi', ma, sdt, items, doiQua, ten, nguon: 'quan' });
}

/** Ly được tặng: đắt nhất trong hoá đơn. Cùng luật với máy chủ. */
export function quaTang(items = []){
  const ds = items
    .map((i) => ({ ten: String(i.name ?? i.ten ?? 'Món'), gia: Number(i.price) || 0 }))
    .filter((x) => x.gia > 0);
  if (!ds.length) return null;
  return ds.reduce((a, b) => (b.gia > a.gia ? b : a));
}
