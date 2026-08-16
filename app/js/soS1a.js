/* ==========================================================================
   soS1a.js — dựng Sổ doanh thu bán hàng hoá, dịch vụ (Mẫu S1a-HKD)

   Module THUẦN: vào là danh sách hoá đơn, ra là mảng dòng của sổ. Không đụng
   DOM, không đụng Firebase — vì đây là sổ nộp cho cơ quan thuế, và thứ đáng
   kiểm nhất ở đây là CON SỐ, không phải cái nút bấm.

   ── Sổ này KHÁC báo cáo doanh thu đang có ───────────────────────────────────

   Nút "Xuất CSV" cũ tổng hợp theo MÓN: mỗi dòng một tên món, cộng cả kỳ. Hữu
   ích để biết bán gì chạy, nhưng không phải sổ kế toán.

   Sổ S1a-HKD ghi theo THỜI GIAN: mỗi dòng một chứng từ, xếp theo ngày phát
   sinh, cộng dồn theo tháng và theo quý. Hai thứ khác nhau về bản chất nên
   giữ cả hai, không thay thế.

   ── Phạm vi: CHỈ doanh thu TẠI QUÁN ─────────────────────────────────────────

   App này chỉ nhìn thấy hoá đơn `QCH…` trong Realtime Database. Đơn đặt online
   (`GCH…`) nằm ở Firestore của app khách, app này không đọc được.

   Sổ thuế thiếu doanh thu thì tệ hơn hẳn không có sổ. Nên hàm dựng sổ LUÔN
   chèn một dòng cảnh báo ngay đầu tệp — không có công tắc tắt nó đi. Ai cầm
   tệp này cũng phải đọc được điều đó trước khi đọc con số.

   ── Nguồn tham khảo ─────────────────────────────────────────────────────────

   Mẫu S1a-HKD ban hành kèm Thông tư 152/2025/TT-BTC (thay chế độ kế toán ở
   Thông tư 88/2021/TT-BTC), áp dụng từ 01/01/2026, dành cho hộ kinh doanh
   không thuộc diện chịu thuế GTGT và không phải nộp thuế TNCN.

   Cấu trúc cột dựng theo mô tả ở các nguồn thứ cấp, CHƯA đối chiếu nguyên văn
   thông tư. Trước khi nộp lần đầu nên đưa kế toán xem một bản.
   ========================================================================== */

/** Nhãn cột, đúng thứ tự in ra tệp. */
export const COT_S1A = [
  ['A', 'Ngày, tháng ghi sổ'],
  ['B', 'Số hiệu chứng từ'],
  ['C', 'Ngày, tháng chứng từ'],
  ['D', 'Diễn giải'],
  ['1', 'Doanh thu (VND)'],
];

const hai = (n) => String(n).padStart(2, '0');

/** `Date` -> `dd/mm/yyyy`. Giờ máy, vì quán và sổ cùng ở một múi giờ. */
export function ngayVN(t) {
  const d = t instanceof Date ? t : new Date(Number(t) || 0);
  if (!Number.isFinite(d.getTime()) || d.getTime() <= 0) return '';
  return `${hai(d.getDate())}/${hai(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Khoá tháng `yyyy-mm` để gom, sắp xếp và biết lúc nào sang quý mới. */
export const khoaThang = (t) => {
  const d = t instanceof Date ? t : new Date(Number(t) || 0);
  return `${d.getFullYear()}-${hai(d.getMonth() + 1)}`;
};

export const quyCua = (khoa) => Math.floor((Number(khoa.slice(5, 7)) - 1) / 3) + 1;

/**
 * Mốc thời gian của một hoá đơn, dùng làm NGÀY PHÁT SINH.
 *
 * `paidAt` (lúc thu tiền) đứng trước `createdAt` (lúc tạo hoá đơn): doanh thu
 * phát sinh khi thu được tiền. Hai mốc này gần như luôn cùng ngày, trừ hoá đơn
 * tạo lúc 23:50 mà khách trả lúc 00:05 — và đúng ca đó thì ghi sang ngày mới
 * mới là đúng.
 */
export const mocHoaDon = (b) => Number(b?.paidAt) || Number(b?.tinhToiLuc) || Number(b?.createdAt) || 0;

/**
 * Diễn giải một hoá đơn: bán cái gì.
 *
 * Cắt bớt khi quá dài — một hoá đơn mười món mà liệt kê hết thì ô diễn giải
 * dài hơn cả trang. Nhưng phải NÓI RA là đã cắt, y như ghi chú trên nhãn ly:
 * im lặng cắt mất nửa danh sách thì người đối chiếu tưởng hoá đơn chỉ có ngần
 * ấy món.
 */
export function dienGiai(b, tran = 80) {
  const ds = (b?.items ?? [])
    .map((i) => {
      const ten = String(i?.name ?? '').trim();
      const sl = Number(i?.qty) || 0;
      return ten ? (sl > 1 ? `${ten} x${sl}` : ten) : '';
    })
    .filter(Boolean);

  const dau = b?.table != null && b.table !== '' ? `Bán hàng ăn uống (bàn ${b.table})` : 'Bán hàng ăn uống';
  if (!ds.length) return dau;

  let mon = ds.join(', ');
  if (mon.length > tran) {
    let cat = mon.slice(0, tran);
    const khoang = cat.lastIndexOf(', ');
    if (khoang > tran * 0.5) cat = cat.slice(0, khoang);
    const con = ds.length - cat.split(', ').length;
    mon = `${cat}… và ${con} món nữa`;
  }
  return `${dau}: ${mon}`;
}

/**
 * Doanh thu ghi sổ của một hoá đơn.
 *
 * Lấy `total` — giá trị bán ra SAU giảm giá — chứ không lấy `paidAmount`.
 * Khách chuyển thừa rồi quán trả lại thì phần thừa không phải doanh thu; ghi
 * theo số nhận được là sổ vống lên đúng bằng chỗ tiền không phải của quán.
 */
export const doanhThuCua = (b) => Math.max(0, Math.round(Number(b?.total) || 0));

/**
 * Dựng toàn bộ dòng của sổ.
 *
 * @param {Array}  bills  hoá đơn thô từ RTDB
 * @param {object} [o]
 * @param {Date}   [o.ghiSoLuc]  ngày ghi sổ, mặc định là hôm nay
 * @returns {{dong:Array, tong:number, soChungTu:number, boQua:number}}
 *   Mỗi dòng: `{ loai, A, B, C, D, tien }` với `loai` ∈
 *   `'chungTu' | 'congThang' | 'congQuy' | 'tongCong'`.
 */
export function dungSoS1a(bills = [], o = {}) {
  const ghiSo = ngayVN(o.ghiSoLuc instanceof Date ? o.ghiSoLuc : new Date());

  // Chỉ hoá đơn ĐÃ THU TIỀN mới là doanh thu. Hoá đơn còn treo thì tiền chưa
  // vào, ghi vào sổ là khai khống.
  const hd = (bills ?? [])
    .filter((b) => b?.status === 'paid' && mocHoaDon(b) > 0)
    .map((b) => ({ b, moc: mocHoaDon(b) }))
    .sort((x, y) => x.moc - y.moc);          // theo thứ tự thời gian phát sinh

  const boQua = (bills ?? []).filter((b) => b?.status === 'paid' && !mocHoaDon(b)).length;

  const dong = [];
  let tong = 0;
  let thangHienTai = null;
  let congThang = 0;
  let congQuy = 0;

  const chotThang = () => {
    if (thangHienTai == null) return;
    const [nam, thg] = thangHienTai.split('-');
    dong.push({ loai: 'congThang', A: '', B: '', C: '', D: `Cộng tháng ${Number(thg)}/${nam}`, tien: congThang });
    congThang = 0;
  };
  const chotQuy = (khoa) => {
    dong.push({
      loai: 'congQuy', A: '', B: '', C: '',
      D: `CỘNG QUÝ ${quyCua(khoa)}/${khoa.slice(0, 4)}`, tien: congQuy,
    });
    congQuy = 0;
  };

  for (const { b, moc } of hd) {
    const khoa = khoaThang(moc);
    if (khoa !== thangHienTai) {
      if (thangHienTai != null) {
        chotThang();
        // Sang quý mới thì chốt quý cũ TRƯỚC khi mở tháng đầu quý mới.
        if (quyCua(khoa) !== quyCua(thangHienTai) || khoa.slice(0, 4) !== thangHienTai.slice(0, 4)) {
          chotQuy(thangHienTai);
        }
      }
      thangHienTai = khoa;
    }

    const tien = doanhThuCua(b);
    dong.push({
      loai: 'chungTu',
      A: ghiSo,
      B: String(b.code ?? b.key ?? ''),
      C: ngayVN(moc),
      D: dienGiai(b),
      tien,
    });
    tong += tien;
    congThang += tien;
    congQuy += tien;
  }

  if (thangHienTai != null) { chotThang(); chotQuy(thangHienTai); }

  dong.push({ loai: 'tongCong', A: '', B: '', C: '', D: 'TỔNG CỘNG', tien: tong });
  return { dong, tong, soChungTu: hd.length, boQua };
}

/* ══════════════════ xuất ra tệp CSV ══════════════════ */

const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';

/**
 * Toàn bộ nội dung tệp sổ S1a-HKD.
 *
 * @param {Array}  bills
 * @param {object} quan   { phapNhan, maSoThue, diaChi, ten }
 * @param {object} [o]    { from, to, ghiSoLuc }
 * @returns {{noiDung:string, ten:string, tong:number, soChungTu:number}}
 */
export function csvS1a(bills = [], quan = {}, o = {}) {
  const { dong, tong, soChungTu, boQua } = dungSoS1a(bills, o);
  const nam = (o.from || o.to || new Date().toISOString()).slice(0, 4);

  const L = [];
  const dongTrong = () => L.push('');

  // ── thông tin chung ──────────────────────────────────────────────────────
  L.push([q('Đơn vị:'), q(quan.phapNhan || quan.ten || '')].join(','));
  L.push([q('Mã số thuế:'), q(quan.maSoThue || '(chưa có)')].join(','));
  L.push([q('Địa chỉ:'), q(quan.diaChi || '')].join(','));
  dongTrong();
  L.push([q('SỔ DOANH THU BÁN HÀNG HOÁ, DỊCH VỤ')].join(','));
  L.push([q('Mẫu số S1a-HKD')].join(','));
  L.push([q('Năm:'), q(nam)].join(','));
  if (o.from || o.to) L.push([q('Kỳ:'), q(`${o.from || '…'} đến ${o.to || '…'}`)].join(','));
  L.push([q('Đơn vị tiền tệ:'), q('VND')].join(','));
  dongTrong();

  // ── cảnh báo phạm vi: KHÔNG có công tắc tắt ──────────────────────────────
  //
  // Sổ thuế thiếu doanh thu tệ hơn hẳn không có sổ, và người mở tệp này ba
  // tháng sau sẽ không nhớ nó lấy từ đâu ra. Dòng này phải nằm TRÊN con số.
  L.push([q('LƯU Ý: Sổ này chỉ gồm doanh thu BÁN TẠI QUÁN (hoá đơn QCH...).')].join(','));
  L.push([q('Đơn đặt online (GCH...) nằm ở hệ thống khác, PHẢI cộng thêm trước khi nộp.')].join(','));
  dongTrong();

  // ── bảng ─────────────────────────────────────────────────────────────────
  L.push(COT_S1A.map(([k]) => q(k)).join(','));
  L.push(COT_S1A.map(([, ten]) => q(ten)).join(','));

  for (const d of dong) {
    L.push([q(d.A), q(d.B), q(d.C), q(d.D), d.tien].join(','));
  }

  dongTrong();
  L.push([q('Số chứng từ:'), soChungTu].join(','));
  if (boQua) {
    L.push([q('Hoá đơn đã thu tiền nhưng thiếu mốc thời gian, KHÔNG ghi được vào sổ:'), boQua].join(','));
  }
  dongTrong();
  L.push([q('Người lập biểu'), '', '', q('Người đại diện hộ kinh doanh')].join(','));
  L.push([q('(Ký, họ tên)'), '', '', q('(Ký, họ tên)')].join(','));

  const ten = `so-S1a-HKD-${o.from || nam}${o.to && o.to !== o.from ? '_' + o.to : ''}.csv`;
  // BOM UTF-8 + CRLF: Excel tiếng Việt mở tệp không có BOM là ra chữ vuông.
  return { noiDung: '\ufeff' + L.join('\r\n'), ten, tong, soChungTu };
}
