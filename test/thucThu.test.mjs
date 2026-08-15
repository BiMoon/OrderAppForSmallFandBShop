import test from 'node:test';
import assert from 'node:assert/strict';

import {
  heSoConLai, mocHoaDon, cuaSoHoaDon, hoaDonCuaDong, ganThucThu, congSo,
} from '../app/js/thucThu.js';

const HNAY = '2026-08-14';
const T = (h, m = 0) =>
  new Date(`${HNAY}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+07:00`).getTime();

/** Hóa đơn đã trả: bàn, mốc gom món, tạm tính, % giảm. */
const hd = (tbl, moc, subtotal, discount = 0, o = {}) => {
  const discAmt = Math.round(subtotal * discount / 100);
  return {
    table: tbl, code: o.code ?? `QCH${moc}`, status: o.status ?? 'paid',
    tinhToiLuc: moc, subtotal, discount, discAmt, total: subtotal - discAmt, ...o,
  };
};
/** Dòng lịch sử đã chuẩn hóa như report.js làm. */
const dong = (tbl, moc, revenue, o = {}) => ({ table: tbl, moc, revenue, ...o });

// ── hệ số ───────────────────────────────────────────────────────────────────

test('hệ số lấy từ tiền thật đã tính, không lấy thẳng phần trăm', () => {
  assert.equal(heSoConLai({ subtotal: 100000, total: 50000 }), 0.5);
  assert.equal(heSoConLai({ subtotal: 100000, total: 100000 }), 1);
  assert.equal(heSoConLai({ subtotal: 90000, total: 81000 }), 0.9);
});

test('hóa đơn cũ chỉ có discount thì vẫn suy ra được', () => {
  assert.equal(heSoConLai({ discount: 25 }), 0.75);
  assert.equal(heSoConLai({ discount: 100 }), 0);
});

test('dữ liệu vô lý quy về nguyên giá chứ không bịa hệ số', () => {
  assert.equal(heSoConLai({}), 1);
  assert.equal(heSoConLai(null), 1);
  assert.equal(heSoConLai({ subtotal: 0, total: 0 }), 1);
  assert.equal(heSoConLai({ subtotal: -5, total: 10 }), 1);
  assert.equal(heSoConLai({ subtotal: 100, total: 200 }), 1, 'không cho phép thu quá giá niêm yết');
  assert.equal(heSoConLai({ subtotal: 100, total: -50 }), 0);
  assert.equal(heSoConLai({ discount: 0 }), 1);
  assert.equal(heSoConLai({ discount: 150 }), 1, 'giảm 150% là dữ liệu hỏng');
});

test('total/subtotal thắng discount khi cả hai cùng có', () => {
  // Hóa đơn bị sửa tay: discount còn 50 nhưng tiền thu thật là 80k.
  assert.equal(heSoConLai({ subtotal: 100000, total: 80000, discount: 50 }), 0.8);
});

test('mốc hóa đơn ưu tiên tinhToiLuc, thiếu thì lấy paidAt', () => {
  assert.equal(mocHoaDon({ tinhToiLuc: 5, paidAt: 9 }), 5);
  assert.equal(mocHoaDon({ paidAt: 9 }), 9);
  assert.equal(mocHoaDon({}), 0);
  assert.equal(mocHoaDon(null), 0);
});

// ── cửa sổ ──────────────────────────────────────────────────────────────────

test('chỉ hóa đơn ĐÃ TRẢ mới chia cửa sổ', () => {
  const cs = cuaSoHoaDon([
    hd(1, T(10), 100000, 50),
    hd(1, T(12), 100000, 50, { status: 'unpaid' }),
  ]);
  assert.equal(cs.get('1').length, 1);
  assert.equal(cs.get('1')[0].den, T(10));
});

test('hóa đơn thiếu mốc bị bỏ qua, không xếp bừa vào đầu dãy', () => {
  const cs = cuaSoHoaDon([{ table: 1, status: 'paid', subtotal: 100, total: 50 }]);
  assert.equal(cs.has('1'), false);
});

test('cửa sổ sắp theo mốc, không theo thứ tự trong mảng', () => {
  const cs = cuaSoHoaDon([hd(1, T(15), 100, 10), hd(1, T(9), 100, 20)]);
  assert.deepEqual(cs.get('1').map(w => w.den), [T(9), T(15)]);
});

test('số bàn dạng chuỗi và dạng số là một', () => {
  const cs = cuaSoHoaDon([hd('3', T(10), 100000, 50)]);
  assert.ok(hoaDonCuaDong(cs, 3, T(9)));
});

// ── xếp dòng vào hóa đơn ────────────────────────────────────────────────────

test('dòng rơi đúng cửa sổ (mốc trước, mốc này]', () => {
  const cs = cuaSoHoaDon([hd(1, T(10), 100000, 50), hd(1, T(14), 100000, 10)]);
  assert.equal(hoaDonCuaDong(cs, 1, T(9)).heSo, 0.5, 'trước mốc đầu -> hóa đơn đầu');
  assert.equal(hoaDonCuaDong(cs, 1, T(10)).heSo, 0.5, 'đúng mốc -> vẫn hóa đơn đầu');
  assert.equal(hoaDonCuaDong(cs, 1, T(11)).heSo, 0.9, 'sau mốc đầu -> hóa đơn sau');
  assert.equal(hoaDonCuaDong(cs, 1, T(14)).heSo, 0.9);
  assert.equal(hoaDonCuaDong(cs, 1, T(15)), null, 'sau mốc cuối -> chưa chốt');
});

test('bàn khác không ăn ké giảm giá của bàn này', () => {
  const cs = cuaSoHoaDon([hd(1, T(10), 100000, 50)]);
  assert.equal(hoaDonCuaDong(cs, 2, T(9)), null);
});

test('dòng cũ không có mốc thì không đoán', () => {
  const cs = cuaSoHoaDon([hd(1, T(10), 100000, 50)]);
  assert.equal(hoaDonCuaDong(cs, 1, 0), null);
});

// ── LỖI GỐC: hóa đơn 100k giảm 50% ──────────────────────────────────────────

test('hóa đơn 100k giảm 50% -> thống kê phải ra 50k, không phải 100k', () => {
  const bills = [hd(1, T(10), 100000, 50)];
  const rows = ganThucThu([
    dong(1, T(9, 10), 60000, { item: 'Cà phê sữa', qty: 2 }),
    dong(1, T(9, 40), 40000, { item: 'Trà đào', qty: 1 }),
  ], bills);

  assert.deepEqual(rows.map(r => r.thucThu), [30000, 20000]);
  assert.deepEqual(rows.map(r => r.maHD), ['QCH' + T(10), 'QCH' + T(10)]);
  assert.equal(rows.every(r => r.chuaChot === false), true);

  const s = congSo(rows);
  assert.equal(s.goc, 100000);
  assert.equal(s.thuc, 50000);
  assert.equal(s.giam, 50000);
});

test('đơn giá thực thu của từng món cũng phải giảm theo', () => {
  const bills = [hd(1, T(10), 100000, 50)];
  const [r] = ganThucThu([dong(1, T(9), 60000, { qty: 2 })], bills);
  assert.equal(r.thucThu / 2, 15000, 'ly 30k bán giảm nửa còn 15k');
});

test('không giảm giá thì giữ nguyên số cũ, không đụng vào làm tròn', () => {
  const bills = [hd(1, T(10), 99999, 0)];
  const [r] = ganThucThu([dong(1, T(9), 33333)], bills);
  assert.equal(r.thucThu, 33333);
  assert.equal(r.heSo, 1);
  assert.equal(r.chuaChot, false);
});

test('hai lượt khách cùng bàn, mỗi lượt một mức giảm', () => {
  const bills = [hd(1, T(10), 100000, 50), hd(1, T(16), 200000, 10)];
  const rows = ganThucThu([
    dong(1, T(9), 100000),      // lượt sáng, giảm 50%
    dong(1, T(15), 200000),     // lượt chiều, giảm 10%
  ], bills);
  assert.deepEqual(rows.map(r => r.thucThu), [50000, 180000]);
});

test('hóa đơn trả không đúng thứ tự tạo vẫn chia cửa sổ đúng', () => {
  // Thu ngân tạo hai hóa đơn rồi khách trả cái sau trước. Cửa sổ xếp theo mốc
  // gom món chứ không theo lúc trả, nên món sáng vẫn ăn giảm giá của hóa đơn sáng.
  const bills = [
    hd(1, T(16), 200000, 10, { paidAt: T(16, 5) }),
    hd(1, T(10), 100000, 50, { paidAt: T(17) }),
  ];
  const rows = ganThucThu([dong(1, T(9), 100000), dong(1, T(15), 200000)], bills);
  assert.deepEqual(rows.map(r => r.thucThu), [50000, 180000]);
});

test('ly đã pha mà bàn chưa thanh toán: vẫn tính đủ nhưng bị đánh dấu', () => {
  const rows = ganThucThu([dong(1, T(9), 45000)], [hd(1, T(10), 100000, 50, { status: 'unpaid' })]);
  assert.equal(rows[0].thucThu, 45000);
  assert.equal(rows[0].chuaChot, true);
  assert.equal(rows[0].maHD, null);
  assert.equal(congSo(rows).chuaChot, 45000);
});

test('không có hóa đơn nào thì báo cáo chạy y như trước khi có tính năng này', () => {
  const rows = ganThucThu([dong(1, T(9), 30000), dong(2, T(10), 45000)], []);
  assert.deepEqual(rows.map(r => r.thucThu), [30000, 45000]);
  const s = congSo(rows);
  assert.equal(s.goc, s.thuc);
  assert.equal(s.giam, 0);
  assert.equal(s.chuaChot, 75000);
});

test('làm tròn từng dòng lệch không quá vài đồng so với tổng hóa đơn', () => {
  // 3 ly 33.333đ, giảm 15% -> hóa đơn thu 84.999đ.
  const sub = 99999, bills = [hd(1, T(10), sub, 15)];
  const rows = ganThucThu([
    dong(1, T(9, 1), 33333), dong(1, T(9, 2), 33333), dong(1, T(9, 3), 33333),
  ], bills);
  const lech = Math.abs(congSo(rows).thuc - bills[0].total);
  assert.ok(lech <= 2, `lệch ${lech}đ`);
});

test('giảm 100% ra 0đ chứ không rơi về nguyên giá', () => {
  const rows = ganThucThu([dong(1, T(9), 40000)], [hd(1, T(10), 40000, 100)]);
  assert.equal(rows[0].thucThu, 0);
  assert.equal(congSo(rows).giam, 40000);
});

test('congSo đếm số dòng được giảm, không đếm dòng chưa chốt', () => {
  const bills = [hd(1, T(10), 100000, 50)];
  const rows = ganThucThu([dong(1, T(9), 100000), dong(2, T(9), 50000)], bills);
  const s = congSo(rows);
  assert.equal(s.soDongGiam, 1);
  assert.equal(s.chuaChot, 50000);
});

/* ══════════════ tiền vào bằng đường nào ══════════════

   `payMethod` nằm trong hóa đơn từ lâu mà màn Thống kê chưa từng đọc tới, nên
   cuối ngày không ai biết két phải có bao nhiêu.                            */

import { congTheoCachTra, chuanHoaCach, CACH_TRA } from '../app/js/thucThu.js';

const hdCach = (tbl, den, cach, o = {}) =>
  ({ table: tbl, status: 'paid', tinhToiLuc: den, code: `Q${den}`, payMethod: cach,
     subtotal: 100000, total: 100000, ...o });
const dg = (tbl, moc, tien) => ({ table: tbl, moc, revenue: tien, qty: 1 });

test('cộng riêng tiền mặt và chuyển khoản', () => {
  const bills = [hdCach(1, 1000, 'tienmat'), hdCach(2, 1000, 'chuyenkhoan')];
  const rows = ganThucThu([dg(1, 900, 30000), dg(2, 900, 50000)], bills);
  const t = congTheoCachTra(rows);
  assert.equal(t.tienmat, 30000);
  assert.equal(t.chuyenkhoan, 50000);
  assert.equal(t.tong, 80000);
});

test('giảm giá của hóa đơn nào thì trừ vào đúng rổ của hóa đơn đó', () => {
  const bills = [hdCach(1, 1000, 'tienmat', { subtotal: 100000, total: 50000 })];
  const rows = ganThucThu([dg(1, 900, 100000)], bills);
  const t = congTheoCachTra(rows);
  assert.equal(t.tienmat, 50000, 'phải là tiền thật vào két, không phải giá niêm yết');
  assert.equal(t.chuyenkhoan, 0);
});

test('món chưa chốt hóa đơn KHÔNG rơi vào rổ nào', () => {
  const t = congTheoCachTra(ganThucThu([dg(1, 900, 40000)], []));
  assert.equal(t.tong, 0);
  assert.equal(t.tienmat, 0);
  assert.equal(t.chuaChot, 40000,
    'đếm tiền chưa vào két là cuối ngày đi tìm một khoản không tồn tại');
});

test('hóa đơn cũ thiếu payMethod vào rổ "không rõ", KHÔNG dồn vào tiền mặt', () => {
  const bills = [{ table: 1, status: 'paid', tinhToiLuc: 1000, code: 'Q1', subtotal: 1, total: 1 }];
  const t = congTheoCachTra(ganThucThu([dg(1, 900, 20000)], bills));
  assert.equal(t.tienmat, 0, 'dồn bừa vào tiền mặt là người đếm két bị nghi oan');
  assert.equal(t.khac, 20000);
  assert.equal(t.tong, 20000);
});

test('nhận mọi cách viết của cùng một hình thức', () => {
  for (const v of ['tienmat', 'TIEN MAT', 'tien_mat', 'cash']) {
    assert.equal(chuanHoaCach(v), 'tienmat', v);
  }
  for (const v of ['chuyenkhoan', 'CHUYEN-KHOAN', 'sepay', 'bank', 'ck']) {
    assert.equal(chuanHoaCach(v), 'chuyenkhoan', v);
  }
  for (const v of [null, undefined, '', 'momo', 123]) {
    assert.equal(chuanHoaCach(v), 'khac', String(v));
  }
});

test('mọi rổ đều có nhãn để hiện lên màn hình', () => {
  for (const k of ['tienmat', 'chuyenkhoan', 'khac']) {
    assert.ok(CACH_TRA[k]?.nhan, k);
  }
});

test('tổng ba rổ đúng bằng thực thu của phần đã chốt', () => {
  const bills = [hdCach(1, 1000, 'tienmat', { subtotal: 100000, total: 80000 }),
                 hdCach(2, 1000, 'sepay')];
  const rows = ganThucThu([dg(1, 900, 100000), dg(2, 900, 60000)], bills);
  const t = congTheoCachTra(rows);
  assert.equal(t.tienmat + t.chuyenkhoan + t.khac, t.tong);
  assert.equal(t.tong, congSo(rows).thuc);
});
