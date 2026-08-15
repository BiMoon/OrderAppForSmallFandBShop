import test from 'node:test';
import assert from 'node:assert/strict';

import {
  mocCua, hoaDonCuaBan, hoaDonMoCuaBan, mocDaChot, sanPhien, GIO_DOI_NGAY,
  monChuaTinhTien, trangThaiBan, tongTien,
} from '../app/js/phien.js';

const HNAY = '2026-08-14';
const T = (h, m = 0) => new Date(`${HNAY}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00+07:00`).getTime();

const don   = (tbl, ten, gia, luc, qty = 1) => ({ table: tbl, item: ten, price: gia, quantity: qty, sentAt: luc });
const xong  = (tbl, ten, gia, luc, qty = 1) => ({ table: tbl, item: ten, price: gia, quantity: qty, timestamp: luc, completedDate: HNAY });
const hd    = (tbl, o = {}) => ({ table: tbl, code: o.code ?? 'QCH2608140001', status: 'unpaid', createdAt: o.createdAt ?? T(9), ...o });

// Cắm 'bây giờ' vào 20:00 cùng ngày. Bỏ trống thì mọi test dính đồng hồ thật
// và sẽ đỏ vào một buổi sáng nào đó mà không ai hiểu vì sao.
const goi = (p) => monChuaTinhTien({ hnay: HNAY, luc: T(20), ...p });
const tt  = (p) => trangThaiBan({ hnay: HNAY, luc: T(20), ...p });

// ── mốc thời gian ───────────────────────────────────────────────────────────

test('lúc GỌI món thắng lúc pha xong; giờ suy từ HH:MM chỉ là phương án cuối', () => {
  assert.equal(mocCua({ timestamp: 300, sentAt: 100, at: 400 }), 100,
    'sentAt thắng — nếu không, ly gọi trước hóa đơn mà pha xong sau sẽ bị tính tiền lần hai');
  assert.equal(mocCua({ timestamp: 300, at: 400 }), 300, 'dòng cũ chưa có sentAt vẫn dùng timestamp');
  assert.equal(mocCua({ sentAt: 200, at: 300 }), 200);
  assert.equal(mocCua({ at: 300 }), 300);
  assert.equal(mocCua({}), 0);
  assert.equal(mocCua(null), 0);
});

test('LỖI: ly gọi trước hóa đơn, pha xong sau, bị hóa đơn kế tiếp gom lần nữa', () => {
  // 09:55 khách gọi → 10:00 xuất và trả hóa đơn (đã gồm ly này) → 10:05 pha xong.
  const bills = [hd(3, { status: 'paid', tinhToiLuc: T(10) })];
  const history = [{ ...xong(3, 'Trà đào', 30000, T(10, 5)), sentAt: T(9, 55) }];
  assert.deepEqual(goi({ orders: [], history, bills, tbl: 3 }), [],
    'hóa đơn kế tiếp của bàn phải TRỐNG');

  // Dòng cũ không có sentAt thì vẫn theo hành vi cũ — không phải chuyển đổi dữ liệu.
  const cu = [xong(3, 'Trà đào', 30000, T(10, 5))];
  assert.equal(goi({ orders: [], history: cu, bills, tbl: 3 }).length, 1);
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

test('món của ca hôm qua không lọt vào hóa đơn hôm nay', () => {
  const homQua = {
    table: 3, item: 'Cũ', price: 10000, quantity: 1,
    timestamp: new Date('2026-08-13T09:00:00+07:00').getTime(),
    completedDate: '2026-08-13',
  };
  const items = goi({ orders: [], history: [homQua], bills: [], tbl: 3 });
  assert.equal(items.length, 0);
});

/* ══════════════ ngày kinh doanh: ly qua nửa đêm ══════════════

   Đây là lỗi mất tiền thật: bản cũ lọc lịch sử bằng `completedDate === hnay`,
   nên ly gọi 23:50 rơi khỏi hóa đơn khách trả lúc 00:05.                    */

const NUA_DEM = {
  hnay: '2026-08-15',
  luc:  new Date('2026-08-15T00:05:00+07:00').getTime(),
  ly:   {
    table: 3, item: 'Trà đào cam sả', price: 45000, quantity: 1,
    timestamp: new Date('2026-08-14T23:58:00+07:00').getTime(),
    sentAt:    new Date('2026-08-14T23:50:00+07:00').getTime(),
    completedDate: '2026-08-14',
  },
};

test('ly gọi 23:50 VẪN nằm trong hóa đơn khách trả lúc 00:05', () => {
  const items = monChuaTinhTien({
    orders: [], history: [NUA_DEM.ly], bills: [], tbl: 3,
    hnay: NUA_DEM.hnay, luc: NUA_DEM.luc,
  });
  assert.equal(items.length, 1,
    'lọc theo lịch ngày thì ly này biến mất và khách trả thiếu 45.000đ — không ai biết');
  assert.equal(tongTien(items), 45000);
});

test('00:05 vẫn thuộc ngày kinh doanh hôm trước', () => {
  const sang = new Date('2026-08-15T00:05:00+07:00').getTime();
  const trua = new Date('2026-08-15T14:00:00+07:00').getTime();
  assert.equal(sanPhien(sang), new Date(`2026-08-14T0${GIO_DOI_NGAY}:00:00+07:00`).getTime());
  assert.equal(sanPhien(trua), new Date(`2026-08-15T0${GIO_DOI_NGAY}:00:00+07:00`).getTime());
  assert.ok(sanPhien(sang) < sanPhien(trua), 'ca đêm và ca sáng hôm sau là hai phiên khác nhau');
});

test('bàn đã chốt hóa đơn thì mốc chốt vẫn thắng, không dính sàn ngày', () => {
  const chot = new Date('2026-08-14T22:00:00+07:00').getTime();
  const items = monChuaTinhTien({
    orders: [], history: [NUA_DEM.ly], bills: [{ table: 3, status: 'paid', tinhToiLuc: chot }],
    tbl: 3, hnay: NUA_DEM.hnay, luc: NUA_DEM.luc,
  });
  assert.equal(items.length, 1, 'ly gọi 23:50 phát sinh SAU hóa đơn 22:00 nên vẫn phải tính');
});

test('ly của ca đêm KHÔNG bị tính lại vào ca sáng hôm sau', () => {
  const items = monChuaTinhTien({
    orders: [], history: [NUA_DEM.ly], bills: [], tbl: 3,
    hnay: '2026-08-15', luc: new Date('2026-08-15T09:00:00+07:00').getTime(),
  });
  assert.equal(items.length, 0, '9 giờ sáng đã sang phiên mới — khách khác ngồi vào bàn đó');
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
