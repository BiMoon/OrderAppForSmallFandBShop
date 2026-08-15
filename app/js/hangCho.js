/* ==========================================================================
   hangCho.js — chờ máy chủ, nhưng đừng chờ mãi

   ── Vấn đề nó giải ──────────────────────────────────────────────────────────

   Firebase Realtime Database ghi dữ liệu vào hàng đợi CỤC BỘ ngay lập tức rồi
   đẩy lên khi có mạng — nhưng promise của `push()` chỉ resolve khi MÁY CHỦ xác
   nhận. Hai chuyện đó cách nhau vô hạn nếu wifi quán chập.

   Hậu quả ở quầy: thu ngân bấm "Gửi đơn", nút đổi thành "⏳ Đang gửi…" rồi kẹt
   ở đó vĩnh viễn. Giỏ không xoá. Người đứng quầy thấy đơn chưa đi, bấm lại —
   và khi mạng về, **hai đơn cùng lúc** rơi xuống quầy pha.

   Cùng chuyện đó ở màn pha chế: phiếu kẹt "⏳ Đang lưu…" vì `remove()` chưa
   chạy, người pha tưởng máy treo.

   ── Cách giải ───────────────────────────────────────────────────────────────

   Chờ có hạn. Trong hạn mà máy chủ trả lời thì báo "đã gửi". Quá hạn thì tin
   vào hàng đợi của Firebase, giải phóng giao diện, và nói THẬT với người dùng
   là đơn đang xếp hàng — chứ không giả vờ đã xong.

   Không dùng `navigator.onLine` để đoán: nó chỉ biết máy có cắm mạng hay
   không, không biết mạng đó có ra tới Firebase không. Wifi quán có sóng mà
   modem rớt là đúng cái ca này, và `onLine` vẫn báo true.
   ========================================================================== */

/** Chờ máy chủ tối đa bao lâu trước khi tin vào hàng đợi cục bộ. */
export const HAN_CHO = 3000;

/**
 * Chờ một lệnh ghi, nhưng bỏ chờ sau `han` mili giây.
 *
 * @param {Promise} viec   promise của lệnh ghi (push/set/remove…)
 * @param {number}  [han]  hạn chờ, mili giây
 * @returns {Promise<'xong'|'xepHang'>}
 *   `'xong'`    — máy chủ đã xác nhận.
 *   `'xepHang'` — chưa xác nhận kịp; dữ liệu nằm trong hàng đợi của Firebase và
 *                 sẽ tự đẩy lên khi có mạng.
 * @throws lỗi thật của `viec`, **chỉ khi** nó hỏng trước lúc hết hạn. Hỏng sau
 *   đó thì không còn ai đợi để mà báo.
 */
export function choMayChu(viec, han = HAN_CHO) {
  let xong = false;
  const p = Promise.resolve(viec).then(
    (v) => { xong = true; return v; },
    (e) => { xong = true; throw e; },
  );
  // Lỗi về SAU khi đã báo "xếp hàng" thì không còn ai bắt. Nuốt tại đây, nếu
  // không trình duyệt dựng cờ unhandledrejection cho một chuyện bình thường.
  p.catch(() => {});

  return new Promise((ok, hong) => {
    const dongHo = setTimeout(() => { if (!xong) ok('xepHang'); }, Math.max(0, han));
    p.then(
      () => { clearTimeout(dongHo); ok('xong'); },
      (e) => { clearTimeout(dongHo); hong(e); },
    );
  });
}

/**
 * Câu báo cho người đứng quầy.
 *
 * Cố ý KHÔNG nói "đã gửi" cho ca xếp hàng. Nói dối ở đây thì lúc mạng về, đơn
 * rơi xuống quầy muộn vài phút và không ai hiểu vì sao.
 */
export const loiBao = (kq, xong, xepHang) =>
  kq === 'xong' ? { msg: xong, kind: 'ok' } : { msg: xepHang, kind: 'warn' };
