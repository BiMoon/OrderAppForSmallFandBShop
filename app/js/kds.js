/* ==========================================================================
   kds.js — Quầy pha chế
   Một cột dọc, thẻ to đủ nhìn khi máy dựng cạnh máy pha.
   Món xin hủy luôn nổi lên đầu; giữ màn hình sáng khi cần.
   ========================================================================== */
import {
  el, esc, money, fmtElapsed, ageClass,
  data, onData, completeOrder, approveCancel, rejectCancel,
  trangThaiBan, TRANG_THAI_BAN,
  toast, sheet, closeSheet, store, audio, keepAwake
} from './core.js';
import { openRecipeSheet } from './prep.js';

/**
 * Nhãn tiền của một bàn, hiện ngay trên phiếu pha chế.
 *
 * Quầy cần biết đúng một chuyện: bàn này đã trả tiền chưa. Bàn đã trả mà còn
 * món đang pha là chuyện bình thường (khách trả trước rồi ngồi đợi), nhưng bàn
 * đã trả rồi mà nhân viên bưng nhầm sang bàn khác thì mất cả ly lẫn tiền.
 * Chỉ hiện khi có gì để nói — bàn đang phục vụ bình thường thì không dán nhãn.
 */
function nhanTien(tbl){
  const tt = trangThaiBan(tbl);
  if (tt === 'daTra')  return '<span class="btien ok">✅ Đã trả</span>';
  if (tt === 'choTra') return '<span class="btien cho">⏳ Chờ trả</span>';
  return '';
}

let group   = store.get('kds.group', 'table');   // table | time
let filter  = 'all';
let mounted = false;
let busy    = new Set();

const isReq    = o => !!(o.cancel && o.cancel.state === 'requested');
const byUrgent = (a,b) => (isReq(b) - isReq(a)) || (a.at - b.at);

const CSS = `
.kstats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
.kstat{background:var(--surface);border:1px solid var(--line);border-radius:12px;
       padding:10px 6px;text-align:center;box-shadow:var(--shadow-1)}
.kstat b{display:block;font-size:21px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.kstat s{display:block;text-decoration:none;font-size:9.5px;color:var(--ink-3);
         text-transform:uppercase;letter-spacing:.05em;margin-top:3px}
.kstat.late b{color:var(--late)} .kstat.cx b{color:var(--late)}
.kgrp{margin-bottom:20px}
.kgrp-h{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.kgrp-h .t{font-size:15px;font-weight:700}
.kgrp-h .c{font-size:12px;color:var(--ink-3);font-weight:600}
.kgrp-h .r{flex:1;height:1px;background:var(--line)}
.tk{position:relative;background:var(--surface);border:1px solid var(--line);border-radius:15px;
    box-shadow:var(--shadow-1);padding:14px 15px;margin-bottom:11px;
    display:flex;flex-direction:column;gap:12px}
.tk::before{content:"";position:absolute;left:0;top:14px;bottom:14px;width:4px;
            border-radius:0 4px 4px 0;background:var(--line-strong)}
.tk.age-warn::before{background:var(--warn)}
.tk.age-late::before{background:var(--late)}
.tk.cxreq{border-color:var(--late);background:#fffafa;box-shadow:0 0 0 3px var(--late-soft),var(--shadow-2)}
.tk.cxreq::before{background:var(--late)}
.tk .top{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
.btien{
  margin-left:7px;padding:2px 7px;border-radius:99px;
  font-size:10.5px;font-weight:700;letter-spacing:.02em;vertical-align:middle;
}
.btien.ok{background:var(--ok-soft);color:var(--ok)}
.btien.cho{background:var(--amber-soft);color:var(--warn)}
.tk .tb{display:inline-flex;align-items:baseline;gap:5px;background:var(--brand-soft);color:var(--brand);
        padding:5px 12px;border-radius:9px;font-size:13px;font-weight:700}
.tk .tb b{font-size:17px}
.tk .rt{text-align:right;font-size:12px;color:var(--ink-3);white-space:nowrap;line-height:1.4}
.tk .el{font-size:13.5px;font-weight:700;color:var(--ink-2);font-variant-numeric:tabular-nums;
        display:inline-flex;align-items:center;gap:5px}
.tk.age-warn .el{color:var(--warn)}
.tk.age-late .el{color:var(--late)}
.tk.age-late .el::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor;
                         animation:bl 1.1s ease-in-out infinite}
@keyframes bl{0%,100%{opacity:1}50%{opacity:.25}}
.tk .mid{display:flex;align-items:center;gap:13px}
.tk .q{flex:none;width:52px;height:52px;border-radius:13px;background:var(--ink);color:#fff;
       display:grid;place-items:center;font-size:22px;font-weight:700;font-variant-numeric:tabular-nums}
.tk .info{flex:1;min-width:0}
.tk .nm{font-size:18px;font-weight:650;line-height:1.28;word-break:break-word}
.tk .stt{display:inline-flex;align-items:center;gap:5px;margin-top:4px;
         font-size:11.5px;font-weight:700;color:var(--ink-3);letter-spacing:.02em}
.tk .stt b{color:var(--brand)}
.tk .pv{font-size:12px;color:var(--ink-3);margin-top:2px}
.tk .recipe-btn{
  flex:none;width:38px;height:38px;border-radius:11px;
  border:1.5px solid var(--brand);background:var(--brand-soft);
  color:var(--brand);font-size:17px;
  display:grid;place-items:center;
  transition:background .15s;
}
.tk .recipe-btn:active{background:var(--brand);color:#fff}
.tk .done{width:100%;min-height:52px;border-radius:13px;background:var(--ink);color:#fff;
          font-size:16px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px}
.tk .done:active{background:var(--ok)}
.tk .done[disabled]{opacity:.5}
.cxbox{font-size:13px;line-height:1.45;color:var(--ink-2);background:var(--late-soft);
       border:1px solid #f3cfcf;border-radius:11px;padding:10px 12px}
.cxbox b{display:block;font-size:11.5px;text-transform:uppercase;letter-spacing:.05em;
         color:var(--late);margin-bottom:3px}
.cxtag{font-size:11.5px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em}
.tkacts{display:flex;gap:9px}
.tkacts button{flex:1;min-height:50px;border:1px solid var(--line-strong);border-radius:13px;
               background:var(--surface);font-size:14.5px;font-weight:700;color:var(--ink-2)}
.tkacts .ap{background:var(--late);border-color:var(--late);color:#fff}
.kclear{min-height:36px;padding:0 13px;border:1px solid var(--line-strong);border-radius:9px;
        background:var(--surface);font-size:12.5px;font-weight:600;color:var(--ink-2)}
`;

function shell(){
  return `
  <div class="kstats">
    <div class="kstat"><b id="ksP">0</b><s>Đang chờ</s></div>
    <div class="kstat"><b id="ksT">0</b><s>Bàn</s></div>
    <div class="kstat" id="ksLbox"><b id="ksL">0</b><s>Quá 10′</s></div>
    <div class="kstat" id="ksCbox"><b id="ksC">0</b><s>Xin hủy</s></div>
  </div>
  <div class="seg" id="kdsGroup" style="margin-bottom:12px">
    <button data-g="table">Theo bàn</button>
    <button data-g="time">Chờ lâu nhất</button>
  </div>
  <div class="chiprow" id="kdsFilter" style="margin-bottom:12px"></div>
  <div id="kdsBoard"></div>`;
}

export function mountKds(root){
  if (mounted) return;
  const st = document.createElement('style'); st.textContent = CSS;
  document.head.appendChild(st);
  root.innerHTML = shell();

  el('kdsGroup').onclick = e => {
    const b = e.target.closest('button[data-g]'); if (!b) return;
    group = b.dataset.g; store.set('kds.group', group); render();
  };
  el('kdsFilter').onclick = e => {
    const b = e.target.closest('.chip'); if (!b) return;
    filter = b.dataset.t === 'all' ? 'all' : b.dataset.t; render();
  };
  el('kdsBoard').onclick = e => {
    const rc = e.target.closest('[data-recipe]');
    if (rc) return openRecipeSheet(rc.dataset.recipe);
    const d = e.target.closest('[data-done]');
    if (d) return finish(d.dataset.done, d);
    const a = e.target.closest('[data-ap]');
    if (a) return approve(a.dataset.ap, a);
    const r = e.target.closest('[data-rj]');
    if (r) return rejectSheet(r.dataset.rj);
    const g = e.target.closest('[data-grp]');
    if (g) return finishGroup(g.dataset.grp);
  };

  // 'bills' cũng phải vẽ lại: bàn vừa trả tiền thì nhãn trên phiếu phải đổi ngay.
  onData(w => { if (w === 'orders' || w === 'menu' || w === 'bills'){ render(); if (w === 'orders') alertNew(); } });
  render();

  setInterval(() => {
    root.querySelectorAll('.tk[data-at]').forEach(c => {
      const ms = Date.now() - +c.dataset.at;
      const l = c.querySelector('.el'); if (l) l.textContent = fmtElapsed(ms);
      if (c.classList.contains('cxreq')) return;
      c.classList.remove('age-warn','age-late');
      const k = ageClass(ms); if (k) c.classList.add(k);
    });
    stats();
  }, 1000);
  mounted = true;
}

function stats(){
  const all = data.orders;
  el('ksP').textContent = all.length;
  el('ksT').textContent = new Set(all.map(o => o.table ?? '—')).size;
  const late = all.filter(o => Date.now() - o.at >= 6e5).length;
  el('ksL').textContent = late;
  el('ksLbox').className = 'kstat' + (late ? ' late' : '');
  const cx = all.filter(isReq).length;
  el('ksC').textContent = cx;
  el('ksCbox').className = 'kstat' + (cx ? ' cx' : '');
}

function ticket(o){
  const ms = Date.now() - o.at, req = isReq(o);
  const rej = o.cancel && o.cancel.state === 'rejected';
  const b = busy.has(o.key);
  const hasRecipe = data.menu.length > 0;
  const banner = req ? `<div class="cxbox"><b>⚠ Thu ngân xin hủy món này</b>${
      esc(o.cancel.reason || 'Không nêu lý do')}${o.cancel.note ? ' — ' + esc(o.cancel.note) : ''}</div>` : '';
  const acts = req
    ? `<div class="tkacts">
         <button data-rj="${o.key}">✕ Từ chối</button>
         <button class="ap" data-ap="${o.key}" ${b?'disabled':''}>${b?'⏳ Đang hủy…':'🗑 Đồng ý hủy'}</button></div>`
    : `<button class="done" data-done="${o.key}" ${b?'disabled':''}>${b?'⏳ Đang lưu…':'✓ Hoàn thành'}</button>`;
  return `<article class="tk ${req ? 'cxreq' : ageClass(ms)}" data-at="${o.at}">
    <div class="top">
      <span class="tb">Bàn <b>${esc(o.table ?? '—')}</b>${nhanTien(o.table)}</span>
      <span class="rt"><span class="el">${fmtElapsed(ms)}</span><br>${esc(o.time || '')}</span>
    </div>
    <div class="mid">
      <div class="q">${Number(o.quantity) || 1}</div>
      <div class="info">
        <div class="nm">${esc(o.item)}</div>
        <div class="stt">STT <b>#${esc(o.stt ?? '—')}</b>${o.price != null ? ` · <span class="pv">${money(o.price*(Number(o.quantity)||1))}</span>` : ''}</div>
      </div>
      ${hasRecipe ? `<button class="recipe-btn" data-recipe="${esc(o.stt)}" title="Xem công thức">📋</button>` : ''}
    </div>
    ${banner}${rej ? '<div class="cxtag">Đã từ chối yêu cầu hủy</div>' : ''}${acts}</article>`;
}

function render(){
  stats();
  const all = data.orders;
  const tables = [...new Set(all.map(o => o.table ?? '—'))].sort((a,b)=>(+a||999)-(+b||999));
  if (filter !== 'all' && !tables.some(t => String(t) === String(filter))) filter = 'all';

  el('kdsFilter').innerHTML = tables.length
    ? `<button class="chip ${filter==='all'?'active':''}" data-t="all">Tất cả <span class="c">${all.length}</span></button>`
      + tables.map(t => `<button class="chip ${String(filter)===String(t)?'active':''}" data-t="${esc(t)}">Bàn ${esc(t)} <span class="c">${all.filter(o=>(o.table??'—')==t).length}</span></button>`).join('')
    : '';
  [...el('kdsGroup').children].forEach(b => b.classList.toggle('active', b.dataset.g === group));

  let rows = all.filter(o => filter === 'all' || (o.table ?? '—') == filter);
  if (!rows.length){
    el('kdsBoard').innerHTML = `<div class="empty"><div class="ic">${all.length ? '🔍' : '✨'}</div>
      <h3>${all.length ? 'Không có món ở bộ lọc này' : 'Hết món chờ pha'}</h3>
      <p>${all.length ? 'Chọn “Tất cả” để xem toàn bộ.' : 'Đơn mới sẽ tự hiện ở đây.'}</p></div>`;
    return;
  }

  if (group === 'time'){
    el('kdsBoard').innerHTML = rows.slice().sort(byUrgent).map(ticket).join('');
  } else {
    const g = new Map();
    rows.forEach(o => { const k = o.table ?? '—'; (g.get(k) || g.set(k,[]).get(k)).push(o); });
    el('kdsBoard').innerHTML = [...g.entries()]
      .sort((a,b)=>(+a[0]||999)-(+b[0]||999))
      .map(([k, list]) => {
        list.sort(byUrgent);
        const q = list.reduce((s,o)=>s+(Number(o.quantity)||1),0);
        const canBulk = list.filter(o => !isReq(o)).length > 1;
        return `<section class="kgrp">
          <div class="kgrp-h"><span class="t">Bàn ${esc(k)}${nhanTien(k)}</span>
            <span class="c">${list.length} món · ${q} ly</span><span class="r"></span>
            ${canBulk ? `<button class="kclear" data-grp="${esc(k)}">✓ Xong cả bàn</button>` : ''}</div>
          ${list.map(ticket).join('')}</section>`;
      }).join('');
  }
}

/* ─────────────────── hành động ─────────────────── */
function finish(key, btn){
  const o = data.orders.find(x => x.key === key); if (!o || busy.has(key)) return;
  busy.add(key);
  if (btn){ btn.disabled = true; btn.textContent = '⏳ Đang lưu…'; }
  completeOrder(o)
    .then(() => { busy.delete(key); toast('Đã hoàn thành: ' + o.item, 'ok'); })
    .catch(err => {
      busy.delete(key); console.error(err); render();
      toast('Lỗi Firebase — kiểm tra quyền ghi (.write)', 'err');
    });
}
function finishGroup(g){
  const list = data.orders.filter(o => (o.table ?? '—') == g && !isReq(o));
  if (!list.length) return;
  sheet({
    title:`Hoàn thành cả bàn ${g}?`,
    desc:`${list.length} món sẽ được ghi vào lịch sử và biến mất khỏi danh sách chờ. Món đang xin hủy được bỏ qua.`,
    actions:[
      { label:'Quay lại' },
      { label:`Xong ${list.length} món`, cls:'solid', onClick(){ list.forEach(o => finish(o.key)); } }
    ]
  });
}
function approve(key, btn){
  const o = data.orders.find(x => x.key === key); if (!o || busy.has(key)) return;
  busy.add(key);
  if (btn){ btn.disabled = true; btn.textContent = '⏳ Đang hủy…'; }
  approveCancel(o)
    .then(() => { busy.delete(key); toast('Đã hủy: ' + o.item, 'ok'); })
    .catch(err => {
      busy.delete(key); console.error(err); render();
      toast('Không hủy được — kiểm tra quyền ghi (.write)', 'err');
    });
}
function rejectSheet(key){
  const o = data.orders.find(x => x.key === key); if (!o) return;
  const presets = ['Món đã pha xong', 'Đang pha, không kịp dừng', 'Nguyên liệu đã dùng'];
  let note = presets[0];
  sheet({
    title:'Từ chối yêu cầu hủy',
    desc:`${o.item} — bàn ${o.table ?? '—'}. Lý do sẽ gửi lại cho thu ngân.`,
    body:`<div id="rjOpts">${presets.map((p,i)=>
        `<button class="opt ${i===0?'sel':''}" data-r="${esc(p)}"><span class="rk"></span>${esc(p)}</button>`).join('')}</div>
      <textarea id="rjNote" class="mt8" placeholder="Hoặc ghi lý do khác…"></textarea>`,
    actions:[
      { label:'Quay lại' },
      { label:'Gửi từ chối', cls:'solid', onClick(){
          const t = el('rjNote') ? el('rjNote').value.trim() : '';
          rejectCancel(o, t || note)
            .then(()=>toast('Đã từ chối yêu cầu hủy','ok'))
            .catch(err=>{ console.error(err); toast('Không gửi được phản hồi','err'); });
        } }
    ]
  });
  el('rjOpts').onclick = e => {
    const b = e.target.closest('.opt'); if (!b) return;
    note = b.dataset.r;
    [...e.currentTarget.children].forEach(x => x.classList.toggle('sel', x === b));
  };
}

/* ─────────────────── báo có đơn mới / xin hủy ─────────────────── */
let seen = null;
function alertNew(){
  const now = new Map(data.orders.map(o => [o.key, o.cancel && o.cancel.state]));
  if (seen === null){ seen = now; return; }          // lần đầu mở, không kêu
  let fresh = 0, cancels = 0;
  now.forEach((state, k) => {
    if (!seen.has(k)) fresh++;
    else if (state === 'requested' && seen.get(k) !== 'requested') cancels++;
  });
  seen = now;
  if (cancels){ audio.alarm(); audio.buzz(); toast('⚠ Thu ngân xin hủy món', 'err'); }
  else if (fresh){ audio.ding(); audio.buzz(); }
}

export const kdsBadge = () => data.orders.filter(isReq).length;
export const kdsWaiting = () => data.orders.length;
export { keepAwake };
