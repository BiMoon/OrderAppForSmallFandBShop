/* ==========================================================================
   thongKeQuan.js — báo số ly bán tại quầy về sổ "Bán chạy" của app khách

   Nhãn "Bán chạy" trên thực đơn online trước đây chỉ đếm đơn ĐẶT ONLINE. Với
   một quán mà phần lớn ly bán ra là khách vãng lai, nhãn ấy tính từ một mẫu
   nhỏ và lệch — món chỉ bán chạy ở quầy thì không bao giờ được gắn nhãn.

   Hai app đã dùng chung một định danh món (`stt` = cột STT trong Google Sheet),
   nên chỉ còn thiếu đường nối. Đây là đường nối đó.

   ── Ba điều cố ý ────────────────────────────────────────────────────────────

   1. **Gửi lúc CHỐT TIỀN, không phải lúc gửi món xuống bếp.** Một lượt gọi cho
      cả hoá đơn thay vì một lượt mỗi ly, và "đã bán" có nghĩa là "đã thu tiền"
      — món gửi xuống bếp rồi khách đổi ý thì không phải một ly bán được.

   2. **Không chặn giao diện, không báo lỗi đỏ.** Đây là số liệu xếp hạng, hỏng
      vài hoá đơn không ai chết. Bắt thu ngân nhìn một dòng đỏ vì thống kê lỗi,
      giữa lúc khách đang đứng chờ tiền thối, là đặt sai thứ tự ưu tiên.
      `tools/thong-ke-lai.mjs` bên repo website dựng lại được toàn bộ khi cần.

   3. **Máy chủ chống cộng trùng theo mã hoá đơn**, nên gọi lại bao nhiêu lần
      cũng chỉ vào sổ một lần. Nhờ vậy ở đây không cần hàng đợi, không cần nhớ
      đã gửi hoá đơn nào.

   Dùng chung mã thiết bị với sổ tem: thêm khoá thứ hai nghĩa là thêm một chuỗi
   nữa phải dán vào từng máy ở quầy, và một chuỗi nữa để dán nhầm.
   ========================================================================== */

import { cauHinhTem } from './tem.js';

const API = 'https://ghecauhai.netlify.app/api/thong-ke-quan';

/**
 * Báo một hoá đơn đã thu tiền.
 *
 * @param {object} b hoá đơn — cần `code` và `items` (mỗi dòng có `stt`, `qty`)
 * @returns {Promise<{ok:boolean, soLy?:number, daGhi?:boolean, boQua?:string}>}
 *   Không bao giờ ném lỗi. Gọi xong không bắt buộc phải xem kết quả.
 */
export async function baoBanTaiQuan(b) {
  const ma = cauHinhTem().ma;
  // Chưa dán mã thiết bị thì thôi, im lặng. Chủ quán chưa bật tính năng tem
  // cũng là chưa bật cái này — không phải lỗi để mà kêu.
  if (!ma) return { ok: false, boQua: 'chưa có mã thiết bị' };

  const items = (b?.items ?? [])
    .filter((i) => i?.stt != null && i.stt !== '')
    .map((i) => ({ stt: i.stt, qty: Number(i.qty) || 0 }));
  if (!items.length) return { ok: false, boQua: 'không có dòng nào có mã món' };

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-thiet-bi': ma },
      body: JSON.stringify({ ma: b.code, items }),
    });
    if (!res.ok) {
      console.warn('[tk-quan] máy chủ trả', res.status);
      return { ok: false, boQua: 'HTTP ' + res.status };
    }
    return await res.json();
  } catch (e) {
    // Mất mạng là chuyện thường ở quán. Ghi console cho người sửa, không dựng
    // gì lên màn hình của thu ngân.
    console.warn('[tk-quan] không gửi được:', e?.message ?? e);
    return { ok: false, boQua: 'mất mạng' };
  }
}
