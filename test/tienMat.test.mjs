import test from 'node:test';
import assert from 'node:assert/strict';

import { goiYTien, tienThoi, chiaTo, MENH_GIA } from '../app/js/tienMat.js';

/* ══════════════ tiền thối ══════════════ */

test('thối đúng phần chênh', () => {
  assert.deepEqual(tienThoi(200000, 68000), { thoi: 132000, thieu: 0, du: true });
});

test('đưa đúng thì không thối', () => {
  assert.deepEqual(tienThoi(68000, 68000), { thoi: 0, thieu: 0, du: true });
});

test('đưa thiếu thì nói ra thiếu bao nhiêu, không âm', () => {
  const { thoi, thieu, du } = tienThoi(50000, 68000);
  assert.equal(thoi, 0, 'tiền thối âm là con số vô nghĩa trên màn hình');
  assert.equal(thieu, 18000);
  assert.equal(du, false);
});

test('rác nhập vào không làm hỏng phép tính', () => {
  for (const v of [null, undefined, '', 'abc', NaN, -5]) {
    assert.equal(tienThoi(v, 10000).thieu, 10000, String(v));
  }
  assert.equal(tienThoi(10000, null).thoi, 10000);
});

/* ══════════════ gợi ý mệnh giá ══════════════ */

test('gợi ý luôn bắt đầu bằng ĐÚNG số tiền', () => {
  assert.equal(goiYTien(68000)[0], 68000, 'khách trả lẻ đủ là ca phổ biến nhất');
});

test('không gợi ý số nhỏ hơn hóa đơn', () => {
  for (const tong of [1000, 68000, 125000, 480000, 1250000]) {
    for (const v of goiYTien(tong)) assert.ok(v >= tong, `${tong} -> ${v}`);
  }
});

test('gợi ý có số tròn để khách "đưa cho tròn"', () => {
  const g = goiYTien(68000);
  assert.ok(g.includes(70000), `phải có 70.000: ${g}`);
  assert.ok(g.includes(100000), `phải có 100.000: ${g}`);
});

test('gợi ý không trùng nhau và đã sắp tăng dần', () => {
  const g = goiYTien(50000);
  assert.equal(new Set(g).size, g.length);
  assert.deepEqual(g, [...g].sort((a, b) => a - b));
});

test('dải nút không dài quá, bấm nhầm còn chậm hơn gõ tay', () => {
  assert.ok(goiYTien(12345).length <= 4);
  assert.equal(goiYTien(12345, 2).length, 2);
});

test('hóa đơn 0đ thì không gợi ý gì', () => {
  assert.deepEqual(goiYTien(0), []);
  assert.deepEqual(goiYTien(null), []);
});

/* ══════════════ đếm ra tờ ══════════════ */

test('chia tiền thối ra mệnh giá, ưu tiên tờ lớn', () => {
  assert.deepEqual(chiaTo(132000), [
    { menh: 100000, so: 1 }, { menh: 20000, so: 1 },
    { menh: 10000, so: 1 }, { menh: 2000, so: 1 },
  ]);
});

test('nhiều tờ cùng mệnh giá gộp thành một dòng', () => {
  assert.deepEqual(chiaTo(60000), [{ menh: 50000, so: 1 }, { menh: 10000, so: 1 }]);
  assert.deepEqual(chiaTo(40000), [{ menh: 20000, so: 2 }]);
});

test('cộng ngược lại đúng bằng số tiền thối', () => {
  for (const v of [0, 1000, 132000, 487000, 999000, 1234000]) {
    assert.equal(chiaTo(v).reduce((s, x) => s + x.menh * x.so, 0), v, String(v));
  }
});

test('không thối thì không có tờ nào', () => {
  assert.deepEqual(chiaTo(0), []);
  assert.deepEqual(chiaTo(-100), []);
});

test('lẻ dưới 1.000đ bị bỏ — quán không có tiền lẻ hơn thế', () => {
  assert.equal(chiaTo(1500).reduce((s, x) => s + x.menh * x.so, 0), 1000);
  assert.ok(Math.min(...MENH_GIA) === 1000);
});
