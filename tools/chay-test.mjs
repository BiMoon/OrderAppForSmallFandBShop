/**
 * chay-test.mjs — chạy bộ test với múi giờ của quán, trên MỌI hệ điều hành
 *
 * ── Vì sao cần một tệp riêng cho việc này ───────────────────────────────────
 *
 * Trước đây script là:
 *
 *     "test": "TZ=Asia/Ho_Chi_Minh node --test \"test/*.test.mjs\""
 *
 * Cú pháp `BIEN=giatri lenh` là của shell dòng Unix. `cmd.exe` và PowerShell
 * không hiểu, và trên Windows lệnh đó chết ngay với "'TZ' is not recognized".
 * Tức là toàn bộ bộ test không chạy được trên Windows — không phải đỏ, mà là
 * không khởi động nổi.
 *
 * Vẫn phải cắm múi giờ, không bỏ đi được: `phien.js` cắt ngày kinh doanh lúc
 * 4 giờ sáng theo GIỜ MÁY, nên test chạy ở UTC sẽ cho kết quả khác test chạy ở
 * Việt Nam. Bỏ TZ ra là bộ test đúng trên máy này và sai trên máy khác.
 *
 * Có thể thêm gói `cross-env`, nhưng repo này cố ý không có dependency runtime
 * nào. Mười dòng Node thay được, và không ai phải `npm install` để chạy test.
 */

import { spawnSync } from 'node:child_process';

const MAU = process.argv.slice(2);
const kq = spawnSync(
  process.execPath,
  ['--test', ...(MAU.length ? MAU : ['test/*.test.mjs'])],
  {
    stdio: 'inherit',
    // Giờ của quán, không phải giờ của máy đang chạy test.
    env: { ...process.env, TZ: 'Asia/Ho_Chi_Minh' },
  },
);

// `spawnSync` trả `status: null` khi tiến trình bị tín hiệu giết. Coi đó là
// hỏng, đừng coi là xong — trả 0 ở đây là CI báo xanh cho một lượt chạy đứt.
process.exit(kq.status ?? 1);
