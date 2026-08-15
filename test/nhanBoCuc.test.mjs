import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TRAN_GHI_CHU, baSoCuoi, catGhiChu, boCucNhan, chuanHoaKieuIn,
} from '../app/js/nhanBoCuc.js';
import { SO_COT } from '../app/js/hoaDonBoCuc.js';

const LUC = new Date('2026-08-15T09:05:00+07:00');
const don = (o = {}) => ({
  ma: 'QCH2608150003', ten: 'Anh Long', sdt: '0901234567', kieu: 'Mang đi',
  items: [{ name: 'Trà đào cam sả', qty: 2, tuyChon: 'Ít đá, Ít đường', ghiChu: 'ống hút to' }],
  ...o,
});
const chuCua = (nhan) => nhan.filter((k) => k.kieu === 'chu').map((k) => k.chu);
const co = (nhan, m) => chuCua(nhan).some((c) => c.includes(m));

/* ══════════════════ quyền riêng tư ══════════════════ */

test('KHÔNG in đủ số điện thoại lên ly', () => {
  assert.equal(baSoCuoi('0901234567'), '***567');
  assert.equal(baSoCuoi('+84901234567'), '***567');
  assert.equal(baSoCuoi('12'), '');
  assert.equal(baSoCuoi(null), '');

  const n = boCucNhan(don(), { luc: LUC })[0];
  const het = chuCua(n).join(' ');
  assert.equal(het.includes('0901234567'), false,
    'ly ngồi trên quầy chờ lấy — in đủ số là phát số của khách cho cả quán');
  assert.ok(het.includes('***567'));
  assert.ok(het.includes('Anh Long'));
});

/* ══════════════════ một ly một nhãn ══════════════════ */

test('món ×2 ra 2 nhãn, đánh số 1/2 và 2/2', () => {
  const ds = boCucNhan(don(), { luc: LUC });
  assert.equal(ds.length, 2);
  assert.ok(co(ds[0], '1/2'));
  assert.ok(co(ds[1], '2/2'));
});

test('nhiều dòng món thì đánh số liên tục trên CẢ đơn', () => {
  const ds = boCucNhan(don({
    items: [
      { name: 'Espresso', qty: 2 },
      { name: 'Bạc xỉu', qty: 1 },
    ],
  }), { luc: LUC });
  assert.equal(ds.length, 3);
  assert.deepEqual(ds.map((n) => chuCua(n).find((c) => c.includes('/3'))?.trim().slice(-3)),
    ['1/3', '2/3', '3/3'], 'đánh số theo từng dòng thì người pha không biết bộ đã đủ chưa');
});

test('đơn không có món nào thì không ra nhãn nào', () => {
  assert.deepEqual(boCucNhan(don({ items: [] }), {}), []);
  assert.deepEqual(boCucNhan({}, {}), []);
});

test('số lượng rác vẫn ra ít nhất một nhãn', () => {
  assert.equal(boCucNhan(don({ items: [{ name: 'X', qty: 0 }] }), {}).length, 1);
  assert.equal(boCucNhan(don({ items: [{ name: 'X', qty: -3 }] }), {}).length, 1);
});

/* ══════════════════ nội dung ══════════════════ */

test('có đủ tên món, tuỳ chọn, ghi chú, mã đơn', () => {
  const n = boCucNhan(don(), { luc: LUC })[0];
  assert.ok(co(n, 'Trà đào'));
  assert.ok(co(n, 'Ít đá, Ít đường'));
  assert.ok(co(n, 'ống hút to'));
  assert.ok(co(n, 'QCH2608150003'));
  assert.ok(co(n, 'Mang đi'));
});

test('đọc được cả kiểu trường của đơn ONLINE', () => {
  const n = boCucNhan(don({
    items: [{
      dishName: 'Dirty Matcha', quantity: 1,
      selectedOptions: [{ choiceName: '500ml' }, { choiceName: 'Trân châu' }],
      note: 'ít ngọt',
    }],
  }), { luc: LUC })[0];
  assert.ok(co(n, 'Dirty Matcha'));
  assert.ok(co(n, '500ml, Trân châu'));
  assert.ok(co(n, 'ít ngọt'));
});

test('món không ghi chú thì nhãn gọn, không có khung rỗng', () => {
  const n = boCucNhan(don({ items: [{ name: 'Espresso', qty: 1 }] }), { luc: LUC })[0];
  assert.equal(n.some((k) => k.khung), false);
  assert.equal(co(n, '✎'), false);
});

test('ghi chú của khách được đóng khung để không lẫn với tuỳ chọn', () => {
  const n = boCucNhan(don(), { luc: LUC })[0];
  assert.ok(n.some((k) => k.khung && k.chu.includes('ống hút to')));
});

/* ══════════════════ ghi chú dài ══════════════════ */

test('ghi chú dài bị cắt nhưng PHẢI nói ra là đã cắt', () => {
  const dai = 'khách dặn pha thật nhạt, cho thêm một ít đá viên nhỏ, đừng cho kem, và nhớ lấy ống hút giấy chứ không lấy nhựa';
  const { chu, biCat } = catGhiChu(dai);
  assert.equal(biCat, true);
  assert.ok(chu.endsWith('…'));
  assert.ok(chu.length <= TRAN_GHI_CHU + 1);

  const n = boCucNhan(don({ items: [{ name: 'X', qty: 1, ghiChu: dai }] }), { luc: LUC })[0];
  assert.ok(co(n, 'còn nữa'),
    'im lặng cắt mất nửa câu dặn của khách thì tệ hơn hẳn không in gì');
});

test('ghi chú ngắn thì không cắt, không thêm dấu ba chấm', () => {
  const { chu, biCat } = catGhiChu('ống hút to');
  assert.equal(chu, 'ống hút to');
  assert.equal(biCat, false);
  assert.equal(co(boCucNhan(don(), {})[0], 'còn nữa'), false);
});

test('cắt ở khoảng trắng, không đứt giữa một từ', () => {
  const { chu } = catGhiChu('a'.repeat(30) + ' xin đừng cho đá vào ly này nhé bạn ơi cảm ơn nhiều', 50);
  assert.equal(chu.includes('  '), false);
  assert.ok(!/\S…$/.test(chu) || chu.length <= 51);
});

/* ══════════════════ in lại ══════════════════ */

test('nhãn in lại đóng dấu rõ', () => {
  assert.equal(co(boCucNhan(don(), { luc: LUC })[0], 'IN LẠI'), false);
  assert.ok(co(boCucNhan(don(), { luc: LUC, inLai: true })[0], 'IN LẠI'),
    'hai nhãn giống hệt trên quầy mà không phân biệt được là lại đúng cái bẫy của hoá đơn');
});

/* ══════════════════ khổ giấy ══════════════════ */

test('không dòng nào tràn khổ giấy, kể cả tên món dài và cỡ chữ lớn', () => {
  const d = don({
    ten: 'Nguyễn Thị Hoàng Anh Tuyết',
    items: [{
      name: 'Trà sữa socola bánh oreo vụn size lớn đặc biệt',
      qty: 1, tuyChon: 'Ít đá, Ít đường, Thêm trân châu, Thêm pudding',
      ghiChu: 'pha nhạt thôi nhé',
    }],
  });
  for (const kho of ['58', '80']) {
    for (const n of boCucNhan(d, { kho, luc: LUC })) {
      for (const k of n.filter((x) => x.kieu === 'chu')) {
        assert.ok(k.chu.length * (k.co || 1) <= SO_COT[kho],
          `khổ ${kho}: "${k.chu}" cỡ ${k.co} chiếm ${k.chu.length * (k.co || 1)}/${SO_COT[kho]} cột`);
      }
    }
  }
});

/* ══════════════════ đơn nào được in ══════════════════ */

test('mặc định in cho mang đi và giao hàng, KHÔNG in cho tại bàn', () => {
  const c = chuanHoaKieuIn(undefined);
  assert.equal(c.mangDi, true);
  assert.equal(c.giaoHang, true);
  assert.equal(c.taiBan, false, 'ly ở lại bàn, không lẫn đi đâu — in là tốn decal');
  assert.equal(chuanHoaKieuIn({ taiBan: true }).taiBan, true);
  assert.equal(chuanHoaKieuIn({ mangDi: false }).mangDi, false);
});
