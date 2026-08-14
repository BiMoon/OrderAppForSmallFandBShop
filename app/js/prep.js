/* ==========================================================================
   prep.js — Sơ chế + Tra cứu công thức
   Hai nguồn: bảng sơ chế (PREP_API) và thực đơn pha chế (MENU_API).
   Trên điện thoại: danh sách -> bấm vào là mở chi tiết toàn trang.
   ========================================================================== */
import {
  el, esc, rxEsc, money,
  data, onData, priceOf, nameOf, toast, store
} from './core.js';

let src     = store.get('prep.src', 'prep');   // prep | drink
let openKey = null;
let batch   = 1;
let mounted = false;

/* hẹn giờ */
let tRemain = 0, tTotal = 0, tTick = null;

const CSS = `
.pl{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:13px 14px;
    border:1px solid var(--line);background:var(--surface);border-radius:13px;
    box-shadow:var(--shadow-1);margin-bottom:8px}
.pl:active{border-color:var(--brand);background:var(--brand-soft)}
.pl .cd{flex:none;min-width:42px;height:36px;padding:0 8px;border-radius:10px;background:var(--bg);
        display:grid;place-items:center;font-size:13px;font-weight:700;color:var(--ink-2)}
.pl .nm{flex:1;min-width:0}
.pl .nm .t{font-size:15px;font-weight:600;line-height:1.3}
.pl .nm .g{font-size:11.5px;color:var(--ink-3);margin-top:2px}
.pl .ar{color:var(--ink-3);font-size:18px;flex:none}
.pl mark{background:#fef08a;color:inherit;border-radius:3px;padding:0 1px}
.gh{font-size:11px;font-weight:700;color:var(--ink-3);text-transform:uppercase;
    letter-spacing:.07em;margin:16px 2px 8px}
.rc-hero{background:var(--surface);border:1px solid var(--line);border-radius:16px;
         padding:16px;box-shadow:var(--shadow-1);margin-bottom:12px}
.rc-tag{display:inline-block;font-size:11px;font-weight:700;color:var(--brand);
        background:var(--brand-soft);padding:3px 9px;border-radius:99px;letter-spacing:.03em}
.rc-h{font-size:22px;font-weight:700;letter-spacing:-.025em;line-height:1.2;margin-top:9px}
.rc-sub{font-size:12.5px;color:var(--ink-3);margin-top:5px}
.warnbox{display:flex;gap:10px;background:var(--warn-soft);border:1px solid #edd9b0;
         border-radius:13px;padding:12px 14px;font-size:13px;line-height:1.5;color:#7a4a08;margin-bottom:12px}
.warnbox b{display:block;margin-bottom:2px}
.batch{display:flex;align-items:center;gap:12px;background:var(--surface);border:1px solid var(--line);
       border-radius:13px;padding:13px 15px;margin-bottom:12px;box-shadow:var(--shadow-1)}
.batch .lb{font-size:12px;font-weight:700;color:var(--ink-3);text-transform:uppercase;letter-spacing:.06em}
.batch input[type=range]{flex:1;min-height:0;padding:0;border:0;background:none;accent-color:var(--brand)}
.batch .vv{min-width:48px;text-align:center;font-size:19px;font-weight:700;color:var(--brand)}
.ing{display:flex;align-items:baseline;justify-content:space-between;gap:12px;
     padding:11px 0;border-bottom:1px dashed var(--line)}
.ing:last-child{border-bottom:0}
.ing .n{font-size:14.5px;font-weight:600;flex:1;min-width:0}
.ing .a{font-size:15px;font-weight:700;color:var(--brand);font-variant-numeric:tabular-nums;
        white-space:nowrap;text-align:right}
.stp{display:flex;gap:12px;padding:11px 0;border-bottom:1px dashed var(--line)}
.stp:last-child{border-bottom:0}
.stp .i{flex:none;width:26px;height:26px;border-radius:8px;background:var(--brand);color:#fff;
        display:grid;place-items:center;font-size:12.5px;font-weight:700}
.stp .x{flex:1;min-width:0;font-size:14.5px;line-height:1.5}
.tmr{text-align:center;padding:6px 0 2px}
.tmr .d{font-size:52px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1}
.tmr .d.warn{color:var(--warn)} .tmr .d.done{color:var(--late)}
.tmr .presets{display:flex;gap:7px;justify-content:center;flex-wrap:wrap;margin:14px 0 12px}
.tmr .presets button{min-height:38px;padding:0 14px;border:1px solid var(--line-strong);
                     border-radius:99px;background:var(--surface);font-size:13px;font-weight:600;color:var(--ink-2)}
.tmr .presets button.active{background:var(--brand);border-color:var(--brand);color:#fff}
.tmr .ctl{display:flex;gap:9px}
.tmr .ctl .btn{flex:1}
.lbl{background:var(--surface-2);border:1px dashed var(--line-strong);border-radius:12px;
     padding:13px 14px;font-size:13px;line-height:1.7}
.lbl .k{color:var(--ink-3);font-size:11.5px;text-transform:uppercase;letter-spacing:.05em}
.lbl .v{font-weight:700}
`;

function shell(){
  return `
  <div id="prepList">
    <div class="seg" id="prepSrc" style="margin-bottom:12px">
      <button data-s="prep">🥄 Sơ chế</button>
      <button data-s="drink">☕ Pha chế</button>
    </div>
    <div class="field"><span class="ic">🔍</span>
      <input type="search" id="prepQ" placeholder="Tìm tên hoặc mã…" autocomplete="off">
    </div>
    <div id="prepItems" class="mt12"></div>
  </div>
  <div id="prepDetail" class="hide"></div>`;
}

export function mountPrep(root){
  if (mounted) return;
  const st = document.createElement('style'); st.textContent = CSS;
  document.head.appendChild(st);
  root.innerHTML = shell();

  el('prepSrc').onclick = e => {
    const b = e.target.closest('button[data-s]'); if (!b) return;
    src = b.dataset.s; store.set('prep.src', src); el('prepQ').value = ''; renderList();
  };
  el('prepQ').oninput = renderList;
  el('prepItems').onclick = e => {
    const b = e.target.closest('.pl'); if (!b) return;
    openDetail(b.dataset.k);
  };
  onData(w => { if (w === 'prep' || w === 'menu') renderList(); });
  renderList();
  mounted = true;
}

/* ─────────────────── danh sách ─────────────────── */
const rows = () => src === 'prep' ? data.prep : data.menu;
const codeOf = r => src === 'prep' ? r['Mã Số'] : r['STT'];
const titleOf = r => src === 'prep' ? (r['Tên món'] || '') : nameOf(r);
const groupOf = r => r['Nhóm'] || (src === 'prep' ? 'Tiền chế' : 'Khác');

function renderList(){
  [...el('prepSrc').children].forEach(b => b.classList.toggle('active', b.dataset.s === src));
  const q = (el('prepQ').value || '').trim().toLowerCase();
  let list = rows();
  const loaded = src === 'prep' ? data.prepLoaded : data.menuLoaded;

  if (q) list = list.filter(r =>
    titleOf(r).toLowerCase().includes(q) || String(codeOf(r)).includes(q));

  if (!list.length){
    el('prepItems').innerHTML = `<div class="empty"><div class="ic">${loaded ? '🔍' : '📋'}</div>
      <h3>${loaded ? 'Không tìm thấy' : 'Chưa tải được dữ liệu'}</h3>
      <p>${loaded ? 'Thử từ khóa khác.' : 'Kiểm tra kết nối rồi mở lại app.'}</p></div>`;
    return;
  }

  const groups = new Map();
  list.forEach(r => { const g = groupOf(r); (groups.get(g) || groups.set(g,[]).get(g)).push(r); });

  el('prepItems').innerHTML = [...groups.entries()].map(([g, items]) => `
    <div class="gh">${esc(g)} · ${items.length}</div>
    ${items.map(r => {
      let t = esc(titleOf(r));
      if (q) t = t.replace(new RegExp('('+rxEsc(esc(q))+')','gi'), '<mark>$1</mark>');
      const pr = src === 'drink' ? priceOf(r) : null;
      return `<button class="pl" data-k="${esc(codeOf(r))}">
        <span class="cd">${esc(codeOf(r))}</span>
        <span class="nm"><span class="t">${t}</span>
          <span class="g">${src==='prep'
            ? esc(r['Thời gian sử dụng'] ? 'HSD ' + r['Thời gian sử dụng'] : 'Tiền chế')
            : (pr != null ? money(pr) : 'chưa có giá')}</span></span>
        <span class="ar">›</span></button>`;
    }).join('')}`).join('');
}

/* ─────────────────── chi tiết ─────────────────── */
function findRow(k){
  return rows().find(r => String(codeOf(r)) === String(k));
}
export function openDetail(k){
  const r = findRow(k); if (!r) return;
  openKey = k; batch = 1;
  el('prepList').classList.add('hide');
  el('prepDetail').classList.remove('hide');
  el('prepDetail').innerHTML = detailHTML(r);
  bindDetail(r);
  document.getElementById('main').scrollTop = 0;
  window.dispatchEvent(new CustomEvent('prep:detail', { detail:{ open:true, title: titleOf(r) } }));
}
export function closeDetail(){
  if (!openKey) return false;
  stopTimer();
  openKey = null;
  el('prepDetail').classList.add('hide');
  el('prepList').classList.remove('hide');
  window.dispatchEvent(new CustomEvent('prep:detail', { detail:{ open:false } }));
  return true;
}
export const isDetailOpen = () => !!openKey;

function detailHTML(r){
  const isPrep = src === 'prep';
  const hsd = r['Thời gian sử dụng'] || '';
  const pr  = isPrep ? null : priceOf(r);
  return `
  <div class="rc-hero">
    <span class="rc-tag">${esc(groupOf(r))}</span>
    <div class="rc-h">${esc(titleOf(r))}</div>
    <div class="rc-sub">Mã ${esc(codeOf(r))}${
      pr != null ? ' · ' + money(pr) : ''}${hsd ? ' · HSD ' + esc(hsd) : ''}</div>
  </div>

  ${isPrep ? `<div class="warnbox"><span>⚠️</span><span>
      <b>Bắt buộc dán tem HSD sau khi làm xong</b>
      Hạn sử dụng: ${esc(hsd || 'xem quy định')}. Cất ngăn mát 0–4°C.</span></div>` : ''}

  <div class="batch">
    <span class="lb">Mẻ</span>
    <input type="range" id="pbSlider" min="0.5" max="5" step="0.5" value="1">
    <span class="vv" id="pbVal">x1</span>
  </div>

  <div class="card">
    <div class="card-head"><span class="card-title">Định lượng</span>
      <span class="card-note" id="pbNote"></span></div>
    <div class="card-body" id="pIng"></div>
  </div>

  ${isPrep ? `
  <div class="card">
    <div class="card-head"><span class="card-title">Các bước thực hiện</span></div>
    <div class="card-body" id="pSteps"></div>
  </div>

  <div class="card">
    <div class="card-head"><span class="card-title">Hẹn giờ</span></div>
    <div class="card-body">
      <div class="tmr">
        <div class="d" id="tDisp">00:00</div>
        <div class="presets" id="tPre">
          ${[1,3,5,10,15,30].map(m=>`<button data-m="${m}">${m} phút</button>`).join('')}
        </div>
        <div class="ctl">
          <button class="btn solid" id="tGo">▶ Bắt đầu</button>
          <button class="btn" id="tRst">↺ Đặt lại</button>
        </div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-head"><span class="card-title">Nhãn dán hũ</span>
      <div class="spacer"></div>
      <button class="btn sm" id="pCopy">Chép</button></div>
    <div class="card-body"><div class="lbl" id="pLabel"></div></div>
  </div>` : ''}

  <button class="btn block mt16" id="pBack">‹ Về danh sách</button>`;
}

function bindDetail(r){
  const s = el('pbSlider');
  if (s) s.oninput = () => { batch = parseFloat(s.value) || 1; renderBatch(r); };
  el('pBack').onclick = closeDetail;
  const pre = el('tPre');
  if (pre) pre.onclick = e => {
    const b = e.target.closest('button[data-m]'); if (!b) return;
    [...pre.children].forEach(x => x.classList.toggle('active', x === b));
    setTimer((+b.dataset.m) * 60);
  };
  if (el('tGo'))  el('tGo').onclick  = toggleTimer;
  if (el('tRst')) el('tRst').onclick = () => { setTimer(tTotal || 0); };
  if (el('pCopy')) el('pCopy').onclick = () => {
    const txt = el('pLabel').innerText.replace(/\n+/g,' | ');
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject())
      .then(()=>toast('Đã chép nhãn','ok')).catch(()=>toast('Không chép được','err'));
  };
  renderBatch(r);
  if (src === 'prep'){ renderSteps(r); renderLabel(r); setTimer(0); }
}

/* nhân mẻ: nhân mọi con số trong dòng */
function scale(line, m){
  if (m === 1) return line;
  return String(line).replace(/(\d+([.,]\d+)?)/g, t => {
    const v = parseFloat(t.replace(',','.')) * m;
    return Number.isInteger(v) ? String(v) : v.toFixed(1).replace('.',',');
  });
}
function renderBatch(r){
  const v = el('pbVal'); if (v) v.textContent = 'x' + (Number.isInteger(batch) ? batch : batch.toFixed(1));
  const n = el('pbNote'); if (n) n.textContent = batch === 1 ? '' : 'đã nhân x' + batch;

  const raw = String((src === 'prep' ? r['Định lượng chuẩn'] : r['Định lượng']) || '').trim();
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const box = el('pIng'); if (!box) return;
  box.innerHTML = lines.length ? lines.map(line => {
    const sc = scale(line, batch);
    const i = sc.indexOf(':');
    const name = (i > -1 ? sc.slice(0,i) : sc).replace(/^[-•*]\s*/,'').trim();
    const amt  = i > -1 ? sc.slice(i+1).trim() : '';
    return `<div class="ing"><span class="n">${esc(name)}</span><span class="a">${esc(amt)}</span></div>`;
  }).join('') : '<p class="muted" style="font-size:13.5px">Chưa có định lượng cho món này.</p>';
}
function renderSteps(r){
  const raw = String(r['Các bước thực hiện'] || '').trim();
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  const box = el('pSteps'); if (!box) return;
  box.innerHTML = lines.length
    ? lines.map((l,i) => `<div class="stp"><span class="i">${i+1}</span>
        <span class="x">${esc(l.replace(/^(\d+[.)]\s*|[-•*]\s*)/,''))}</span></div>`).join('')
    : '<p class="muted" style="font-size:13.5px">Chưa có mô tả các bước.</p>';
}
function renderLabel(r){
  const now = new Date(), p = n => String(n).padStart(2,'0');
  const box = el('pLabel'); if (!box) return;
  box.innerHTML = `
    <div><span class="k">Tên</span> <span class="v">${esc(r['Ghi nhãn'] || r['Tên món'] || '')}</span></div>
    <div><span class="k">Ngày làm</span> <span class="v">${p(now.getDate())}/${p(now.getMonth()+1)}/${now.getFullYear()}</span>
         &nbsp;<span class="k">Giờ</span> <span class="v">${p(now.getHours())}:${p(now.getMinutes())}</span></div>
    <div><span class="k">HSD</span> <span class="v">${esc(r['Thời gian sử dụng'] || 'xem quy định')}</span></div>
    <div><span class="k">Người làm</span> ____________________</div>`;
}

/* ─────────────────── hẹn giờ ─────────────────── */
function paint(){
  const d = el('tDisp'); if (!d) return;
  const m = Math.floor(tRemain/60), s = tRemain % 60;
  d.textContent = String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
  d.classList.toggle('warn', tRemain > 0 && tRemain <= 30);
  d.classList.toggle('done', tRemain === 0 && tTotal > 0);
}
function setTimer(sec){ stopTimer(); tTotal = sec; tRemain = sec; paint(); label('▶ Bắt đầu'); }
const label = t => { const b = el('tGo'); if (b) b.textContent = t; };
function stopTimer(){ if (tTick){ clearInterval(tTick); tTick = null; } }
function toggleTimer(){
  if (tTick){ stopTimer(); label('▶ Tiếp tục'); return; }
  if (tRemain <= 0) return toast('Chọn thời gian trước đã','err');
  label('⏸ Tạm dừng');
  tTick = setInterval(() => {
    tRemain--; paint();
    if (tRemain <= 0){
      stopTimer(); label('▶ Bắt đầu');
      toast('⏰ Hết giờ!','err');
      if (navigator.vibrate) navigator.vibrate([200,100,200,100,200]);
      import('./core.js').then(m => m.audio.alarm());
    }
  }, 1000);
}
