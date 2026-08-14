# Ứng dụng mobile "Quản Lý Pha Chế" (PWA)

Bản mobile nằm trong thư mục `app/`. Nó **dùng chung Firebase** với bản web hiện tại,
nên hai bản chạy song song: thu ngân dùng điện thoại, quầy dùng máy tính — dữ liệu vẫn khớp.

---

## 1. Đưa lên mạng (một lần duy nhất)

PWA **bắt buộc phải chạy trên HTTPS** mới cài được lên máy. Dùng luôn Firebase Hosting
của dự án `quanlyphachequan`:

```bash
# cài công cụ (chỉ lần đầu)
npm install -g firebase-tools

# đăng nhập bằng Google có quyền trên dự án
firebase login

# chạy trong thư mục Order (nơi có firebase.json)
cd ~/Downloads/Order
firebase deploy --only hosting
```

Sau khi xong, terminal in ra địa chỉ dạng:

```
Hosting URL: https://quanlyphachequan.web.app
```

| Địa chỉ | Dùng cho |
|---|---|
| `https://quanlyphachequan.web.app/app/` | **Ứng dụng mobile** (cài lên điện thoại) |
| `https://quanlyphachequan.web.app/order.html` | Bản web cũ — vẫn hoạt động bình thường |
| `https://quanlyphachequan.web.app/observeOrder.html` | Màn hình quầy pha chế trên máy tính |
| `https://quanlyphachequan.web.app/summary.html` | Thống kê trên máy tính |

Muốn xem thử trước khi deploy thật:

```bash
firebase emulators:start --only hosting
# rồi mở http://localhost:5000/app/  (localhost cũng cài được PWA)
```

---

## 2. Cài lên điện thoại Android

1. Mở **Chrome** trên điện thoại → vào `https://quanlyphachequan.web.app/app/`
2. App sẽ hiện dải **"Cài lên máy như một app"** → bấm **Cài đặt**.
   Nếu không thấy: menu **⋮** của Chrome → **Thêm vào Màn hình chính**.
3. Xong. Trên màn hình chính có icon ☕ **Pha Chế**, mở ra là toàn màn hình,
   không còn thanh địa chỉ của trình duyệt.

Nhấn giữ icon còn có lối đi nhanh vào **Quầy pha chế**, **Đặt món**, **Thống kê**.

> iPhone cũng cài được: Safari → nút Chia sẻ → **Thêm vào MH chính**.

---

## 3. Cách dùng

Lần đầu mở, app hỏi **bạn làm ở vị trí nào** — chọn một lần rồi nhớ luôn:

| Vai trò | Mở vào màn hình | Việc chính |
|---|---|---|
| 🧾 Thu ngân | Đặt món | Chọn bàn → nhập mã/chọn thực đơn → gửi đơn → xin hủy khi cần |
| ☕ Quầy pha chế | Quầy pha chế | Xem món đang chờ, bấm Hoàn thành, duyệt/từ chối yêu cầu hủy |
| 🥄 Sơ chế | Sơ chế | Công thức, nhân mẻ, hẹn giờ, nhãn dán HSD |
| 📊 Quản lý | Thống kê | Doanh thu theo ngày/tháng/năm, món bán chạy, món bị hủy |

Đổi vai trò bất cứ lúc nào: thanh dưới, hoặc **⋯ → Vai trò hiện tại → Đổi**.

**Vài điểm đáng lưu ý**

- **Âm báo** phải bật bằng tay lần đầu (nút 🔔 trên thanh trên) — Android chặn
  tự phát âm thanh khi chưa có tương tác. Đơn mới kêu 2 tiếng cao; xin hủy kêu 3 tiếng trầm.
- **Giữ màn hình sáng**: bật tự động cho vai trò Quầy pha chế. Tắt/bật ở **⋯ → Màn hình**.
- **Mất mạng**: app vẫn mở được, vẫn xem được thực đơn và công thức (đã lưu sẵn).
  Đơn gửi lúc mất mạng được Firebase xếp hàng và **tự gửi lại khi có mạng**.
- **Giỏ hàng chưa gửi** được lưu trên máy — đóng app mở lại vẫn còn.

---

## 4. Cập nhật app về sau

Sửa file trong `app/` rồi:

```bash
cd ~/Downloads/Order
firebase deploy --only hosting
```

Điện thoại sẽ hiện dải **"Đã có bản cập nhật mới → Tải lại"** ở lần mở kế tiếp.

Nếu sửa file trong `app/js/` hoặc `app/app.css`, **nhớ tăng số phiên bản** ở đầu
`app/sw.js` để service worker nạp lại bản mới:

```js
const VERSION = 'v1.0.1';   // đổi mỗi lần phát hành
```

---

## 5. Quyền Firebase cần có

App đọc/ghi các nhánh sau — kiểm tra Rules trong Firebase Console:

| Nhánh | Đọc | Ghi | Ai dùng |
|---|---|---|---|
| `orders` | ✔ | ✔ | Thu ngân gửi đơn, xin hủy; quầy xóa khi xong |
| `history` | ✔ | ✔ | Quầy ghi khi Hoàn thành; Thống kê đọc |
| `cancelled` | ✔ | ✔ | Quầy ghi khi đồng ý hủy; Thống kê đọc |

Thiếu quyền thì app hiện thông báo đỏ chứ không lặng lẽ bỏ qua.

---

## 6. Muốn có file .apk thật (tùy chọn)

PWA đã cài được như app nhưng **không có mặt trên Play Store**. Nếu cần file `.apk`:

```bash
npm install -g @bubblewrap/cli
bubblewrap init --manifest https://quanlyphachequan.web.app/app/manifest.webmanifest
bubblewrap build
```

Cần cài **JDK 17** và **Android SDK**. Kết quả là `app-release-signed.apk`
(Trusted Web Activity — vỏ Android bọc chính PWA này, không phải viết lại app).
