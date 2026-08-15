import test from 'node:test';
import assert from 'node:assert/strict';

import {
  KHO, KHOI_TAO, dayGiay, catGiay, daNganKeo, noi, anhRaster, lenhIn, sangBase64,
} from '../app/js/escpos.js';
import { SO_COT, ngatDong, haiCot, boCucHoaDon } from '../app/js/hoaDonBoCuc.js';

/* ══════════════════ escpos.js ══════════════════ */

test('nối byte giữ đúng thứ tự và bỏ mảnh rỗng', () => {
  const r = noi(Uint8Array.of(1, 2), null, Uint8Array.of(3));
  assert.deepEqual([...r], [1, 2, 3]);
  assert.ok(r instanceof Uint8Array);
});

test('lệnh cơ bản đúng mã ESC/POS', () => {
  assert.deepEqual([...KHOI_TAO], [0x1b, 0x40]);
  assert.deepEqual([...dayGiay(4)], [0x1b, 0x64, 4]);
  assert.deepEqual([...catGiay(3)], [0x1d, 0x56, 66, 3]);
  assert.deepEqual([...daNganKeo()], [0x1b, 0x70, 0, 25, 250]);
});

test('số dòng đẩy giấy bị kẹp vào 0..255, không tràn thành byte khác', () => {
  assert.deepEqual([...dayGiay(-5)], [0x1b, 0x64, 0]);
  assert.deepEqual([...dayGiay(999)], [0x1b, 0x64, 255]);
});

// ── raster: ba chỗ dễ sai ───────────────────────────────────────────────────

test('8 điểm dồn 1 byte, bit cao nằm bên TRÁI', () => {
  // Một dòng 8 điểm, chỉ điểm ngoài cùng bên trái là đen -> 0b1000_0000.
  const r = anhRaster([1, 0, 0, 0, 0, 0, 0, 0], 8);
  assert.equal(r.at(-1), 0x80, 'đảo bit là ảnh in ra như soi gương');

  const p = anhRaster([0, 0, 0, 0, 0, 0, 0, 1], 8);
  assert.equal(p.at(-1), 0x01);
});

test('chiều rộng làm tròn LÊN bội số của 8', () => {
  // 12 điểm ngang -> 2 byte mỗi dòng, không phải 1.
  const r = anhRaster(new Uint8Array(12 * 2), 12);
  const dau = [...r.slice(0, 8)];
  assert.deepEqual(dau, [0x1d, 0x76, 0x30, 0, 2, 0, 2, 0],
    'tính thiếu một byte mỗi dòng là cả ảnh xô chéo dần xuống dưới');
  assert.equal(r.length, 8 + 2 * 2);
});

test('điểm thừa của byte cuối để trắng, không nuốt sang dòng sau', () => {
  // 9 điểm: dòng 1 toàn đen, dòng 2 toàn trắng.
  const r = anhRaster([...Array(9).fill(1), ...Array(9).fill(0)], 9);
  const than = r.slice(8);
  assert.deepEqual([...than], [0xff, 0x80, 0x00, 0x00]);
});

test('ảnh dài bị chia băng, mỗi băng một lệnh GS v 0', () => {
  const cao = 300, rong = 16;
  const r = anhRaster(new Uint8Array(rong * cao), rong, 128);
  let soLenh = 0;
  for (let i = 0; i < r.length - 2; i++){
    if (r[i] === 0x1d && r[i + 1] === 0x76 && r[i + 2] === 0x30) soLenh++;
  }
  assert.equal(soLenh, 3, '300 dòng / băng 128 -> 3 băng (máy in rẻ nghẹn nếu đẩy một cục)');
});

test('băng cuối mang đúng số dòng còn lại, không phải cả băng', () => {
  const r = anhRaster(new Uint8Array(8 * 130), 8, 128);
  // Lệnh thứ hai bắt đầu sau: 8 byte đầu + 128 byte thân.
  const dau2 = r.slice(8 + 128, 8 + 128 + 8);
  assert.equal(dau2[6], 2, 'băng cuối chỉ có 2 dòng');
});

test('chiều cao suy từ số điểm chia chiều rộng; ảnh rỗng thì ném lỗi', () => {
  assert.throws(() => anhRaster([1, 1], 8), /không có dòng nào/);
  assert.throws(() => anhRaster([1], 0), /chiều rộng/);
});

test('lenhIn ghép đủ khởi tạo → ảnh → đẩy giấy → cắt', () => {
  const r = lenhIn(new Uint8Array(8), 8);
  assert.deepEqual([...r.slice(0, 2)], [0x1b, 0x40], 'phải khởi tạo trước, kẻo ăn cấu hình sót lại');
  assert.deepEqual([...r.slice(-4)], [0x1d, 0x56, 66, 3]);
});

test('ngăn kéo chỉ đá khi được yêu cầu', () => {
  assert.equal(lenhIn(new Uint8Array(8), 8).length + 5,
               lenhIn(new Uint8Array(8), 8, { nganKeo: true }).length);
  assert.ok(!lenhIn(new Uint8Array(8), 8).includes(0x70));
});

test('base64 chịu được ảnh dài mà không tràn ngăn xếp', () => {
  const to = new Uint8Array(200000).fill(65);
  const b64 = sangBase64(to);
  assert.equal(Buffer.from(b64, 'base64').length, 200000);
});

test('khổ giấy khai đúng số điểm vật lý của đầu in', () => {
  assert.equal(KHO['58'].rong, 384);
  assert.equal(KHO['80'].rong, 576);
});

/* ══════════════════ hoaDonBoCuc.js ══════════════════ */

test('ngắt dòng ưu tiên khoảng trắng', () => {
  assert.deepEqual(ngatDong('Trà sữa socola bánh oreo vụn', 12),
    ['Trà sữa', 'socola bánh', 'oreo vụn']);
  assert.deepEqual(ngatDong('Espresso', 32), ['Espresso']);
  assert.deepEqual(ngatDong('   ', 10), ['']);
  assert.deepEqual(ngatDong(null, 10), ['']);
});

test('từ dài hơn cả dòng thì cắt cứng chứ không để tràn', () => {
  assert.deepEqual(ngatDong('AAAAAAAAAAAAA', 5), ['AAAAA', 'AAAAA', 'AAA']);
  assert.deepEqual(ngatDong('ok AAAAAAA', 5), ['ok', 'AAAAA', 'AA']);
});

test('hai cột canh phải đúng bề rộng', () => {
  assert.equal(haiCot('Tạm tính', '100.000đ', 32).length, 32);
  assert.ok(haiCot('Tạm tính', '100.000đ', 32).endsWith('100.000đ'));
});

test('chật chỗ thì cắt NHÃN, không bao giờ cắt số tiền', () => {
  const d = haiCot('Tên món dài kinh khủng khiếp', '1.234.567đ', 20);
  assert.ok(d.endsWith('1.234.567đ'), 'cắt mất số tiền là hóa đơn vô nghĩa');
  assert.ok(d.length <= 20);
});

const HD = {
  code: 'QCH2608140007', table: 3, status: 'unpaid',
  items: [
    { name: 'Espresso', qty: 2, price: 20000 },
    { name: 'Trà sữa socola bánh oreo vụn', qty: 1, price: 45000 },
  ],
  subtotal: 85000, discount: 0, discAmt: 0, total: 85000, paidAmount: 0,
};
const chuCua = (kh) => kh.filter(k => k.kieu === 'chu').map(k => k.chu);
const co = (kh, m) => chuCua(kh).some(c => c.includes(m));

test('phiếu chưa trả: có đủ mã, bàn, từng món và tổng', () => {
  const kh = boCucHoaDon(HD, { kho: '80', luc: new Date('2026-08-14T15:30:00+07:00') });
  assert.ok(co(kh, 'QCH2608140007'));
  assert.ok(co(kh, 'Bàn 3'));
  assert.ok(co(kh, 'Espresso'));
  assert.ok(co(kh, '2 x 20.000đ'));
  assert.ok(co(kh, '40.000đ'), 'thành tiền của dòng Espresso');
  assert.ok(co(kh, 'TỔNG CỘNG'));
  assert.ok(co(kh, '85.000đ'));
  assert.ok(co(kh, 'PHIẾU TÍNH TIỀN'));
});

test('tên món dài bị ngắt chứ không cắt cụt', () => {
  const kh = boCucHoaDon(HD, { kho: '58' });
  const c = chuCua(kh).join('\n');
  assert.ok(c.includes('Trà sữa'));
  assert.ok(c.includes('oreo vụn'), 'không được nuốt mất đuôi tên món');
  for (const d of chuCua(kh)) assert.ok(d.length <= SO_COT['58'], `dòng dài quá khổ: "${d}"`);
});

test('không giảm giá thì KHÔNG in dòng tạm tính thừa', () => {
  const kh = boCucHoaDon(HD, {});
  assert.equal(co(kh, 'Tạm tính'), false);
  assert.equal(co(kh, 'Giảm giá'), false);
});

test('có giảm giá thì in đủ ba dòng tạm tính / giảm / tổng', () => {
  const kh = boCucHoaDon(
    { ...HD, discount: 50, discAmt: 42500, total: 42500 }, {});
  assert.ok(co(kh, 'Tạm tính'));
  assert.ok(co(kh, '85.000đ'));
  assert.ok(co(kh, 'Giảm giá 50%'));
  assert.ok(co(kh, '-42.500đ'));
  assert.ok(co(kh, '42.500đ'));
});

test('hóa đơn đã trả: đổi tiêu đề, ghi cách trả, KHÔNG in QR nữa', () => {
  const kh = boCucHoaDon(
    { ...HD, status: 'paid', payMethod: 'chuyenkhoan', paidAmount: 85000 },
    { qr: 'data:image/png;base64,xx' });
  assert.ok(co(kh, 'PHIẾU THANH TOÁN'));
  assert.ok(co(kh, 'Chuyển khoản'));
  assert.equal(kh.some(k => k.src === 'data:image/png;base64,xx'), false,
    'trả rồi mà còn in mã CHUYỂN TIỀN là mời trả lần hai');
  assert.equal(co(kh, 'Quét mã để chuyển'), false);
});

test('chưa trả và có QR thì in mã kèm đúng nội dung chuyển khoản', () => {
  const kh = boCucHoaDon(HD, { qr: 'data:image/png;base64,xx' });
  assert.equal(kh.filter(k => k.kieu === 'anh').length, 1);
  assert.ok(co(kh, 'Nội dung: QCH2608140007'),
    'SePay bóc mã từ nội dung chuyển khoản — sai chuỗi này là tiền không vào hóa đơn nào');
  assert.ok(co(kh, 'Quét mã để chuyển 85.000đ'));
});

test('trả thiếu thì QR đòi đúng phần CÒN THIẾU, không đòi lại cả hóa đơn', () => {
  const kh = boCucHoaDon({ ...HD, paidAmount: 25000 }, { qr: 'x' });
  // Dòng "Đã nhận" là hai cột nên giữa nhãn và số là một khoảng trắng canh lề,
  // không phải đúng một dấu cách — soi từng vế.
  const daNhan = chuCua(kh).find(c => c.startsWith('Đã nhận'));
  assert.ok(daNhan?.endsWith('25.000đ'), `thấy "${daNhan}"`);
  assert.ok(co(kh, 'Quét mã để chuyển 60.000đ'));
});

test('khách chuyển thừa thì nói ra trên giấy', () => {
  const kh = boCucHoaDon(
    { ...HD, status: 'paid', payMethod: 'chuyenkhoan', paidAmount: 100000,
      overpaid: true, overpaidAmount: 15000 }, {});
  assert.ok(co(kh, 'Khách chuyển thừa'));
  assert.ok(co(kh, '15.000đ'));
});

test('tờ in lại đóng dấu rõ', () => {
  assert.equal(co(boCucHoaDon(HD, {}), 'IN LẠI'), false);
  assert.ok(co(boCucHoaDon(HD, { inLai: true }), 'IN LẠI'),
    'hai tờ cùng mã trên quầy mà không phân biệt được là có ngày thu tiền hai lần');
});

test('hóa đơn rỗng / hỏng vẫn ra được tờ giấy, không ném lỗi', () => {
  const kh = boCucHoaDon({}, {});
  assert.ok(kh.length > 0);
  assert.ok(co(kh, 'Bàn —'));
  assert.ok(co(kh, '0đ'));
});

test('khổ 58 hẹp hơn 80 nhưng không dòng nào tràn', () => {
  for (const kho of ['58', '80']){
    const kh = boCucHoaDon({ ...HD, discount: 15, discAmt: 12750, total: 72250 }, { kho });
    for (const d of chuCua(kh)) assert.ok(d.length <= SO_COT[kho], `khổ ${kho} tràn: "${d}"`);
  }
});

test('dòng chữ CỠ LỚN chỉ được dùng nửa số cột', () => {
  // Chữ cỡ 2 rộng gấp đôi. Đếm ký tự thì dòng nào cũng "vừa", nhưng vẽ ra thì
  // phần bên phải rơi khỏi mép giấy — và phần bên phải chính là SỐ TIỀN. Đã
  // thật sự xảy ra: tờ hóa đơn có chữ TỔNG CỘNG mà không có tổng.
  for (const kho of ['58', '80']){
    const kh = boCucHoaDon({ ...HD, total: 1234567 }, { kho });
    for (const k of kh.filter(x => x.kieu === 'chu')){
      assert.ok(k.chu.length * (k.co || 1) <= SO_COT[kho],
        `khổ ${kho}: "${k.chu}" cỡ ${k.co} chiếm ${k.chu.length * k.co}/${SO_COT[kho]} cột`);
    }
  }
});

test('dòng tổng cộng luôn giữ được số tiền, kể cả số dài', () => {
  const kh = boCucHoaDon({ ...HD, subtotal: 12345678, discount: 0, discAmt: 0, total: 12345678 }, { kho: '58' });
  const dong = chuCua(kh).find(c => c.startsWith('TỔNG CỘNG'));
  assert.ok(dong?.endsWith('12.345.678đ'), `thấy "${dong}"`);
});

/* ══════════════════ dòng tem trên hoá đơn ══════════════════ */

import { temSauHoaDon } from '../app/js/hoaDonBoCuc.js';

const HD_TEM = { ...HD, sdt: '0901234567', temTruoc: 6, temMoc: 10, temSe: 3, doiQua: false };

test('không có số điện thoại thì KHÔNG in dòng tem', () => {
  assert.equal(temSauHoaDon(HD), null);
  assert.equal(co(boCucHoaDon(HD, {}), 'Tem tích luỹ'), false);
});

test('tra sổ hụt lúc tạo hoá đơn thì cũng không in — không đoán bừa', () => {
  assert.equal(temSauHoaDon({ ...HD_TEM, temTruoc: null }), null, 'mất mạng lúc tra sổ');
  assert.equal(temSauHoaDon({ ...HD_TEM, temMoc: null }), null, 'chương trình đang tắt');
  assert.equal(temSauHoaDon({ ...HD_TEM, temTruoc: -1 }), null);
});

test('in số tem SAU hoá đơn này, không phải số lúc bắt đầu', () => {
  assert.deepEqual(temSauHoaDon(HD_TEM), { sau: 9, moc: 10, thieu: 1, du: false },
    'khách cầm tờ giấy đi ra — con số họ cần là con số họ đang có');
  const kh = boCucHoaDon(HD_TEM, {});
  const dong = chuCua(kh).find((c) => c.startsWith('Tem tích luỹ'));
  assert.ok(dong?.endsWith('9/10'), `thấy "${dong}"`);
  assert.ok(co(kh, 'Còn 1 ly nữa là được tặng một ly'));
});

test('đủ tem thì đổi lời chúc mừng, không nói "còn 0 ly nữa"', () => {
  const kh = boCucHoaDon({ ...HD_TEM, temTruoc: 8, temSe: 3 }, {});
  assert.ok(co(kh, 'Đủ tem — lần sau đổi một ly miễn phí!'));
  assert.equal(co(kh, 'Còn 0 ly'), false);
});

test('hoá đơn có đổi quà thì trừ mốc rồi mới cộng tem mới', () => {
  assert.deepEqual(temSauHoaDon({ ...HD_TEM, temTruoc: 10, temSe: 2, doiQua: true }),
    { sau: 2, moc: 10, thieu: 8, du: false });
});

test('hứa đổi quà mà tới lúc trả không đủ tem: KHÔNG in số âm', () => {
  // Khách có 10 tem lúc tạo hoá đơn, tiêu mất ở hoá đơn khác, còn 3.
  const t = temSauHoaDon({ ...HD_TEM, temTruoc: 3, temSe: 1, doiQua: true });
  assert.equal(t.sau, 1, 'trừ đúng phần trừ được (3), rồi cộng 1');
  assert.ok(t.sau >= 0);
});

test('dòng tem không làm tràn khổ giấy hẹp', () => {
  for (const kho of ['58', '80']) {
    const kh = boCucHoaDon({ ...HD_TEM, temMoc: 100, temTruoc: 99 }, { kho });
    for (const k of kh.filter((x) => x.kieu === 'chu')) {
      assert.ok(k.chu.length * (k.co || 1) <= SO_COT[kho], `khổ ${kho}: "${k.chu}"`);
    }
  }
});

/* ══════════════════ chân hoá đơn ══════════════════

   Tờ giấy khách cầm về nhà. Trước bản này chân hoá đơn chỉ có mỗi "Cảm ơn quý
   khách!" — không số điện thoại, không đường quay lại quán.                 */

import { QUAN, QR_DAT_ONLINE } from '../app/js/quanInfo.js';

const daTra = (o = {}) => ({ ...HD, status: 'paid', payMethod: 'tienmat', paidAmount: 85000, ...o });
const anhCua = (kh) => kh.filter((k) => k.kieu === 'anh');

test('đầu hoá đơn có slogan và địa chỉ', () => {
  const kh = boCucHoaDon(HD, {});
  assert.ok(co(kh, QUAN.slogan));
  assert.ok(co(kh, 'Trường Chinh'));
});

test('số điện thoại in ĐÚNG MỘT LẦN khi Zalo trùng số gọi', () => {
  const het = chuCua(boCucHoaDon(daTra(), {})).join('\n');
  const lan = het.split(QUAN.dienThoai).length - 1;
  assert.equal(lan, 1, `in ${lan} lần — hai lần cùng một số là hai dòng giấy vứt đi`);
  assert.ok(het.includes('Zalo / ĐT'));
});

test('chân hoá đơn có Zalo và wifi', () => {
  const kh = boCucHoaDon(daTra(), {});
  const het = chuCua(kh).join(' ');
  assert.ok(het.includes(QUAN.zalo));
  assert.ok(het.includes(QUAN.wifi));
  assert.ok(het.includes(QUAN.wifiMatKhau), 'khách hỏi mật khẩu wifi nhiều hơn mọi thứ khác');
});

/* ── một mã QR trên một tờ giấy ── */

test('tờ ĐÃ TRẢ in mã QR đặt online — đây là tờ khách cầm về', () => {
  const kh = boCucHoaDon(daTra(), {});
  const anh = anhCua(kh);
  assert.equal(anh.length, 1);
  assert.equal(anh[0].src, QR_DAT_ONLINE);
  assert.ok(co(kh, 'QUÉT ĐỂ ĐẶT ONLINE'));
  assert.ok(co(kh, QUAN.web));
});

test('tờ CHƯA TRẢ đã có mã VietQR thì KHÔNG in thêm mã thứ hai', () => {
  const kh = boCucHoaDon(HD, { qr: 'data:image/png;base64,xx' });
  const anh = anhCua(kh);
  assert.equal(anh.length, 1, 'hai mã trên một tờ là khách quét nhầm cái không thu tiền');
  assert.equal(anh[0].src, 'data:image/png;base64,xx', 'mã còn lại phải là mã CHUYỂN TIỀN');
  assert.ok(co(kh, 'Đặt online: ' + QUAN.web), 'vẫn nhắc bằng chữ, chỉ là không thêm mã');
});

test('tờ chưa trả mà không lấy được mã VietQR thì vẫn in mã đặt online', () => {
  const kh = boCucHoaDon(HD, {});
  assert.equal(anhCua(kh).length, 1);
  assert.equal(anhCua(kh)[0].src, QR_DAT_ONLINE);
});

test('mã QR đặt online nhúng thẳng trong mã nguồn, không gọi mạng', () => {
  assert.match(QR_DAT_ONLINE, /^data:image\/png;base64,/);
  assert.ok(QR_DAT_ONLINE.length > 200, 'chuỗi quá ngắn thì không phải một mã QR thật');
});

/* ── thu ngân ── */

test('in tên thu ngân, nhưng chỉ phần trước @', () => {
  const kh = boCucHoaDon(daTra({ thuBoi: 'linh.nv@ghecauhai.vn' }), {});
  const het = chuCua(kh).join(' ');
  assert.ok(het.includes('linh.nv'));
  assert.equal(het.includes('@ghecauhai.vn'), false,
    'phơi email đầy đủ của nhân viên lên tờ giấy phát cho khách là không cần thiết');
});

test('không biết ai thu thì bỏ hẳn dòng đó, không in "không rõ"', () => {
  assert.equal(co(boCucHoaDon(daTra(), {}), 'Thu ngân'), false);
});

/* ── tiền thối ── */

test('có thối tiền thì in ra để khách đối chiếu tại quầy', () => {
  const kh = boCucHoaDon(daTra({ khachDua: 100000, tienThoi: 15000 }), {});
  assert.ok(co(kh, 'Khách đưa'));
  assert.ok(co(kh, '100.000đ'));
  assert.ok(co(kh, 'Tiền thối'));
  assert.ok(co(kh, '15.000đ'));
});

test('đưa đúng tiền thì không in hai dòng thừa', () => {
  const kh = boCucHoaDon(daTra({ khachDua: 85000, tienThoi: 0 }), {});
  assert.equal(co(kh, 'Tiền thối'), false);
});

/* ── khổ giấy ── */

test('không dòng nào của chân hoá đơn tràn khổ, kể cả 58mm', () => {
  for (const kho of ['58', '80']) {
    const kh = boCucHoaDon(daTra({ thuBoi: 'nguyenthihoanganh@ghecauhai.vn', khachDua: 500000, tienThoi: 415000 }), { kho });
    for (const k of kh.filter((x) => x.kieu === 'chu')) {
      assert.ok(k.chu.length * (k.co || 1) <= SO_COT[kho],
        `khổ ${kho}: "${k.chu}" cỡ ${k.co || 1} chiếm ${k.chu.length * (k.co || 1)}/${SO_COT[kho]} cột`);
    }
  }
});

test('KHÔNG gọi tờ giấy này là "hoá đơn"', () => {
  for (const b of [HD, daTra()]) {
    const het = chuCua(boCucHoaDon(b, {})).join(' ');
    assert.equal(/HÓA ĐƠN/.test(het), false,
      'chưa phát hành hoá đơn điện tử thì đây không phải hoá đơn theo nghĩa của cơ quan thuế');
  }
});

/* ══════════════════ pháp nhân trên phiếu ══════════════════

   Tờ giấy có số tiền mà không nói ai bán là chỗ dễ bị hỏi. Tên đăng ký kinh
   doanh khác tên thương hiệu, và phải có cả hai: một cái để khách nhớ, một cái
   để cơ quan thuế đọc.                                                      */

test('phiếu có TÊN ĐĂNG KÝ KINH DOANH, không chỉ tên thương hiệu', () => {
  for (const b of [HD, daTra()]) {
    const het = chuCua(boCucHoaDon(b, {})).join(' ');
    assert.ok(het.includes(QUAN.ten), 'thiếu thương hiệu');
    assert.ok(het.includes(QUAN.phapNhan), 'thiếu pháp nhân — tờ giấy không nói ai bán');
  }
});

test('thương hiệu vẫn là chữ TO NHẤT trên tờ giấy', () => {
  const kh = boCucHoaDon(daTra(), {});
  const hieu = kh.find((k) => k.chu === QUAN.ten);
  const phap = kh.find((k) => k.chu === QUAN.phapNhan);
  assert.equal(hieu.co, 2);
  assert.ok(!phap.co || phap.co === 1,
    'pháp nhân mà to bằng thương hiệu thì khách nhớ nhầm tên quán');
  const toHon = kh.filter((k) => k.kieu === 'chu' && (k.co || 1) > 1 && k.chu !== QUAN.ten);
  assert.equal(toHon.length, 1);
  assert.ok(toHon[0].chu.startsWith('TỔNG CỘNG'),
    'chỉ TỔNG CỘNG được to ngang thương hiệu, thấy: ' + toHon[0].chu);
});

test('thương hiệu đứng TRƯỚC pháp nhân', () => {
  const chu = chuCua(boCucHoaDon(daTra(), {}));
  assert.ok(chu.indexOf(QUAN.ten) < chu.indexOf(QUAN.phapNhan));
});

test('pháp nhân đi LIỀN địa chỉ — đó là khối người ta đọc để biết ai bán ở đâu', () => {
  const chu = chuCua(boCucHoaDon(daTra(), {}));
  const iPhap = chu.indexOf(QUAN.phapNhan);
  const iDiaChi = chu.findIndex((c) => c.includes('Trường Chinh'));
  assert.ok(iDiaChi > iPhap && iDiaChi - iPhap <= 2,
    `pháp nhân ở dòng ${iPhap}, địa chỉ ở dòng ${iDiaChi} — rải xa nhau thì phải đi tìm`);
});

test('chưa có mã số thuế thì KHÔNG in dòng MST rỗng', () => {
  const het = chuCua(boCucHoaDon(daTra(), {})).join(' ');
  assert.equal(/MST/.test(het), QUAN.maSoThue ? true : false,
    'in "MST:" trống là tệ hơn không in — nhìn như quên điền');
});

test('pháp nhân không tràn khổ giấy hẹp nhất', () => {
  for (const kho of ['58', '80']) {
    for (const d of ngatDong(QUAN.phapNhan, SO_COT[kho])) {
      assert.ok(d.length <= SO_COT[kho], `khổ ${kho}: "${d}"`);
    }
  }
  assert.equal(ngatDong(QUAN.phapNhan, SO_COT['58']).length, 1,
    'gãy hai dòng ở khổ 58mm thì đầu phiếu trông lộn xộn — rút gọn tên lại');
});
