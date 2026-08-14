import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mocCua, hoaDonCuaBan, hoaDonMoCuaBan, mocDaChot,
  monChuaTinhTien, trangThaiBan, tongTien,
} from '../app/js/phien.js';

const HNAY = '2026-08-14';
const T = (h, m = 0) => new Date(`${HNAY}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+07:00`).getTime();

const don   = (tbl, ten, gia, luc, qty = 1) => ({ table: tbl, item: ten, price: gia, quantity: qty, sentAt: luc });
const xong  = (tbl, ten, gia, luc, qty = 1) => ({ table: tbl, item: ten, price: gia, quantity: qty, timestamp: luc, completedDate: HNAY });
const hd    = (tbl, o = {}) => ({ table: tbl, code: o.code ?? 'QCH2608140001', status: 'unpaid', createdAt: o.createdAt ?? T(9), ...o });

const goi = (p) => monChuaTinhTien({ hnay: HNAY, ...p });
const tt  = (p) => trangThaiBan({ hnay: HNAY, ...p });

// ── mốc thời gian ───────────────────────────────────────────────────────────

test('ưu tiên giờ máy chủ, giờ suy từ HH:MM chỉ là phương án cuối', () => {
  assert.equal(mocCua({ timestamp: 100, sentAt: 200, at: 300 }), 100);
  assert.equal(mocCua({ sentAt: 200, at: 300 }), 200);
  assert.equal(mocCua({ at: 300 }), 300);
  assert.equal(mocCua({}), 0);
  assert.equal(mocCua(null), 0);
});

// ── LỖI GỐC: bàn quay vòng nhiều lượt khách trong ngày ──────────────────────

test('bàn chưa từng thanh toán thì gom hết món hôm nay', () => {
  const items = goi({
    orders:  [don(3, 'Espresso', 18000, T(9))],
    history: [xong(3, 'Trà đào', 30000, T(9, 10))],
    bills:   [],
    tbl: 3,
  });
  assert.equal(items.length, 2);
  assert.equal(tongTien(items), 48000);
});

test('lượt khách thứ hai KHÔNG bị tính lại tiền của lượt thứ nhất', () => {
  // Đây là lỗi mà cả phần này sinh ra để chặn. Bàn 3 quay hai lượt trong ngày.
  const bills = [hd(3, { status: 'paid', tinhToiLuc: T(9, 30), paidAt: T(9, 31) })];
  const items = goi({
    orders:  [],
    history: [
      xong(3, 'Espresso', 18000, T(9)),        // lượt 1 — đã trả
      xong(3, 'Trà đào',  30000, T(9, 10)),    // lượt 1 — đã trả
      xong(3, 'Bạc xỉu',  25000, T(11)),       // lượt 2 — chưa trả
    ],
    bills,
    tbl: 3,
  });
  assert.deepEqual(items.map(i => i.name), ['Bạc xỉu']);
  assert.equal(tongTien(items), 25000);
});

test('món gọi thêm trong lúc chờ trả tiền vẫn nằm ngoài hóa đơn đã tạo', () => {
  // Hóa đơn chốt lúc 9:30; khách gọi thêm lúc 9:40 rồi mới trả.
  // Ly gọi thêm phải rơi vào hóa đơn SAU, không biến mất.
  const bills = [hd(3, { status: 'paid', tinhToiLuc: T(9, 30), paidAt: T(9, 45) })];
  const items = goi({
    orders:  [don(3, 'Cà phê sữa', 22000, T(9, 40))],
    history: [xong(3, 'Espresso', 18000, T(9))],
    bills,
    tbl: 3,
  });
  assert.deepEqual(items.map(i => i.name), ['Cà phê sữa']);
});

test('hóa đơn chưa trả KHÔNG dịch mốc — xóa nó đi là mọi thứ trở lại như cũ', () => {
  const bills = [hd(3, { status: 'unpaid', tinhToiLuc: T(9, 30) })];
  const items = goi({
    orders: [], history: [xong(3, 'Espresso', 18000, T(9))], bills, tbl: 3,
  });
  assert.equal(items.length, 1, 'món vẫn phải còn để tính lại nếu hủy hóa đơn');
});

test('hai hóa đơn trả không đúng thứ tự vẫn lấy mốc xa nhất', () => {
  // Thu ngân tạo hai hóa đơn, khách trả cái tạo sau trước. Lấy mốc của hóa đơn
  // "mới nhất" là lùi mốc lại và tính tiền hai lần.
  const bills = [
    hd(3, { code: 'A', status: 'paid', createdAt: T(9),  tinhToiLuc: T(11) }),
    hd(3, { code: 'B', status: 'paid', createdAt: T(10), tinhToiLuc: T(10) }),
  ];
  assert.equal(mocDaChot(bills, 3), T(11));
  const items = goi({ orders: [], history: [xong(3, 'X', 10000, T(10, 30))], bills, tbl: 3 });
  assert.equal(items.length, 0);
});

test('hóa đơn cũ thiếu tinhToiLuc thì lấy tạm giờ thanh toán', () => {
  const bills = [hd(3, { status: 'paid', paidAt: T(9, 30) })];
  assert.equal(mocDaChot(bills, 3), T(9, 30));
});

// ── không lẫn bàn ───────────────────────────────────────────────────────────

test('chỉ lấy món của đúng bàn, số và chuỗi coi như một', () => {
  const items = goi({
    orders:  [don(3, 'A', 10000, T(9)), don(4, 'B', 10000, T(9))],
    history: [xong('3', 'C', 10000, T(9))],
    bills:   [],
    tbl: 3,
  });
  assert.deepEqual(items.map(i => i.name).sort(), ['A', 'C']);
});

test('hóa đơn bàn khác không dịch mốc của bàn này', () => {
  const bills = [hd(4, { status: 'paid', tinhToiLuc: T(12) })];
  const items = goi({ orders: [], history: [xong(3, 'A', 10000, T(9))], bills, tbl: 3 });
  assert.equal(items.length, 1);
});

test('món của hôm qua không lọt vào hóa đơn hôm nay', () => {
  const hom_qua = { ...xong(3, 'Cũ', 10000, T(9)), completedDate: '2026-08-13' };
  const items = goi({ orders: [], history: [hom_qua], bills: [], tbl: 3 });
  assert.equal(items.length, 0);
});

// ── dữ liệu thiếu mốc thời gian ─────────────────────────────────────────────

test('dòng cũ thiếu mốc vẫn được tính khi bàn chưa từng chốt hóa đơn', () => {
  // Thà tính thừa cho thu ngân nhìn thấy còn hơn bỏ sót trong im lặng.
  const items = goi({
    orders: [], bills: [],
    history: [{ table: 3, item: 'Không rõ giờ', price: 15000, quantity: 1, completedDate: HNAY }],
    tbl: 3,
  });
  assert.equal(items.length, 1);
});

test('dòng cũ thiếu mốc bị loại sau khi bàn đã chốt một hóa đơn', () => {
  const bills = [hd(3, { status: 'paid', tinhToiLuc: T(9, 30) })];
  const items = goi({
    orders: [], bills,
    history: [{ table: 3, item: 'Không rõ giờ', price: 15000, quantity: 1, completedDate: HNAY }],
    tbl: 3,
  });
  assert.equal(items.length, 0, 'không rõ giờ thì coi như đã nằm trong hóa đơn cũ');
});

// ── hóa đơn đang mở ─────────────────────────────────────────────────────────

test('mỗi bàn chỉ nhận một hóa đơn đang mở, lấy cái mới nhất', () => {
  const bills = [
    hd(3, { code: 'A', createdAt: T(9) }),
    hd(3, { code: 'B', createdAt: T(10) }),
  ];
  assert.equal(hoaDonMoCuaBan(bills, 3).code, 'B');
  assert.deepEqual(hoaDonCuaBan(bills, 3).map(b => b.code), ['B', 'A']);
});

test('trả xong thì không còn hóa đơn nào đang mở', () => {
  const bills = [hd(3, { status: 'paid', tinhToiLuc: T(9, 30) })];
  assert.equal(hoaDonMoCuaBan(bills, 3), null);
});

// ── trạng thái bàn ──────────────────────────────────────────────────────────

test('bàn trống khi chưa có gì xảy ra', () => {
  assert.equal(tt({ orders: [], history: [], bills: [], tbl: 5 }), 'trong');
});

test('có món chưa tính tiền -> đang phục vụ', () => {
  assert.equal(tt({ orders: [don(5, 'A', 10000, T(9))], history: [], bills: [], tbl: 5 }), 'dangPhucVu');
});

test('có hóa đơn chưa trả -> chờ trả tiền', () => {
  assert.equal(tt({ orders: [don(5, 'A', 10000, T(9))], history: [], bills: [hd(5)], tbl: 5 }), 'choTra');
});

test('trả xong -> đã trả, và giữ nhãn cho tới khi có khách mới', () => {
  const bills = [hd(5, { status: 'paid', tinhToiLuc: T(9, 30) })];
  assert.equal(tt({ orders: [], history: [xong(5, 'A', 10000, T(9))], bills, tbl: 5 }), 'daTra');

  // Khách mới ngồi vào gọi món -> tự quay về đang phục vụ, không cần bấm dọn bàn.
  assert.equal(
    tt({ orders: [don(5, 'B', 10000, T(11))], history: [xong(5, 'A', 10000, T(9))], bills, tbl: 5 }),
    'dangPhucVu'
  );
});

test('tongTien bỏ qua món chưa có giá thay vì ra NaN', () => {
  assert.equal(tongTien([{ price: 18000, qty: 2 }, { price: null, qty: 1 }]), 36000);
  assert.equal(tongTien([]), 0);
  assert.equal(tongTien(null), 0);
});
