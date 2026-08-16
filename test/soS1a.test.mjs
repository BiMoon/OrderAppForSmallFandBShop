import test from 'node:test';
import assert from 'node:assert/strict';

import {
  COT_S1A, ngayVN, khoaThang, quyCua, mocHoaDon, dienGiai, doanhThuCua,
  dungSoS1a, csvS1a,
} from '../app/js/soS1a.js';

const T = (iso) => new Date(iso + '+07:00').getTime();
const hd = (o = {}) => ({
  code: 'QCH2601150001', table: 3, status: 'paid',
  paidAt: T('2026-01-15T10:00:00'),
  total: 68000, subtotal: 68000,
  items: [{ name: 'Espresso', qty: 2 }, { name: 'Bạc xỉu', qty: 1 }],
  ...o,
});
const GHI = { ghiSoLuc: new Date(T('2026-08-15T09:00:00')) };
const ct = (s) => s.dong.filter((d) => d.loai === 'chungTu');
const loai = (s, l) => s.dong.filter((d) => d.loai === l);

/* ══════════════════ cột và ngày ══════════════════ */

test('đủ năm cột theo đúng thứ tự A, B, C, D, 1', () => {
  assert.deepEqual(COT_S1A.map(([k]) => k), ['A', 'B', 'C', 'D', '1']);
  assert.match(COT_S1A[0][1], /ghi sổ/);
  assert.match(COT_S1A[1][1], /Số hiệu/);
  assert.match(COT_S1A[2][1], /chứng từ/);
  assert.match(COT_S1A[3][1], /Diễn giải/);
  assert.match(COT_S1A[4][1], /Doanh thu/);
});

test('ngày ghi dạng dd/mm/yyyy', () => {
  assert.equal(ngayVN(T('2026-01-05T08:00:00')), '05/01/2026');
  assert.equal(ngayVN(0), '');
  assert.equal(ngayVN(null), '');
});

test('mốc phát sinh lấy lúc THU TIỀN, không phải lúc tạo hoá đơn', () => {
  const b = { paidAt: T('2026-01-16T00:05:00'), createdAt: T('2026-01-15T23:50:00') };
  assert.equal(mocHoaDon(b), T('2026-01-16T00:05:00'));
  assert.equal(ngayVN(mocHoaDon(b)), '16/01/2026',
    'hoá đơn tạo 23:50 trả 00:05 thì doanh thu phát sinh sang ngày mới');
});

test('thiếu paidAt thì lùi về tinhToiLuc rồi createdAt', () => {
  assert.equal(mocHoaDon({ tinhToiLuc: 111, createdAt: 222 }), 111);
  assert.equal(mocHoaDon({ createdAt: 222 }), 222);
  assert.equal(mocHoaDon({}), 0);
});

/* ══════════════════ doanh thu ══════════════════ */

test('ghi theo giá bán SAU giảm giá, không theo số tiền nhận được', () => {
  assert.equal(doanhThuCua({ total: 68000, subtotal: 85000, paidAmount: 100000 }), 68000,
    'khách đưa 100k rồi nhận tiền thối — phần thừa không phải doanh thu');
});

test('số âm hoặc rác quy về 0', () => {
  for (const v of [null, undefined, 'x', -5000, NaN]) {
    assert.equal(doanhThuCua({ total: v }), 0, String(v));
  }
});

/* ══════════════════ chỉ hoá đơn đã thu tiền ══════════════════ */

test('hoá đơn CÒN TREO không vào sổ — ghi vào là khai khống', () => {
  const s = dungSoS1a([hd(), hd({ code: 'QCH2601150002', status: 'unpaid' })], GHI);
  assert.equal(ct(s).length, 1);
  assert.equal(s.tong, 68000);
});

test('hoá đơn đã thu mà thiếu mốc thời gian thì đếm riêng, KHÔNG lặng lẽ bỏ', () => {
  const s = dungSoS1a([hd(), { code: 'QCH2601150003', status: 'paid', total: 50000 }], GHI);
  assert.equal(ct(s).length, 1);
  assert.equal(s.boQua, 1, 'phải nói ra để người lập sổ đi tìm, không được im');
});

/* ══════════════════ thứ tự thời gian ══════════════════ */

test('xếp theo ngày phát sinh, không theo thứ tự trong dữ liệu', () => {
  const s = dungSoS1a([
    hd({ code: 'B', paidAt: T('2026-01-20T10:00:00') }),
    hd({ code: 'A', paidAt: T('2026-01-05T10:00:00') }),
    hd({ code: 'C', paidAt: T('2026-01-31T10:00:00') }),
  ], GHI);
  assert.deepEqual(ct(s).map((d) => d.B), ['A', 'B', 'C']);
});

/* ══════════════════ cộng dồn tháng và quý ══════════════════ */

test('cộng theo tháng, và cộng quý ở cuối mỗi quý', () => {
  const s = dungSoS1a([
    hd({ code: 'A', paidAt: T('2026-01-15T10:00:00'), total: 100000 }),
    hd({ code: 'B', paidAt: T('2026-02-03T10:00:00'), total: 50000 }),
    hd({ code: 'C', paidAt: T('2026-04-01T10:00:00'), total: 30000 }),
  ], GHI);

  assert.deepEqual(loai(s, 'congThang').map((d) => [d.D, d.tien]), [
    ['Cộng tháng 1/2026', 100000],
    ['Cộng tháng 2/2026', 50000],
    ['Cộng tháng 4/2026', 30000],
  ]);
  assert.deepEqual(loai(s, 'congQuy').map((d) => [d.D, d.tien]), [
    ['CỘNG QUÝ 1/2026', 150000],
    ['CỘNG QUÝ 2/2026', 30000],
  ]);
  assert.equal(loai(s, 'tongCong')[0].tien, 180000);
});

test('dòng cộng quý nằm SAU dòng cộng tháng cuối của quý đó', () => {
  const s = dungSoS1a([
    hd({ paidAt: T('2026-03-31T23:00:00'), total: 10000 }),
    hd({ code: 'X', paidAt: T('2026-04-01T01:00:00'), total: 20000 }),
  ], GHI);
  const nhan = s.dong.map((d) => d.loai);
  assert.deepEqual(nhan, ['chungTu', 'congThang', 'congQuy', 'chungTu', 'congThang', 'congQuy', 'tongCong']);
});

test('quý tính đúng cho cả 12 tháng', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => quyCua(`2026-${String(m).padStart(2, '0')}`)),
    [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4]);
});

test('sang năm mới thì chốt quý của năm cũ', () => {
  const s = dungSoS1a([
    hd({ paidAt: T('2026-12-20T10:00:00'), total: 10000 }),
    hd({ code: 'X', paidAt: T('2027-01-05T10:00:00'), total: 20000 }),
  ], GHI);
  assert.deepEqual(loai(s, 'congQuy').map((d) => d.D), ['CỘNG QUÝ 4/2026', 'CỘNG QUÝ 1/2027']);
});

test('tổng cộng luôn bằng tổng các dòng chứng từ', () => {
  const s = dungSoS1a([
    hd({ paidAt: T('2026-01-05T10:00:00'), total: 11000 }),
    hd({ code: 'B', paidAt: T('2026-05-05T10:00:00'), total: 22000 }),
    hd({ code: 'C', paidAt: T('2026-09-05T10:00:00'), total: 33000 }),
  ], GHI);
  assert.equal(loai(s, 'tongCong')[0].tien, ct(s).reduce((x, d) => x + d.tien, 0));
  assert.equal(loai(s, 'tongCong')[0].tien,
    loai(s, 'congQuy').reduce((x, d) => x + d.tien, 0), 'tổng quý phải khớp tổng cộng');
});

test('không có hoá đơn nào thì chỉ còn dòng tổng bằng 0', () => {
  const s = dungSoS1a([], GHI);
  assert.equal(s.soChungTu, 0);
  assert.deepEqual(s.dong.map((d) => d.loai), ['tongCong']);
  assert.equal(s.tong, 0);
});

/* ══════════════════ diễn giải ══════════════════ */

test('diễn giải liệt kê món và số bàn', () => {
  const d = dienGiai(hd());
  assert.match(d, /bàn 3/);
  assert.match(d, /Espresso x2/);
  assert.match(d, /Bạc xỉu/);
  assert.equal(/x1/.test(d), false, 'một ly thì không cần ghi x1');
});

test('hoá đơn nhiều món bị cắt, nhưng PHẢI nói ra là đã cắt', () => {
  const nhieu = Array.from({ length: 12 }, (_, i) => ({ name: `Món số ${i + 1}`, qty: 1 }));
  const d = dienGiai(hd({ items: nhieu }));
  assert.match(d, /và \d+ món nữa/, 'im lặng cắt thì người đối chiếu tưởng hoá đơn chỉ có ngần ấy món');
});

test('hoá đơn không có dòng món nào vẫn có diễn giải', () => {
  assert.equal(dienGiai({ items: [], table: 5 }), 'Bán hàng ăn uống (bàn 5)');
  assert.equal(dienGiai({}), 'Bán hàng ăn uống');
});

/* ══════════════════ tệp CSV ══════════════════ */

const QUAN = { phapNhan: 'Hộ Kinh Doanh Cậu Hai Long', maSoThue: '9000369315', diaChi: '371/3 Trường Chinh' };
const xuat = (bills = [hd()], q = QUAN, o = {}) => csvS1a(bills, q, { ...GHI, from: '2026-01-01', to: '2026-12-31', ...o });

test('đầu sổ có đủ tên hộ kinh doanh, mã số thuế, địa chỉ, tên sổ, năm', () => {
  const t = xuat().noiDung;
  assert.ok(t.includes('Hộ Kinh Doanh Cậu Hai Long'));
  assert.ok(t.includes('9000369315'));
  assert.ok(t.includes('371/3 Trường Chinh'));
  assert.ok(t.includes('SỔ DOANH THU BÁN HÀNG HOÁ, DỊCH VỤ'));
  assert.ok(t.includes('Mẫu số S1a-HKD'));
  assert.ok(t.includes('2026'));
  assert.ok(t.includes('VND'));
});

test('LUÔN có cảnh báo sổ chỉ gồm doanh thu tại quán', () => {
  const t = xuat().noiDung;
  assert.match(t, /chỉ gồm doanh thu BÁN TẠI QUÁN/i);
  assert.match(t, /online/i);
  // Cảnh báo phải nằm TRÊN bảng số liệu, không nhét xuống cuối.
  assert.ok(t.indexOf('BÁN TẠI QUÁN') < t.indexOf('Ngày, tháng ghi sổ'));
});

test('chưa có mã số thuế thì nói rõ là chưa có, không để trống', () => {
  assert.match(xuat([hd()], { ...QUAN, maSoThue: '' }).noiDung, /Mã số thuế:","\(chưa có\)"/);
});

test('mở được bằng Excel tiếng Việt: có BOM và xuống dòng CRLF', () => {
  const { noiDung } = xuat();
  assert.equal(noiDung.charCodeAt(0), 0xfeff, 'thiếu BOM là Excel hiện chữ vuông');
  assert.ok(noiDung.includes('\r\n'));
});

test('dấu nháy trong tên món không làm vỡ cột', () => {
  const t = xuat([hd({ items: [{ name: 'Trà "đặc biệt"', qty: 1 }] })]).noiDung;
  assert.ok(t.includes('""đặc biệt""'));
});

test('có chỗ ký tên hai bên', () => {
  const t = xuat().noiDung;
  assert.ok(t.includes('Người lập biểu'));
  assert.ok(t.includes('Người đại diện hộ kinh doanh'));
});

test('tên tệp mang kỳ báo cáo để khỏi ghi đè lẫn nhau', () => {
  assert.equal(xuat([hd()], QUAN, { from: '2026-01-01', to: '2026-03-31' }).ten,
    'so-S1a-HKD-2026-01-01_2026-03-31.csv');
});

test('báo số chứng từ và tổng tiền để đối chiếu nhanh', () => {
  const kq = xuat([hd(), hd({ code: 'QCH2601160002', paidAt: T('2026-01-16T10:00:00'), total: 32000 })]);
  assert.equal(kq.soChungTu, 2);
  assert.equal(kq.tong, 100000);
  assert.ok(kq.noiDung.includes('"Số chứng từ:",2'));
});

test('hoá đơn thiếu mốc thời gian được báo ngay trong tệp', () => {
  const t = xuat([hd(), { code: 'X', status: 'paid', total: 1000 }]).noiDung;
  assert.match(t, /thiếu mốc thời gian/);
});
