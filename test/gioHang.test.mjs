import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TUY_CHON_NHANH, chuanHoaMoTa, khoaGop, themVaoGio, suaMoTa, moTaMon, coMoTa,
} from '../app/js/gioHang.js';

const mon = (o = {}) => ({ stt: 2, name: 'Trà đào', table: 3, price: 30000, ...o });

/* ══════════════════ chuẩn hoá ══════════════════ */

test('bỏ dấu cách thừa, cắt độ dài, không để undefined lọt xuống RTDB', () => {
  assert.deepEqual(chuanHoaMoTa({ tuyChon: '  Ít   đá ', ghiChu: '\nlấy ống hút to\n' }),
    { tuyChon: 'Ít đá', ghiChu: 'lấy ống hút to' });
  assert.deepEqual(chuanHoaMoTa(undefined), { tuyChon: '', ghiChu: '' });
  assert.equal(chuanHoaMoTa({ ghiChu: 'x'.repeat(500) }).ghiChu.length, 200);
});

/* ══════════════════ LỖI GỐC: gộp nhầm hai ly khác nhau ══════════════════ */

test('cùng món cùng bàn nhưng KHÁC ghi chú thì KHÔNG gộp', () => {
  let g = themVaoGio([], mon(), 2, 1, '09:00');
  g = themVaoGio(g.cart, mon({ ghiChu: 'ít đường' }), 1, g.idKe, '09:01');

  assert.equal(g.cart.length, 2,
    'gộp lại là quầy pha ra hai ly giống hệt nhau, mất ghi chú của khách');
  assert.deepEqual(g.cart.map((o) => o.qty), [2, 1]);
});

test('giống hệt nhau thì gộp, không đẻ dòng thừa', () => {
  let g = themVaoGio([], mon({ tuyChon: 'Ít đá' }), 1, 1, '09:00');
  g = themVaoGio(g.cart, mon({ tuyChon: 'Ít đá' }), 2, g.idKe, '09:02');
  assert.equal(g.cart.length, 1);
  assert.equal(g.cart[0].qty, 3);
  assert.equal(g.cart[0].time, '09:02', 'giờ lấy lần thêm gần nhất');
});

test('"ít đường" và "Ít đường " là một — đừng tách ra cho dài phiếu', () => {
  let g = themVaoGio([], mon({ ghiChu: 'ít đường' }), 1, 1);
  g = themVaoGio(g.cart, mon({ ghiChu: '  Ít đường ' }), 1, g.idKe);
  assert.equal(g.cart.length, 1);
  assert.equal(g.cart[0].qty, 2);
});

test('khác bàn thì không gộp, kể cả cùng món cùng ghi chú', () => {
  let g = themVaoGio([], mon({ table: 3 }), 1, 1);
  g = themVaoGio(g.cart, mon({ table: 5 }), 1, g.idKe);
  assert.equal(g.cart.length, 2);
});

test('khác món thì không gộp', () => {
  let g = themVaoGio([], mon({ stt: 2 }), 1, 1);
  g = themVaoGio(g.cart, mon({ stt: 7, name: 'Espresso' }), 1, g.idKe);
  assert.equal(g.cart.length, 2);
});

test('tuỳ chọn và ghi chú là hai chuyện, không lẫn vào nhau', () => {
  const a = khoaGop(mon({ tuyChon: 'Ít đá', ghiChu: '' }));
  const b = khoaGop(mon({ tuyChon: '', ghiChu: 'Ít đá' }));
  assert.notEqual(a, b);
});

/* ══════════════════ thêm vào giỏ ══════════════════ */

test('dòng mới luôn có đủ trường, không có undefined', () => {
  const { cart } = themVaoGio([], mon(), 1, 9, '10:30');
  assert.deepEqual(cart[0], {
    id: 9, stt: 2, name: 'Trà đào', qty: 1, table: 3, price: 30000,
    tuyChon: '', ghiChu: '', time: '10:30',
  });
});

test('id chỉ tăng khi thật sự thêm dòng mới', () => {
  const a = themVaoGio([], mon(), 1, 1);
  assert.equal(a.idKe, 2);
  const b = themVaoGio(a.cart, mon(), 1, a.idKe);
  assert.equal(b.idKe, 2, 'gộp thì không tiêu id');
  assert.equal(b.gopVao, 1);
});

test('không sửa giỏ cũ tại chỗ', () => {
  const cu = [];
  const g = themVaoGio(cu, mon(), 1, 1);
  assert.equal(cu.length, 0);
  assert.notEqual(g.cart, cu);
});

test('số lượng rác vẫn ra ít nhất 1 ly', () => {
  assert.equal(themVaoGio([], mon(), 0, 1).cart[0].qty, 1);
  assert.equal(themVaoGio([], mon(), -5, 1).cart[0].qty, 1);
  assert.equal(themVaoGio([], mon(), 'hai', 1).cart[0].qty, 1);
});

/* ══════════════════ sửa mô tả ══════════════════ */

test('sửa ghi chú của một dòng', () => {
  const { cart } = themVaoGio([], mon(), 2, 1);
  const sau = suaMoTa(cart, 1, { tuyChon: 'Ít đá', ghiChu: 'ống hút to' });
  assert.equal(sau[0].tuyChon, 'Ít đá');
  assert.equal(sau[0].ghiChu, 'ống hút to');
  assert.equal(sau[0].qty, 2, 'sửa ghi chú không đụng số lượng');
});

test('sửa thành GIỐNG HỆT một dòng khác thì gộp lại', () => {
  let g = themVaoGio([], mon({ ghiChu: 'ít đường' }), 1, 1);
  g = themVaoGio(g.cart, mon(), 2, g.idKe);
  assert.equal(g.cart.length, 2);

  // Thu ngân nhận ra ghi nhầm, xoá ghi chú của dòng đầu.
  const sau = suaMoTa(g.cart, 1, { tuyChon: '', ghiChu: '' });
  assert.equal(sau.length, 1, 'hai dòng y hệt nhau thì quầy pha đọc thành hai lần');
  assert.equal(sau[0].qty, 3);
});

test('sửa dòng không tồn tại thì trả giỏ y nguyên', () => {
  const { cart } = themVaoGio([], mon(), 1, 1);
  assert.equal(suaMoTa(cart, 999, { ghiChu: 'x' }), cart);
});

/* ══════════════════ mô tả để hiện ══════════════════ */

test('ghép tuỳ chọn và ghi chú thành một dòng đọc được', () => {
  assert.equal(moTaMon({ tuyChon: 'Ít đá, Ít đường', ghiChu: 'ống hút to' }),
    'Ít đá, Ít đường · ống hút to');
  assert.equal(moTaMon({ tuyChon: 'Ít đá' }), 'Ít đá');
  assert.equal(moTaMon({ ghiChu: 'ống hút to' }), 'ống hút to');
  assert.equal(moTaMon({}), '');
  assert.equal(coMoTa({}), false);
  assert.equal(coMoTa({ ghiChu: 'x' }), true);
});

test('danh sách tuỳ chọn nhanh phủ mấy câu khách hay nói', () => {
  for (const c of ['Ít đá', 'Không đá', 'Ít đường', 'Không đường', 'Nóng']) {
    assert.ok(TUY_CHON_NHANH.includes(c), `thiếu "${c}"`);
  }
});
