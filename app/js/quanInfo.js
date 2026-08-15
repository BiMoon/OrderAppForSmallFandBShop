/* ==========================================================================
   quanInfo.js — thông tin quán, MỘT nguồn duy nhất

   Mấy thứ dưới đây gần như không bao giờ đổi, nên chúng là HẰNG SỐ trong repo
   chứ không phải cài đặt trong localStorage.

   Vì sao không để trong màn Cài đặt như `tenQuan`/`diaChi`: cài đặt máy in lưu
   theo TỪNG MÁY. Năm trường liên hệ nhân với ba máy ở quầy là mười lăm lần gõ
   tay, và gõ sai một chỗ thì đúng một cái máy in ra số Zalo sai — không ai
   phát hiện, vì hoá đơn ở ba máy trông giống hệt nhau. Đổi thông tin thì sửa
   file này, deploy, cả ba máy đúng cùng lúc.

   Bên repo website có `lib/quanInfo.mjs` giữ cùng mấy giá trị này. Hai repo
   tách nhau nên không import chéo được — sửa một bên thì sửa cả bên kia.
   ========================================================================== */

export const QUAN = {
  // Tên khách nhớ. In cỡ gấp đôi, đứng một mình trên đầu tờ giấy.
  ten: 'GHÉ CẬU HAI',
  slogan: 'Góc nhỏ món ngon',

  /* ── Pháp nhân ────────────────────────────────────────────────────────────
     Tên đăng ký kinh doanh, KHÁC tên thương hiệu. In nhỏ, nằm cùng khối với
     địa chỉ — đó là khối mà người của cơ quan thuế đọc: bán hàng là ai, ở đâu.
     Thiếu nó thì tờ giấy có số tiền mà không có người bán.

     Cố ý KHÔNG viết tắt thành "HKD": chỗ này để tránh phiền hà, mà viết tắt
     thì lại phải giải thích. 26 ký tự, vừa cả khổ 58mm (32 cột). */
  phapNhan: 'Hộ Kinh Doanh Cậu Hai Long',

  /* Mã số thuế. ĐỂ TRỐNG cho tới khi có số thật — in một mã số sai còn tệ hơn
     hẳn không in gì, vì nó biến một thiếu sót thành một lời khai không đúng.
     Điền vào đây là tự khắc hiện trên phiếu, không phải sửa chỗ nào khác. */
  maSoThue: '',

  diaChi: '371/3 Trường Chinh, P. Tân Bình, TP.HCM',

  // Dạng người đọc. Máy in nhiệt không bấm được nên không cần dạng `tel:`.
  dienThoai: '0707 621 318',
  zalo: '0707 621 318',

  // Bỏ `https://` khi in: khách không gõ lại, họ quét mã. Hai chữ đó chỉ tốn
  // chỗ trên một dòng vốn đã chật.
  web: 'ghecauhai.vn',
  webDayDu: 'https://ghecauhai.vn',

  // Khách hỏi wifi nhiều hơn hỏi bất cứ thứ gì khác ở một quán cà phê.
  wifi: 'ghecauhai',
  wifiMatKhau: 'gocnhomonngon',
};

/**
 * Mã QR dẫn tới trang đặt món, nhúng thẳng vào mã nguồn.
 *
 * Cố ý KHÔNG gọi dịch vụ sinh QR ngoài như mã VietQR: link này không bao giờ
 * đổi, nên sinh một lần rồi đóng vào đây là xong. Đổi lại được hai thứ — in
 * được cả khi quán rớt mạng, và không thêm một điểm chết đơn lẻ nào nữa vào
 * đường in.
 *
 * 29 module (phiên bản 2, sửa lỗi mức M), 305 byte PNG. Sinh lại khi đổi tên
 * miền — xem `tools/sinh-qr.mjs`.
 */
export const QR_DAT_ONLINE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAOgAAADoAQAAAADN0pXVAAAA+ElEQVR42u2YOxLEMAxCeTu5/5XZQpLtNNsvSTKTnyuChMBYP46P3tX/XpWHYEtyn7OUh/dqpEIy8zJfMvGKBdOY40t0tRfS8P699iOmKI7Ha001ixIwP0Gf/QB95uY32NQG87spbm77nsovS53dg4ju6tT+tTydvJrYwf6qzZWxSqSb4ki8XkWNRU9gh/rJgojHQQ/W+gmhfhIJpo1l6p3YeaQzF42/cuo8wuWdexgx4cGxelWVfKZfgvMC2z/3YMKt2tn7GxJLoKPzYEPkSA11zd7N21nfsfn33M/pdGhZQHA9+wzA3nuVoXg527ZJxrH+OViR3tUvBlWPmnCzhTwAAAAASUVORK5CYII=';
