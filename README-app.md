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

## 4.1. Xuất CSV và sổ S1a-HKD trong tab Thống kê

### Cách xuất

1. Mở `https://quanlyphachequan.web.app/app/` và đăng nhập.
2. Chọn tab **Thống kê**.
3. Chọn đúng kỳ cần xem: **Ngày**, **Tháng**, **Năm**, **Khoảng** hoặc **Tất cả**.
4. Chờ biểu ngữ tải dữ liệu biến mất và kiểm tra doanh thu trên màn hình.
5. Bấm một trong hai nút:
    - **Xuất CSV doanh thu theo món**: tổng hợp theo món, có doanh thu niêm yết,
       giảm giá, thực thu, phương thức thanh toán và món bị hủy.
    - **Xuất sổ S1a-HKD (nộp thuế)**: mỗi hóa đơn là một chứng từ, có cộng tháng,
       cộng quý và tổng cộng.

Trên Android, nếu hệ điều hành cho phép chia sẻ tệp, app sẽ mở bảng **Chia sẻ**.
Nếu không, file được tải vào thư mục **Downloads**. Tên file có dạng:

```text
doanhthu-2026-09-01_2026-09-30.csv
so-S1a-HKD-2026-09-01_2026-09-30.csv
```

### Điều kiện để số liệu đúng

- Sổ S1a chỉ ghi hóa đơn có trạng thái **đã thanh toán**.
- Doanh thu lấy từ `total`, tức số sau giảm giá, không lấy tiền khách đưa và tiền
   thối.
- Ngày chứng từ lấy theo lúc thu tiền (`paidAt`), sau đó mới lọc vào kỳ báo cáo.
- Hóa đơn tạo gần nửa đêm được tải rộng hơn một ngày để nối dữ liệu, nhưng khi
   xuất S1a vẫn được lọc lại theo ngày thu tiền thực tế.
- S1a chỉ gồm doanh thu bán tại quán từ hóa đơn `QCH...`. Đơn online `GCH...` nằm
   ở hệ thống khác và phải cộng thêm trước khi nộp.
- Hóa đơn đã thanh toán nhưng thiếu mốc thời gian sẽ được báo trong file, không
   âm thầm bỏ qua.

### Nếu bấm nút không thấy gì

1. Chọn lại tab **Thống kê**, chọn kỳ cụ thể, rồi chờ tải xong.
2. Kiểm tra biểu ngữ cảnh báo: nếu còn dòng **Đang tải hóa đơn của kỳ này**, chờ
    rồi bấm lại.
3. Kiểm tra thư mục **Downloads** hoặc bảng chia sẻ của điện thoại. File có đuôi
    `.csv`, không mở trực tiếp trong app.
4. Nếu app đã được cài như PWA, đóng hẳn app rồi mở lại. Khi thấy dải **Đã có bản
    cập nhật mới**, bấm **Tải lại**.
5. Nếu vẫn lỗi, mở app bằng Chrome tại `/app/`, không mở shortcut cũ; hoặc vào
    Chrome → Cài đặt trang web → Xóa dữ liệu trang, rồi đăng nhập lại.

### Kiểm tra sau khi xuất

Mở file bằng Excel hoặc Google Sheets và đối chiếu:

- `Số chứng từ` với số hóa đơn đã thanh toán trong kỳ.
- `TỔNG CỘNG` với doanh thu thực thu trên màn hình.
- Sổ S1a có dòng cảnh báo **chỉ gồm doanh thu BÁN TẠI QUÁN**.
- File S1a có tên mẫu, năm, mã số thuế, địa chỉ và chỗ ký tên.

Nếu hai tổng không khớp, không nộp ngay. Kiểm tra trước hóa đơn bị treo, hóa đơn
thiếu `paidAt`, hóa đơn đã xóa và các đơn online chưa cộng vào sổ.

### Kiểm thử và phát hành bản sửa

```bash
node --test test/soS1a.test.mjs test/sw.test.mjs
firebase deploy --only hosting
```

Sau mỗi thay đổi trong `app/js/` hoặc `app/app.css`, phải tăng `VERSION` trong
`app/sw.js`; nếu không, PWA có thể tiếp tục chạy file cũ từ cache.

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

---

## 7. Thanh toán tại quán (VietQR + SePay)

Thu ngân bấm tab **💳 Hóa đơn → Tạo hóa đơn**, chọn bàn, chọn % khuyến mãi nếu
có. App sinh một mã dạng **`QCH2608140001`**, vẽ mã QR VietQR mang đúng số tiền
và **lấy chính mã đó làm nội dung chuyển khoản**. Khách quét, chuyển tiền, và
hóa đơn **tự nhảy sang "Đã thanh toán"** — không ai phải bấm gì.

### Phiên bàn — đừng bỏ qua phần này

Một bàn quay 6–8 lượt khách mỗi ngày. Hóa đơn **chỉ gom món phát sinh sau lần
thanh toán gần nhất của bàn đó**, nên lượt khách thứ hai không bị tính lại tiền
của lượt thứ nhất. Cơ chế nằm ở `app/js/phien.js`, có test riêng:

```bash
npm test
```

Trạng thái bàn hiện thành vạch màu dưới mỗi nút bàn, và **suy ra từ hóa đơn**
chứ không lưu cờ nào:

| Vạch | Nghĩa |
|---|---|
| (không có) | Bàn trống |
| xanh ngọc | Đang phục vụ — có món chưa tính tiền |
| cam | Chờ trả tiền — đã tạo hóa đơn |
| xanh lá | Đã trả — giữ nhãn tới khi có khách mới gọi món |

Quầy pha chế cũng thấy nhãn **✅ Đã trả** / **⏳ Chờ trả** ngay trên phiếu.

### Hai app, một tài khoản ngân hàng

App đặt món online (`ghecauhai.netlify.app`) và app này đổ tiền vào **cùng một
tài khoản ACB**, nên SePay bắn cả hai về **cùng một webhook**. Phân biệt bằng
tiền tố mã:

| Mã | Của ai | Ghi vào |
|---|---|---|
| `GCH…` | khách đặt online | Firestore `orders` |
| `QCH…` | khách ngồi tại quán | RTDB `bills` |

Định dạng mã ở `app/js/core.js` (`taoMaHoaDon`) **phải khớp** với
`lib/maHoaDon.mjs` bên repo `ghecauhai-website`. Đổi một bên là tiền không khớp
được vào hóa đơn nào và nằm chờ đối soát tay.

**Đừng dựng webhook thứ hai.** Hai chỗ chống trùng giao dịch là có ngày cộng
tiền hai lần.

### Cần cấu hình gì trước khi chạy thật

1. **Bên repo `ghecauhai-website`** — Netlify → Environment variables, thêm:
   ```
   FIREBASE_DATABASE_URL = https://quanlyphachequan-default-rtdb.asia-southeast1.firebasedatabase.app
   ```
   (`SHOP_BANK_ID`, `SHOP_ACCOUNT_NO`, `SHOP_ACCOUNT_NAME` đã có sẵn.)
   Rồi `npm run deploy`.

2. **Rules Realtime Database** — thêm nhánh `bills` và `counters`.
   Xem `database.rules.mau.json`; **đối chiếu với bản đang có trong Console rồi
   thêm vào**, đừng deploy đè.

3. Deploy app này: `firebase deploy --only hosting`.

Số tài khoản **không** chép tay vào `core.js` — app hỏi
`https://ghecauhai.netlify.app/api/cau-hinh-quan` một lần rồi nhớ vào máy. Chưa
lấy được thì app nói rõ chứ không vẽ một mã QR hỏng.

### Khi webhook không chạy

Vẫn còn hai nút bấm tay trên mỗi hóa đơn: **💵 Tiền mặt** và **🏦 Chuyển khoản**.
Hóa đơn ghi lại ai chốt (`paidBy`: `sepay` hay `nguoi`) và trả bằng gì
(`payMethod`), nên cuối tháng đối soát được và biết webhook có thật sự chạy hay
thu ngân vẫn phải bấm tay.

### Kiểm tra

```bash
npm test                              # logic phiên bàn
node test/kiem-man-thanh-toan.mjs     # cả màn hình, bằng trình duyệt thật
```

Bài thứ hai thay Firebase bằng bản giả nạp qua `page.route`, nên chạy được offline
và dựng màn hình bằng **chính** `pos.js`/`core.js` đang chạy thật.

---

## 8. Ba trang máy tính và cổng đăng nhập

`order.html`, `observeOrder.html`, `summary.html` chạy trên máy tính ở quầy
(PWA không có bố cục màn hình lớn — `app.css` chỉ có media query cho chế độ
tối, nên ba trang này vẫn có việc thật).

**Chúng chỉ import `firebase-app.js` và `firebase-database.js`, không import
`firebase-auth.js`.** Phiên đăng nhập vẫn nằm trong IndexedDB của trình duyệt
(Firebase Auth lưu theo origin, sống qua mọi lần chuyển trang) — nhưng không có
gì trên ba trang đó đọc nó ra. `getDatabase(app)` lấy token qua component
`auth-internal`, mà component ấy **chỉ được đăng ký khi module auth được nạp
trên chính trang đó**. Không nạp thì Database mở kết nối trắng, rules từ chối,
và trang đứng im không báo gì.

PWA `/app/index.html` không dính vì cả bốn màn hình của nó là **một trang duy
nhất**, điều hướng bằng `#/pos`, `#/kds`, `#/prep`, `#/report` — nạp auth đúng
một lần nên thanh trên chỗ nào cũng thấy tài khoản.

Bản vá là `auth-guard.js`, gắn bằng đúng một dòng cuối `<body>` mỗi trang:

```html
<script type="module" src="./auth-guard.js"></script>
```

Nó gọi `getAuth(app)` trên cùng FirebaseApp mà trang đã khởi tạo — chỉ vậy là
Database có chỗ lấy token, tự gắn vào kết nối đang mở và chạy lại listener.
Kèm theo: huy hiệu tài khoản ở góc dưới phải (có nút Thoát), và nếu chưa đăng
nhập thì đá về `index.html?tiep=<đường quay lại>`.

`index.html` đọc `?tiep=` để trả người dùng về **đúng trang máy tính** họ đang
mở, thay vì đẩy sang PWA điện thoại rồi bắt gõ lại địa chỉ. Chỉ nhận đường dẫn
nội bộ bắt đầu bằng một dấu `/` và không phải `//` — `//evil.com` là URL tuyệt
đối hợp lệ, nhận bừa là mở đường cho người khác dán link đăng nhập rồi hất nạn
nhân sang trang của họ.

```bash
node test/kiem-cong-dang-nhap.mjs
```

Một file dùng chung chứ không chép ba lần: ba bản chép tay của cùng một đoạn mã
là ba bản sẽ lệch nhau — dự án này đã dính đúng chuyện đó hai lần.
