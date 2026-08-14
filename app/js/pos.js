/* ==========================================================================
   pos.js — Thu ngân (Đặt món)
   Bản web có 3 cột cạnh nhau; trên điện thoại đổi thành 3 thẻ:
   Chọn món → Giỏ hàng → Chưa pha xong. Dải bàn luôn nằm trên cùng.
   ========================================================================== */
import {
  el, esc, rxEsc, money, hm, fmtElapsed, ageClass, nf,
  TABLES, CANCEL_REASONS, data, onData, findMenuItem, nameOf, priceOf,
  sendOrders, requestCancel, clearCancel,
  toast, sheet, closeSheet, store, audio
} from './core.js';

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
  </div>`;
}

/* ─────────────────── CSS riêng cho màn này ─────────────────── */
const CSS = `
#posDisplay{
  height:64px;display:flex;align-items:center;justify-content:flex-end;padding:0 4px;
  font-size:38px;font-weight:700;letter-spacing:.06em;color:var(--ink);
}
#posDisplay.blank{color:var(--ink-3);font-weight:400;font-size:28px}
#posPreview{
  min-height:40px;display:flex;align-items:center;justify-content:center;text-align:center;
  padding:8px 12px;border-radius:11px;font-size:13.5px;font-weight:600;
  border:1px dashed var(--line-strong);color:var(--ink-3);
}
#posPreview.match{background:var(--brand-soft);border:1px solid var(--brand);color:var(--brand)}
#posPreview.nomatch{background:var(--late-soft);border:1px solid var(--late);color:var(--late)}
.qtybar{display:flex;align-items:center;background:var(--surface);border:1px solid var(--line-strong);
        border-radius:13px;overflow:hidden}
.qtybar .lb{flex:1;padding-left:15px;font-size:12.5px;font-weight:700;color:var(--ink-3);
            text-transform:uppercase;letter-spacing:.06em}
.qtybar button{width:56px;height:56px;background:var(--surface-2);font-size:24px;font-weight:600;color:var(--ink)}
.qtybar button:active{background:var(--brand-soft);color:var(--brand)}
.qtybar .vv{width:58px;text-align:center;font-size:21px;font-weight:700;font-variant-numeric:tabular-nums}
.numpad{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
.key{height:62px;border:1px solid var(--line);background:var(--surface);border-radius:14px;
     font-size:25px;font-weight:600;color:var(--ink);box-shadow:var(--shadow-1)}
.key:active{transform:scale(.96);background:var(--brand-soft)}
.key.del{color:var(--late);font-size:21px}
.key.add{grid-column:span 3;height:56px;background:var(--ink);border-color:var(--ink);color:#fff;
         font-size:16px;font-weight:700}
.mi{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:12px 14px;
    border:1px solid var(--line);background:var(--surface);border-radius:13px;
    box-shadow:var(--shadow-1);margin-bottom:8px}
.mi:active{border-color:var(--brand);background:var(--brand-soft)}
.mi .code{flex:none;min-width:40px;height:34px;padding:0 8px;border-radius:9px;background:var(--bg);
          display:grid;place-items:center;font-size:13px;font-weight:700;color:var(--ink-2)}
.mi .nm{flex:1;min-width:0;font-size:15px;font-weight:600;line-height:1.3}
.mi .pr{flex:none;font-size:13px;font-weight:700;color:var(--brand)}
.mi mark{background:#fef08a;color:inherit;border-radius:3px;padding:0 1px}
.crow{display:flex;align-items:center;gap:11px;padding:12px 13px;background:var(--surface);
      border:1px solid var(--line);border-radius:13px;box-shadow:var(--shadow-1);margin-bottom:9px}
.crow .qc{display:flex;align-items:center;gap:3px;flex:none}
.crow .qc button{width:36px;height:36px;border:1px solid var(--line);background:var(--surface-2);
                 border-radius:10px;font-size:19px;font-weight:600;color:var(--ink-2)}
.crow .qc button:active{background:var(--brand-soft);color:var(--brand)}
.crow .qv{min-width:34px;text-align:center;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums}
.crow .info{flex:1;min-width:0}
.crow .nm{font-size:15px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.crow .mt{font-size:12px;color:var(--ink-3);margin-top:2px}
.crow .acts{display:flex;flex-direction:column;gap:5px;flex:none}
.crow .acts button{width:38px;height:32px;border:1px solid var(--line);border-radius:9px;
                   font-size:13px;color:var(--ink-2);background:var(--surface)}
.pcard{position:relative;padding:13px 14px;background:var(--surface);border:1px solid var(--line);
       border-radius:13px;box-shadow:var(--shadow-1);margin-bottom:10px}
.pcard::before{content:"";position:absolute;left:0;top:13px;bottom:13px;width:3px;
               border-radius:0 3px 3px 0;background:var(--line-strong)}
.pcard.age-warn::before{background:var(--warn)}
.pcard.age-late::before{background:var(--late)}
.pcard.req{border-color:var(--warn);background:var(--warn-soft)}
.pcard.rej{border-color:var(--late);background:var(--late-soft)}
.pcard .top{display:flex;align-items:flex-start;gap:11px}
.pcard .q{flex:none;width:38px;height:38px;border-radius:10px;background:var(--ink);color:#fff;
          display:grid;place-items:center;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.pcard .nm{flex:1;min-width:0;font-size:15px;font-weight:600;line-height:1.3;word-break:break-word}
.pcard .mt{font-size:12px;color:var(--ink-3);margin-top:2px}
.pcard .el{flex:none;font-size:12.5px;font-weight:700;color:var(--ink-2);font-variant-numeric:tabular-nums}
.pcard.age-warn .el{color:var(--warn)} .pcard.age-late .el{color:var(--late)}
.pnote{font-size:12.5px;line-height:1.45;padding:9px 11px;border-radius:10px;margin-top:10px;
       background:var(--surface);border:1px solid var(--line)}
.pnote b{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
.pnote.w b{color:var(--warn)} .pnote.r b{color:var(--late)}
.pacts{display:flex;gap:8px;margin-top:10px}
.pacts .btn{flex:1;min-height:40px;font-size:13.5px}
.tbtn{position:relative;min-width:58px;height:52px;border:1.5px solid var(--line-strong);
      background:var(--surface);border-radius:13px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:1px}
.tbtn b{font-size:18px;font-weight:700;color:var(--ink);line-height:1}
.tbtn s{font-size:9px;text-decoration:none;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em}
.tbtn.active{background:var(--ink);border-color:var(--ink)}
.tbtn.active b{color:#fff} .tbtn.active s{color:rgba(255,255,255,.65)}
.tbtn.has-cancel{border-color:var(--late);box-shadow:0 0 0 3px var(--late-soft)}
.tbtn .bg{position:absolute;min-width:19px;height:19px;padding:0 5px;border-radius:99px;
          font-size:10.5px;font-weight:700;line-height:19px;color:#fff;
          box-shadow:0 0 0 2px var(--surface);font-variant-numeric:tabular-nums}
.tbtn .bg.wait{background:var(--warn);top:-5px;right:-5px}
.tbtn .bg.cart{background:var(--brand);top:-5px;left:-5px}
.tbtn .bg[hidden]{display:none}
.tot{display:flex;align-items:center;justify-content:space-between;padding:14px 15px;
     background:var(--surface);border:1px solid var(--line);border-radius:13px;margin-bottom:12px}
.tot .l{font-size:12.5px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em}
.tot .v{font-size:22px;font-weight:700;letter-spacing:-.02em}
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
      <b>${n}</b><s>bàn</s></button>`;
  }).join('');
  tblEls = [...el('posTables').children];
}
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
    saveCart(); renderAll();
  };
  el('posCartFoot').onclick = e => {
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
    if (b.dataset.a === 'undo') return clearCancel(key)
      .then(()=>toast('Đã thu hồi yêu cầu hủy','ok')).catch(fail);
    if (b.dataset.a === 'ack')  return clearCancel(key).catch(fail);
  };
}
const fail = e => { console.error(e); toast('Không gửi được — kiểm tra quyền ghi (.write)','err'); };

function setView(v){
  view = v; store.set('pos.view', v);
  [...el('posView').children].forEach(b => b.classList.toggle('active', b.dataset.v === v));
  el('posEntry').classList.toggle('hide', v !== 'entry');
  el('posCart').classList.toggle('hide', v !== 'cart');
  el('posPending').classList.toggle('hide', v !== 'pending');
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
  const ex = cart.find(o => String(o.stt) === String(it['STT']) && o.table === table);
  if (ex){ ex.qty += n; ex.time = hm(); }
  else cart.push({ id: nextId++, stt: it['STT'], name: nameOf(it),
                   qty: n, table, price: priceOf(it), time: hm() });
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
        <div class="mt">#${esc(o.stt)} · Bàn ${o.table} · ${
          o.price != null ? money(o.price*o.qty) : '<span style="color:var(--warn)">chưa có giá</span>'}</div>
      </div>
      <div class="acts">
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
    <button class="btn danger block mt8" id="posClear">🗑 Xóa toàn bộ giỏ</button>` : '';
}

function send(){
  if (!cart.length) return;
  const b = el('posSend'); b.disabled = true; b.textContent = '⏳ Đang gửi…';
  const batch = cart.slice();
  sendOrders(batch).then(() => {
    cart = []; cartTab = 'all'; saveCart(); renderAll();
    toast(`Đã gửi ${batch.length} món xuống quầy`, 'ok');
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
      acts = `<button class="btn danger" data-a="req" data-k="${o.key}">✕ Yêu cầu hủy</button>`;
    }
    return `<article class="${cls}" data-at="${o.at}">
      <div class="top">
        <div class="q">${Number(o.quantity)||1}</div>
        <div style="flex:1;min-width:0">
          <div class="nm">${esc(o.item)}</div>
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

export function renderAll(){ renderTables(); renderCart(); renderPending(); }
export const posBadge = () => cart.reduce((s,o)=>s+o.qty,0);
