import test from 'node:test';
import assert from 'node:assert/strict';

import { choMayChu, loiBao, HAN_CHO } from '../app/js/hangCho.js';

const treo = () => new Promise(() => {});                       // không bao giờ xong
const cham = (ms, v) => new Promise((ok) => setTimeout(() => ok(v), ms));
const hongSau = (ms) => new Promise((_, no) => setTimeout(() => no(new Error('rớt')), ms));

test('máy chủ trả lời trong hạn -> "xong"', async () => {
  assert.equal(await choMayChu(cham(5, 'ok'), 200), 'xong');
});

test('máy chủ im quá hạn -> "xepHang", KHÔNG treo mãi', async () => {
  assert.equal(await choMayChu(treo(), 20), 'xepHang',
    'chờ mãi thì nút kẹt, thu ngân bấm lại, và mạng về là hai đơn cùng rơi xuống quầy');
});

test('lỗi TRƯỚC hạn thì ném ra để giao diện báo đỏ', async () => {
  await assert.rejects(() => choMayChu(hongSau(5), 200), /rớt/);
});

test('lỗi SAU khi đã báo xếp hàng thì im, không làm sập gì', async () => {
  const kq = await choMayChu(hongSau(40), 10);
  assert.equal(kq, 'xepHang');
  await new Promise((r) => setTimeout(r, 60));   // để lỗi kịp nổ ra
});

test('hạn 0 thì xếp hàng ngay, không chờ một nhịp nào', async () => {
  assert.equal(await choMayChu(treo(), 0), 'xepHang');
  assert.equal(await choMayChu(-5 && treo(), 0), 'xepHang');
});

test('nhận cả giá trị thường, không riêng promise', async () => {
  assert.equal(await choMayChu(42, 50), 'xong');
});

test('hạn mặc định đủ dài cho mạng bình thường, đủ ngắn để không ai đứng chờ', () => {
  assert.ok(HAN_CHO >= 1000 && HAN_CHO <= 5000, `HAN_CHO = ${HAN_CHO}`);
});

test('câu báo nói THẬT là đang xếp hàng, không giả vờ đã gửi', () => {
  assert.deepEqual(loiBao('xong', 'Đã gửi', 'Đang xếp hàng'), { msg: 'Đã gửi', kind: 'ok' });
  const q = loiBao('xepHang', 'Đã gửi', 'Đang xếp hàng');
  assert.equal(q.msg, 'Đang xếp hàng');
  assert.equal(q.kind, 'warn', 'không phải "ok" — chưa lên máy chủ thì chưa xong');
});
