import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

/**
 * Danh sách file trong service worker viết tay, nên nó sẽ lệch.
 *
 * Thiếu một module trong SHELL_FILES thì app vẫn chạy khi online — trình duyệt
 * lặng lẽ rơi xuống mạng — rồi chết câm lúc mất sóng. Đúng kiểu lỗi chỉ lộ ra ở
 * quán vào giờ wifi chập, và không ai nối được nó với commit đã gây ra.
 *
 * (Repo ghecauhai-website đã mất một buổi vì đúng chuyện này: `copy-public.mjs`
 * chép theo danh sách viết tay, thiếu `so.mjs`, trang chủ chết ngay lúc nạp.)
 */
test('mọi module trong app/js đều nằm trong SHELL_FILES của service worker', () => {
  const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
  const trongSW = new Set([...sw.matchAll(/'\.\/js\/([\w.-]+\.js)'/g)].map(m => m[1]));
  const tren0 = readdirSync(new URL('../app/js', import.meta.url)).filter(f => f.endsWith('.js'));

  const thieu = tren0.filter(f => !trongSW.has(f));
  assert.deepEqual(thieu, [], `thiếu trong sw.js: ${thieu.join(', ')} — thêm vào SHELL_FILES rồi tăng VERSION`);

  const thua = [...trongSW].filter(f => !tren0.includes(f));
  assert.deepEqual(thua, [], `sw.js kể tên file không còn tồn tại: ${thua.join(', ')} — cache sẽ hỏng cả lượt cài`);
});

test('đổi danh sách cache thì phải tăng VERSION, kẻo máy cũ giữ bản cũ mãi', () => {
  const sw = readFileSync(new URL('../app/sw.js', import.meta.url), 'utf8');
  const v = sw.match(/const VERSION\s*=\s*'([^']+)'/)?.[1];
  assert.match(v ?? '', /^v\d+\.\d+\.\d+$/, 'VERSION phải dạng vX.Y.Z');
});
