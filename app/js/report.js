/* ==========================================================================
   report.js — Thống kê kinh doanh
   Chọn kỳ: Ngày / Tháng / Năm / Khoảng / Tất cả.

   Doanh thu dựa trên đơn giá đã chốt lúc bán; bản ghi cũ dùng giá hiện tại
   trong Menu và được đánh dấu rõ.

   GIẢM GIÁ nằm ở hóa đơn chứ không ở dòng lịch sử, nên mọi con số tiền ở đây
   đều là THỰC THU — đã trừ phần giảm của hóa đơn đã thanh toán. Cách nối dòng
   lịch sử với hóa đơn nằm ở thucThu.js.
   ========================================================================== */
import {
  el, esc, money, moneyShort, nf, ymd, addDays, dmy, slug, parsePrice,
  data, onData, resolvePrice, toast, store, mocCua, taiHoaDonKhoang, taiHoaDonXoa,
  khoiPhucHoaDon, sheet
} from './core.js';
import { ganThucThu, congSo, congTheoCachTra, CACH_TRA } from './thucThu.js';
import { csvS1a, mocHoaDon } from './soS1a.js';
import { QUAN } from './quanInfo.js';

let mode   = store.get('rp.mode', 'day');    // day | month | year | range | all
let metric = 'rev';
let sortKey = 'rev', sortDir = -1, query = '';
let mounted = false;

const CSS = `
.rkpi{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
.rtra{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;margin-top:4px}
.rtra b{font-weight:700;text-align:right;font-variant-numeric:tabular-nums}
.rtra span{color:var(--ink-2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk{background:var(--surface);border:1px solid var(--line);border-radius:14px;
    padding:13px 14px;box-shadow:var(--shadow-1)}
.rk.wide{grid-column:span 2}
.rk .l{font-size:10.5px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em}
.rk .v{font-size:25px;font-weight:700;letter-spacing:-.03em;line-height:1.1;margin-top:6px;
       font-variant-numeric:tabular-nums}
.rk .v small{font-size:13px;font-weight:600;color:var(--ink-3);margin-left:4px}
.rk .s{font-size:11.5px;color:var(--ink-2);margin-top:5px;line-height:1.35;
       overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rk.accent{background:var(--brand);border-color:var(--brand)}
.rk.accent .l{color:rgba(255,255,255,.72)}
.rk.accent .v{color:#fff;font-size:31px}
.rk.accent .s{color:rgba(255,255,255,.85)}
.rk.bad .v{color:var(--late)}
.rbanner{display:none;gap:9px;background:var(--warn-soft);border:1px solid #edd9b0;border-radius:13px;
         padding:11px 13px;font-size:12.5px;line-height:1.5;color:#7a4a08;margin-bottom:12px}
.rbanner.show{display:flex}
.rbanner b{display:block}
.irow{display:flex;align-items:center;gap:11px;padding:11px 0;border-bottom:1px solid var(--line)}
.irow:last-child{border-bottom:0}
.irow .rk2{flex:none;width:25px;height:25px;border-radius:8px;background:var(--bg);color:var(--ink-2);
           display:grid;place-items:center;font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}
.irow:nth-child(1) .rk2{background:var(--brand);color:#fff}
.irow:nth-child(2) .rk2,.irow:nth-child(3) .rk2{background:var(--brand-soft);color:var(--brand)}
.irow .ii{flex:1;min-width:0}
.irow .nm{font-size:14.5px;font-weight:600;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.irow .mt{font-size:11.5px;color:var(--ink-3);margin-top:2px;font-variant-numeric:tabular-nums}
.irow .vv{flex:none;text-align:right}
.irow .vv .r{font-size:15px;font-weight:700;font-variant-numeric:tabular-nums}
.irow .vv .p{font-size:11px;color:var(--ink-3);font-variant-numeric:tabular-nums}
.flag{font-size:9.5px;font-weight:700;color:var(--warn);background:var(--warn-soft);
      border-radius:5px;padding:1px 5px;margin-left:5px;white-space:nowrap}
.flag.g{color:var(--ink-3);background:var(--bg)}
.bar{height:5px;background:var(--bg);border-radius:99px;overflow:hidden;margin-top:5px}
.bar i{display:block;height:100%;background:var(--brand-2);border-radius:99px}
.rchart{display:flex;align-items:flex-end;gap:4px;height:150px;padding-top:16px}
.rcol{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px;
      min-width:0;position:relative}
.rcol i{display:block;width:100%;max-width:34px;background:var(--brand-2);border-radius:4px 4px 0 0;min-height:3px}
.rcol em{font-size:9px;color:var(--ink-3);font-style:normal;white-space:nowrap;font-variant-numeric:tabular-nums}
.rcol b{position:absolute;top:0;font-size:9px;font-weight:700;color:var(--ink-2);white-space:nowrap}
.cxr{display:flex;align-items:center;gap:11px;padding:10px 0;border-bottom:1px solid var(--line);font-size:13.5px}
.cxr:last-child{border-bottom:0}
.cxr .q{flex:none;width:30px;height:30px;border-radius:9px;background:var(--late-soft);color:var(--late);
        display:grid;place-items:center;font-size:13px;font-weight:700}
.cxr .n{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cxr .rs{font-size:11px;color:var(--ink-3);margin-top:1px;font-weight:500}
.cxr .v{flex:none;font-weight:700;color:var(--late);font-variant-numeric:tabular-nums}
.xrow{display:flex;align-items:center;gap:11px;padding:11px 0;border-bottom:1px solid var(--line)}
.xrow:last-child{border-bottom:0}
.xrow .xi{flex:1;min-width:0}
.xrow .xm{font-size:13.5px;font-weight:700;font-variant-numeric:tabular-nums;
          overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.xrow .xs{font-size:11.5px;color:var(--ink-3);margin-top:2px;line-height:1.35}
.xrow .xv{flex:none;text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
`;

function shell(){
  return `
  <div class="seg wrap" id="rpMode" style="margin-bottom:10px">
    <button data-m="day">Ngày</button>
    <button data-m="month">Tháng</button>
    <button data-m="year">Năm</button>
    <button data-m="range">Khoảng</button>
    <button data-m="all">Tất cả</button>
  </div>

  <div id="rpCtlDay" class="hide">
    <input type="date" id="rpDate">
    <div class="row mt8">
      <button class="btn sm" data-jump="0" style="flex:1">Hôm nay</button>
      <button class="btn sm" data-jump="-1" style="flex:1">Hôm qua</button>
    </div>
  </div>
  <div id="rpCtlMonth" class="hide"><input type="month" id="rpMonth"></div>
  <div id="rpCtlYear" class="hide"><select id="rpYear"></select></div>
  <div id="rpCtlRange" class="hide">
    <input type="date" id="rpFrom">
    <input type="date" id="rpTo" class="mt8">
  </div>

  <div class="sec-label" id="rpCaption"></div>
  <div class="rbanner" id="rpBanner"><span>⚠️</span><span id="rpBannerTxt"></span></div>

  <div class="rkpi">
    <div class="rk accent wide"><div class="l">Doanh thu</div>
      <div class="v" id="rpRev">–</div><div class="s" id="rpRevSub"></div></div>
    <div class="rk"><div class="l">Sản lượng</div>
      <div class="v"><span id="rpQty">–</span><small>ly</small></div><div class="s" id="rpQtySub"></div></div>
    <div class="rk"><div class="l">TB mỗi ly</div>
      <div class="v" id="rpAvg" style="font-size:20px">–</div><div class="s" id="rpAvgSub"></div></div>
    <div class="rk wide hide" id="rpDiscCard"><div class="l">Đã giảm giá</div>
      <div class="v" id="rpDisc" style="font-size:20px">–</div><div class="s" id="rpDiscSub"></div></div>
    <div class="rk wide" id="rpTraCard"><div class="l">Tiền vào bằng đường nào</div>
      <div class="rtra" id="rpTra"></div><div class="s" id="rpTraSub"></div></div>
    <div class="rk wide"><div class="l">Món doanh thu cao nhất</div>
      <div class="v" id="rpTop" style="font-size:17px">–</div><div class="s" id="rpTopSub"></div></div>
    <div class="rk bad wide"><div class="l">Đã hủy</div>
      <div class="v" id="rpCx" style="font-size:20px">–</div><div class="s" id="rpCxSub"></div></div>
  </div>

  <div class="card">
    <div class="card-head"><span class="card-title" id="rpChartT">Biểu đồ</span>
      <span class="card-note" id="rpChartN"></span><div class="spacer"></div>
      <div class="seg" id="rpMetric" style="width:auto">
        <button data-v="rev" style="min-height:32px;padding:0 12px">₫</button>
        <button data-v="qty" style="min-height:32px;padding:0 12px">Ly</button>
      </div></div>
    <div class="card-body"><div class="rchart" id="rpChart"></div></div>
  </div>

  <div class="card">
    <div class="card-head"><span class="card-title">Chi tiết theo món</span>
      <span class="card-note" id="rpTblN"></span></div>
    <div class="card-body" style="padding-top:6px">
      <div class="field" style="margin-bottom:6px"><span class="ic">🔍</span>
        <input type="search" id="rpQ" placeholder="Tìm tên món…" autocomplete="off"></div>
      <div class="seg" id="rpSort" style="margin:10px 0 4px">
        <button data-s="rev">Doanh thu</button>
        <button data-s="qty">Số lượng</button>
        <button data-s="name">Tên</button>
      </div>
      <div id="rpItems"></div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><span class="card-title">Món bị hủy</span>
      <span class="card-note" id="rpCxN"></span></div>
    <div class="card-body" id="rpCxList"></div>
  </div>

  <div class="card hide" id="rpXoaCard">
    <div class="card-head"><span class="card-title">Hóa đơn đã xóa</span>
      <span class="card-note" id="rpXoaN"></span></div>
    <div class="card-body" id="rpXoaList"></div>
  </div>

  <button class="btn block mt16" id="rpCsv">⬇ Xuất CSV doanh thu theo món</button>
  <button class="btn block mt8" id="rpS1a">📒 Xuất sổ S1a-HKD (nộp thuế)</button>
  <p style="color:var(--ink-3);font-size:12.5px;line-height:1.5;margin-top:8px">
    Sổ S1a-HKD ghi theo <b>từng hoá đơn</b>, xếp theo ngày, cộng dồn theo tháng và quý.
    Chỉ gồm doanh thu <b>bán tại quán</b> — đơn đặt online nằm ở hệ thống khác, phải cộng
    thêm trước khi nộp.
  </p>`;
}

export function mountReport(root){
  if (mounted) return;
  const st = document.createElement('style'); st.textContent = CSS;
  document.head.appendChild(st);
  root.innerHTML = shell();

  const t = new Date();
  el('rpDate').value  = ymd(t);
  el('rpMonth').value = ymd(t).slice(0,7);
  el('rpFrom').value  = ymd(addDays(t,-6));
  el('rpTo').value    = ymd(t);
  years();

  el('rpMode').onclick = e => {
    const b = e.target.closest('button[data-m]'); if (!b) return;
    mode = b.dataset.m; store.set('rp.mode', mode); render();
  };
  el('rpMetric').onclick = e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    metric = b.dataset.v; render();
  };
  el('rpSort').onclick = e => {
    const b = e.target.closest('button[data-s]'); if (!b) return;
    if (sortKey === b.dataset.s) sortDir *= -1; else { sortKey = b.dataset.s; sortDir = -1; }
    render();
  };
  el('rpCtlDay').onclick = e => {
    const b = e.target.closest('[data-jump]'); if (!b) return;
    el('rpDate').value = ymd(addDays(new Date(), +b.dataset.jump)); render();
  };
  ['rpDate','rpMonth','rpYear','rpFrom','rpTo'].forEach(id => el(id).onchange = render);
  el('rpQ').oninput = e => { query = e.target.value.trim().toLowerCase(); render(); };
  el('rpCsv').onclick = csv;
  el('rpS1a').onclick = xuatS1a;
  el('rpXoaList').onclick = e => {
    const b = e.target.closest('[data-xoa-phuc]');
    if (b) khoiPhucSheet(b.dataset.xoaPhuc);
  };

  onData(w => {
    // 'bills' cũng phải nghe: thu ngân bấm "đã trả" là hóa đơn đó mới bắt đầu
    // được trừ giảm giá. Bỏ kỳ đã tải để lần vẽ tới nạp lại bản mới.
    // Xóa một hóa đơn cũng bắn 'bills', nên bỏ luôn danh sách đã xóa — hóa đơn
    // vừa xóa mà không thấy trong thẻ thì người ta tưởng bản sao không có.
    if (w === 'bills'){ kyDaTai = null; dangTaiHoaDon = null; xoaDaTai = null; render(); return; }
    if (w === 'history' || w === 'cancelled' || w === 'menu'){ years(); render(); }
  });
  render();
  mounted = true;
}

/* ─────────────────── chuẩn hóa ─────────────────── */
function norm(d){
  let date = d.completedDate || d.date || null;
  const ts = typeof d.timestamp === 'number' ? d.timestamp : null;
  if (!date && ts) date = ymd(new Date(ts));
  const qty = Number(d.quantity) || 0;
  const { price, live } = resolvePrice(d);
  const stored = parsePrice(d.revenue);
  return { item: String(d.item ?? '(không tên)'), qty, date, ts, price, live,
           // Bàn + mốc thời gian: hai thứ duy nhất để nối dòng này với hóa đơn
           // đã thu tiền nó. `mocCua` là đúng hàm phien.js dùng để cắt phiên bàn.
           table: d.table ?? null, moc: mocCua(d),
           revenue: stored !== null ? stored : (price !== null ? price*qty : 0),
           hasPrice: price !== null };
}
function normCx(d){
  let date = d.cancelledDate || null;
  const ts = typeof d.timestamp === 'number' ? d.timestamp : null;
  if (!date && ts) date = ymd(new Date(ts));
  const qty = Number(d.quantity) || 0;
  const { price } = resolvePrice(d);
  const stored = parsePrice(d.lostRevenue);
  return { item: String(d.item ?? '(không tên)'), qty, date, reason: d.reason || null,
           lost: stored !== null ? stored : (price !== null ? price*qty : 0) };
}

function years(){
  const sel = el('rpYear'); if (!sel) return;
  const cur = sel.value;
  const ys = new Set([String(new Date().getFullYear())]);
  data.history.forEach(d => { const x = d.completedDate || d.date; if (x) ys.add(String(x).slice(0,4)); });
  data.cancelled.forEach(d => { if (d.cancelledDate) ys.add(String(d.cancelledDate).slice(0,4)); });
  const list = [...ys].sort().reverse();
  sel.innerHTML = list.map(y => `<option value="${y}">${y}</option>`).join('');
  sel.value = list.includes(cur) ? cur : list[0];
}

function range(){
  switch(mode){
    case 'day':   { const v = el('rpDate').value;  return v ? [v,v] : [null,null]; }
    case 'month': { const v = el('rpMonth').value; return v ? [v+'-01', v+'-31'] : [null,null]; }
    case 'year':  { const v = el('rpYear').value;  return v ? [v+'-01-01', v+'-12-31'] : [null,null]; }
    case 'range': return [el('rpFrom').value||null, el('rpTo').value||null];
    default: return [null,null];
  }
}
function caption(from,to){
  if (mode === 'all')  return 'Toàn bộ dữ liệu';
  if (mode === 'year') return 'Năm ' + el('rpYear').value;
  if (mode === 'month'){ const v = el('rpMonth').value;
    return v ? 'Tháng ' + v.slice(5,7) + '/' + v.slice(0,4) : 'Chưa chọn tháng'; }
  if (mode === 'day'){ const v = el('rpDate').value;
    if (!v) return 'Chưa chọn ngày';
    return new Date(v+'T00:00:00').toLocaleDateString('vi-VN',
      { weekday:'long', day:'2-digit', month:'2-digit', year:'numeric' }); }
  if (!from && !to) return 'Chưa chọn khoảng';
  return 'Từ ' + dmy(from) + '/' + from.slice(0,4) + ' đến ' + dmy(to) + '/' + to.slice(0,4);
}
const inR = (d,f,t) => { if (!d) return !f && !t; if (f && d < f) return false; if (t && d > t) return false; return true; };

function gran(from,to,rows){
  if (mode === 'day') return 'hour';
  if (mode === 'month') return 'day';
  if (mode === 'year') return 'month';
  let a = from, b = to;
  if (!a || !b){ const ds = rows.map(r=>r.date).filter(Boolean).sort(); a = a||ds[0]; b = b||ds[ds.length-1]; }
  if (!a || !b) return 'day';
  return (new Date(b) - new Date(a))/864e5 > 62 ? 'month' : 'day';
}
const bLabel = (k,g) => g==='hour' ? k+'h' : g==='month' ? 'T'+k.slice(5,7) : dmy(k);

/* ─────────────────── hóa đơn của kỳ đang xem ───────────────────

   `data.bills` chỉ giữ 200 hóa đơn gần nhất — đủ cho màn POS và cho báo cáo
   hôm nay, thiếu hẳn cho báo cáo cả tháng. Thiếu hóa đơn nghĩa là phần giảm
   giá của kỳ đó biến mất và doanh thu bị thổi lên đúng bằng số đã giảm.

   Nên tải riêng theo khoảng ngày. Trong lúc chờ thì vẫn vẽ bằng 200 cái đang
   có — thà số gần đúng hiện ngay còn hơn màn trắng — và nói rõ trên biểu ngữ
   là đang tải, để không ai chốt sổ bằng con số tạm. */
let kyDaTai = null;         // { khoa, list }
let dangTaiHoaDon = null;   // khóa kỳ đang tải, null nếu rảnh

function hoaDonKy(from, to){
  const khoa = `${from || ''}|${to || ''}`;
  if (kyDaTai && kyDaTai.khoa === khoa) return kyDaTai.list;

  if (dangTaiHoaDon !== khoa){
    dangTaiHoaDon = khoa;
    taiHoaDonKhoang(from, to).then(list => {
      if (dangTaiHoaDon !== khoa) return;      // người dùng đã đổi kỳ, bỏ kết quả cũ
      dangTaiHoaDon = null;
      if (list){ kyDaTai = { khoa, list }; render(); }
    });
  }
  return data.bills;
}

/* ─────────────────── vẽ ─────────────────── */
let last = null;
function render(){
  [...el('rpMode').children].forEach(b => b.classList.toggle('active', b.dataset.m === mode));
  [...el('rpMetric').children].forEach(b => b.classList.toggle('active', b.dataset.v === metric));
  [...el('rpSort').children].forEach(b => b.classList.toggle('active', b.dataset.s === sortKey));
  ['Day','Month','Year','Range'].forEach(m =>
    el('rpCtl'+m).classList.toggle('hide', mode !== m.toLowerCase()));

  const [from,to] = range();
  el('rpCaption').textContent = caption(from,to);

  const tho  = data.history.map(norm).filter(r => inR(r.date, from, to));
  const rows = ganThucThu(tho, hoaDonKy(from, to));
  const cx   = data.cancelled.map(normCx).filter(r => inR(r.date, from, to));

  const byItem = new Map();
  rows.forEach(r => {
    const c = byItem.get(r.item) || { qty:0, rev:0, goc:0, price:r.price, live:r.live, hasPrice:r.hasPrice };
    c.qty += r.qty; c.rev += r.thucThu; c.goc += r.revenue;
    if (c.price == null && r.price != null){ c.price = r.price; c.hasPrice = true; c.live = r.live; }
    byItem.set(r.item, c);
  });

  const tQty = rows.reduce((s,r)=>s+r.qty,0);
  const so   = congSo(rows);
  const tRev = so.thuc;
  const days = new Set(rows.map(r=>r.date).filter(Boolean));
  const miss = [...byItem.entries()].filter(([,v]) => !v.hasPrice);
  const live = [...byItem.values()].filter(v => v.live).length;

  const w = [];
  if (!data.menuLoaded) w.push('Chưa tải được bảng giá — doanh thu chỉ tính từ giá đã lưu khi bán.');
  if (dangTaiHoaDon) w.push('Đang tải hóa đơn của kỳ này — phần giảm giá có thể chưa trừ đủ.');
  if (miss.length) w.push(`<b>${miss.length} món chưa có đơn giá</b>${
    miss.slice(0,3).map(([n])=>esc(n)).join(', ')}${miss.length>3?'…':''} — tính 0₫ nên doanh thu thấp hơn thực tế.`);
  if (live) w.push(`${live} món dùng đơn giá hiện tại trong Menu (bán trước khi hệ thống lưu giá).`);
  // Ly đã pha mà chưa có hóa đơn nào thanh toán — vẫn cộng vào doanh thu theo
  // giá niêm yết, nhưng phải nói ra: đây là tiền chưa nằm trong két, và nếu
  // sau này thu có giảm giá thì con số hôm nay sẽ tụt xuống.
  if (so.chuaChot) w.push(`<b>${money(so.chuaChot)} chưa chốt hóa đơn</b>tính theo giá niêm yết. Bàn chưa thanh toán, hoặc thu tiền mà không tạo hóa đơn.`);
  el('rpBanner').className = w.length ? 'rbanner show' : 'rbanner';
  el('rpBannerTxt').innerHTML = w.join('<br>');

  el('rpRev').textContent = money(tRev);
  el('rpRevSub').textContent = rows.length
    ? `${nf.format(rows.length)} lượt bán · ${days.size} ngày${so.giam ? ' · đã trừ giảm giá' : ''}`
    : 'Chưa có giao dịch';
  el('rpQty').textContent = nf.format(tQty);
  el('rpQtySub').textContent = byItem.size ? byItem.size + ' loại món' : '';
  el('rpAvg').textContent = tQty ? money(tRev/tQty) : '–';
  el('rpAvgSub').textContent = days.size ? 'TB ngày ' + moneyShort(tRev/days.size) + '₫' : '';

  // Tiền vào bằng đường nào — để cuối ngày đếm được két và đối chiếu sao kê.
  // `payMethod` vốn đã nằm trong hóa đơn từ lâu, chỉ là chưa ai cộng nó lại.
  const tra = congTheoCachTra(rows);
  const roRang = ['tienmat', 'chuyenkhoan', 'khac'].filter(k => tra[k] > 0);
  el('rpTraCard').classList.toggle('hide', !roRang.length);
  el('rpTra').innerHTML = roRang.map(k =>
    `<span>${CACH_TRA[k].icon} ${CACH_TRA[k].nhan}</span><b>${money(tra[k])}</b>`).join('');
  el('rpTraSub').textContent = tra.chuaChot
    ? `Chưa tính ${money(tra.chuaChot)} của món chưa chốt hóa đơn`
    : (roRang.length > 1 ? 'Cộng lại đúng bằng doanh thu ở trên' : '');

  el('rpDiscCard').classList.toggle('hide', !so.giam);
  el('rpDisc').textContent = '−' + money(so.giam);
  el('rpDiscSub').textContent = so.giam
    ? `${nf.format(so.soDongGiam)} lượt bán · niêm yết ${money(so.goc)} · thực thu ${
        (tRev / so.goc * 100).toFixed(1)}%`
    : '';

  const top = [...byItem.entries()].sort((a,b)=>b[1].rev-a[1].rev)[0];
  el('rpTop').textContent = top ? top[0] : '–';
  el('rpTopSub').textContent = top
    ? money(top[1].rev) + (tRev ? ` · ${(top[1].rev/tRev*100).toFixed(1)}% doanh thu` : '') : '';

  const cxQ = cx.reduce((s,r)=>s+r.qty,0), cxL = cx.reduce((s,r)=>s+r.lost,0);
  el('rpCx').textContent = money(cxL);
  el('rpCxSub').textContent = cx.length
    ? `${cx.length} lượt · ${cxQ} ly${tRev ? ` · ${(cxL/(tRev+cxL)*100).toFixed(1)}% giá trị` : ''}`
    : 'Không có món nào bị hủy';

  /* danh sách món */
  let list = [...byItem.entries()].map(([item,v]) => ({ item, ...v }));
  if (query) list = list.filter(r => r.item.toLowerCase().includes(query));
  list.sort((a,b) => sortKey==='name' ? a.item.localeCompare(b.item,'vi')*sortDir*-1
                   : sortKey==='qty'  ? (a.qty-b.qty)*sortDir : (a.rev-b.rev)*sortDir);
  const maxRev = Math.max(1, ...list.map(r=>r.rev));
  el('rpTblN').textContent = list.length ? list.length + ' món' : '';
  el('rpItems').innerHTML = list.length ? list.map((r,i)=>{
    // Đơn giá hiển thị là THỰC THU trên mỗi ly — chia ngược từ tiền đã thu chứ
    // không lấy giá niêm yết. Có giảm giá thì kèm giá gốc để còn đối chiếu.
    const dg = r.qty ? r.rev / r.qty : null;
    const coGiam = r.goc > r.rev;
    return `
    <div class="irow">
      <span class="rk2">${i+1}</span>
      <div class="ii">
        <div class="nm">${esc(r.item)}${!r.hasPrice ? '<span class="flag">chưa có giá</span>'
          : r.live ? '<span class="flag g">giá hiện tại</span>' : ''}</div>
        <div class="mt">${nf.format(r.qty)} ly${dg != null && r.hasPrice ? ' × ' + money(dg) : ''}${
          coGiam ? `<span class="flag">gốc ${money(r.price)}</span>` : ''}</div>
        <div class="bar"><i style="width:${(r.rev/maxRev*100).toFixed(1)}%"></i></div>
      </div>
      <div class="vv"><div class="r">${money(r.rev)}</div>
        <div class="p">${tRev ? (r.rev/tRev*100).toFixed(1) : '0.0'}%</div></div>
    </div>`;
  }).join('')
    : `<div class="empty" style="padding:30px 10px"><div class="ic">${query?'🔍':'📭'}</div>
        <h3>${query?'Không tìm thấy':'Chưa có dữ liệu trong kỳ này'}</h3>
        <p>${query?'Thử từ khóa khác.':'Món được ghi nhận khi quầy bấm “Hoàn thành”.'}</p></div>`;

  /* biểu đồ */
  const g = gran(from,to,rows), bk = new Map();
  rows.forEach(r => {
    let k = null;
    if (g === 'hour'){ if (r.ts == null) return; k = String(new Date(r.ts).getHours()).padStart(2,'0'); }
    else if (g === 'month') k = (r.date||'').slice(0,7);
    else k = r.date;
    if (!k) return;
    const c = bk.get(k) || { qty:0, rev:0 };
    c.qty += r.qty; c.rev += r.thucThu; bk.set(k,c);
  });
  let keys = [...bk.keys()].sort();
  if (keys.length > 24) keys = keys.slice(-24);
  const val = k => metric === 'rev' ? bk.get(k).rev : bk.get(k).qty;
  const mx = Math.max(1, ...keys.map(val));
  el('rpChartT').textContent = g==='hour' ? 'Theo giờ' : g==='month' ? 'Theo tháng' : 'Theo ngày';
  el('rpChartN').textContent = keys.length ? keys.length + (g==='hour'?' giờ':g==='month'?' tháng':' ngày') : '';
  el('rpChart').innerHTML = keys.length ? keys.map(k => {
      const v = val(k);
      return `<div class="rcol" title="${bLabel(k,g)}: ${money(bk.get(k).rev)} · ${bk.get(k).qty} ly">
        <b>${metric==='rev' ? moneyShort(v) : nf.format(v)}</b>
        <i style="height:${Math.max(4, v/mx*104).toFixed(0)}px"></i>
        <em>${bLabel(k,g)}</em></div>`;
    }).join('')
    : `<div class="empty" style="margin:auto;padding:14px"><p>${
        g==='hour' ? 'Bản ghi cũ chưa có giờ để vẽ' : 'Chưa có dữ liệu để vẽ'}</p></div>`;

  /* món bị hủy */
  const cxBy = new Map();
  cx.forEach(r => {
    const c = cxBy.get(r.item) || { qty:0, lost:0, rs:new Set() };
    c.qty += r.qty; c.lost += r.lost; if (r.reason) c.rs.add(r.reason);
    cxBy.set(r.item,c);
  });
  const cxList = [...cxBy.entries()].sort((a,b)=>b[1].lost-a[1].lost||b[1].qty-a[1].qty);
  el('rpCxN').textContent = cx.length ? `${cxQ} ly · ${money(cxL)}` : '';
  el('rpCxList').innerHTML = cxList.length
    ? cxList.map(([n,v])=>`<div class="cxr"><div class="q">${v.qty}</div>
        <div class="n">${esc(n)}<div class="rs">${esc([...v.rs].join(', ') || 'Không nêu lý do')}</div></div>
        <div class="v">${v.lost ? '−'+money(v.lost) : '—'}</div></div>`).join('')
    : `<div class="empty" style="padding:24px 10px"><div class="ic">✅</div>
        <p>Không có món nào bị hủy trong kỳ này</p></div>`;

  veHoaDonXoa();

  last = { list, tQty, tRev, from, to, cxList, cxL, so, tra };
}

/* ─────────────────── hóa đơn đã xóa ───────────────────

   Xóa một hóa đơn là chuyện im lặng: bàn tính lại từ đầu, sổ thu hụt đúng bằng
   số ấy, và không còn dòng nào giải thích. `core.xoaHoaDon` đã chép sang
   `billsXoa/` trước khi xóa — chỗ này là cái cửa sổ duy nhất nhìn vào bản sao
   đó, và không có cửa sổ thì bản sao chỉ là dữ liệu chết.

   Thẻ này ẨN khi kỳ không có hóa đơn nào bị xóa, tức là gần như luôn ẩn. Một
   thẻ "0 hóa đơn" đứng mãi ở đó thì mắt quen dần, rồi hôm nó khác 0 cũng không
   ai thấy. */
let xoaDaTai = null;        // { khoa, list }
let dangTaiXoa = null;

/** Ngày tạo suy từ mã: `QCH` + yymmdd + số thứ tự. */
function ngayTuMa(code){
  const m = /^QCH(\d{2})(\d{2})(\d{2})\d{4}$/.exec(String(code || ''));
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : null;
}

/** `1723712345678` -> `14/08 lúc 21:39`. Rỗng nếu không có mốc. */
function lucVN(ts){
  if (!Number.isFinite(Number(ts))) return '';
  const d = new Date(Number(ts));
  const h = (n) => String(n).padStart(2, '0');
  return `${h(d.getDate())}/${h(d.getMonth() + 1)} lúc ${h(d.getHours())}:${h(d.getMinutes())}`;
}

function veHoaDonXoa(){
  const [from, to] = range();
  const khoa = `${from || ''}|${to || ''}`;

  if (!xoaDaTai || xoaDaTai.khoa !== khoa){
    // Giữ thẻ ẩn trong lúc tải. Hiện "đang tải" rồi biến mất là nhấp nháy vô
    // ích cho một thẻ hầu như luôn rỗng.
    el('rpXoaCard').classList.add('hide');
    if (dangTaiXoa === khoa) return;
    dangTaiXoa = khoa;
    taiHoaDonXoa(from, to).then(list => {
      if (dangTaiXoa !== khoa) return;   // người dùng đã đổi kỳ
      dangTaiXoa = null;
      xoaDaTai = { khoa, list: list || [] };
      veHoaDonXoa();
    });
    return;
  }

  // Lọc lại ở máy: `taiHoaDonXoa` nới mỗi đầu một ngày theo khóa.
  const list = xoaDaTai.list
    .filter(b => inR(ngayTuMa(b.code || b.key), from, to))
    .sort((a, b) => (Number(b.xoaLuc) || 0) - (Number(a.xoaLuc) || 0));

  el('rpXoaCard').classList.toggle('hide', !list.length);
  if (!list.length) return;

  const tien = list.reduce((s, b) => s + (Number(b.total) || 0), 0);
  el('rpXoaN').textContent = `${list.length} hóa đơn · ${money(tien)}`;
  el('rpXoaList').innerHTML = list.map(b => {
    const ma  = esc(b.code || b.key || '—');
    const ban = b.table ? `Bàn ${esc(String(b.table))}` : 'Không rõ bàn';
    const ai  = b.xoaBoi ? esc(String(b.xoaBoi)) : 'không rõ ai';
    const luc = lucVN(b.xoaLuc);
    const daTra = b.status === 'paid';
    return `<div class="xrow">
      <div class="xi">
        <div class="xm">${ma}${daTra ? ' <span class="flag">đã thu tiền</span>' : ''}</div>
        <div class="xs">${ban} · ${esc(String(b.items?.length ?? 0))} dòng<br>
          ${ai}${luc ? ' · ' + luc : ''}</div>
      </div>
      <div class="xv">${money(Number(b.total) || 0)}
        <div><button class="btn sm mt8" data-xoa-phuc="${ma}">Dựng lại</button></div>
      </div>
    </div>`;
  }).join('');
}

function khoiPhucSheet(code){
  const b = (xoaDaTai?.list || []).find(x => (x.code || x.key) === code);
  sheet({
    title: 'Dựng lại hóa đơn ' + code + '?',
    desc: 'Hóa đơn quay về danh sách ở tab Hóa đơn, trạng thái CHƯA THANH TOÁN — '
        + 'kể cả bản cũ đã thu tiền, vì không ai xác nhận lại khoản đó.'
        + (b?.table ? ` Nếu bàn ${b.table} đã được tính lại sau khi xóa thì sẽ thành hai hóa đơn cho cùng một mâm món.` : ''),
    actions:[
      { label: 'Thôi' },
      { label: 'Dựng lại', cls: 'solid', onClick(){
          khoiPhucHoaDon(code)
            .then(() => toast('Đã dựng lại ' + code + ' — xem ở tab Hóa đơn', 'ok'))
            .catch(e => {
              console.error(e);
              toast(e?.choNguoiDung ? e.message : 'Không dựng lại được', 'err');
            });
        }
      }
    ]
  });
}

/* ─────────────────── sổ S1a-HKD ─────────────────── */

/**
 * Xuất Sổ doanh thu bán hàng hoá, dịch vụ — Mẫu S1a-HKD.
 *
 * Khác hẳn nút "Xuất CSV" bên trên: cái kia tổng hợp theo MÓN để biết bán gì
 * chạy, cái này ghi theo THỜI GIAN để nộp cho cơ quan thuế. Giữ cả hai.
 *
 * Dựng từ đúng danh sách hoá đơn mà màn hình đang xem, nên kỳ báo cáo chọn ở
 * trên là kỳ của sổ.
 */
function xuatS1a(){
  if (!last) return toast('Chưa có dữ liệu để xuất','err');
  const { from, to } = last;
  // Truy vấn hóa đơn nới thêm một ngày ở mỗi đầu để ghép dữ liệu lịch sử.
  // Sổ phải lọc lại theo ngày thực thu, nếu không hóa đơn sát ranh giới có
  // thể lọt sang kỳ báo cáo kế bên.
  const bills = hoaDonKy(from, to).filter(b => {
    const moc = mocHoaDon(b);
    return !moc || inR(ymd(new Date(moc)), from, to);
  });

  if (dangTaiHoaDon){
    // Xuất sổ thuế bằng 200 hoá đơn tạm là ra một con số thiếu mà trông như đủ.
    return toast('Đang tải hoá đơn của kỳ — chờ một chút rồi bấm lại', 'err');
  }

  const { noiDung, ten, tong, soChungTu } = csvS1a(bills, QUAN, { from, to });
  if (!soChungTu) return toast('Kỳ này chưa có hoá đơn nào đã thanh toán','err');

  taiVe(new Blob([noiDung], { type:'text/csv;charset=utf-8;' }), ten, `Sổ S1a-HKD · ${money(tong)}`);
}

/* ─────────────────── xuất CSV ─────────────────── */
function csv(){
  if (!last || !last.list.length) return toast('Không có dữ liệu để xuất','err');
  const { list, tQty, tRev, from, to, cxList, cxL, so, tra } = last;
  const q = s => '"' + String(s).replace(/"/g,'""') + '"';
  // Ba cột tiền chứ không một: kế toán cần thấy giảm giá tách ra, không phải
  // một con số đã trừ rồi mà không giải thích được vì sao lệch với bảng giá.
  const lines = [
    ['Ky bao cao', q(caption(from,to))].join(','),
    ['Doanh thu niem yet (VND)', Math.round(so.goc)].join(','),
    ['Giam gia (VND)', Math.round(so.giam)].join(','),
    ['Doanh thu thuc thu (VND)', Math.round(so.thuc)].join(','),
    ...(so.chuaChot ? [['Chua chot hoa don (VND)', Math.round(so.chuaChot)].join(',')] : []),
    '',
    ['TIEN VAO BANG DUONG NAO'].join(','),
    ['Tien mat (VND)', Math.round(tra.tienmat)].join(','),
    ['Chuyen khoan (VND)', Math.round(tra.chuyenkhoan)].join(','),
    ...(tra.khac ? [['Khong ro (VND)', Math.round(tra.khac)].join(',')] : []),
    '',
    ['Hang','Ten mon','So luong (ly)','Don gia niem yet (VND)','Don gia thuc thu (VND)',
     'Niem yet (VND)','Giam gia (VND)','Thuc thu (VND)','Ty trong DT (%)'].join(','),
    ...list.map((r,i)=>[i+1, q(r.item), r.qty,
                        r.hasPrice ? Math.round(r.price) : '',
                        r.qty ? Math.round(r.rev/r.qty) : '',
                        Math.round(r.goc), Math.round(r.goc - r.rev), Math.round(r.rev),
                        tRev ? (r.rev/tRev*100).toFixed(1) : '0.0'].join(',')),
    '', ['','TONG CONG', tQty, '', '',
         Math.round(so.goc), Math.round(so.giam), Math.round(tRev), '100.0'].join(',')
  ];
  if (cxList.length){
    lines.push('', 'MON BI HUY', ['Ten mon','So luong','Gia tri mat (VND)'].join(','),
      ...cxList.map(([n,v]) => [q(n), v.qty, Math.round(v.lost)].join(',')),
      ['TONG', cxList.reduce((s,[,v])=>s+v.qty,0), Math.round(cxL)].join(','));
  }
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type:'text/csv;charset=utf-8;' });
  const name = 'doanhthu-' + (from||'tatca') + (to && to!==from ? '_'+to : '') + '.csv';
  taiVe(blob, name, 'Đã xuất ' + list.length + ' dòng');
}

/**
 * Đưa một tệp tới tay người dùng.
 *
 * Trên Android, chia sẻ dễ dùng hơn tải về — tệp tải về rơi vào thư mục
 * Downloads rồi phải đi tìm, còn chia sẻ thì gửi thẳng sang Zalo cho kế toán.
 * Máy nào không có thì rơi về cách tải bình thường.
 */
function taiVe(blob, name, xong){
  const file = window.File ? new File([blob], name, { type: blob.type }) : null;
  const coTheChiaSe = file && typeof navigator.canShare === 'function'
    && typeof navigator.share === 'function'
    && navigator.canShare({ files:[file] });
  if (coTheChiaSe){
    navigator.share({ files:[file], title: name })
      .then(()=>toast('Đã chia sẻ ' + name,'ok'))
      .catch(err => {
        // Người dùng bấm huỷ thì không báo lỗi; lỗi API phải rơi về tải file.
        if (err?.name === 'AbortError') return;
        taiFile(blob, name, xong);
      });
    return;
  }
  taiFile(blob, name, xong);
}

function taiFile(blob, name, xong){
  const a = document.createElement('a');
  const url = URL.createObjectURL(blob);
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  // Trình duyệt có thể chưa đọc xong object URL ngay sau click.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(xong || ('Đã xuất ' + name), 'ok');
}
