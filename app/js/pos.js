/* ==========================================================================
   pos.js — Thu ngân (Đặt món)
   Bản web có 3 cột cạnh nhau; trên điện thoại đổi thành 3 thẻ:
   Chọn món → Giỏ hàng → Chưa pha xong. Dải bàn luôn nằm trên cùng.
   ========================================================================== */
import {
  el, esc, rxEsc, money, hm, fmtElapsed, ageClass, nf, ymd,
  TABLES, CANCEL_REASONS, data, onData, findMenuItem, nameOf, priceOf,
  sendOrders, requestCancel, clearCancel, saveBill, traTay, moLaiHoaDon, xoaHoaDon,
  vietQRUrl, VIETQR, taiCauHinhQR,
  monChuaTinhTien, hoaDonMoCuaBan, trangThaiBan, TRANG_THAI_BAN,
  db, FB,
  toast, sheet, closeSheet, store, audio
} from './core.js';
import { inHoaDon, cauHinhIn, luuCauHinhIn, CACH_GUI } from './inHoaDon.js';
import { KHO } from './escpos.js';
import { xemTem, ghiTem, quaTang, chuanHoaSdt, cauHinhTem, luuCauHinhTem, temBatChua } from './tem.js';
import { TUY_CHON_NHANH, themVaoGio, suaMoTa, moTaMon } from './gioHang.js';
import { inNhan, cauHinhNhan, luuCauHinhNhan } from './inNhan.js';
import { choMayChu, loiBao } from './hangCho.js';
import { goiYTien, tienThoi, chiaTo } from './tienMat.js';

let table    = store.get('pos.table', 1);
let tab      = 'pad';          // pad | menu
let qty      = 1;
let input    = '';
let cart     = store.get('pos.cart', []);
let nextId   = cart.reduce((m,o) => Math.max(m, o.id), 0) + 1;
let cartTab  = 'all';
let scopeAll = false;
let view     = store.get('pos.view', 'entry');   // entry | cart | pending
let mounted  = false;

const saveCart = () => store.set('pos.cart', cart);

/* ─────────────────── khung màn hình ─────────────────── */
function shell(){
  return `
  <div class="chiprow" id="posTables" style="margin-bottom:12px"></div>

  <div class="seg" id="posView" style="margin-bottom:14px">
    <button data-v="entry">Chọn món</button>
    <button data-v="cart">Giỏ <span class="c" id="vcCart">0</span></button>
    <button data-v="pending">Chờ pha <span class="c" id="vcPend">0</span></button>
    <button data-v="bill">💳 Hóa đơn <span class="c" id="vcBill">0</span></button>
  </div>

  <!-- ══ CHỌN MÓN ══ -->
  <div id="posEntry">
    <div class="seg" id="posTab" style="margin-bottom:12px">
      <button data-t="pad">⌨ Bàn phím số</button>
      <button data-t="menu">📋 Thực đơn</button>
    </div>

    <div id="posPad">
      <div class="card">
        <div class="card-body" style="padding:12px 14px">
          <div id="posDisplay" class="num"></div>
          <div id="posPreview"></div>
        </div>
      </div>
      <div class="qtybar mt12" id="posQty"></div>
      <div class="numpad mt12" id="posNumpad">
        ${[7,8,9,4,5,6,1,2,3].map(n=>`<button class="key" data-k="${n}">${n}</button>`).join('')}
        <button class="key del" data-k="del">⌫</button>
        <button class="key" data-k="0">0</button>
        <button class="key del" data-k="clr" style="font-size:15px">Xóa</button>
        <button class="key add" data-k="add">✚ Thêm vào giỏ</button>
      </div>
    </div>

    <div id="posMenu" class="hide">
      <div class="qtybar" id="posQty2"></div>
      <div class="field mt12"><span class="ic">🔍</span>
        <input type="search" id="posSearch" placeholder="Tìm tên món hoặc mã…" autocomplete="off">
      </div>
      <div id="posMenuList" class="mt12"></div>
    </div>
  </div>

  <!-- ══ GIỎ HÀNG ══ -->
  <div id="posCart" class="hide">
    <div class="chiprow" id="posCartTabs" style="margin-bottom:10px"></div>
    <div id="posCartList"></div>
    <div id="posCartFoot" class="mt16"></div>
  </div>

  <!-- ══ CHƯA PHA XONG ══ -->
  <div id="posPending" class="hide">
    <div class="row" style="margin-bottom:12px">
      <div class="sec-label" style="margin:0;flex:1" id="posPendNote"></div>
      <button class="btn sm" id="posScope">Bàn ${table}</button>
    </div>
    <div id="posPendList"></div>
  </div>

  <!-- ══ HÓA ĐƠN ══ -->
  <div id="posBill" class="hide">
    <div class="row" style="margin-bottom:12px">
      <div class="sec-label" style="margin:0;flex:1" id="posBillNote"></div>
      <button class="btn sm" id="posBillIn" title="Cài đặt máy in">🖨</button>
      <button class="btn sm solid" id="posBillNew">✚ Tạo hóa đơn</button>
    </div>
    <div id="posBillList"></div>
  </div>`;
}

/* ─────────────────── CSS riêng cho màn này ─────────────────── */
const CSS = `
#posDisplay{
  height:72px;display:flex;align-items:center;justify-content:flex-end;padding:0 6px;
  font-size:44px;font-weight:800;letter-spacing:.04em;color:var(--ink);
  font-variant-numeric:tabular-nums;
}
#posDisplay.blank{color:var(--ink-3);font-weight:400;font-size:26px;letter-spacing:.01em}
#posPreview{
  min-height:44px;display:flex;align-items:center;justify-content:center;text-align:center;
  padding:10px 14px;border-radius:13px;font-size:14px;font-weight:600;line-height:1.35;
  border:1.5px dashed var(--line-strong);color:var(--ink-3);
  transition:background .18s,border-color .18s,color .18s;
}
#posPreview.match{
  background:var(--brand-soft);border:1.5px solid var(--brand);color:var(--brand-dark);
}
#posPreview.nomatch{
  background:var(--late-soft);border:1.5px solid var(--late);color:var(--late);
}
.qtybar{
  display:flex;align-items:center;background:var(--surface);
  border:1.5px solid var(--line-strong);border-radius:14px;overflow:hidden;
}
.qtybar .lb{
  flex:1;padding-left:16px;font-size:11.5px;font-weight:700;color:var(--ink-3);
  text-transform:uppercase;letter-spacing:.07em;
}
.qtybar button{
  width:58px;height:58px;background:var(--surface-2);
  font-size:26px;font-weight:600;color:var(--ink);
  transition:background .12s,color .12s;
}
.qtybar button:active{background:var(--brand-soft);color:var(--brand)}
.qtybar .vv{
  min-width:52px;text-align:center;font-size:22px;font-weight:800;
  font-variant-numeric:tabular-nums;color:var(--ink);
}
.numpad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.key{
  height:66px;
  background:var(--surface);
  border:1.5px solid var(--line);
  border-radius:16px;
  font-size:26px;font-weight:700;color:var(--ink);
  box-shadow:var(--shadow-1);
  transition:transform .1s,background .12s,box-shadow .12s;
}
.key:active{transform:scale(.94);background:var(--brand-soft);box-shadow:none}
.key.del{color:var(--late-ink);font-size:22px}
.key.add{
  grid-column:span 3;height:58px;
  background:var(--brand-nen);
  border:none;color:#fff;
  font-size:16px;font-weight:700;letter-spacing:.01em;
  box-shadow:var(--shadow-brand);
  border-radius:16px;
}
.key.add:active{transform:scale(.97);box-shadow:none}
.mi{
  display:flex;align-items:center;gap:12px;width:100%;text-align:left;
  padding:12px 14px;
  border:1.5px solid var(--line);background:var(--surface);
  border-radius:14px;box-shadow:var(--shadow-1);margin-bottom:8px;
  transition:border-color .15s,background .15s;
}
.mi:active{border-color:var(--brand);background:var(--brand-soft)}
.mi .code{
  flex:none;min-width:40px;height:36px;padding:0 8px;border-radius:10px;
  background:var(--surface-2);border:1px solid var(--line);
  display:grid;place-items:center;font-size:12.5px;font-weight:700;color:var(--ink-2);
}
.mi .nm{flex:1;min-width:0;font-size:15px;font-weight:600;line-height:1.3}
.mi .pr{flex:none;font-size:13px;font-weight:700;color:var(--amber)}
.mi mark{background:#fef08a;color:inherit;border-radius:3px;padding:0 1px}
.crow{
  display:flex;align-items:center;gap:11px;padding:12px 13px;
  background:var(--surface);border:1.5px solid var(--line);
  border-radius:14px;box-shadow:var(--shadow-1);margin-bottom:9px;
}
.crow .qc{display:flex;align-items:center;gap:4px;flex:none}
.crow .qc button{
  width:36px;height:36px;border:1.5px solid var(--line);
  background:var(--surface-2);border-radius:10px;
  font-size:20px;font-weight:600;color:var(--ink-2);
  transition:background .12s,color .12s;
}
.crow .qc button:active{background:var(--brand-soft);color:var(--brand)}
.crow .qv{
  min-width:34px;text-align:center;font-size:17px;font-weight:800;
  font-variant-numeric:tabular-nums;
}
.crow .info{flex:1;min-width:0}
.crow .nm{font-size:15px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crow .mt{font-size:12px;color:var(--ink-3);margin-top:2px}
.crow .acts{display:flex;flex-direction:column;gap:5px;flex:none}
.crow .acts button{
  width:38px;height:32px;border:1.5px solid var(--line);
  border-radius:10px;font-size:13px;color:var(--ink-2);background:var(--surface);
}
.pcard{
  position:relative;padding:13px 14px;
  background:var(--surface);border:1.5px solid var(--line);
  border-radius:16px;box-shadow:var(--shadow-1);margin-bottom:10px;
}
.pcard::before{
  content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;
  border-radius:0 4px 4px 0;background:var(--line-strong);
}
.pcard.age-warn::before{background:var(--warn)}
.pcard.age-late::before{background:var(--late)}
.pcard.req{border-color:rgba(180,83,9,.35);background:var(--warn-soft)}
.pcard.rej{border-color:rgba(220,38,38,.35);background:var(--late-soft)}
.pcard .top{display:flex;align-items:flex-start;gap:11px}
.pcard .q{
  flex:none;width:40px;height:40px;border-radius:12px;
  background:var(--ink);color:#fff;
  display:grid;place-items:center;font-size:16px;font-weight:800;
  font-variant-numeric:tabular-nums;
}
.pcard .nm{flex:1;min-width:0;font-size:15px;font-weight:600;line-height:1.3;word-break:break-word}
.pcard .mt{font-size:12px;color:var(--ink-3);margin-top:2px}
.pcard .el{
  flex:none;font-size:12px;font-weight:700;color:var(--ink-2);
  font-variant-numeric:tabular-nums;
}
.pcard.age-warn .el{color:var(--warn)}
.pcard.age-late .el{color:var(--late)}
.pnote{
  font-size:12.5px;line-height:1.5;padding:10px 12px;
  border-radius:11px;margin-top:10px;
  background:var(--surface);border:1px solid var(--line);
}
.pnote b{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;margin-bottom:3px}
.pnote.w b{color:var(--warn)}
.pnote.r b{color:var(--late)}
.pacts{display:flex;gap:8px;margin-top:10px}
.pacts .btn{flex:1;min-height:40px;font-size:13.5px}
.tbtn{
  position:relative;min-width:58px;height:54px;
  border:1.5px solid var(--line-strong);
  background:var(--surface);border-radius:14px;
  display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:1px;
  transition:background .15s,border-color .15s;
}
.tbtn b{font-size:18px;font-weight:800;color:var(--ink);line-height:1}
.tbtn s{font-size:9px;text-decoration:none;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em}
.tbtn.active{
  background:var(--brand-nen);
  border-color:transparent;box-shadow:var(--shadow-brand);
}
.tbtn.active b{color:#fff}
/* Dòng phụ mờ 70% chỉ được 3.54:1 trên nền teal — nhìn thì "mờ cho dịu" nhưng
   đọc thì không ra. 88% giữ được vẻ phụ mà vẫn qua ngưỡng. */
.tbtn.active s{color:rgba(255,255,255,.88)}
.tbtn.has-cancel{border-color:var(--late);box-shadow:0 0 0 3px var(--late-soft)}
.tbtn .bg{
  position:absolute;min-width:19px;height:19px;padding:0 5px;border-radius:99px;
  font-size:10px;font-weight:700;line-height:19px;color:#fff;
  box-shadow:0 0 0 2px var(--surface);font-variant-numeric:tabular-nums;
}
.tbtn .bg.wait{background:var(--amber);top:-5px;right:-5px}
.tbtn .bg.cart{background:var(--brand);top:-5px;left:-5px}
.tbtn .bg[hidden]{display:none}

/* Trạng thái bàn — một vạch màu dưới đáy nút, không tranh chỗ với hai chấm
   đếm sẵn có ở hai góc trên. Nhìn cả dải là ra sơ đồ quán. */
.tbtn .tstate{
  position:absolute;left:8px;right:8px;bottom:5px;height:3px;border-radius:99px;
}
.tbtn .tstate[hidden]{display:none}
.tbtn[data-tt="dangPhucVu"] .tstate{background:var(--brand)}
.tbtn[data-tt="choTra"]     .tstate{background:var(--amber)}
.tbtn[data-tt="daTra"]      .tstate{background:var(--ok)}
.tbtn[data-tt="choTra"]{border-color:var(--amber);background:var(--amber-soft)}
.tbtn[data-tt="daTra"]{background:var(--ok-soft)}
.tbtn.active[data-tt]{background:var(--brand-nen)}
.tbtn.active .tstate{box-shadow:0 0 0 1.5px rgba(255,255,255,.6)}

/* Dòng ghi chú dưới chân hóa đơn */
.bill-note{
  margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);
  font-size:12.5px;line-height:1.5;
}
.bill-note.ok{color:var(--ok)}
.bill-note.warn{color:var(--warn)}
.bill-note b{font-weight:700}

.bill-qr .cho-tien{color:var(--brand-dark);font-weight:600}
.bill-qr .qr-thieu{
  font-size:13px;color:var(--warn);text-align:center;line-height:1.6;
  display:flex;flex-direction:column;align-items:center;gap:8px;
}
.nb-canh{
  padding:10px 12px;margin-bottom:10px;border-radius:10px;
  background:var(--warn-soft);color:var(--warn);font-size:13px;line-height:1.5;
}
.tot{
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 16px;
  background:linear-gradient(135deg,var(--brand-soft),rgba(230,244,242,.3));
  border:1.5px solid rgba(13,148,136,.2);border-radius:14px;margin-bottom:12px;
}
.tot .l{
  font-size:11.5px;font-weight:700;color:var(--brand-dark);
  text-transform:uppercase;letter-spacing:.07em;
}
.tot .v{font-size:24px;font-weight:800;letter-spacing:-.02em;color:var(--brand-dark)}
.bill-card{
  background:var(--surface);border:1.5px solid var(--line);
  border-radius:16px;box-shadow:var(--shadow-1);margin-bottom:12px;overflow:hidden;
}
.bill-card.paid{border-color:var(--ok);opacity:.75}
.bill-head{
  display:flex;align-items:center;gap:10px;
  padding:12px 14px;border-bottom:1px solid var(--line);
  background:var(--surface-2);
}
.bill-head .tbl{font-size:16px;font-weight:800;color:var(--ink)}
.bill-head .time{font-size:11.5px;color:var(--ink-3);flex:1}
.bill-status{
  font-size:11px;font-weight:700;padding:3px 10px;border-radius:99px;
  text-transform:uppercase;letter-spacing:.05em;
}
.bill-status.unpaid{background:var(--warn-soft);color:var(--warn)}
.bill-status.paid{background:var(--ok-soft);color:var(--ok)}
.bill-items{padding:10px 14px}
.bill-row{
  display:flex;align-items:baseline;gap:8px;
  padding:5px 0;border-bottom:1px dashed var(--line);font-size:13.5px;
}
.bill-row:last-child{border-bottom:0}
.bill-row .bn{flex:1;min-width:0;font-weight:500}
.bill-row .bq{color:var(--ink-3);font-size:12px;white-space:nowrap}
.bill-row .bp{font-weight:700;color:var(--ink);white-space:nowrap;font-variant-numeric:tabular-nums}
.bill-foot{
  padding:10px 14px;border-top:1px solid var(--line);
  background:var(--surface-2);
}
.bill-foot-row{display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px;color:var(--ink-2)}
.bill-foot-row.total{font-size:17px;font-weight:800;color:var(--ink);margin-bottom:0}
.bill-foot-row.discount{color:var(--ok)}
.bill-qr{padding:14px;display:flex;flex-direction:column;align-items:center;gap:8px;border-top:1px solid var(--line)}
.bill-qr img{width:180px;height:180px;border-radius:12px;border:1px solid var(--line)}
.bill-qr .qr-note{font-size:12px;color:var(--ink-3);text-align:center}
.bill-acts{display:flex;gap:8px;padding:0 14px 14px}
.bill-acts .btn{flex:1;min-height:44px;font-size:13.5px;white-space:nowrap}
/* Nút xóa giữ bề rộng cố định. Để nó flex:1 như hai nút kia là ba nút chia ba
   phần bằng nhau, chữ tràn ra ngoài và đè lên nhau trên máy 390px. */
.bill-acts .btn.danger{flex:0 0 46px;padding-inline:0}
`;

/* ─────────────────── khởi tạo ─────────────────── */
export function mountPos(root){
  if (mounted) return;
  const st = document.createElement('style'); st.textContent = CSS;
  document.head.appendChild(st);
  root.innerHTML = shell();

  buildTables(); qtyBar('posQty'); qtyBar('posQty2');
  bind();
  onData(w => {
    if (w === 'orders'){ renderTables(); renderPending(); notifyRejects(); }
    if (w === 'menu')  { renderMenu(); preview(); }
    if (w === 'history'){ renderTables(); }
    if (w === 'vietqr'){ renderBillList(); }
    if (w === 'bills') { renderTables(); renderBillList(); baoTienVe(); }
  });
  setView(view); setTab(tab); renderAll();

  setInterval(() => {
    root.querySelectorAll('.pcard[data-at]').forEach(c => {
      const ms = Date.now() - +c.dataset.at;
      const l = c.querySelector('.el'); if (l) l.textContent = fmtElapsed(ms);
      if (c.classList.contains('req') || c.classList.contains('rej')) return;
      c.classList.remove('age-warn','age-late');
      const k = ageClass(ms); if (k) c.classList.add(k);
    });
  }, 1000);
  mounted = true;
}

/* ─────────────────── dải bàn ─────────────────── */
let tblEls = [];
function buildTables(){
  el('posTables').innerHTML = Array.from({length:TABLES},(_,i)=>{
    const n = i+1;
    return `<button class="tbtn" data-t="${n}">
      <span class="bg cart" hidden></span><span class="bg wait" hidden></span>
      <b>${n}</b><s>bàn</s><i class="tstate" hidden></i></button>`;
  }).join('');
  tblEls = [...el('posTables').children];
}
/**
 * Dải bàn — vừa là nút chọn bàn, vừa là sơ đồ quán.
 * Trạng thái SUY RA từ hóa đơn (xem trangThaiBan trong core.js), không lưu cờ
 * nào, nên không có gì để quên cập nhật.
 */
function renderTables(){
  tblEls.forEach((b,i) => {
    const n = i+1;
    const c  = cart.filter(o=>o.table===n).reduce((s,o)=>s+o.qty,0);
    const ps = data.orders.filter(o=>o.table==n);
    const pq = ps.reduce((s,o)=>s+(Number(o.quantity)||0),0);
    b.classList.toggle('active', n===table);
    b.classList.toggle('has-cancel', ps.some(o=>o.cancel && o.cancel.state==='requested'));
    const bc = b.children[0], bw = b.children[1];
    bc.hidden = !c;  bc.textContent = c || '';
    bw.hidden = !pq; bw.textContent = pq || '';

    const tt = trangThaiBan(n);
    b.dataset.tt = tt;
    const dot = b.querySelector('.tstate');
    if (dot){
      dot.hidden = tt === 'trong';
      dot.title = TRANG_THAI_BAN[tt].nhan;
    }
  });
}

function qtyBar(id){
  el(id).innerHTML = `<span class="lb">Số lượng</span>
    <button data-q="-1">−</button><span class="vv" data-qv>1</span><button data-q="1">+</button>`;
}
function setQty(v){
  qty = Math.max(1, Math.min(99, v));
  document.querySelectorAll('[data-qv]').forEach(x => x.textContent = qty);
}

/* ─────────────────── gắn sự kiện ─────────────────── */
function bind(){
  el('posTables').onclick = e => {
    const b = e.target.closest('.tbtn'); if (!b) return;
    table = +b.dataset.t; store.set('pos.table', table);
    b.scrollIntoView({inline:'center', block:'nearest', behavior:'smooth'});
    if (!scopeAll) el('posScope').textContent = 'Bàn ' + table;
    renderAll();
  };
  el('posView').onclick = e => {
    const b = e.target.closest('button[data-v]'); if (!b) return;
    setView(b.dataset.v);
  };
  el('posTab').onclick = e => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    setTab(b.dataset.t);
  };
  document.addEventListener('click', e => {
    const q = e.target.closest('[data-q]');
    if (q && e.target.closest('.qtybar')) setQty(qty + (+q.dataset.q));
  });
  el('posNumpad').onclick = e => {
    const b = e.target.closest('.key'); if (!b) return;
    key(b.dataset.k);
  };
  el('posSearch').oninput = renderMenu;
  el('posMenuList').onclick = e => {
    const b = e.target.closest('.mi'); if (!b) return;
    const it = findMenuItem(b.dataset.stt); if (!it) return;
    addToCart(it, qty); setQty(1);
  };
  el('posCartTabs').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    cartTab = b.dataset.t === 'all' ? 'all' : +b.dataset.t;
    renderCart();
  };
  el('posCartList').onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const id = +b.dataset.id, o = cart.find(x=>x.id===id); if (!o) return;
    if (b.dataset.a === 'inc') o.qty++;
    if (b.dataset.a === 'dec'){ o.qty--; if (o.qty < 1) cart = cart.filter(x=>x.id!==id); }
    if (b.dataset.a === 'del') cart = cart.filter(x=>x.id!==id);
    if (b.dataset.a === 'tbl') return moveSheet(o);
    if (b.dataset.a === 'note') return ghiChuSheet(o);
    saveCart(); renderAll();
  };
  el('posCartFoot').onclick = e => {
    if (e.target.closest('#posNhan')) return inNhanGio();
    if (e.target.closest('#posSend')) return send();
    if (e.target.closest('#posClear')) return clearSheet();
  };
  el('posScope').onclick = () => {
    scopeAll = !scopeAll;
    el('posScope').textContent = scopeAll ? 'Tất cả bàn' : 'Bàn ' + table;
    renderPending();
  };
  el('posPendList').onclick = e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const key = b.dataset.k;
    if (b.dataset.a === 'req')  return cancelSheet(key);
    if (b.dataset.a === 'nhan'){
      const o = data.orders.find(x => x.key === key);
      if (!o) return;
      // Nhãn rách, in lệch, hay dán nhầm ly — in lại đúng món đó, có đóng dấu.
      return inNhan({
        ma: 'Bàn ' + (o.table ?? '—'), kieu: 'Tại quán',
        items: [{ name: o.item, qty: o.quantity, tuyChon: o.tuyChon, ghiChu: o.ghiChu }],
      }, { inLai: true })
        .then(kq => toast(`Đã gửi lại ${kq.soNhan} nhãn`, 'ok'))
        .catch(e => { console.error(e); toast(e.message || 'Không in được nhãn', 'err'); });
    }
    if (b.dataset.a === 'undo') return clearCancel(key)
      .then(()=>toast('Da thu hoi yeu cau huy','ok')).catch(fail);
    if (b.dataset.a === 'ack')  return clearCancel(key).catch(fail);
  };
  el('posBillNew').onclick = () => newBillSheet();
  el('posBillList').onclick = e => {
    const c = e.target.closest('[data-bill-cash]');
    if (c) return traTienSheet(c.dataset.billCash, 'tienmat');
    const m = e.target.closest('[data-bill-manual]');
    if (m) return traTienSheet(m.dataset.billManual, 'chuyenkhoan');
    const u = e.target.closest('[data-bill-unpay]');
    if (u) return moLaiHoaDon(u.dataset.billUnpay)
      .then(()=>toast('Đã chuyển về chưa thanh toán')).catch(fail);
    const d = e.target.closest('[data-bill-del]');
    if (d) return deleteBillSheet(d.dataset.billDel);
    const p = e.target.closest('[data-bill-in]');
    if (p) return inMotHoaDon(p.dataset.billIn, p);
    if (e.target.closest('[data-bill-cauhinh]'))
      return taiCauHinhQR().then(() => { renderBillList(); toast('Đã tải lại cấu hình'); });
  };
  el('posBillIn').onclick = () => cauHinhInSheet();
}
const fail = e => { console.error(e); toast('Không gửi được — kiểm tra quyền ghi (.write)','err'); };

function setView(v){
  view = v; store.set('pos.view', v);
  [...el('posView').children].forEach(b => b.classList.toggle('active', b.dataset.v === v));
  el('posEntry').classList.toggle('hide', v !== 'entry');
  el('posCart').classList.toggle('hide', v !== 'cart');
  el('posPending').classList.toggle('hide', v !== 'pending');
  el('posBill').classList.toggle('hide', v !== 'bill');
  if (v === 'bill') renderBillList();
}
function setTab(t){
  tab = t;
  [...el('posTab').children].forEach(b => b.classList.toggle('active', b.dataset.t === t));
  el('posPad').classList.toggle('hide', t !== 'pad');
  el('posMenu').classList.toggle('hide', t !== 'menu');
}

/* ─────────────────── bàn phím số ─────────────────── */
function key(k){
  if (k === 'del') input = input.slice(0,-1);
  else if (k === 'clr') input = '';
  else if (k === 'add') return addFromPad();
  else if (input.length < 3) input += k;
  const d = el('posDisplay');
  d.textContent = input || 'Nhập mã món';
  d.classList.toggle('blank', !input);
  preview();
}
function preview(){
  const p = el('posPreview'); if (!p) return;
  if (!input){ p.className=''; p.textContent = data.menu.length
      ? `Thực đơn ${data.menu.length} món · đang ghi cho bàn ${table}`
      : 'Đang tải thực đơn…'; return; }
  const it = findMenuItem(input);
  if (it){
    const pr = priceOf(it);
    p.className = 'match';
    p.textContent = '✔ ' + nameOf(it) + (pr != null ? ' · ' + money(pr) : ' · chưa có giá');
  } else { p.className = 'nomatch'; p.textContent = '✕ Không có món mã ' + input; }
}
function addFromPad(){
  if (!input) return toast('Chưa nhập mã món','err');
  const it = findMenuItem(input);
  if (!it) return toast('Không tìm thấy món mã ' + input,'err');
  addToCart(it, qty);
  input = ''; key('');   // vẽ lại display
  setQty(1);
}

/* ─────────────────── thực đơn ─────────────────── */
function renderMenu(){
  const q = (el('posSearch').value || '').trim().toLowerCase();
  let list = data.menu;
  if (q) list = list.filter(d => nameOf(d).toLowerCase().includes(q) || String(d['STT']).includes(q));
  list = list.slice(0,150);
  el('posMenuList').innerHTML = list.length ? list.map(d => {
    let nm = esc(nameOf(d));
    if (q) nm = nm.replace(new RegExp('('+rxEsc(esc(q))+')','gi'), '<mark>$1</mark>');
    const pr = priceOf(d);
    return `<button class="mi" data-stt="${esc(d['STT'])}">
      <span class="code">${esc(d['STT'])}</span><span class="nm">${nm}</span>
      <span class="pr">${pr != null ? money(pr) : '—'}</span></button>`;
  }).join('')
  : `<div class="empty"><div class="ic">${data.menu.length ? '🔍' : '📋'}</div>
      <h3>${data.menu.length ? 'Không tìm thấy món' : 'Chưa tải được thực đơn'}</h3>
      <p>${data.menu.length ? 'Thử từ khóa khác.' : 'Kiểm tra kết nối rồi mở lại app.'}</p></div>`;
}

/* ─────────────────── giỏ hàng ─────────────────── */
function addToCart(it, n){
  // Luật gộp nằm ở gioHang.js: hai ly chỉ gộp khi cùng món, cùng bàn, CÙNG
  // tuỳ chọn và CÙNG ghi chú. Món vừa bấm chưa có ghi chú nên nó gộp vào dòng
  // "không ghi chú", không đụng tới dòng "ít đường" đứng cạnh.
  const kq = themVaoGio(cart, {
    stt: it['STT'], name: nameOf(it), table, price: priceOf(it),
  }, n, nextId, hm());
  cart = kq.cart; nextId = kq.idKe;
  cartTab = 'all'; saveCart();
  audio.buzz();
  toast(`+${n} ${nameOf(it)} · bàn ${table}`, 'ok');
  renderAll();
}

function renderCart(){
  const tables = [...new Set(cart.map(o=>o.table))].sort((a,b)=>a-b);
  if (cartTab !== 'all' && !tables.includes(cartTab)) cartTab = 'all';
  el('posCartTabs').innerHTML = tables.length
    ? `<button class="chip ${cartTab==='all'?'active':''}" data-t="all">Tất cả <span class="c">${cart.length}</span></button>`
      + tables.map(t=>`<button class="chip ${cartTab===t?'active':''}" data-t="${t}">Bàn ${t} <span class="c">${cart.filter(o=>o.table===t).length}</span></button>`).join('')
    : '';

  const list = cartTab === 'all' ? cart : cart.filter(o=>o.table===cartTab);
  const tq = cart.reduce((s,o)=>s+o.qty,0);
  const tv = cart.reduce((s,o)=>s+(o.price||0)*o.qty,0);
  const noPrice = cart.some(o=>o.price == null);
  el('vcCart').textContent = tq;

  el('posCartList').innerHTML = list.length ? list.map(o=>`
    <div class="crow">
      <div class="qc">
        <button data-a="dec" data-id="${o.id}">−</button>
        <span class="qv">${o.qty}</span>
        <button data-a="inc" data-id="${o.id}">+</button>
      </div>
      <div class="info">
        <div class="nm">${esc(o.name)}</div>
        ${moTaMon(o) ? `<div class="cnote">${esc(moTaMon(o))}</div>` : ''}
        <div class="mt">#${esc(o.stt)} · Bàn ${o.table} · ${
          o.price != null ? money(o.price*o.qty) : '<span style="color:var(--warn)">chưa có giá</span>'}</div>
      </div>
      <div class="acts">
        <button data-a="note" data-id="${o.id}" title="Ghi chú cho ly này"
          ${moTaMon(o) ? 'data-co' : ''}>✎</button>
        <button data-a="tbl" data-id="${o.id}" title="Đổi bàn">🔄</button>
        <button data-a="del" data-id="${o.id}" title="Xóa">✕</button>
      </div>
    </div>`).join('')
    : `<div class="empty"><div class="ic">🧾</div><h3>Giỏ hàng trống</h3>
        <p>Chọn món ở tab “Chọn món”.<br>Món sẽ ghi vào <b>bàn ${table}</b>.</p></div>`;

  el('posCartFoot').innerHTML = cart.length ? `
    <div class="tot">
      <div><div class="l">Tổng cộng</div>
        <div style="font-size:12px;color:var(--ink-3);margin-top:3px">${cart.length} món · ${tq} ly${noPrice?' · thiếu giá':''}</div></div>
      <div class="v">${money(tv)}</div>
    </div>
    <button class="btn solid block" id="posSend">📤 Gửi đơn xuống quầy <span class="n">${tq} ly</span></button>
    ${cauHinhNhan().bat ? `<button class="btn block mt8" id="posNhan">🏷 In nhãn dán ly <span class="n">${tq} nhãn</span></button>` : ''}
    <button class="btn danger block mt8" id="posClear">🗑 Xóa toàn bộ giỏ</button>` : '';
}

function send(){
  if (!cart.length) return;
  const b = el('posSend'); b.disabled = true; b.textContent = '⏳ Đang gửi…';
  const batch = cart.slice();
  // Không chờ máy chủ xác nhận quá 3 giây: dữ liệu đã nằm trong hàng đợi của
  // Firebase rồi. Chờ mãi thì nút kẹt, thu ngân bấm lại, và khi mạng về là hai
  // đơn cùng rơi xuống quầy pha. Xem hangCho.js.
  choMayChu(sendOrders(batch)).then((kq) => {
    cart = []; cartTab = 'all'; saveCart(); renderAll();
    const { msg, kind } = loiBao(kq,
      `Đã gửi ${batch.length} món xuống quầy`,
      `Mạng chậm — ${batch.length} món đang xếp hàng, tự gửi khi có mạng lại`);
    toast(msg, kind);
    setView('pending');
  }).catch(err => {
    console.error(err); renderAll();
    toast('Gửi đơn thất bại — sẽ tự gửi lại khi có mạng', 'err');
  });
}
function clearSheet(){
  sheet({
    title:'Xóa toàn bộ giỏ?',
    desc:`${cart.length} món trong giỏ sẽ bị bỏ. Món đã gửi xuống quầy không bị ảnh hưởng.`,
    actions:[
      { label:'Giữ lại' },
      { label:'Xóa hết', cls:'solid danger', onClick(){ cart=[]; saveCart(); renderAll(); } }
    ]
  });
}
/**
 * Ghi chú cho MỘT dòng giỏ: chip bấm nhanh + một ô chữ tự do.
 *
 * Chip cho mấy câu khách nói nhiều nhất (ít đá, ít đường…) vì gõ tay giữa giờ
 * cao điểm là không kịp; ô chữ cho phần còn lại. Hai thứ lưu tách nhau chứ
 * không nhập một chuỗi: sau này còn đếm được "bao nhiêu ly ít đường", và nhãn
 * dán ly in chúng khác cỡ chữ.
 */
/**
 * In nhãn cho cả giỏ đang mở.
 *
 * In TRƯỚC khi gửi đơn xuống quầy: người pha dán nhãn lên ly rỗng rồi mới pha,
 * đúng thứ tự thao tác thật. In sau khi gửi thì ly đã pha xong rồi mới có nhãn.
 */
async function inNhanGio(){
  if (!cart.length) return toast('Giỏ đang trống', 'err');
  const b = el('posNhan');
  if (b){ b.disabled = true; b.textContent = '🏷 Đang in…'; }
  try {
    const kq = await inNhan({
      ma: 'Bàn ' + table, kieu: 'Tại quán',
      items: cart.map(o => ({ name: o.name, qty: o.qty, tuyChon: o.tuyChon, ghiChu: o.ghiChu })),
    });
    toast(`Đã gửi ${kq.soNhan} nhãn tới máy in`, 'ok');
  } catch (e) {
    console.error(e);
    toast(e.message || 'Không in được nhãn', 'err');
  } finally {
    renderCart();
  }
}

function ghiChuSheet(o){
  let chon = new Set((o.tuyChon || '').split(',').map(x => x.trim()).filter(Boolean));

  sheet({
    title: 'Ghi chú cho ly này',
    desc: `${o.name} · bàn ${o.table} · ${o.qty} ly`,
    body: `
      <div class="sec-label" style="margin-top:0">Tuỳ chọn</div>
      <div class="chiprow" id="gcChip">
        ${TUY_CHON_NHANH.map(t =>
          `<button class="chip ${chon.has(t) ? 'active' : ''}" data-t="${esc(t)}">${esc(t)}</button>`).join('')}
      </div>
      <div class="sec-label">Khách dặn thêm</div>
      <input type="text" id="gcText" maxlength="200" autocomplete="off"
             value="${esc(o.ghiChu || '')}" placeholder="ví dụ: lấy ống hút to, ít kem">
      <p style="color:var(--ink-3);font-size:12.5px;line-height:1.5;margin-top:8px">
        Ghi chú đi theo <b>từng ly</b>. Ly nào khác ghi chú thì tự tách thành dòng riêng —
        nhìn thì thừa, nhưng đó đúng là hai ly khác nhau.
      </p>`,
    actions: [
      { label: 'Thôi' },
      { label: 'Xong', cls: 'solid', onClick(){
          cart = suaMoTa(cart, o.id, {
            tuyChon: [...chon].join(', '),
            ghiChu: el('gcText') ? el('gcText').value : '',
          });
          saveCart(); renderAll();
        }
      },
    ],
  });

  setTimeout(() => {
    const box = el('gcChip');
    if (!box) return;
    box.onclick = (e) => {
      const b = e.target.closest('.chip'); if (!b) return;
      const t = b.dataset.t;
      if (chon.has(t)) chon.delete(t); else chon.add(t);
      b.classList.toggle('active', chon.has(t));
    };
  }, 50);
}

function moveSheet(o){
  sheet({
    title:'Chuyển sang bàn khác',
    desc:`${o.name} — đang ở bàn ${o.table}`,
    body:`<div class="grid-tbl" id="mvGrid">${Array.from({length:TABLES},(_,i)=>{
      const n=i+1; return `<button class="${n===o.table?'cur':''}" data-t="${n}">${n}</button>`;}).join('')}</div>`,
    actions:[{ label:'Hủy bỏ' }]
  });
  el('mvGrid').onclick = e => {
    const b = e.target.closest('button[data-t]'); if (!b) return;
    const n = +b.dataset.t;
    const dup = cart.find(x => x!==o && String(x.stt)===String(o.stt) && x.table===n);
    if (dup){ dup.qty += o.qty; cart = cart.filter(x=>x!==o); }
    else o.table = n;
    saveCart(); closeSheet(); renderAll();
  };
}

/* ─────────────────── chưa pha xong ─────────────────── */
function renderPending(){
  const rows = (scopeAll ? data.orders : data.orders.filter(o => o.table == table))
                 .slice().sort((a,b) => a.at - b.at);
  const q = rows.reduce((s,o)=>s+(Number(o.quantity)||0),0);
  el('posPendNote').textContent = rows.length ? `${rows.length} món · ${q} ly` : '';
  el('vcPend').textContent = data.orders.reduce((s,o)=>s+(Number(o.quantity)||0),0);

  if (!rows.length){
    el('posPendList').innerHTML = `<div class="empty"><div class="ic">✅</div>
      <h3>${scopeAll ? 'Quầy đã pha xong tất cả' : 'Bàn ' + table + ' không còn món chờ'}</h3>
      <p>Món đã gửi sẽ hiện ở đây tới khi quầy bấm “Hoàn thành”.</p></div>`;
    return;
  }

  el('posPendList').innerHTML = rows.map(o => {
    const ms = Date.now() - o.at, st = o.cancel && o.cancel.state;
    let cls = 'pcard ' + ageClass(ms), banner = '', acts = '';
    if (st === 'requested'){
      cls = 'pcard req';
      banner = `<div class="pnote w"><b>⏳ Đã gửi yêu cầu hủy</b>${esc(o.cancel.reason||'')}${
        o.cancel.note ? ' — ' + esc(o.cancel.note) : ''}<br>Đang chờ quầy xác nhận.</div>`;
      acts = `<button class="btn" data-a="undo" data-k="${o.key}">↩ Thu hồi</button>`;
    } else if (st === 'rejected'){
      cls = 'pcard rej';
      banner = `<div class="pnote r"><b>✕ Quầy từ chối hủy</b>${esc(o.cancel.barNote || 'Món đã/đang được pha.')}</div>`;
      acts = `<button class="btn" data-a="ack" data-k="${o.key}">Đã hiểu</button>
              <button class="btn danger" data-a="req" data-k="${o.key}">Yêu cầu lại</button>`;
    } else {
      acts = `${cauHinhNhan().bat ? `<button class="btn" data-a="nhan" data-k="${o.key}">🏷 In lại nhãn</button>` : ''}
              <button class="btn danger" data-a="req" data-k="${o.key}">✕ Yêu cầu hủy</button>`;
    }
    return `<article class="${cls}" data-at="${o.at}">
      <div class="top">
        <div class="q">${Number(o.quantity)||1}</div>
        <div style="flex:1;min-width:0">
          <div class="nm">${esc(o.item)}</div>
          ${moTaMon(o) ? `<div class="cnote">${esc(moTaMon(o))}</div>` : ''}
          <div class="mt">Bàn ${esc(o.table ?? '—')} · gửi ${esc(o.time||'')}${
            o.price != null ? ' · ' + money(o.price*(Number(o.quantity)||1)) : ''}</div>
        </div>
        <div class="el">${fmtElapsed(ms)}</div>
      </div>${banner}<div class="pacts">${acts}</div></article>`;
  }).join('');
}

function cancelSheet(key){
  const o = data.orders.find(x => x.key === key); if (!o) return;
  let reason = CANCEL_REASONS[0];
  sheet({
    title:'Yêu cầu hủy món',
    desc:'Món này đã gửi xuống quầy. Quầy sẽ nhận yêu cầu và xác nhận trước khi hủy.',
    body:`<div class="crow" style="margin-bottom:14px">
        <div class="qv" style="width:40px;height:40px;border-radius:11px;background:var(--ink);color:#fff;display:grid;place-items:center">${Number(o.quantity)||1}</div>
        <div class="info"><div class="nm">${esc(o.item)}</div>
        <div class="mt">Bàn ${esc(o.table ?? '—')} · đã chờ ${fmtElapsed(Date.now()-o.at)}</div></div></div>
      <div id="cxReasons">${CANCEL_REASONS.map((r,i)=>
        `<button class="opt ${i===0?'sel':''}" data-r="${esc(r)}"><span class="rk"></span>${esc(r)}</button>`).join('')}</div>
      <textarea id="cxNote" class="mt8" placeholder="Ghi chú thêm cho quầy (không bắt buộc)…"></textarea>`,
    actions:[
      { label:'Quay lại' },
      { label:'Gửi yêu cầu hủy', cls:'solid danger', onClick(){
          requestCancel(key, reason, el('cxNote') ? el('cxNote').value.trim() : '')
            .then(()=>toast('Đã gửi yêu cầu hủy xuống quầy','err')).catch(fail);
        } }
    ]
  });
  el('cxReasons').onclick = e => {
    const b = e.target.closest('.opt'); if (!b) return;
    reason = b.dataset.r;
    [...e.currentTarget.children].forEach(x => x.classList.toggle('sel', x === b));
  };
}

/* quầy vừa từ chối một yêu cầu -> báo cho thu ngân */
function notifyRejects(){
  const prev = data.orders._prevCancel;
  if (!prev) return;
  data.orders.forEach(o => {
    if (o.cancel && o.cancel.state === 'rejected' && prev.get(o.key) === 'requested'){
      toast('Quầy từ chối hủy: ' + o.item, 'err');
      audio.alarm(); audio.buzz();
    }
  });
}

export function renderAll(){ renderTables(); renderCart(); renderPending(); renderBillList(); }
export const posBadge = () => cart.reduce((s,o)=>s+o.qty,0);

/* ─────────────────── HÓA ĐƠN ─────────────────── */
/**
 * Món của bàn chưa nằm trong hóa đơn nào ĐÃ TRẢ.
 *
 * Bản cũ gom cả lịch sử hôm nay của bàn, nên lượt khách thứ hai của cùng một
 * bàn bị tính lại tiền của lượt thứ nhất. Một bàn quay 6–8 lượt/ngày thì đó là
 * tính sai tiền mỗi ngày. Logic phiên bàn nằm ở core.js.
 */
const billItemsForTable = tbl => monChuaTinhTien(tbl);

function newBillSheet(){
  // Chỉ những bàn đang có món chưa tính tiền. Bàn đã trả xong mà vẫn hiện ở
  // đây là mời thu ngân tạo một hóa đơn 0đ.
  const tables = Array.from({length:TABLES},(_,i)=>i+1)
    .filter(n => ['dangPhucVu','choTra'].includes(trangThaiBan(n)));

  // Bàn đang có hóa đơn chưa trả thì mở lại cái đó, đừng đẻ thêm cái thứ hai —
  // hai điện thoại cùng bấm là bàn 3 có hai mã QR khác nhau, khách quét cái nào
  // cũng chỉ trả được một nửa.
  const dangMo = hoaDonMoCuaBan(table);
  if (dangMo){
    setView('bill');
    return toast(`Bàn ${table} đang có hóa đơn ${dangMo.code} chưa thanh toán`, 'err');
  }

  let selTable = tables.includes(table) ? table : (tables[0] ?? table);
  let discount = 0;
  let sdt = '';            // số điện thoại khách, bỏ trống được
  let so = null;           // sổ tem đang tra được, hoặc null
  let doiQua = false;      // khách chọn đổi tem lấy một ly

  const refreshPreview = () => {
    const items = billItemsForTable(selTable);
    const subtotal = items.reduce((s,i) => s + (i.price||0)*i.qty, 0);
    // Tem trừ tiền TRƯỚC khi tính phần trăm giảm giá? Không — tặng một ly rồi
    // còn giảm % trên phần còn lại thì hai ưu đãi chồng nhau đúng như khách
    // mong đợi, và thứ tự này khớp với bên app khách.
    const quaGia   = doiQua ? (quaTang(items)?.gia ?? 0) : 0;
    const sauQua   = Math.max(0, subtotal - quaGia);
    const discAmt  = Math.round(sauQua * discount / 100);
    const total    = sauQua - discAmt;
    const mo       = hoaDonMoCuaBan(selTable);
    const box = el('nbPreview'); if (!box) return;

    box.innerHTML = (mo
      ? `<p class="nb-canh">Bàn ${esc(selTable)} đang có hóa đơn <b>${esc(mo.code)}</b> chưa thanh toán.
           Thanh toán hoặc xóa hóa đơn đó trước.</p>`
      : '')
      + (items.length
      ? items.map(i => `<div class="bill-row">
          <span class="bn">${esc(i.name)}${i.status==='pending' ? ' <span style="color:var(--warn);font-size:11px">(chờ pha)</span>' : ''}</span>
          <span class="bq">${i.qty} ly</span>
          <span class="bp">${i.price != null ? money(i.price*i.qty) : '—'}</span>
        </div>`).join('')
        + `<div style="margin-top:10px;padding-top:10px;border-top:1px solid var(--line)">
            <div class="bill-foot-row"><span>Tạm tính</span><span>${money(subtotal)}</span></div>
            ${quaGia ? `<div class="bill-foot-row discount"><span>Đổi tem — 1 ${esc(quaTang(items)?.ten ?? 'ly')}</span><span>-${money(quaGia)}</span></div>` : ''}
            ${discount ? `<div class="bill-foot-row discount"><span>Giảm ${discount}%</span><span>-${money(discAmt)}</span></div>` : ''}
            <div class="bill-foot-row total"><span>Tổng</span><span>${money(total)}</span></div>
          </div>`
      : '<p style="color:var(--ink-3);font-size:13.5px">Bàn này chưa có món nào chưa tính tiền.</p>');
  };

  sheet({
    title: 'Tạo hóa đơn',
    desc: 'Chỉ gom món phát sinh sau lần thanh toán gần nhất của bàn.',
    body: `
      <div class="sec-label" style="margin-top:0">Chọn bàn</div>
      <div class="chiprow" id="nbTables">
        ${tables.length
          ? tables.map(t => `<button class="chip ${t==selTable?'active':''}" data-t="${t}">Bàn ${t}</button>`).join('')
          : '<span style="color:var(--ink-3);font-size:13.5px">Không bàn nào đang có món chưa tính tiền.</span>'}
      </div>
      ${temBatChua() ? `
      <div class="sec-label">Số điện thoại khách <span style="font-weight:400;color:var(--ink-3)">— bỏ trống cũng được</span></div>
      <input type="tel" id="nbSdt" inputmode="tel" autocomplete="off" placeholder="09xx xxx xxx" maxlength="15">
      <div id="nbTem"></div>` : ''}

      <div class="sec-label">Khuyến mãi (%)</div>
      <div style="display:flex;align-items:center;gap:10px">
        <input type="range" id="nbDiscount" min="0" max="100" step="5" value="0"
          style="flex:1;min-height:0;padding:0;border:0;background:none;accent-color:var(--brand)">
        <span id="nbDiscVal" style="min-width:40px;text-align:right;font-size:16px;font-weight:700;color:var(--brand)">0%</span>
      </div>
      <div class="sec-label">Chi tiết</div>
      <div id="nbPreview"></div>`,
    actions:[
      { label: 'Hủy' },
      { label: 'Tạo & hiển thị QR', cls: 'solid', keepOpen: true, onClick(){
          if (hoaDonMoCuaBan(selTable))
            return toast('Bàn này còn hóa đơn chưa thanh toán', 'err');
          const items = billItemsForTable(selTable);
          if (!items.length) return toast('Bàn này chưa có món', 'err');
          const subtotal = items.reduce((s,i) => s+(i.price||0)*i.qty, 0);
          const qua      = doiQua ? quaTang(items) : null;
          const quaGia   = qua?.gia ?? 0;
          const sauQua   = Math.max(0, subtotal - quaGia);
          const discAmt  = Math.round(sauQua * discount / 100);
          const total    = sauQua - discAmt;
          if (total < 0) return toast('Tổng tiền âm — kiểm tra lại giá món', 'err');

          // Tem chỉ ghi vào sổ khi hoá đơn ĐÃ THANH TOÁN. Ở đây mới là ghi ý
          // định lên hoá đơn: hoá đơn bị xoá trước khi trả thì không có tem nào
          // phải đi đòi lại, và không ai mất tem oan.
          // Chụp lại số tem lúc này để in lên giấy. Không lưu thì lúc in phải
          // gọi máy chủ lần nữa, mà lúc đó khách đã đứng dậy đi rồi.
          saveBill({ table: selTable, items, subtotal, discount, discAmt, total,
                     sdt: chuanHoaSdt(sdt) ?? '', doiQua: !!qua, qua: qua ?? null,
                     temTruoc: so ? so.tem : null,
                     temMoc: so ? so.moc : null,
                     temSe: items.reduce((s, i) => s + ((i.price || 0) > 0 ? (Number(i.qty) || 0) : 0), 0) })
            .then(code => { closeSheet(); setView('bill'); toast('Đã tạo hóa đơn ' + code, 'ok'); })
            .catch(fail);
        }
      }
    ]
  });

  setTimeout(() => {
    refreshPreview();
    const nbT = el('nbTables');
    if (nbT) nbT.onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      selTable = +b.dataset.t;
      [...nbT.children].forEach(x => x.classList.toggle('active', +x.dataset.t === selTable));
      refreshPreview();
    };
    const sl = el('nbDiscount');
    if (sl) sl.oninput = () => {
      discount = +sl.value;
      el('nbDiscVal').textContent = discount + '%';
      refreshPreview();
    };

    const oSdt = el('nbSdt');
    if (oSdt){
      let hen = null, lan = 0;
      oSdt.oninput = () => {
        sdt = oSdt.value;
        doiQua = false; so = null;
        veTem('');
        clearTimeout(hen);
        if (!chuanHoaSdt(sdt)) { refreshPreview(); return; }
        // Hoãn 400ms rồi mới hỏi: gõ 10 số là 10 lượt gọi máy chủ cho một hoá
        // đơn. `lan` bỏ kết quả về trễ của số cũ — mạng quán chập thì thứ tự
        // trả lời không theo thứ tự gửi.
        const cua = ++lan;
        veTem('<p class="nb-tem-cho">Đang tra sổ tem…</p>');
        hen = setTimeout(() => {
          xemTem(sdt)
            .then((kq) => { if (cua === lan){ so = kq; veTemSo(); refreshPreview(); } })
            .catch((e) => { if (cua === lan) veTem(`<p class="nb-tem-loi">${esc(e.message)}</p>`); });
        }, 400);
      };
    }

    function veTem(html){ const b = el('nbTem'); if (b) b.innerHTML = html; }

    function veTemSo(){
      if (!so) return veTem('<p class="nb-tem-cho">Chương trình tích tem đang tắt.</p>');
      const hat = Array.from({ length: so.moc }, (_, i) =>
        `<i${i < so.tem ? ' data-co' : ''}></i>`).join('');
      veTem(`
        <div class="nb-tem" ${so.doiDuoc ? 'data-du' : ''}>
          <div class="nb-tem-dau">
            <strong>${so.doiDuoc ? 'Đủ tem — đổi được 1 ly' : `${so.tem}/${so.moc} tem`}</strong>
            <span>${so.doiDuoc ? 'Tem chỉ trừ khi hoá đơn đã thanh toán' : `còn ${so.thieu} ly nữa`}</span>
          </div>
          <div class="nb-tem-hat">${hat}</div>
          ${so.doiDuoc ? `
            <label class="nb-tem-doi">
              <input type="checkbox" id="nbDoiQua" ${doiQua ? 'checked' : ''}>
              <span>Đổi tem lấy một ly miễn phí <em>(ly đắt nhất trong hoá đơn)</em></span>
            </label>` : ''}
        </div>`);
      const cb = el('nbDoiQua');
      if (cb) cb.onchange = () => { doiQua = cb.checked; refreshPreview(); };
    }
  }, 50);
}

/* ─────────────────── danh sách hóa đơn ─────────────────── */

const AI_CHOT = { sepay: 'SePay tự nhận', nguoi: 'thu ngân xác nhận' };
const CACH_TRA = { chuyenkhoan: 'Chuyển khoản', tienmat: 'Tiền mặt' };

/**
 * Dòng "ai làm" dưới mỗi hóa đơn.
 *
 * Chỉ hiện khi có gì đáng nhìn: hóa đơn CÓ GIẢM GIÁ, hoặc đã bị mở lại. Dán
 * tên người vào mọi tấm thẻ thì nó thành nhiễu và không ai đọc nữa — mà thứ
 * cần nhìn thì đúng là hai cái đó: giảm giá và mở lại sổ.
 *
 * Chỉ lấy phần trước @ cho gọn; ai cần đủ thì đã có trong dữ liệu.
 */
const tenNgan = (mail) => mail ? String(mail).split('@')[0] : null;

function nguoiLam(b){
  const phan = [];
  if (b.discount && tenNgan(b.taoBoi)) phan.push(`giảm ${b.discount}% bởi ${esc(tenNgan(b.taoBoi))}`);
  if (tenNgan(b.moLaiBoi)) phan.push(`đã mở lại bởi ${esc(tenNgan(b.moLaiBoi))}`);
  return phan.length
    ? `<div class="bill-note" style="color:var(--ink-3);font-size:12px">${phan.join(' · ')}</div>`
    : '';
}

function renderBillList(){
  const box = el('posBillList'); if (!box) return;
  const bills = [...data.bills].sort((a,b) => (b.createdAt||0)-(a.createdAt||0));
  const unpaid = bills.filter(b => b.status !== 'paid').length;
  const noteEl = el('posBillNote');
  if (noteEl) noteEl.textContent = bills.length ? `${bills.length} hóa đơn · ${unpaid} chưa thanh toán` : '';
  const vcBill = el('vcBill');
  if (vcBill) vcBill.textContent = unpaid || '';

  if (!bills.length){
    box.innerHTML = `<div class="empty"><div class="ic">💳</div>
      <h3>Chưa có hóa đơn</h3><p>Bấm “Tạo hóa đơn” để xuất QR thanh toán.</p></div>`;
    return;
  }

  box.innerHTML = bills.map(b => {
    const paid   = b.status === 'paid';
    const daTra  = Number(b.paidAmount) || 0;
    const thieu  = Math.max(0, (Number(b.total)||0) - daTra);
    const qrUrl  = paid ? null : vietQRUrl(b.total, b.code || `BAN ${b.table}`);
    const timeStr = b.createdAt ? new Date(b.createdAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}) : '';

    return `<div class="bill-card ${paid ? 'paid' : ''}">
      <div class="bill-head">
        <span class="tbl">Bàn ${esc(b.table)}</span>
        <span class="time">${timeStr}${b.code ? ' · ' + esc(b.code) : ''}</span>
        <span class="bill-status ${paid ? 'paid' : 'unpaid'}">${paid ? '✅ Đã thanh toán' : '⏳ Chưa thanh toán'}</span>
      </div>
      <div class="bill-items">
        ${(b.items||[]).map(i => `<div class="bill-row">
          <span class="bn">${esc(i.name)}</span>
          <span class="bq">${i.qty} ly</span>
          <span class="bp">${i.price != null ? money(i.price*i.qty) : '—'}</span>
        </div>`).join('')}
      </div>
      <div class="bill-foot">
        <div class="bill-foot-row"><span>Tạm tính</span><span>${money(b.subtotal)}</span></div>
        ${b.discount ? `<div class="bill-foot-row discount"><span>Giảm ${b.discount}%</span><span>-${money(b.discAmt)}</span></div>` : ''}
        <div class="bill-foot-row total"><span>Tổng cộng</span><span>${money(b.total)}</span></div>
        ${paid && Number(b.tienThoi) > 0
          ? `<div class="bill-foot-row"><span>Khách đưa ${money(b.khachDua)}</span><span>thối ${money(b.tienThoi)}</span></div>`
          : ''}
        ${paid
          ? `<div class="bill-note ok">${CACH_TRA[b.payMethod] || 'Đã thu'} · ${AI_CHOT[b.paidBy] || 'đã chốt'}${
               b.overpaid ? ` · <b>khách chuyển thừa ${money(b.overpaidAmount)}</b>` : ''}</div>`
          : daTra > 0
            ? `<div class="bill-note warn">Đã nhận ${money(daTra)} — <b>còn thiếu ${money(thieu)}</b></div>`
            : ''}
        ${nguoiLam(b)}
      </div>
      ${!paid ? (qrUrl
        ? `<div class="bill-qr">
             <img src="${esc(qrUrl)}" alt="QR thanh toán ${esc(b.code||'')}" loading="lazy">
             <div class="qr-note">
               Quét mã để chuyển ${money(thieu || b.total)}<br>
               Nội dung: <b>${esc(b.code || '')}</b><br>
               <span class="cho-tien">Tiền về là tự đổi trạng thái, không phải bấm gì.</span>
             </div>
           </div>`
        : `<div class="bill-qr">
             <div class="qr-thieu">Chưa lấy được số tài khoản nhận tiền nên không vẽ mã QR.
               <button class="btn sm" data-bill-cauhinh="1">Thử lại</button></div>
           </div>`) : ''}
      <div class="bill-acts">
        ${!paid
          ? `<button class="btn solid" data-bill-cash="${b.code}">💵 Tiền mặt</button>
             <button class="btn" data-bill-manual="${b.code}">🏦 Chuyển khoản</button>`
          : `<button class="btn" data-bill-unpay="${b.code}">↩ Hoàn tác</button>`
        }
        ${cauHinhIn().bat
          ? `<button class="btn" data-bill-in="${b.code}">🖨 ${daIn.has(b.code) ? 'In lại' : 'In'}</button>` : ''}
        <button class="btn danger" data-bill-del="${b.code}">🗑</button>
      </div>
    </div>`;
  }).join('');
}

/* ─────────────────── in hóa đơn ───────────────────

   `daIn` chỉ sống trong phiên, không lưu xuống máy: nó chỉ để đổi chữ nút
   thành "In lại". Nhớ dai qua các lần mở app thì thu ngân mở máy buổi sáng đã
   thấy "In lại" cho hóa đơn chưa từng in ra tờ nào. */
const daIn = new Set();

async function inMotHoaDon(code, nut){
  const b = data.bills.find(x => (x.code || x.key) === code);
  if (!b) return toast('Không thấy hóa đơn này', 'err');
  // Khóa nút ngay: vẽ raster mất vài trăm mili giây, và bấm hai lần trong lúc
  // đó là hai tờ giấy giống hệt nhau nằm trên quầy.
  if (nut){ nut.disabled = true; nut.textContent = '🖨 …'; }
  try{
    // QR chỉ in khi CHƯA trả. Hóa đơn đã thu rồi mà còn kèm mã quét là mời
    // khách chuyển thêm lần nữa.
    const qr = b.status === 'paid'
      ? null
      : vietQRUrl(Math.max(0, (Number(b.total) || 0) - (Number(b.paidAmount) || 0)) || b.total,
                  b.code || `BAN ${b.table}`);
    await inHoaDon(b, { qr, inLai: daIn.has(code), nganKeo: b.payMethod === 'tienmat' });
    daIn.add(code);
    toast('Đã gửi tới máy in', 'ok');
  }catch(e){
    console.error(e);
    toast(e.message || 'Không in được', 'err');
  }finally{
    renderBillList();
  }
}

function cauHinhInSheet(){
  const c = cauHinhIn();
  const o = (v, ten, dang) => `<option value="${v}" ${dang===v?'selected':''}>${ten}</option>`;
  const t = cauHinhTem();
  const n = cauHinhNhan();
  sheet({
    title: 'Cài đặt máy này',
    desc: 'Máy in và mã tích tem lưu riêng trên TỪNG máy ở quầy, không đồng bộ — mỗi máy phải cài một lần.',
    body: `
      <div class="sec-label" style="margin-top:0">Mã thiết bị để tích tem</div>
      <input type="password" id="temMa" value="${esc(t.ma)}" autocomplete="off" spellcheck="false"
             placeholder="dán chuỗi bí mật vào đây">
      <p style="color:var(--ink-3);font-size:12.5px;line-height:1.5;margin-top:6px">
        Lấy đúng chuỗi đã đặt ở biến <code>LOYALTY_DEVICE_KEY</code> trên Netlify. Bỏ trống thì ô số
        điện thoại không hiện và quán không tích tem được ở máy này.
        Mã này chỉ cộng/trừ được tem — không đụng tới đơn hàng hay tiền.
      </p>

      <div class="sec-label" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line)">Máy in hóa đơn</div>
      <p style="color:var(--ink-3);font-size:12.5px;line-height:1.5;margin:-4px 0 10px">
        Hóa đơn in dưới dạng ẢNH nên tiếng Việt có dấu đầy đủ. Máy in nhiệt rẻ hầu như không có
        bảng mã tiếng Việt, in chữ thẳng là mất dấu.
      </p>

      <label class="cong-tac" style="display:flex;gap:12px;align-items:flex-start;padding:12px 0">
        <input type="checkbox" id="inBat" ${c.bat ? 'checked' : ''} style="width:20px;height:20px;flex:none">
        <span><b>Bật nút In trên thẻ hóa đơn</b>
          <em style="display:block;color:var(--ink-3);font-size:12.5px;margin-top:3px">Tắt thì màn hóa đơn gọn như cũ.</em></span>
      </label>

      <div class="sec-label">Khổ giấy</div>
      <select id="inKho">${Object.entries(KHO).map(([k,v]) => o(k, v.nhan, c.kho)).join('')}</select>

      <div class="sec-label">Cách gửi tới máy in</div>
      <select id="inCach">${Object.entries(CACH_GUI).map(([k,v]) => o(k, v.nhan, c.cach)).join('')}</select>
      <p id="inCachTa" style="color:var(--ink-3);font-size:12.5px;line-height:1.5;margin-top:6px"></p>

      <div id="inCauNoiWrap" class="hide">
        <div class="sec-label">Địa chỉ cầu nối</div>
        <input type="url" id="inCauNoi" value="${esc(c.cauNoi)}" placeholder="http://192.168.1.50:9110"
               autocomplete="off" inputmode="url">
        <p style="color:var(--ink-3);font-size:12.5px;line-height:1.5;margin-top:6px">
          Chạy <code>node tools/cau-noi-in.mjs --may=IP-máy-in</code> trên một máy luôn bật.
          Cần Chrome ≥142 trên máy ở quầy.</p>
      </div>

      <div class="sec-label">Tên quán in trên hóa đơn</div>
      <input type="text" id="inTen" value="${esc(c.tenQuan)}" autocomplete="off">
      <div class="sec-label">Địa chỉ / số điện thoại (để trống thì bỏ qua)</div>
      <input type="text" id="inDiaChi" value="${esc(c.diaChi)}" autocomplete="off">

      <label class="cong-tac" style="display:flex;gap:12px;align-items:flex-start;padding:12px 0">
        <input type="checkbox" id="inNganKeo" ${c.nganKeo ? 'checked' : ''} style="width:20px;height:20px;flex:none">
        <span><b>Đá ngăn kéo tiền khi thu tiền mặt</b>
          <em style="display:block;color:var(--ink-3);font-size:12.5px;margin-top:3px">Chỉ khi ngăn kéo cắm vào cổng RJ11 sau máy in.</em></span>
      </label>

      <div class="sec-label" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line)">Máy in nhãn dán ly</div>

      <label class="cong-tac" style="display:flex;gap:12px;align-items:flex-start;padding:12px 0">
        <input type="checkbox" id="nhanBat" ${n.bat ? 'checked' : ''} style="width:20px;height:20px;flex:none">
        <span><b>Bật nút in nhãn dán ly</b>
          <em style="display:block;color:var(--ink-3);font-size:12.5px;margin-top:3px">Một ly một nhãn, có tên món, tuỳ chọn và câu khách dặn.</em></span>
      </label>

      <label class="cong-tac" style="display:flex;gap:12px;align-items:flex-start;padding:12px 0">
        <input type="checkbox" id="nhanRieng" ${n.rieng ? 'checked' : ''} style="width:20px;height:20px;flex:none">
        <span><b>Có máy in nhãn riêng</b>
          <em style="display:block;color:var(--ink-3);font-size:12.5px;margin-top:3px">Tắt: in nhãn ra đúng máy in hóa đơn ở trên — phải thay cuộn bill bằng cuộn decal. Bật: điền địa chỉ máy thứ hai bên dưới.</em></span>
      </label>

      <div id="nhanMayWrap" class="${n.rieng ? '' : 'hide'}">
        <div class="sec-label">Khổ giấy nhãn</div>
        <select id="nhanKho">${Object.entries(KHO).map(([k,v]) => o(k, v.nhan, n.kho)).join('')}</select>

        <div class="sec-label">Cách gửi tới máy in nhãn</div>
        <select id="nhanCach">${Object.entries(CACH_GUI).map(([k,v]) => o(k, v.nhan, n.cach)).join('')}</select>
        <p style="color:var(--ink-3);font-size:12.5px;line-height:1.5;margin-top:6px">
          Hai máy thì nên dùng <b>cầu nối</b>: RawBT chỉ có một máy in mặc định, không chọn được
          theo từng lệnh in. Chạy hai bản cầu nối, mỗi bản một cổng nghe.</p>

        <div id="nhanCauNoiWrap" class="hide" style="margin-top:14px">
          <div class="sec-label">Địa chỉ cầu nối của máy in nhãn</div>
          <input type="url" id="nhanCauNoi" value="${esc(n.cauNoi)}" placeholder="http://192.168.1.50:9111"
                 autocomplete="off" inputmode="url">
          <p style="color:var(--ink-3);font-size:12.5px;line-height:1.5;margin-top:6px">
            Phải khác cổng của máy in hóa đơn, ví dụ
            <code>node tools/cau-noi-in.mjs --may=192.168.1.51 --nghe=9111</code>.</p>
        </div>

        <button class="btn block" id="nhanInThu" style="margin-top:10px">🏷 In thử một nhãn</button>
      </div>`,
    actions: [
      { label: 'Đóng' },
      { label: 'In thử hóa đơn', keepOpen: true, onClick(){ luuTuForm(); inThu(); } },
      { label: 'Lưu', cls: 'solid', onClick(){ luuTuForm(); renderBillList(); toast('Đã lưu cài đặt máy in','ok'); } },
    ],
  });

  const dongBo = () => {
    const cach = el('inCach').value;
    el('inCachTa').textContent = CACH_GUI[cach]?.ta ?? '';
    el('inCauNoiWrap').classList.toggle('hide', cach !== 'caunoi');
    // Tắt "máy riêng" thì mấy ô kia biến mất luôn, kẻo người dùng điền vào đó
    // rồi tưởng nhãn đang đi máy khác trong khi nó vẫn theo máy hóa đơn.
    const rieng = el('nhanRieng').checked;
    el('nhanMayWrap').classList.toggle('hide', !rieng);
    el('nhanCauNoiWrap').classList.toggle('hide', el('nhanCach').value !== 'caunoi');
  };
  setTimeout(() => {
    if (!el('inCach')) return;
    el('inCach').onchange = dongBo;
    el('nhanCach').onchange = dongBo;
    el('nhanRieng').onchange = dongBo;
    el('nhanInThu').onclick = () => { luuTuForm(); inThuNhan(); };
    dongBo();
  }, 50);
}

function luuTuForm(){
  luuCauHinhTem({ ma: el('temMa').value.trim() });
  // Lưu máy in hóa đơn TRƯỚC: khi chưa bật "máy riêng" thì cấu hình nhãn kế
  // thừa từ đó, lưu ngược thứ tự sẽ chép lại giá trị cũ của lần mở sheet.
  luuCauHinhIn({
    bat: el('inBat').checked,
    kho: el('inKho').value,
    cach: el('inCach').value,
    cauNoi: el('inCauNoi')?.value || cauHinhIn().cauNoi,
    tenQuan: el('inTen').value.trim() || 'GHÉ CẬU HAI',
    diaChi: el('inDiaChi').value.trim(),
    nganKeo: el('inNganKeo').checked,
  });
  luuCauHinhNhan({
    bat: el('nhanBat').checked,
    rieng: el('nhanRieng').checked,
    kho: el('nhanKho')?.value || cauHinhNhan().kho,
    cach: el('nhanCach')?.value || cauHinhNhan().cach,
    cauNoi: el('nhanCauNoi')?.value || cauHinhNhan().cauNoi,
  });
}

/** Một ly giả để dò xem máy in nhãn có đúng địa chỉ không. */
function inThuNhan(){
  inNhan({
    ma: 'IN-THU', ten: 'Thử máy', sdt: '0900000000', kieu: 'Mang đi',
    items: [{ name: 'Thử nhãn — tiếng Việt có dấu đủ chưa?', qty: 1, ghiChu: 'khung ghi chú phải thấy rõ' }],
  }).then(k => toast(`Đã gửi ${k.soNhan} nhãn tới máy in`, 'ok'))
    .catch(e => { console.error(e); toast(e.message || 'Không in được nhãn', 'err'); });
}

/** Hóa đơn giả để thử máy in mà không phải tạo hóa đơn thật cho một bàn nào. */
function inThu(){
  inHoaDon({
    code: 'IN-THU', table: '—', status: 'unpaid',
    items: [{ name: 'Thử máy in — tiếng Việt có dấu đủ chưa?', qty: 1, price: 0 }],
    subtotal: 0, discount: 0, discAmt: 0, total: 0, paidAmount: 0,
  }, {}).then(n => toast(`Đã gửi ${(n/1024).toFixed(0)}KB tới máy in`, 'ok'))
        .catch(e => { console.error(e); toast(e.message || 'Không in được', 'err'); });
}

/* ─────────────────── chuông báo tiền về ───────────────────
   Chỉ kêu khi WEBHOOK chốt (paidBy === 'sepay'). Thu ngân tự bấm thì họ biết
   rồi, kêu nữa chỉ tổ nhiễu. Lần vẽ đầu tiên thì im, nếu không mở app lên là
   kêu inh ỏi vì cả chục hóa đơn cũ — cùng cái bẫy đã tránh ở chuông đơn mới. */
let daThayBill = null;
function baoTienVe(){
  const bayGio = new Map(data.bills.map(b => [b.code || b.key, b.status]));
  if (daThayBill === null){ daThayBill = bayGio; return; }

  for (const [code, st] of bayGio){
    if (st === 'paid' && daThayBill.get(code) === 'unpaid'){
      const b = data.bills.find(x => (x.code || x.key) === code);
      if (b && b.paidBy === 'sepay'){
        audio.tienVe(); audio.buzz();
        toast(`Bàn ${b.table} đã chuyển ${money(b.paidAmount || b.total)}`, 'ok');
      }
      if (b) ghiTemChoHoaDon(b);
    }
  }
  daThayBill = bayGio;
}

/**
 * Ghi tem cho một hoá đơn vừa chuyển sang đã thanh toán.
 *
 * Chạy ở MỌI máy đang mở màn hoá đơn, nên cùng một hoá đơn có thể bị gửi lên
 * ba lần từ ba điện thoại. Không sao: mã hoá đơn QCH… chính là khoá chống ghi
 * hai lần ở máy chủ, nên lần thứ hai trở đi chỉ trả về `daGhi: true`.
 *
 * Không chờ kết quả, không chặn gì: hoá đơn đã thanh toán rồi, và đánh đổi
 * trải nghiệm ở quầy lấy vài cái tem là sai chiều. Hỏng thì báo nhẹ một câu.
 */
function ghiTemChoHoaDon(b){
  const sdt = chuanHoaSdt(b?.sdt);
  if (!sdt || !temBatChua()) return;
  ghiTem({ ma: b.code || b.key, sdt, items: b.items ?? [], doiQua: !!b.doiQua })
    .then((kq) => {
      if (kq.daGhi) return;                       // máy khác ghi trước rồi
      if (kq.thieuTem) {
        toast(`Khách thiếu ${kq.thieuTem} tem — quán vẫn tặng ly này`, 'err');
      } else if (b.doiQua) {
        toast(`Đã trừ tem, khách còn ${kq.tem} tem`, 'ok');
      } else {
        toast(`Đã tích tem — khách có ${kq.tem}/${kq.moc}`, 'ok');
      }
    })
    .catch((e) => { console.error(e); toast('Không ghi được tem: ' + e.message, 'err'); });
}

function traTienSheet(code, cach){
  const b = data.bills.find(x => x.code === code);
  if (!b) return;
  const tong = Number(b.total) || 0;
  const tienMat = cach === 'tienmat';

  sheet({
    title: tienMat ? 'Nhận tiền mặt?' : 'Xác nhận đã chuyển khoản?',
    desc: `Bàn ${b.table} · ${money(tong)}${
      tienMat ? '' : ' — chỉ bấm khi đã thấy tiền trong app ngân hàng.'}`,
    // Ô "khách đưa" chỉ có nghĩa với tiền mặt. Chuyển khoản thì số tiền đã
    // nằm sẵn trong sao kê, gõ lại chỉ tổ sai.
    body: tienMat ? `
      <div class="sec-label" style="margin-top:0">Khách đưa</div>
      <div class="row" id="ttGoiY" style="flex-wrap:wrap;gap:6px;margin-bottom:8px">
        ${goiYTien(tong).map(v =>
          `<button class="btn btn-nho" data-tien="${v}">${money(v)}</button>`).join('')}
      </div>
      <input type="tel" id="ttDua" inputmode="numeric" autocomplete="off"
             placeholder="Bỏ trống = khách đưa đúng ${money(tong)}">
      <div id="ttThoi" class="hide" style="margin-top:10px;padding:12px;border-radius:12px;
           background:var(--ok-soft,rgba(16,122,87,.12))">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
          <span style="color:var(--ink-2)">Thối lại</span>
          <b id="ttThoiSo" style="font-size:26px;font-variant-numeric:tabular-nums"></b>
        </div>
        <div id="ttThoiTo" style="color:var(--ink-3);font-size:12.5px;margin-top:4px"></div>
      </div>` : '',
    actions:[
      { label: 'Chưa' },
      { label: 'Xác nhận', cls: 'solid', onClick(){
          const dua = tienMat ? soTuO('ttDua') : 0;
          traTay(code, cach, dua || tong)
            .then(() => {
              const { thoi } = tienThoi(dua || tong, tong);
              toast(thoi ? `Đã ghi nhận · thối ${money(thoi)}` : 'Đã ghi nhận thanh toán', 'ok');
            })
            .catch(fail);
        }
      }
    ]
  });

  if (!tienMat) return;
  setTimeout(() => {
    const o = el('ttDua'); if (!o) return;
    const ve = () => {
      const { thoi, du } = tienThoi(soTuO('ttDua'), tong);
      const co = soTuO('ttDua') > 0 && du && thoi > 0;
      el('ttThoi').classList.toggle('hide', !co);
      if (!co) return;
      el('ttThoiSo').textContent = money(thoi);
      // Đếm sẵn ra mấy tờ mấy đồng — thu ngân bốc khỏi két, không phải nhẩm.
      el('ttThoiTo').textContent = chiaTo(thoi)
        .map(({ menh, so }) => `${so}×${money(menh)}`).join('  +  ');
    };
    o.oninput = ve;
    el('ttGoiY').onclick = (e) => {
      const n = e.target.closest('[data-tien]'); if (!n) return;
      o.value = n.dataset.tien; ve(); o.focus();
    };
  }, 50);
}

/** Số nguyên từ một ô nhập, bỏ mọi dấu chấm phẩy người dùng gõ cho dễ đọc. */
function soTuO(id){
  return Math.max(0, Math.round(Number(String(el(id)?.value ?? '').replace(/[^\d]/g, '')) || 0));
}

function deleteBillSheet(code){
  const b = data.bills.find(x => x.code === code);
  sheet({
    title: 'Xóa hóa đơn?',
    desc: b && b.status === 'paid'
      ? 'Hóa đơn NÀY ĐÃ THANH TOÁN. Xóa đi là mất dấu khoản tiền đã nhận và bàn sẽ tính lại từ đầu.'
      : 'Hóa đơn sẽ bị xóa vĩnh viễn. Món của bàn quay về danh sách chưa tính tiền.',
    actions:[
      { label: 'Giữ lại' },
      { label:'Xóa', cls:'solid danger', onClick(){
          xoaHoaDon(code).then(() => toast('Đã xóa hóa đơn')).catch(fail);
        }
      }
    ]
  });
}
