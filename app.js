/* Third Hand Fab & Welding — test app (plain JS, no build step). */
'use strict';
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => { const n = parseFloat(String(v ?? '').replace(/[$,%\s]/g, '')); return isFinite(n) ? n : 0; };
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const money = n => (n < 0 ? '-$' : '$') + Math.abs(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtN = n => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });
const uid = p => p + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const pad3 = n => String(n).padStart(3, '0');
function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function nowStamp() { return new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
function fmtDate(s) { if (!s) return ''; const [y, m, d] = s.split('-'); const dt = new Date(+y, (+m || 1) - 1, +d || 1); return d ? dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }); }
const BIZ_KEYS = ['shopName', 'tagline', 'phone', 'email', 'address', 'website', 'ein', 'sosControl', 'countyLicense', 'nhtsaMid', 'wmi', 'wmiSuffix', 'plantCode', 'plantCity', 'part565Id', 'keyContacts', 'county'];
// Private info file (v1.6.0): fills ONLY blank business fields; never the EIN, never any records.
const FILL_KEYS = ['phone', 'email', 'address', 'website', 'county', 'sosControl', 'countyLicense', 'nhtsaMid', 'wmi', 'wmiSuffix', 'plantCode', 'plantCity', 'part565Id', 'keyContacts'];
let LAST_FILL = '';
function applyPrivateFill(data) {
  if (!data || data.type !== 'third-hand-private-fill' || data.version !== 1 || typeof data.fields !== 'object' || !data.fields) throw new Error('Not a Third Hand private info file');
  let filled = 0, kept = 0;
  for (const k of FILL_KEYS) {
    const v = data.fields[k]; if (v == null || String(v).trim() === '') continue;
    if (bizVal(k)) { kept++; continue; }
    S.settings[k] = ['wmi', 'wmiSuffix', 'plantCode'].includes(k) ? String(v).trim().toUpperCase() : String(v).trim(); filled++;
  }
  return { filled, kept };
}
const taxOf = (amt) => Math.round(num(amt) * (num(S.settings.taxRate) / 100) * 100) / 100;
/* Private business numbers live only in this phone's Settings (v1.6.0); the public code carries none of them. */
const bizVal = k => String((S.settings || {})[k] ?? '').trim();
const NOT_ENTERED = 'Not entered — add it in <a href="#/settings">Settings</a>';
const nv = k => bizVal(k) ? esc(bizVal(k)) : NOT_ENTERED;
const vinIds = () => ({ wmi: bizVal('wmi').toUpperCase(), suffix: bizVal('wmiSuffix'), plant: bizVal('plantCode').toUpperCase() });
const vinIdsSet = () => { const v = vinIds(); return /^[A-HJ-NPR-Z0-9]{3}$/.test(v.wmi) && /^[A-HJ-NPR-Z0-9]{3}$/.test(v.suffix) && /^[A-HJ-NPR-Z0-9]$/.test(v.plant); };
const plantTxt = code => { const c = code || vinIds().plant; const city = bizVal('plantCity'); return c ? c + (city ? ' — ' + city : '') : ''; };

/* ---------- storage: IndexedDB (falls back to localStorage) ---------- */
let DB = null, S = null;
const PHOTO_CACHE = {};
function openIDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('thirdhand', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('kv'); r.result.createObjectStore('photos'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
function idbDo(store, mode, fn) {
  return new Promise((res, rej) => {
    const t = DB.transaction(store, mode); const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req ? req.result : undefined); t.onerror = () => rej(t.error);
  });
}
async function loadState() {
  try { DB = await openIDB(); S = await idbDo('kv', 'readonly', s => s.get('state')); }
  catch (e) { DB = null; S = JSON.parse(localStorage.getItem('th-state') || 'null'); }
  if (!S) { S = structuredClone(TH.SEED); }
  migrate(); await save();
}
function migrate() {
  for (const k of Object.keys(TH.SEED)) if (S[k] === undefined) S[k] = structuredClone(TH.SEED[k]);
  S.settings = { ...TH.SEED.settings, ...S.settings };
  if (!S.photos) S.photos = {}; // only used when IndexedDB is unavailable
  const maxSerial = Math.max(0, ...S.vins.map(v => v.serial || 0));
  S.settings.nextSerial = Math.max(S.settings.nextSerial || 1, maxSerial + 1);
  // Invoices (added v1.4): numbers INV-0001 and up, never reused or skipped.
  if (S.settings.invoiceTerms == null) S.settings.invoiceTerms = 'Due on receipt';
  if (S.settings.payMethods == null) S.settings.payMethods = 'Cash, Check, Card';
  const maxInv = Math.max(0, ...S.estimates.map(e => e.invoiceSeq || 0));
  S.settings.nextInvoice = Math.max(S.settings.nextInvoice || 1, maxInv + 1);
  // Parts prices (added v1.5.1): fill blank worksheet lines once per price set; never overwrite typed values.
  const PP = TH.PARTS_PRICES;
  if (PP && S.settings.partsPricesLoaded !== PP.version) {
    if (!S.worksheets) S.worksheets = {};
    for (const [mid, lines] of Object.entries(PP.prices)) {
      const w = S.worksheets[mid] = S.worksheets[mid] || { lines: {}, hours: '', overhead: '', profit: 25 };
      if (!w.lines) w.lines = {};
      for (const [l, v] of Object.entries(lines)) { const cur = w.lines[l]; if (cur === '' || cur == null) w.lines[l] = Number(v).toFixed(2); }
    }
    S.settings.partsPricesLoaded = PP.version;
  }
  // Kit prices (added v1.5.2): one time, after the parts prices. Per model, only if every kit line is blank or still the baseline.
  const KP = TH.KIT_PRICES;
  if (KP && S.settings.kitPricesLoaded !== KP.version) {
    if (!S.worksheets) S.worksheets = {};
    const applied = [];
    for (const [mid, kit] of Object.entries(KP.models)) {
      const base = (PP && PP.prices[mid]) || {};
      const w = S.worksheets[mid] = S.worksheets[mid] || { lines: {}, hours: '', overhead: '', profit: 25 };
      if (!w.lines) w.lines = {};
      const untouched = KP.lines.every(l => {
        const cur = w.lines[l]; if (cur === '' || cur == null) return true;
        if (base[l] == null) return false;
        return String(cur) === Number(base[l]).toFixed(2) || Number(cur) === Number(base[l]);
      });
      if (!untouched) continue;
      KP.lines.forEach(l => w.lines[l] = '');
      w.lines['Axle(s)'] = Number(kit.price).toFixed(2);
      applied.push(mid);
    }
    S.settings.kitPricesApplied = applied;
    S.settings.kitPricesLoaded = KP.version;
  }
  // Husky axle kit (added v1.5.3): one time, after the kit load. Per model, only if the lines are still exactly what the
  // kit load wrote (kit price on Axle(s), the rest blank) or the untouched baseline; otherwise the model is left alone.
  const HP = TH.HUSKY_PRICES;
  if (HP && S.settings.huskyPricesLoaded !== HP.version) {
    if (!S.worksheets) S.worksheets = {};
    const applied = [];
    const same = (cur, v) => (v === '' || v == null) ? (cur === '' || cur == null) : (cur !== '' && cur != null && (String(cur) === Number(v).toFixed(2) || Number(cur) === Number(v)));
    for (const [mid, kit] of Object.entries(HP.models)) {
      const base = PP && PP.prices[mid];
      if (!base) continue;
      const w = S.worksheets[mid] = S.worksheets[mid] || { lines: {}, hours: '', overhead: '', profit: 25 };
      if (!w.lines) w.lines = {};
      const tpo = KP && KP.models[mid];
      const isKit = !!tpo && HP.lines.every(l => same(w.lines[l], l === 'Axle(s)' ? tpo.price : ''));
      const isBase = HP.lines.every(l => same(w.lines[l], base[l]));
      if (!isKit && !isBase) continue;
      HP.lines.forEach(l => w.lines[l] = Number(base[l]).toFixed(2));
      w.lines['Axle(s)'] = Number(kit.price).toFixed(2);
      applied.push(mid);
    }
    S.settings.huskyApplied = applied;
    S.settings.huskyPricesLoaded = HP.version;
  }
  // Best prices (added v1.5.4): one time, after the Husky load. Per model and line, a value is replaced only if it is blank
  // or still exactly what an earlier load wrote (baseline, TPO kit, or Husky). Anything typed by hand is kept.
  const BP = TH.BEST_PRICES;
  if (BP && S.settings.bestPricesLoaded !== BP.version) {
    if (!S.worksheets) S.worksheets = {};
    const same = (cur, v) => (v === '' || v == null) ? (cur === '' || cur == null) : (cur !== '' && cur != null && (String(cur) === Number(v).toFixed(2) || Number(cur) === Number(v)));
    const applied = {}, kept = {};
    for (const [mid, bm] of Object.entries(BP.models)) {
      const base = (PP && PP.prices[mid]) || {};
      const tpo = KP && KP.models[mid], hk = HP && HP.models[mid];
      const w = S.worksheets[mid] = S.worksheets[mid] || { lines: {}, hours: '', overhead: '', profit: 25 };
      if (!w.lines) w.lines = {};
      const prior = l => {
        const cur = w.lines[l];
        if (same(cur, '') || same(cur, base[l])) return true;
        if (tpo && same(cur, l === 'Axle(s)' ? tpo.price : '')) return true;
        if (hk && same(cur, l === 'Axle(s)' ? hk.price : base[l])) return true;
        return false;
      };
      // A hand-typed Axle(s) on a model still using the TPO complete kit means the other lines are covered by it: leave the model alone.
      const onTpoKit = tpo && (S.settings.kitPricesApplied || []).includes(mid) && !(S.settings.huskyApplied || []).includes(mid);
      if (onTpoKit && !prior('Axle(s)')) { kept[mid] = BP.lines.slice(); continue; }
      for (const l of BP.lines) {
        if (prior(l)) { w.lines[l] = Number(bm.lines[l]).toFixed(2); (applied[mid] = applied[mid] || []).push(l); }
        else (kept[mid] = kept[mid] || []).push(l);
      }
    }
    S.settings.bestApplied = applied;
    S.settings.bestKept = kept;
    S.settings.bestPricesLoaded = BP.version;
  }
  // Business Information Record wholesaler updates (added v1.5.6): once. Appends notes only
  // if the facts are not already on the card; never overwrites typed fields. Adds Southwest Wheel
  // only when no card with that name exists.
  const SUP_VER = '2026-11-15-biz';
  if (S.settings.bizSuppliersLoaded !== SUP_VER) {
    if (!Array.isArray(S.suppliers)) S.suppliers = [];
    const hay = s => [s.notes, s.status, s.contact, s.email, s.phone, s.terms].join(' ').toLowerCase();
    const husky = S.suppliers.find(s => /husky/i.test(s.name || '') || s.id === 's-husky');
    if (husky) {
      const h = hay(husky);
      if (!(/10%\s*off/.test(h) && /500/.test(h))) {
        const add = 'Discount Partner approved 9/29/2026. 10% off first $500+ qualifying order, grows with volume, free FedEx on most orders.';
        husky.notes = [husky.notes, add].filter(Boolean).join(' ');
      }
    }
    const dex = S.suppliers.find(s => /dexter/i.test(s.name || '') || s.id === 's-dexter');
    if (dex) {
      const h = hay(dex);
      if (!/sikeston/.test(h) && !/472-?3839/.test(h)) {
        dex.notes = [dex.notes, 'Sikeston, MO Branch 6: (573) 472-3839'].filter(Boolean).join(' ');
      }
    }
    if (!S.suppliers.some(s => /southwest\s*wheel/i.test(s.name || '') || s.id === 's-sww')) {
      S.suppliers.push({ id: 's-sww', name: 'Southwest Wheel', category: 'Brake drums & trailer parts', website: '',
        contact: '', phone: '', email: 'sales@southwestwheel.com', address: '', account: '', terms: '', status: '',
        notes: 'Brake drums, hubs, running-gear parts.', added: '2026-11-15' });
    }
    S.settings.bizSuppliersLoaded = SUP_VER;
  }
}
function kitNote(mid) {
  const bp = TH.BEST_PRICES && TH.BEST_PRICES.models[mid];
  const bl = (S.settings.bestApplied || {})[mid];
  if (bp && bl && bl.length) {
    const kept = (S.settings.bestKept || {})[mid] || [];
    const cav = ['Husky prices include the 10% account discount; confirm it applies to every item', 'Husky freight ships to business addresses only', 'Hwy 96 lights' + (/Hwy 96 lights and/.test(bp.vendors) ? ' and fenders' : '') + ' likely pickup in Eagleville TN', ...bp.caveats, 'Confirm Hwy 96 rear clearance lamps meet FMVSS 108'];
    return `<p class="small muted">Best prices loaded Nov 15, 2026: ${esc(bp.vendors)}. Brakes are in the axle kit; Other = fenders, safety chains, breakaway, D-rings.${kept.length ? ` Kept your own numbers on: ${esc(kept.join(', '))}.` : ''} Prices exclude shipping/freight.</p><p class="small muted">Check: ${esc(cav.join('; '))}. Steel, decking, paint still blank.</p>`;
  }
  const hk = TH.HUSKY_PRICES && TH.HUSKY_PRICES.models[mid];
  if (hk && (S.settings.huskyApplied || []).includes(mid))
    return `<p class="small muted">Axles: Husky tandem 3,500 lb axle kit with electric brakes on both axles, ${money(hk.price)} after 10% account-holder discount (${money(hk.list)} list, SKU ${esc(hk.sku)}). Tires, coupler, jack, lights, fenders priced separately. Shipping extra. Steel, decking, paint still blank.</p>`;
  const kit = TH.KIT_PRICES && TH.KIT_PRICES.models[mid];
  if (!kit || !(S.settings.kitPricesApplied || []).includes(mid)) return '';
  const two = kit.axles > 1;
  return `<p class="small muted">Parts: Trailer Parts Outlet complete kit ${money(kit.price)} (SKU ${esc(kit.sku)}), on the Axle(s) line; covers ${two ? 'axles' : 'axle'}, tires/wheels, coupler, jack, lights. Shipping extra. Confirm brakes on ${two ? 'both axles' : 'the axle'}. Steel, decking, paint still blank.</p>`;
}
const invNo = n => 'INV-' + String(n).padStart(4, '0');
let saveTimer = null;
async function save() {
  if (DB) await idbDo('kv', 'readwrite', s => s.put(S, 'state'));
  else localStorage.setItem('th-state', JSON.stringify(S));
}
async function putPhoto(dataUrl) {
  const id = uid('p'); PHOTO_CACHE[id] = dataUrl;
  if (DB) await idbDo('photos', 'readwrite', s => s.put(dataUrl, id)); else S.photos[id] = dataUrl;
  return id;
}
async function getPhoto(id) {
  if (PHOTO_CACHE[id]) return PHOTO_CACHE[id];
  const v = DB ? await idbDo('photos', 'readonly', s => s.get(id)) : S.photos[id];
  if (v) PHOTO_CACHE[id] = v; return v;
}
async function delPhoto(id) {
  delete PHOTO_CACHE[id];
  if (DB) await idbDo('photos', 'readwrite', s => s.delete(id)); else delete S.photos[id];
}
async function allPhotos() {
  if (!DB) return { ...S.photos };
  const out = {};
  await new Promise((res, rej) => {
    const t = DB.transaction('photos'); const st = t.objectStore('photos'); const c = st.openCursor();
    c.onsuccess = () => { const cur = c.result; if (cur) { out[cur.key] = cur.value; cur.continue(); } };
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
  return out;
}
async function clearPhotos() { if (DB) await idbDo('photos', 'readwrite', s => s.clear()); else S.photos = {}; for (const k in PHOTO_CACHE) delete PHOTO_CACHE[k]; }
/* compress a picked image to max 1600px JPEG */
function compressImage(file, max = 1600, q = 0.72) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file); const img = new Image();
    img.onload = () => {
      let { width: w, height: h } = img; const k = Math.min(1, max / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
      const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Could not read that image')); };
    img.src = url;
  });
}
function pickImage(multiple = false) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = multiple;
    i.onchange = async () => { const out = []; for (const f of i.files) { try { out.push(await compressImage(f)); } catch (e) { toast(e.message); } } res(out); };
    i.click();
  });
}
async function hydratePhotos() {
  for (const img of $$('img[data-pid]')) { if (!img.src) { const d = await getPhoto(img.dataset.pid); if (d) img.src = d; } }
}

/* ---------- small UI helpers ---------- */
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
function sheet(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; m.onclick = e => { if (e.target === m) closeModal(); }; return m; }
function confirmBox(msg, okLabel = 'Delete', danger = true) {
  return new Promise(res => {
    sheet(`<p style="font-size:17px">${esc(msg)}</p><div class="btns"><button class="btn sec" id="cNo">Cancel</button><button class="btn ${danger ? 'danger' : ''}" id="cYes">${esc(okLabel)}</button></div>`);
    $('#cNo').onclick = () => { closeModal(); res(false); }; $('#cYes').onclick = () => { closeModal(); res(true); };
  });
}
function promptBox(msg, { label = 'Save', placeholder = '', type = 'text', value = '' } = {}) {
  return new Promise(res => {
    sheet(`<p style="font-size:17px;margin-top:0">${esc(msg)}</p><input id="pIn" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}" step="any"><div class="btns"><button class="btn sec" id="cNo">Cancel</button><button class="btn" id="cYes">${esc(label)}</button></div>`);
    setTimeout(() => { const p = $('#pIn'); if (p) p.focus(); }, 50);
    $('#cNo').onclick = () => { closeModal(); res(null); }; $('#cYes').onclick = () => { const v = $('#pIn').value; closeModal(); res(v); };
  });
}
async function viewPhoto(pid) {
  const src = await getPhoto(pid); if (!src) return toast('Photo not found');
  const m = $('#modal'); let z = 1;
  m.innerHTML = `<div class="vbar"><button class="btn sec sm" id="vClose">✕ Close</button><span class="spacer"></span><button class="btn sec sm" id="vOut">−</button><span id="vZ" style="min-width:52px;text-align:center">100%</span><button class="btn sec sm" id="vIn">＋ Zoom</button><button class="btn sec sm" id="vFit">Fit</button></div><div class="vwrap"><img id="vImg" alt="Full photo"></div>`;
  m.hidden = false; m.onclick = null;
  const img = $('#vImg'); img.src = src;
  const apply = () => { const W = m.querySelector('.vwrap').clientWidth; img.style.width = (W * z) + 'px'; $('#vZ').textContent = Math.round(z * 100) + '%'; };
  img.onload = apply; apply();
  $('#vClose').onclick = closeModal; $('#vIn').onclick = () => { z = Math.min(6, z * 1.5); apply(); }; $('#vOut').onclick = () => { z = Math.max(1, z / 1.5); apply(); }; $('#vFit').onclick = () => { z = 1; apply(); };
  img.ondblclick = () => { z = z > 1 ? 1 : 2.5; apply(); };
}
function download(name, text, type = 'text/plain') {
  const blob = text instanceof Blob ? text : new Blob([text], { type });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function toCSV(rows) {
  const q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
}
function applyAccent() {
  const a = S.settings.accent || '#19728d'; const r = document.documentElement.style;
  r.setProperty('--accent', a); r.setProperty('--accent-d', shade(a, -0.3)); r.setProperty('--accent-l', mix(a, '#ffffff', 0.88));
  document.querySelector('meta[name=theme-color]').content = a;
}
function hex(c) { c = c.replace('#', ''); return [0, 2, 4].map(i => parseInt(c.substr(i, 2), 16)); }
function toHex(a) { return '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
function shade(c, k) { return toHex(hex(c).map(v => v * (1 + k))); }
function mix(a, b, k) { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * k)); }
function logoHTML(size) {
  const s = size || S.settings.logoSize || 'Large';
  return S.settings.logoPhoto ? `<div class="logo ${s}"><img data-pid="${S.settings.logoPhoto}" alt="Shop logo"></div>` : `<div class="logo ${s}" title="Placeholder — add your logo in Settings">TH</div>`;
}
const custName = id => (S.customers.find(c => c.id === id) || {}).name || '';
const fmtPhone = p => { const d = String(p || '').replace(/\D/g, ''); return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : (p || ''); };

/* ---------- VIN (Scheme B + 49 CFR 565.15 check digit) ---------- */
const VIN_TR = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
const VIN_W = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
function vinCheckDigit(v) {
  v = String(v).toUpperCase(); if (v.length !== 17 || /[IOQ]/.test(v)) return null;
  let sum = 0;
  for (let i = 0; i < 17; i++) { const c = v[i]; const n = /\d/.test(c) ? +c : VIN_TR[c]; if (n === undefined) return null; sum += n * VIN_W[i]; }
  const r = sum % 11; return r === 10 ? 'X' : String(r);
}
function vinValid(v) { v = String(v || '').toUpperCase().trim(); const c = vinCheckDigit(v); return c !== null && v[8] === c; }
function buildVin({ body, hitch, len, axles, year, serial }) {
  if (!body || !hitch || !len || !axles || !year || !serial) return null;
  if (!vinIdsSet()) return null;
  const id = vinIds();
  const base = id.wmi + body + hitch + len + axles + '0' + year + id.plant + id.suffix + pad3(serial);
  const c = vinCheckDigit(base); return c === null ? null : base.slice(0, 8) + c + base.slice(9);
}
function vinHTML(v) {
  if (!v) return '<span class="muted">— pick all codes —</span>';
  const p = (a, b, cls) => `<span class="${cls}">${v.slice(a, b)}</span>`;
  return p(0, 3, 'p-wmi') + p(3, 8, 'p-desc') + p(8, 9, 'p-chk') + p(9, 10, 'p-yr') + p(10, 11, 'p-pl') + p(11, 14, 'p-wmi') + p(14, 17, 'p-ser');
}
const STATUS = { 'in-build': 'In build', built: 'Built', offered: 'Offered', sold: 'Sold', void: 'VOID' };
const offerAllowed = () => today() >= TH.FIRST_OFFER_DATE;
const modelOf = id => TH.MODELS.find(m => m.id === id);
const yearOptions = () => Object.entries(TH.YEAR).sort((a, b) => a[1] - b[1]);

/* ---------- Material list nesting ---------- */
function parseLen(s) { // inches; accepts 75, 75.5, 6'3", 6' 3-1/2", 3 1/2, 20ft
  s = String(s || '').trim().toLowerCase().replace(/ft|feet/g, "'").replace(/in|"|”/g, '');
  if (!s) return 0;
  let ft = 0, rest = s;
  if (s.includes("'")) { const [a, b] = s.split("'"); ft = num(a); rest = b || ''; }
  rest = rest.trim().replace(/-/g, ' ');
  let inch = 0;
  for (const part of rest.split(/\s+/).filter(Boolean)) { if (part.includes('/')) { const [n, d] = part.split('/'); inch += num(n) / (num(d) || 1); } else inch += num(part); }
  return ft * 12 + inch;
}
function fmtLen(inches) {
  const t = Math.round(inches * 16) / 16; const ft = Math.floor(t / 12); let i = t - ft * 12;
  const whole = Math.floor(i); const frac = Math.round((i - whole) * 16);
  let f = ''; if (frac) { let n = frac, d = 16; while (n % 2 === 0) { n /= 2; d /= 2; } f = `${whole ? whole + '-' : ''}${n}/${d}`; } else f = String(whole);
  return (ft ? ft + "' " : '') + f + '"';
}
function cutPlan(list) {
  const kerf = num(list.kerf);
  const groups = {};
  for (const p of list.pieces || []) {
    const len = parseLen(p.length); const qty = Math.max(0, Math.round(num(p.qty)));
    if (!len || !qty) continue;
    const key = p.mode || '20'; (groups[key] = groups[key] || []);
    for (let i = 0; i < qty; i++) groups[key].push({ len, label: p.label || fmtLen(len) });
  }
  const out = [];
  for (const mode of Object.keys(groups).sort()) {
    const pcs = groups[mode];
    if (mode === 'exact') {
      const total = pcs.reduce((a, b) => a + b.len, 0);
      out.push({ mode, label: 'Exact-fit (buy cut to length)', pieces: pcs, total }); continue;
    }
    const stock = num(mode) * 12; const sticks = []; const tooLong = [];
    pcs.sort((a, b) => b.len - a.len);
    for (const pc of pcs) {
      if (pc.len > stock) { tooLong.push(pc); continue; }
      let best = null;
      for (const st of sticks) { const need = pc.len + (st.cuts.length ? kerf : 0); if (st.left >= need && (!best || st.left < best.left)) best = st; }
      if (!best) { best = { cuts: [], left: stock }; sticks.push(best); }
      best.left -= pc.len + (best.cuts.length ? kerf : 0); best.cuts.push(pc);
    }
    const used = pcs.filter(p => !tooLong.includes(p)).reduce((a, b) => a + b.len, 0);
    out.push({ mode, label: `${mode}' stock sticks`, stock, sticks, tooLong, used, waste: sticks.reduce((a, s) => a + s.left, 0) });
  }
  return out;
}

/* ---------- calculations ---------- */
function estCalc(e) {
  const labor = r2(num(e.laborHours) * num(e.laborRate)); const subtotal = r2(labor + num(e.materials) + num(e.other));
  const tax = taxOf(subtotal); return { labor, subtotal, tax, total: r2(subtotal + tax) };
}
function costCalc(k) {
  const cost = r2(num(k.materials) + num(k.labor) + num(k.overhead)); const sell = r2(cost * (1 + num(k.markup) / 100));
  const tax = taxOf(sell); return { cost, markupAmt: r2(sell - cost), sell, tax, total: r2(sell + tax) };
}
function saleCalc(s) { const price = num(s.price); const tax = Math.round(price * (num(s.taxRate ?? S.settings.taxRate) / 100) * 100) / 100; return { price, tax, total: r2(price + tax) }; }
const isLow = i => num(i.onHand) <= num(i.reorderAt);
function kitStatus() {
  const qty = n => S.inventory.filter(i => i.category === 'Bearings' && (i.bearing === n || String(i.name).startsWith(n + ',') || String(i.name).startsWith(n + ' '))).reduce((a, i) => a + num(i.onHand), 0);
  return TH.KIT_TARGETS.map(t => { const q = { inner: qty(t.inner), outer: qty(t.outer), seal: qty(t.seal) }; return { ...t, q, kits: Math.floor(Math.min(q.inner, q.outer, q.seal)) }; });
}

/* ---------- collection schemas ---------- */
const opts = arr => arr.map(v => Array.isArray(v) ? v : [v, v]);
const custOpts = () => [['', '— none —'], ...S.customers.map(c => [c.id, c.name])];
const COLL = {
  customers: { label: 'Customers', one: 'Customer', icon: '👤',
    fields: [{ k: 'name', l: 'Name', req: 1 }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'email', l: 'Email', t: 'email' }, { k: 'address', l: 'Address' }, { k: 'notes', l: 'Notes', t: 'textarea' }],
    title: r => r.name, sub: r => fmtPhone(r.phone) || r.email || '', sort: (a, b) => a.name.localeCompare(b.name) },
  estimates: { label: 'Estimates', one: 'Estimate', icon: '📝',
    fields: [{ k: 'title', l: 'Job title', req: 1 }, { k: 'customerId', l: 'Customer', t: 'select', o: custOpts }, { k: 'status', l: 'Status', t: 'select', o: () => opts([['draft', 'Draft'], ['sent', 'Sent'], ['approved', 'Approved']]), d: 'draft' },
      { k: 'date', l: 'Date', t: 'date', d: today }, { k: 'details', l: 'Job details', t: 'textarea' }, { k: 'laborHours', l: 'Labor hours', t: 'number' }, { k: 'laborRate', l: 'Labor rate ($/hr)', t: 'number', d: () => S.settings.laborRate },
      { k: 'materials', l: 'Materials ($)', t: 'number' }, { k: 'other', l: 'Other ($)', t: 'number' }, { k: 'notes', l: 'Notes (not printed)', t: 'textarea' }],
    title: r => r.title, sub: r => [custName(r.customerId), fmtDate(r.date)].filter(Boolean).join(' · '), right: r => money(estCalc(r).total), badge: r => [r.status, r.status],
    calc: r => { const c = estCalc(r); return totalsTable([['Labor (' + fmtN(num(r.laborHours)) + ' hrs × ' + money(num(r.laborRate)) + ')', c.labor], ['Materials', num(r.materials)], ['Other', num(r.other)], ['Subtotal', c.subtotal], [`Tax (${S.settings.taxRate}%)`, c.tax], ['Total due', c.total, 1]]); },
    sort: (a, b) => (b.date || '').localeCompare(a.date || '') },
  costs: { label: 'Cost sheets', one: 'Cost sheet', icon: '💲',
    fields: [{ k: 'job', l: 'Job', req: 1 }, { k: 'customerId', l: 'Customer', t: 'select', o: custOpts }, { k: 'materials', l: 'Materials ($)', t: 'number' }, { k: 'labor', l: 'Labor ($)', t: 'number', hint: 'Tip: hours × shop rate. Use the button below to fill it.' },
      { k: 'overhead', l: 'Overhead ($)', t: 'number' }, { k: 'markup', l: 'Markup (%)', t: 'number', d: 20 }, { k: 'notes', l: 'Notes', t: 'textarea' }],
    title: r => r.job, sub: r => 'Cost ' + money(costCalc(r).cost) + ' · markup ' + fmtN(num(r.markup)) + '%', right: r => money(costCalc(r).total),
    calc: r => { const c = costCalc(r); return totalsTable([['Materials', num(r.materials)], ['Labor', num(r.labor)], ['Overhead', num(r.overhead)], ['Total cost', c.cost], [`Markup (${fmtN(num(r.markup))}%)`, c.markupAmt], ['Sell price', c.sell], [`Tax (${S.settings.taxRate}%)`, c.tax], ['Total due', c.total, 1]]); } },
  inventory: { label: 'Shop inventory', one: 'Inventory item', icon: '📦',
    fields: [{ k: 'name', l: 'Item name', req: 1 }, { k: 'category', l: 'Category', t: 'text', list: ['Welding', 'Bearings', 'Steel', 'Hardware', 'Electrical', 'Consumables', 'Paint', 'Tires & wheels', 'Other'] },
      { k: 'onHand', l: 'On hand', t: 'number' }, { k: 'unit', l: 'Unit (e.g. each, lb, bottle)' }, { k: 'full', l: 'Full level', t: 'number' }, { k: 'reorderAt', l: 'Reorder point', t: 'number' }, { k: 'notes', l: 'Notes', t: 'textarea' }],
    title: r => r.name, sub: r => `${r.category || 'Uncategorized'} · on hand ${fmtN(num(r.onHand))} ${r.unit || ''} · full ${fmtN(num(r.full))} · reorder at ${fmtN(num(r.reorderAt))}`,
    badge: r => isLow(r) ? ['low', 'Low'] : ['ok', 'OK'], sort: (a, b) => (isLow(b) - isLow(a)) || a.name.localeCompare(b.name) },
  receipts: { label: 'Receipts', one: 'Receipt', icon: '🧾',
    fields: [{ k: 'vendor', l: 'Vendor', req: 1 }, { k: 'amount', l: 'Amount ($)', t: 'number' }, { k: 'date', l: 'Date', t: 'date', d: today }, { k: 'category', l: 'Category', t: 'select', o: () => opts(['Materials', 'Tools', 'Consumables', 'Fuel', 'Parts', 'Office', 'Equipment', 'Other']), d: 'Materials' }, { k: 'note', l: 'Note', t: 'textarea' }],
    title: r => r.vendor, sub: r => [fmtDate(r.date), r.category, r.note].filter(Boolean).join(' · '), right: r => money(r.amount), sort: (a, b) => (b.date || '').localeCompare(a.date || '') },
  mileage: { label: 'Mileage', one: 'Trip', icon: '🚚',
    fields: [{ k: 'date', l: 'Date', t: 'date', d: today }, { k: 'purpose', l: 'Purpose / where', req: 1 }, { k: 'odoStart', l: 'Odometer start', t: 'number' }, { k: 'odoEnd', l: 'Odometer end', t: 'number' }, { k: 'notes', l: 'Notes', t: 'textarea' }],
    title: r => r.purpose, sub: r => `${fmtDate(r.date)} · ${fmtN(num(r.odoStart))} → ${fmtN(num(r.odoEnd))}`, right: r => fmtN(miles(r)) + ' mi',
    calc: r => `<b>Miles: ${fmtN(miles(r))}</b>${num(r.odoEnd) && num(r.odoEnd) < num(r.odoStart) ? ' <span class="bad-t">— end is less than start</span>' : ''}`,
    validate: r => num(r.odoEnd) < num(r.odoStart) ? 'Odometer end must be at least the start reading.' : null, sort: (a, b) => (b.date || '').localeCompare(a.date || '') },
  leads: { label: 'Leads', one: 'Lead', icon: '🎯',
    fields: [{ k: 'name', l: 'Name', req: 1 }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'email', l: 'Email', t: 'email' }, { k: 'source', l: 'Source (website, Instagram, word of mouth…)' }, { k: 'interest', l: 'Interested in' },
      { k: 'followUp', l: 'Follow-up date', t: 'date' }, { k: 'status', l: 'Status', t: 'select', o: () => opts(['New', 'Contacted', 'Quoted', 'Won', 'Lost']), d: 'New' }, { k: 'notes', l: 'Notes', t: 'textarea' }],
    title: r => r.name, sub: r => [r.interest, r.followUp ? 'follow up ' + fmtDate(r.followUp) : ''].filter(Boolean).join(' · '), badge: r => ['accent', r.status] },
  notes: { label: 'Notes', one: 'Note', icon: '🗒️',
    fields: [{ k: 'title', l: 'Title', req: 1 }, { k: 'category', l: 'Category', t: 'select', o: () => opts(['General', 'Job', 'Supplier', 'Compliance', 'Idea']), d: 'General', hint: 'Supplier notes also show as their own cards in Operations Binder → Wholesalers.' }, { k: 'body', l: 'Note', t: 'textarea' }],
    title: r => r.title, sub: r => (r.body || '').slice(0, 80), badge: r => ['accent', r.category] },
  suppliers: { label: 'Wholesalers', one: 'Wholesaler card', icon: '🏭', back: '#/binder/1',
    fields: [{ k: 'name', l: 'Name', req: 1 }, { k: 'category', l: 'Category' }, { k: 'status', l: 'Status' }, { k: 'website', l: 'Website' }, { k: 'contact', l: 'Contact' }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'email', l: 'Email', t: 'email' }, { k: 'address', l: 'Address' }, { k: 'account', l: 'Account #' }, { k: 'terms', l: 'Terms' }, { k: 'notes', l: 'Notes', t: 'textarea' }],
    title: r => r.name, sub: r => r.category },
  materials: { label: 'Material list', one: 'Cut list', icon: '📏', title: r => r.name, sub: r => `${(r.pieces || []).length} entries · ${r.material || ''}` },
  vins: { label: 'VIN Ledger', one: 'VIN record', icon: '🔖' },
  sales: { label: 'Sale records', one: 'Sale record', icon: '🤝' }
};
const miles = r => Math.max(0, num(r.odoEnd) - num(r.odoStart));
function totalsTable(rows) { return `<table class="totals">${rows.map(([l, v, g]) => `<tr class="${g ? 'grand' : ''}"><td>${esc(l)}</td><td>${money(v)}</td></tr>`).join('')}</table>`; }

/* generic form */
function fieldHTML(f, val) {
  const name = `name="${f.k}" id="f_${f.k}"`; const req = f.req ? 'required' : '';
  let input;
  if (f.t === 'textarea') input = `<textarea ${name}>${esc(val)}</textarea>`;
  else if (f.t === 'select') input = `<select ${name}>${f.o().map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (f.t === 'check') return `<label class="check"><input type="checkbox" ${name} ${val ? 'checked' : ''}> ${esc(f.l)}</label>`;
  else {
    const type = f.t === 'number' ? 'number' : (f.t || 'text');
    input = `<input ${name} type="${type}" ${type === 'number' ? 'inputmode="decimal" step="any"' : ''} value="${esc(val)}" ${req} ${f.list ? `list="dl_${f.k}"` : ''}>` + (f.list ? `<datalist id="dl_${f.k}">${f.list.map(o => `<option value="${esc(o)}">`).join('')}</datalist>` : '');
  }
  return `<label class="f"><span>${esc(f.l)}${f.req ? ' *' : ''}</span>${input}${f.hint ? `<div class="small muted" style="margin-top:4px">${esc(f.hint)}</div>` : ''}</label>`;
}
function readForm(form, fields) {
  const o = {};
  for (const f of fields) { const el = form.querySelector(`[name="${f.k}"]`); if (!el) continue; o[f.k] = f.t === 'check' ? el.checked : f.t === 'number' ? (el.value === '' ? '' : num(el.value)) : el.value.trim(); }
  return o;
}

/* ---------- router ---------- */
const ROOT_TABS = { home: 'home', build: 'build', repair: 'repair', office: 'office', more: 'more' };
/* Which side of the shop each record type lives on (drives bottom-tab highlight + list back buttons). */
const SIDE_OF = { costs: 'build', materials: 'build', vins: 'build', sales: 'build', customers: 'repair', estimates: 'repair', leads: 'repair', notes: 'repair', inventory: 'office', receipts: 'office', mileage: 'office', suppliers: 'office' };
const binderSide = tab => (tab === '3' || tab === '4') ? 'build' : 'office';
function tabFor(p, a) {
  if (ROOT_TABS[p]) return p;
  if (p === 'list' || p === 'view' || p === 'edit') return SIDE_OF[a] || 'more';
  if (p === 'vinsheet') return 'build';
  if (p === 'print' || p === 'invoice') return 'repair';
  if (p === 'binder') return binderSide(a || '1');
  if (p === 'settings' || p === 'backup') return 'office';
  return 'home';
}
let CUR = {};
function go(h) { location.hash = h; }
function setTop(title, back, right = '') {
  $('#pageTitle').textContent = title; const b = $('#backBtn'); b.hidden = !back;
  b.onclick = () => { if (history.length > 1 && CUR.cameFromApp) history.back(); else go(back); };
  $('#topRight').innerHTML = right;
}
let navCount = 0;
async function route() {
  navCount++; CUR = { cameFromApp: navCount > 1 };
  closeModal();
  const h = location.hash.replace(/^#\/?/, '') || 'home';
  const [p, a, b] = h.split('/');
  const tabKey = tabFor(p, a);
  $$('#bottomnav a').forEach(x => x.classList.toggle('on', x.dataset.tab === tabKey));
  const app = $('#app'); window.scrollTo(0, 0);
  try {
    let html;
    if (p === 'home') html = pageHome();
    else if (p === 'more') html = pageMore();
    else if (p === 'build' || p === 'repair' || p === 'office') html = pageSide(p);
    else if (p === 'list') html = a === 'vins' ? pageLedger() : a === 'sales' ? pageSales() : pageList(a);
    else if (p === 'view') html = a === 'vins' ? pageVinView(b) : a === 'sales' ? pageSaleView(b) : pageView(a, b);
    else if (p === 'edit') html = a === 'vins' ? pageVinEdit(b) : a === 'sales' ? pageSaleEdit(b) : a === 'materials' ? pageMatEdit(b) : pageEdit(a, b);
    else if (p === 'binder') html = pageBinder(a || '1', b);
    else if (p === 'settings') html = pageSettings();
    else if (p === 'backup') html = pageBackup();
    else if (p === 'print') html = pagePrint(a);
    else if (p === 'invoice') html = await pageInvoice(a);
    else if (p === 'vinsheet') html = pageVinSheet(a);
    else html = pageHome();
    app.innerHTML = html;
    if (CUR.after) CUR.after();
    hydratePhotos();
  } catch (e) { console.error(e); app.innerHTML = `<div class="alert bad">Something went wrong: ${esc(e.message)}</div><a class="btn" href="#/home">Home</a>`; }
}
window.addEventListener('hashchange', route);

/* ---------- the three sides of the shop ---------- */
const SIDES = {
  build: { icon: '🏗️', title: 'Trailer Building', nav: 'Building', blurb: 'Building trailers: costs, cut lists, VINs, sales and paperwork', items: () => [
    ['#/list/costs', '💲', 'Cost sheets', 'Materials + labor + overhead + markup', S.costs.length],
    ['#/binder/3', '🧮', 'Cost Worksheets', `Pricing worksheets for the ${TH.MODELS.length} trailer models`, TH.MODELS.length],
    ['#/list/materials', '📏', 'Material list', 'Cut lists with 20/40 ft nesting', S.materials.length],
    ['#/list/vins', '🔖', 'VIN Ledger', 'Every trailer VIN, in serial order', S.vins.length],
    ['#/edit/vins/new', '＋', 'New VIN', `Next serial ${pad3(S.settings.nextSerial)}, only when a trailer is built`, ''],
    ['#/list/sales', '🤝', 'Sale records', 'Buyer, MCO, bill of sale, history', S.sales.length],
    ['#/binder/4', '⚖️', 'VIN & Compliance rules', 'VIN scheme, check-digit checker, labels and rules', '']] },
  repair: { icon: '🔧', title: 'Repair & Fab Jobs', nav: 'Repair', blurb: 'Daily repair and fab work: customers, estimates, quotes, invoices, leads and notes', items: () => [
    ['#/list/customers', '👤', 'Customers', 'Customer cards and their estimates', S.customers.length],
    ['#/list/estimates', '📝', 'Estimates', 'Jobs, printable quotes and invoices', S.estimates.length],
    ['#/list/leads', '🎯', 'Leads', 'Follow-ups', S.leads.length],
    ['#/list/notes', '🗒️', 'Notes', 'General shop notes', S.notes.length]] },
  office: { icon: '📒', title: 'Shop Office', nav: 'Office', blurb: 'Back office: wholesalers, stock, receipts, mileage, shop rate, settings and backup', items: () => [
    ['#/binder/1', '🏭', 'Wholesalers', 'Where to buy parts and steel', S.suppliers.length],
    ['#/list/inventory', '📦', 'Shop inventory', 'Stock, reorder points, bearings', S.inventory.length],
    ['#/list/receipts', '🧾', 'Receipts', 'Expenses with photos', S.receipts.length],
    ['#/list/mileage', '🚚', 'Mileage', 'Odometer trips', S.mileage.length],
    ['#/binder/2', '⏱️', 'Shop Rate', 'Labor rate and the honest math', ''],
    ['#/binder/5', '📇', 'Quick Reference', 'Business IDs, website QR codes', ''],
    ['#/binder/1', '📒', 'Operations Binder', 'All five tabs: wholesalers, shop rate, worksheets, VIN & compliance, quick reference', ''],
    ['#/settings', '⚙️', 'Settings & branding', 'Shop name, phone, color, logo', ''],
    ['#/backup', '💾', 'Backup & restore', 'Export JSON + CSVs, restore', '']] }
};
const menuHTML = items => `<div class="list menu">${items.map(([h, i, t, s, c]) => `<a class="item" href="${h}"><span class="ic">${i}</span><div class="grow"><div class="t">${t}</div><div class="s">${s}</div></div>${c !== '' && c != null ? `<span class="right">${c}</span>` : ''}<span class="chev">›</span></a>`).join('')}</div>`;
function ledgerCardHTML() {
  const st = S.settings;
  const v = S.vins; const cnt = k => v.filter(x => x.status === k).length;
  const recent = [...v].sort((a, b) => b.serial - a.serial).slice(0, 3);
  return `
  <div class="card" id="ledgerCard" style="border:2px solid var(--accent)">
    <div class="row"><div><div style="font-weight:800;font-size:18px">🔖 VIN Ledger</div><div class="small muted">One record per trailer, strict serial order</div></div>
      <div style="flex:none;text-align:right"><div class="small muted">Next serial</div><div style="font-size:24px;font-weight:800;color:var(--accent-d)">${pad3(st.nextSerial)}</div></div></div>
    <div class="row small" style="margin:10px 0;gap:6px;flex-wrap:wrap">${Object.entries(STATUS).map(([k, l]) => `<span class="badge ${k === 'void' ? 'low' : 'accent'}">${l} ${cnt(k)}</span>`).join('')}</div>
    ${recent.length ? `<div class="list">${recent.map(vinItem).join('')}</div>` : `<div class="small muted">No VINs yet. The first trailer gets serial 001.</div>`}
    <div class="btns"><a class="btn" href="#/edit/vins/new">＋ New VIN</a><a class="btn sec" href="#/list/vins">Open ledger</a></div>
    ${offerAllowed() ? '' : `<div class="small muted">First legal offering for sale: on/after Dec 19, 2026. Offered/sold are locked until then.</div>`}
  </div>
`;
}
function pageSide(key) {
  const sd = SIDES[key]; setTop(sd.title, null);
  return `<p class="muted" style="margin:4px 4px 8px">${esc(sd.blurb)}</p>${key === 'build' ? ledgerCardHTML() : ''}${menuHTML(sd.items())}`;
}

/* ---------- Home ---------- */
function pageHome() {
  setTop(S.settings.shopName || 'Third Hand', null, `<button class="icon-btn" onclick="go('#/settings')" aria-label="Settings">⚙︎</button>`);
  const st = S.settings; const low = S.inventory.filter(isLow);
  const backupDays = st.lastBackup ? Math.floor((Date.now() - new Date(st.lastBackup)) / 864e5) : null;
  const openEst = S.estimates.filter(e => e.status !== 'approved').length;
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const facts = {
    build: `Next VIN serial <b>${pad3(st.nextSerial)}</b> · ${S.vins.length} in VIN Ledger · ${pl(S.costs.length, 'cost sheet')} · ${pl(S.sales.length, 'sale')}`,
    repair: `<b>${openEst}</b> open ${openEst === 1 ? 'estimate' : 'estimates'} · ${pl(S.customers.length, 'customer')} · ${pl(S.leads.length, 'lead')}`,
    office: `${low.length ? `<b>${low.length}</b> low-stock ${low.length === 1 ? 'item' : 'items'}` : 'Stock OK'} · ${pl(S.receipts.length, 'receipt')} · ${pl(S.suppliers.length, 'wholesaler')}`
  };
  return `
  <div class="hero">${logoHTML()}<div><div class="name">${esc(st.shopName)}</div><div class="muted small">${esc(st.tagline || '')}</div><div class="small">${esc(fmtPhone(st.phone))} · ${esc(st.email)}</div></div></div>
  ${low.length ? `<a class="alert bad" style="display:block;text-decoration:none;color:inherit" href="#/list/inventory">⚠️ <b>Low stock:</b> ${low.map(i => esc(i.name)).join(', ')}</a>` : ''}
  ${backupDays === null || backupDays >= 7 ? `<a class="alert warn" style="display:block;text-decoration:none;color:inherit" href="#/backup">💾 ${backupDays === null ? 'No backup made on this phone yet.' : `Last backup ${backupDays} days ago.`} Tap to back up.</a>` : ''}
  ${Object.entries(SIDES).map(([k, sd]) => `<a class="card" id="side-${k}" href="#/${k}" style="display:block;text-decoration:none;color:inherit;border:2px solid var(--accent)">
    <div class="row"><span style="flex:none;font-size:34px">${sd.icon}</span><div><div style="font-weight:800;font-size:18px">${sd.title}</div><div class="small muted">${esc(sd.blurb)}</div><div class="small" style="margin-top:6px">${facts[k]}</div></div><span class="chev" style="flex:none;color:#a6b2b7;font-size:22px">›</span></div></a>`).join('')}
  <p class="small muted center" style="margin-top:20px">Third Hand Fab &amp; Welding · test build · data stays on this phone</p>`;
}
function pageMore() {
  setTop('More', null);
  return Object.entries(SIDES).map(([k, sd]) => `<h2><a href="#/${k}" style="color:inherit;text-decoration:none">${sd.icon} ${sd.title}</a></h2>${menuHTML(sd.items())}`).join('');
}

/* ---------- generic list / view / edit ---------- */
function itemHTML(coll, r) {
  const c = COLL[coll]; const b = c.badge ? c.badge(r) : null;
  return `<a class="item" href="#/view/${coll}/${r.id}"><div class="grow"><div class="t">${esc(c.title(r))}</div>${c.sub ? `<div class="s">${esc(c.sub(r))}</div>` : ''}</div>${b ? `<span class="badge ${b[0]}">${esc(b[1])}</span>` : ''}${c.right ? `<span class="right">${esc(c.right(r))}</span>` : ''}<span class="chev">›</span></a>`;
}
function pageList(coll) {
  const c = COLL[coll]; if (!c) return pageHome();
  setTop(c.label, '#/' + (SIDE_OF[coll] || 'more'));
  let recs = [...S[coll]]; if (c.sort) recs.sort(c.sort);
  let head = '';
  if (coll === 'estimates') head = `<div class="seg" id="estSeg">${['all', 'draft', 'sent', 'approved'].map(s => `<button data-s="${s}" class="${s === 'all' ? 'on' : ''}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}</div>`;
  if (coll === 'receipts') head = `<div class="card tight row"><div>Total filed</div><div style="text-align:right;font-weight:800">${money(S.receipts.reduce((a, r) => a + num(r.amount), 0))}</div></div>`;
  if (coll === 'mileage') head = `<div class="card tight row"><div>Total business miles</div><div style="text-align:right;font-weight:800">${fmtN(S.mileage.reduce((a, r) => a + miles(r), 0))}</div></div>`;
  if (coll === 'inventory') head = inventoryHead();
  CUR.after = () => {
    const box = $('#q'), seg = $('#estSeg'); let status = 'all';
    const draw = () => { const q = (box.value || '').toLowerCase(); $('#listBox').innerHTML = recs.filter(r => (status === 'all' || r.status === status) && JSON.stringify(r).toLowerCase().includes(q)).map(r => itemHTML(coll, r)).join('') || `<div class="card muted center">Nothing here yet. Tap ＋ to add one.</div>`; };
    box.oninput = draw; if (seg) seg.onclick = e => { const bt = e.target.closest('button'); if (!bt) return; status = bt.dataset.s; $$('#estSeg button').forEach(x => x.classList.toggle('on', x === bt)); draw(); };
    draw();
  };
  return `${head}<input id="q" class="search" type="search" placeholder="Search ${c.label.toLowerCase()}…"><div class="list" id="listBox"></div><a class="fab" href="#/edit/${coll}/new" aria-label="Add">＋</a>`;
}
function pageView(coll, id) {
  const c = COLL[coll]; const r = S[coll].find(x => x.id === id); if (!r) { setTop(c.label, '#/list/' + coll); return `<div class="card">Record not found.</div>`; }
  setTop(c.one, c.back || '#/list/' + coll, `<button class="icon-btn" onclick="go('#/edit/${coll}/${id}')">Edit</button>`);
  const fields = c.fields || [];
  const kv = fields.filter(f => r[f.k] !== '' && r[f.k] != null).map(f => {
    let v = r[f.k];
    if (f.t === 'select') v = (f.o().find(o => String(o[0]) === String(v)) || [, v])[1];
    if (f.t === 'date') v = fmtDate(v);
    if (f.k === 'phone') v = `<a href="tel:${esc(String(r.phone).replace(/[^\d+]/g, ''))}">${esc(fmtPhone(r.phone))}</a>`;
    else if (f.k === 'email') v = `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`;
    else if (f.k === 'amount' || (coll !== 'inventory' && f.t === 'number' && /\(\$\)/.test(f.l))) v = money(v);
    else v = `<span class="pre">${esc(v)}</span>`;
    return `<dt>${esc(f.l.replace(/ \(.*\)/, ''))}</dt><dd>${v}</dd>`;
  }).join('');
  let extra = '';
  if (c.calc) extra += `<div class="card">${c.calc(r)}</div>`;
  if (coll === 'estimates') extra += photoBlock(r, 'estimates', true) + `<div class="btns"><a class="btn" href="#/print/${r.id}">🖨️ Printable quote</a><a class="btn" href="#/invoice/${r.id}">🧾 Printable invoice${r.invoiceNo ? ' · ' + esc(r.invoiceNo) : ''}</a></div>`;
  if (coll === 'receipts') extra += photoBlock(r, 'receipts', false);
  if (coll === 'inventory') extra += inventoryExtra(r);
  if (coll === 'customers') { const es = S.estimates.filter(e => e.customerId === r.id); extra += `<h2>Estimates</h2><div class="list">${es.map(e => itemHTML('estimates', e)).join('') || '<div class="muted small">None yet.</div>'}</div><div class="btns"><a class="btn sec" href="#/edit/estimates/new?c=${r.id}">＋ New estimate for ${esc(r.name)}</a></div>`; }
  if (coll === 'leads') extra += `<div class="btns"><button class="btn sec" id="toCust">Convert to customer</button></div>`;
  if (coll === 'materials') extra += matView(r);
  CUR.after = () => {
    bindPhotoBlock(r, coll);
    const tc = $('#toCust'); if (tc) tc.onclick = async () => { const cu = { id: uid('c'), name: r.name, phone: r.phone, email: r.email, address: '', notes: r.notes || '', created: today() }; S.customers.push(cu); r.status = 'Won'; await save(); toast('Customer created'); go('#/view/customers/' + cu.id); };
    if (coll === 'inventory') bindInventory(r);
    $('#delBtn').onclick = async () => { if (await confirmBox(`Delete this ${c.one.toLowerCase()}? This can't be undone.`)) { await deleteRecord(coll, r); toast('Deleted'); go(c.back || '#/list/' + coll); } };
  };
  return `${kv ? `<div class="card"><dl class="kv">${kv}</dl></div>` : ''}${extra}<div class="btns"><a class="btn sec" href="#/edit/${coll}/${id}">✏️ Edit</a><button class="btn danger" id="delBtn">🗑 Delete</button></div>`;
}
async function deleteRecord(coll, r) {
  for (const pid of [...(r.photos || []), r.photo, r.tagPhoto].filter(Boolean)) await delPhoto(pid);
  S[coll] = S[coll].filter(x => x !== r); await save();
}
function pageEdit(coll, id) {
  const c = COLL[coll]; const isNew = id.startsWith('new');
  const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const r = isNew ? {} : S[coll].find(x => x.id === id); if (!r) return `<div class="card">Record not found.</div>`;
  setTop((isNew ? 'New ' : 'Edit ') + c.one.toLowerCase(), isNew ? (c.back || '#/list/' + coll) : `#/view/${coll}/${id}`);
  const val = f => isNew ? (f.k === 'customerId' && qs.get('c') ? qs.get('c') : typeof f.d === 'function' ? f.d() : (f.d ?? '')) : r[f.k];
  let pre = '';
  if (coll === 'inventory') pre = `<label class="f"><span>Stock pull-down</span><select id="pull"><option value="">— pick to fill name &amp; category —</option><optgroup label="Trailer bearings">${TH.BEARINGS.map(b => `<option value="${esc(b.num)}">${esc(b.label)} — ${esc(b.use)}</option>`).join('')}</optgroup></select><div class="small muted" style="margin-top:4px">Picking one fills in the name and the Bearings category — then enter how many you have on hand.</div></label>`;
  const calcBox = c.calc ? `<div class="calc" id="calcBox"></div>` : '';
  const extraBtn = coll === 'costs' ? `<button type="button" class="btn sec sm" id="laborHelp" style="margin-top:8px">Fill labor from hours × $${esc(S.settings.laborRate)}/hr</button>` : '';
  CUR.after = () => {
    const form = $('#editForm');
    const upd = () => { if (c.calc) $('#calcBox').innerHTML = c.calc(readForm(form, c.fields)); };
    form.oninput = upd; upd();
    const pull = $('#pull'); if (pull) pull.onchange = () => { const b = TH.BEARINGS.find(x => x.num === pull.value); if (!b) return; form.name.value = b.label; form.category.value = 'Bearings'; form.dataset.bearing = b.num; if (!form.unit.value) form.unit.value = 'each'; form.onHand.focus(); };
    const lh = $('#laborHelp'); if (lh) lh.onclick = async () => { const h = await promptBox('Labor hours?', { type: 'number', label: 'Fill' }); if (h !== null) { form.labor.value = r2(num(h) * num(S.settings.laborRate)); upd(); } };
    form.onsubmit = async e => {
      e.preventDefault(); const o = readForm(form, c.fields);
      const miss = c.fields.find(f => f.req && !o[f.k]); if (miss) return toast(miss.l + ' is required');
      const err = c.validate && c.validate(o); if (err) return toast(err);
      if (form.dataset.bearing) o.bearing = form.dataset.bearing;
      let rec;
      if (isNew) { rec = { id: uid(coll[0]), created: today(), ...o }; if (coll === 'estimates') { rec.photos = []; } if (coll === 'inventory') rec.usage = []; S[coll].push(rec); }
      else { rec = Object.assign(r, o); }
      await save(); toast('Saved'); location.replace(`#/view/${coll}/${rec.id}`);
    };
  };
  return `<form id="editForm" class="card" novalidate>${pre}${c.fields.map(f => fieldHTML(f, val(f))).join('')}${extraBtn}${calcBox}<div class="btns"><button type="button" class="btn sec" onclick="history.back()">Cancel</button><button class="btn" type="submit">Save</button></div></form>`;
}

/* ---------- photos (estimates: many; receipts: one) ---------- */
function photoBlock(r, coll, multi) {
  const ids = multi ? (r.photos || []) : (r.photo ? [r.photo] : []);
  const ph = multi ? (r.placeholderPhotos || 0) : (r.placeholderPhoto && !r.photo ? 1 : 0);
  return `<div class="card"><div class="row"><b>${multi ? 'Job photos' : 'Receipt photo'}</b><span class="small muted" style="text-align:right">${ids.length + ph} ${multi ? 'photo(s)' : ''}</span></div>
  <div class="photos">${ids.map(id => `<div class="ph" data-view="${id}"><img data-pid="${id}" alt="photo"><button class="x" data-rm="${id}" aria-label="Remove photo">✕</button></div>`).join('')}
  ${Array.from({ length: ph }, (_, i) => `<div class="ph placeholder" data-ph="${i}">Original photo is in the old app — not transferred<button class="x" data-rmph="${i}" aria-label="Remove placeholder">✕</button></div>`).join('')}
  ${multi || !ids.length ? `<div class="ph add" id="addPh" role="button" aria-label="Add photo">＋</div>` : ''}</div>
  ${!multi && ids.length ? `<div class="btns"><button class="btn sec sm" id="fullPh">🔍 Full view + zoom</button><button class="btn sec sm" id="repPh">Replace photo</button></div>` : ''}
  <div class="small muted" style="margin-top:6px">Tap a photo for full view and zoom.</div></div>`;
}
function bindPhotoBlock(r, coll) {
  const add = $('#addPh'); const multi = coll === 'estimates';
  const doAdd = async () => {
    const imgs = await pickImage(multi); if (!imgs.length) return;
    if (multi) { for (const d of imgs) r.photos.push(await putPhoto(d)); }
    else { if (r.photo) await delPhoto(r.photo); r.photo = await putPhoto(imgs[0]); r.placeholderPhoto = false; }
    await save(); toast('Photo added'); route();
  };
  if (add) add.onclick = doAdd; const rep = $('#repPh'); if (rep) rep.onclick = doAdd;
  const full = $('#fullPh'); if (full) full.onclick = () => viewPhoto(r.photo);
  $$('[data-view]').forEach(el => el.onclick = e => { if (!e.target.closest('.x')) viewPhoto(el.dataset.view); });
  $$('[data-rm]').forEach(el => el.onclick = async e => { e.stopPropagation(); if (!await confirmBox('Remove this photo?', 'Remove')) return; const id = el.dataset.rm; if (multi) r.photos = r.photos.filter(x => x !== id); else r.photo = null; await delPhoto(id); await save(); route(); });
  $$('[data-rmph]').forEach(el => el.onclick = async e => { e.stopPropagation(); if (!await confirmBox('Remove this placeholder?', 'Remove')) return; if (multi) r.placeholderPhotos = Math.max(0, (r.placeholderPhotos || 0) - 1); else r.placeholderPhoto = false; await save(); route(); });
  $$('.ph.placeholder').forEach(el => el.onclick = e => { if (!e.target.closest('.x')) toast('This photo lives in the old test app. Re-add it here with ＋.'); });
}

/* ---------- printable quote ---------- */
function pagePrint(id) {
  const e = S.estimates.find(x => x.id === id); if (!e) return '<div class="card">Estimate not found.</div>';
  setTop('Quote', '#/view/estimates/' + id); const c = estCalc(e); const cu = S.customers.find(x => x.id === e.customerId) || {}; const st = S.settings;
  CUR.after = () => { $('#doPrint').onclick = () => window.print(); };
  return `<div class="btns noprint"><button class="btn" id="doPrint">🖨️ Print / Save as PDF</button></div>
  <div class="quote" id="printArea">
    <div class="qh">${logoHTML('Large')}<div><div style="font-size:22px;font-weight:800">${esc(st.shopName)}</div><div style="font-style:italic">${esc(st.tagline)}</div><div class="small">${esc(st.address)}<br>${esc(fmtPhone(st.phone))} · ${esc(st.email)}${st.website ? ' · ' + esc(st.website) : ''}</div></div></div>
    <div class="row" style="align-items:flex-start"><div><h4>Quote for</h4><b>${esc(cu.name || '—')}</b><div class="small">${esc(fmtPhone(cu.phone))}${cu.email ? '<br>' + esc(cu.email) : ''}${cu.address ? '<br>' + esc(cu.address) : ''}</div></div>
      <div style="text-align:right"><h4>Quote</h4><div class="small">${esc(e.title)}<br>Date: ${esc(fmtDate(e.date))}<br>Status: ${esc(e.status)}</div></div></div>
    <h4>Job details</h4><div class="pre">${esc(e.details)}</div>
    <h4>Pricing</h4>${totalsTable([[`Labor — ${fmtN(num(e.laborHours))} hrs × ${money(num(e.laborRate))}/hr`, c.labor], ['Materials', num(e.materials)], ['Other', num(e.other)], ['Subtotal', c.subtotal], [`Sales tax (${st.taxRate}%)`, c.tax], ['Total due', c.total, 1]])}
    ${(e.photos || []).length ? `<h4>Photos</h4><div class="photos">${e.photos.map(p => `<div class="ph"><img data-pid="${p}" alt=""></div>`).join('')}</div>` : ''}
    <div class="sig"><div>Customer approval</div><div>Date</div></div>
    <p class="small muted" style="margin-top:14px">Thank you for your business — ${esc(st.shopName)}.</p>
  </div>`;
}

/* ---------- printable invoice (built from an estimate) ---------- */
async function pageInvoice(id) {
  const e = S.estimates.find(x => x.id === id); if (!e) return '<div class="card">Estimate not found.</div>';
  setTop('Invoice', '#/view/estimates/' + id); const st = S.settings;
  if (!e.invoiceNo) { // first invoice for this estimate: take the next number, never reused
    const n = S.settings.nextInvoice || 1; e.invoiceSeq = n; e.invoiceNo = invNo(n); e.invoiceDate = today();
    if (e.invoiceTerms == null) e.invoiceTerms = st.invoiceTerms || 'Due on receipt';
    S.settings.nextInvoice = n + 1; await save();
  }
  const cu = S.customers.find(x => x.id === e.customerId) || {};
  const body = () => {
    const c = estCalc(e); const paid = r2(num(e.invoicePaid)); const bal = r2(c.total - paid);
    return `<div class="qh">${logoHTML('Large')}<div><div style="font-size:22px;font-weight:800">${esc(st.shopName)}</div><div style="font-style:italic">${esc(st.tagline)}</div><div class="small">${esc(st.address)}<br>${esc(fmtPhone(st.phone))} · ${esc(st.email)}${st.website ? ' · ' + esc(st.website) : ''}</div></div></div>
    <div class="row" style="align-items:flex-start"><div><h4>Bill to</h4><b>${esc(cu.name || '—')}</b><div class="small">${esc(fmtPhone(cu.phone))}${cu.email ? '<br>' + esc(cu.email) : ''}${cu.address ? '<br>' + esc(cu.address) : ''}</div></div>
      <div style="text-align:right"><div style="font-size:22px;font-weight:800;letter-spacing:.08em">INVOICE</div><div class="small"><b>${esc(e.invoiceNo)}</b><br>Invoice date: ${esc(fmtDate(e.invoiceDate))}<br>Terms: ${esc(e.invoiceTerms || 'Due on receipt')}<br>Job: ${esc(e.title)}</div></div></div>
    <h4>Job details</h4><div class="pre">${esc(e.details)}</div>
    <h4>Charges</h4>${totalsTable([[`Labor — ${fmtN(num(e.laborHours))} hrs × ${money(num(e.laborRate))}/hr`, c.labor], ['Materials', num(e.materials)], ['Other', num(e.other)], ['Subtotal', c.subtotal], [`Sales tax (${st.taxRate}%)`, c.tax], ['Total', c.total], ['Amount paid / deposit', -paid], ['Balance due', bal, 1]])}
    ${st.payMethods ? `<p class="small" style="margin-top:10px"><b>Payment methods:</b> ${esc(st.payMethods)}</p>` : ''}
    <p style="margin-top:14px;font-weight:700">Thank you for your business — ${esc(st.shopName)}.</p>`;
  };
  CUR.after = () => {
    $('#doPrint').onclick = () => window.print();
    const f = $('#invForm');
    f.oninput = async () => { e.invoiceDate = f.invoiceDate.value || e.invoiceDate; e.invoiceTerms = f.invoiceTerms.value; e.invoicePaid = f.invoicePaid.value; $('#printArea').innerHTML = body(); hydratePhotos(); await save(); };
  };
  return `<div class="btns noprint"><button class="btn" id="doPrint">🖨️ Print / Save as PDF</button></div>
  <div class="small muted noprint" style="margin:-4px 2px 10px">Pick any printer your phone can see (Wi-Fi, Wi-Fi Direct or Bluetooth portable printer), or Save as PDF to text or email it.</div>
  <form id="invForm" class="card noprint" novalidate onsubmit="return false">
    <div class="row"><label class="f"><span>Invoice date</span><input name="invoiceDate" type="date" value="${esc(e.invoiceDate)}"></label><label class="f"><span>Amount paid / deposit ($)</span><input name="invoicePaid" type="number" inputmode="decimal" step="0.01" value="${esc(e.invoicePaid ?? '')}" placeholder="0.00"></label></div>
    <label class="f"><span>Due date or terms</span><input name="invoiceTerms" value="${esc(e.invoiceTerms ?? '')}" placeholder="Due on receipt"></label>
    <div class="small muted">${esc(e.invoiceNo)} stays with this estimate. Numbers go in order and are never reused.</div>
  </form>
  <div class="quote" id="printArea">${body()}</div>`;
}

/* ---------- inventory ---------- */
function inventoryHead() {
  const low = S.inventory.filter(isLow); const ks = kitStatus();
  return `${low.length ? `<div class="alert bad">⚠️ <b>${low.length} item(s) at or below reorder point:</b> ${low.map(i => esc(i.name)).join(', ')}</div>` : `<div class="alert info">All items above their reorder points.</div>`}
  <details class="card"><summary style="font-weight:700;cursor:pointer;min-height:32px">🛞 Wheel-kit stock targets <span class="small muted">(app only)</span></summary>
  <table class="grid" style="margin-top:8px"><tr><th>Axle</th><th>Kit = inner / outer / seal</th><th>Kits on hand</th><th>Target</th></tr>
  ${ks.map(k => `<tr><td>${k.axle}${k.note ? `<div class="small muted">${k.note}</div>` : ''}</td><td class="small">${k.inner} (${fmtN(k.q.inner)}) / ${k.outer} (${fmtN(k.q.outer)}) / ${k.seal} (${fmtN(k.q.seal)})</td><td class="${k.kits >= k.target ? 'ok-t' : 'bad-t'}">${k.kits}</td><td>${k.target}</td></tr>`).join('')}</table>
  <div class="small muted" style="margin-top:6px">Counts come from Bearings items added with the stock pull-down. 25580 and 10-36 are shared by the 5,200 / 6,000 / 7,000-lb kits, so each row shows what's possible if all shared stock went to that axle.</div></details>`;
}
function inventoryExtra(r) {
  const pct = num(r.full) ? Math.min(100, Math.round(num(r.onHand) / num(r.full) * 100)) : 0;
  return `<div class="card"><div class="row"><div><div class="small muted">On hand</div><div style="font-size:28px;font-weight:800">${fmtN(num(r.onHand))} <span class="small">${esc(r.unit || '')}</span></div></div>
    <div style="text-align:right">${isLow(r) ? '<span class="badge low">Low — reorder</span>' : '<span class="badge ok">OK</span>'}<div class="small muted" style="margin-top:6px">Full ${fmtN(num(r.full))} · reorder at ${fmtN(num(r.reorderAt))}</div></div></div>
    <div style="height:10px;background:#e7ecee;border-radius:5px;margin-top:10px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${isLow(r) ? 'var(--red)' : 'var(--accent)'}"></div></div>
    <div class="btns"><button class="btn" id="useInv">➖ Use inventory</button><button class="btn sec" id="addInv">➕ Restock</button></div></div>
    ${(r.usage || []).length ? `<div class="card"><b>History</b>${[...r.usage].reverse().map(u => `<div class="hist">${esc(u.when)} — ${u.qty < 0 ? 'used ' + fmtN(-u.qty) : 'added ' + fmtN(u.qty)} ${esc(r.unit || '')}${u.job ? ' · ' + esc(u.job) : ''}</div>`).join('')}</div>` : ''}`;
}
function bindInventory(r) {
  $('#useInv').onclick = () => {
    sheet(`<h3 style="margin-top:0">Use inventory — ${esc(r.name)}</h3><label class="f"><span>Amount used</span><input id="uQty" type="number" step="any" inputmode="decimal"></label><label class="f"><span>Job (optional)</span><input id="uJob" list="uJobs"><datalist id="uJobs">${S.estimates.map(e => `<option value="${esc(e.title)}">`).join('')}</datalist></label><div class="btns"><button class="btn sec" onclick="closeModal()">Cancel</button><button class="btn" id="uOk">Record use</button></div>`);
    $('#uOk').onclick = async () => { const q = num($('#uQty').value); if (q <= 0) return toast('Enter how much you used'); r.onHand = r2(num(r.onHand) - q); if (r.onHand < 0) r.onHand = 0; (r.usage = r.usage || []).push({ when: nowStamp(), qty: -q, job: $('#uJob').value.trim() }); await save(); closeModal(); toast(isLow(r) ? `Recorded — ${r.name} is now LOW` : 'Recorded'); route(); };
  };
  $('#addInv').onclick = async () => { const q = await promptBox(`Add how many ${r.unit || ''}? (full level is ${fmtN(num(r.full))})`, { type: 'number', label: 'Add', value: Math.max(0, r2(num(r.full) - num(r.onHand))) || '' }); if (q === null || num(q) <= 0) return; r.onHand = r2(num(r.onHand) + num(q)); (r.usage = r.usage || []).push({ when: nowStamp(), qty: num(q), job: 'Restock' }); await save(); toast('Restocked'); route(); };
}

/* ---------- material list ---------- */
const MODE_L = { '20': "20' stock", '40': "40' stock", exact: 'Exact fit' };
function pageMatEdit(id) {
  const isNew = id === 'new'; const r = isNew ? { name: '', material: '', kerf: 0.125, notes: '', pieces: [{ label: '', length: '', qty: 1, mode: '20' }] } : S.materials.find(x => x.id === id);
  if (!r) return '<div class="card">Not found.</div>';
  setTop(isNew ? 'New cut list' : 'Edit cut list', isNew ? '#/list/materials' : '#/view/materials/' + id);
  const rows = structuredClone(r.pieces || []);
  CUR.after = () => {
    const drawRows = () => {
      $('#rows').innerHTML = rows.map((p, i) => `<div class="card tight" data-i="${i}" style="background:#fafcfc"><div class="row"><label class="f" style="margin:0"><span>Piece label</span><input data-k="label" value="${esc(p.label)}" placeholder="e.g. Side rail"></label><button type="button" class="btn danger sm" data-del="${i}" style="flex:none;margin-top:20px" aria-label="Remove entry">✕</button></div>
      <div class="row"><label class="f"><span>Length</span><input data-k="length" value="${esc(p.length)}" placeholder="e.g. 6' 3-1/2&quot; or 75.5"></label><label class="f" style="flex:.6"><span>Qty</span><input data-k="qty" type="number" inputmode="numeric" value="${esc(p.qty)}"></label></div>
      <label class="f"><span>Stock mode</span><select data-k="mode">${Object.entries(MODE_L).map(([k, l]) => `<option value="${k}" ${p.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <div class="small muted" data-len="${i}">${parseLen(p.length) ? '= ' + fmtLen(parseLen(p.length)) + ' (' + fmtN(r2(parseLen(p.length))) + ' in)' : ''}</div></div>`).join('');
    };
    drawRows();
    $('#rows').oninput = e => { const c = e.target.closest('[data-i]'); if (!c) return; const i = +c.dataset.i; const k = e.target.dataset.k; if (k) rows[i][k] = e.target.value; if (k === 'length') { const L = parseLen(e.target.value); c.querySelector('[data-len]').textContent = L ? '= ' + fmtLen(L) + ' (' + fmtN(r2(L)) + ' in)' : ''; } };
    $('#rows').onclick = e => { const d = e.target.closest('[data-del]'); if (d) { rows.splice(+d.dataset.del, 1); drawRows(); } };
    $('#addRow').onclick = () => { const last = rows[rows.length - 1]; rows.push({ label: '', length: '', qty: 1, mode: last ? last.mode : '20' }); drawRows(); };
    $('#matForm').onsubmit = async e => {
      e.preventDefault(); const f = e.target; if (!f.name.value.trim()) return toast('Name is required');
      const o = { name: f.name.value.trim(), material: f.material.value.trim(), kerf: num(f.kerf.value), notes: f.notes.value.trim(), pieces: rows.filter(p => p.length || p.label).map(p => ({ ...p, qty: num(p.qty) || 1 })) };
      let rec; if (isNew) { rec = { id: uid('m'), created: today(), ...o }; S.materials.push(rec); } else rec = Object.assign(r, o);
      await save(); toast('Saved'); location.replace('#/view/materials/' + rec.id);
    };
  };
  return `<form id="matForm" class="card" novalidate><label class="f"><span>List name *</span><input name="name" value="${esc(r.name)}" placeholder="e.g. 14' utility frame"></label>
  <label class="f"><span>Material / profile</span><input name="material" value="${esc(r.material)}" placeholder="e.g. 2x3 rect tube 3/16"></label>
  <label class="f"><span>Saw kerf (inches per cut)</span><input name="kerf" type="number" step="any" inputmode="decimal" value="${esc(r.kerf)}"></label>
  <h3>Entries</h3><div id="rows"></div><button type="button" class="btn sec block" id="addRow">＋ Add entry</button>
  <label class="f"><span>Notes</span><textarea name="notes">${esc(r.notes)}</textarea></label>
  <div class="btns"><button type="button" class="btn sec" onclick="history.back()">Cancel</button><button class="btn" type="submit">Save</button></div></form>`;
}
function matView(r) {
  const plan = cutPlan(r);
  const entries = `<div class="card"><b>Entries</b><table class="grid"><tr><th>Piece</th><th>Length</th><th>Qty</th><th>Stock</th></tr>${(r.pieces || []).map(p => `<tr><td>${esc(p.label || '—')}</td><td>${esc(fmtLen(parseLen(p.length)))}</td><td>${esc(p.qty)}</td><td>${MODE_L[p.mode] || p.mode}</td></tr>`).join('')}</table><div class="small muted" style="margin-top:6px">Kerf ${esc(r.kerf)}" per cut${r.material ? ' · ' + esc(r.material) : ''}</div></div>`;
  const plans = plan.map(g => {
    if (g.mode === 'exact') return `<div class="card"><b>${g.label}</b><div>${g.pieces.length} pieces · total ${fmtLen(g.total)} (${fmtN(r2(g.total / 12))} ft)</div></div>`;
    return `<div class="card"><div class="row"><b>${g.label}</b><span style="text-align:right;font-weight:800">${g.sticks.length} stick(s)</span></div>
      <div class="small muted">Used ${fmtN(r2(g.used / 12))} ft · drop/waste ${fmtN(r2(g.waste / 12))} ft (${g.sticks.length ? Math.round(g.waste / (g.sticks.length * g.stock) * 100) : 0}%)</div>
      ${g.sticks.map((s, i) => `<div class="stick"><div class="small"><b>Stick ${i + 1}</b> — ${s.cuts.map(c => esc(c.label) + ' ' + fmtLen(c.len)).join(' + ')} · drop ${fmtLen(s.left)}</div><div class="bar">${s.cuts.map(c => `<div class="cut" style="width:${c.len / g.stock * 100}%">${esc(fmtLen(c.len))}</div>`).join('')}</div></div>`).join('')}
      ${g.tooLong.length ? `<div class="alert bad">${g.tooLong.length} piece(s) longer than ${g.mode}' stock — switch them to 40' or exact fit.</div>` : ''}</div>`;
  }).join('');
  return entries + `<h2>Cut plan</h2>` + (plans || '<div class="card muted">Add entries with a length and qty to see the cut plan.</div>');
}

/* ---------- VIN Ledger ---------- */
const VIN_FIELDS = [
  { k: 'gvwr', l: 'GVWR (lb)', t: 'number' }, { k: 'gawr1', l: 'GAWR axle 1 (lb)', t: 'number' }, { k: 'gawr2', l: 'GAWR axle 2 (lb)', t: 'number' },
  { k: 'tireSize', l: 'Tire size' }, { k: 'rimSize', l: 'Rim size' }, { k: 'psi', l: 'Cold tire inflation (PSI)', t: 'number' },
  { k: 'mfgMonth', l: 'Month & year of manufacture', t: 'month' },
  { k: 'tagOrdered', l: 'Certification tag ordered', t: 'check' }, { k: 'tagApplied', l: 'Certification tag applied', t: 'check' }, { k: 'certNotes', l: 'Certification label notes' },
  { k: 'placardDone', l: 'Tire placard (FMVSS 110) applied', t: 'check' },
  { k: 'status', l: 'Status', t: 'select', o: () => [['in-build', 'In build'], ['built', 'Built'], ['offered', 'Offered for sale']] },
  { k: 'notes', l: 'Notes', t: 'textarea' }];
const placardReq = v => num(v.gvwr) > 0 && num(v.gvwr) <= 10000;
function vinItem(v) {
  const m = modelOf(v.model); const sale = S.sales.find(s => s.vinId === v.id);
  return `<a class="item" href="#/view/vins/${v.id}" style="${v.status === 'void' ? 'opacity:.65' : ''}"><div style="flex:none;font-weight:800;font-size:18px;color:var(--accent-d);min-width:42px">${pad3(v.serial)}</div><div class="grow"><div class="t" style="font-family:ui-monospace,monospace;${v.status === 'void' ? 'text-decoration:line-through' : ''}">${esc(v.vin)}</div><div class="s">${esc(m ? m.name : v.model)}${v.status === 'void' ? ' · VOID: ' + esc(v.voidReason) : sale ? ' · ' + esc(sale.buyerName || custName(sale.customerId)) : ''}</div></div><span class="badge ${v.status === 'void' ? 'low' : v.status === 'sold' ? 'approved' : v.status === 'offered' ? 'sent' : 'accent'}">${STATUS[v.status]}</span><span class="chev">›</span></a>`;
}
function ledgerCheck() {
  const ser = S.vins.map(v => v.serial).sort((a, b) => a - b); const issued = S.settings.nextSerial - 1;
  const missing = []; for (let i = 1; i <= issued; i++) if (!ser.includes(i)) missing.push(pad3(i));
  const dupSer = ser.filter((s, i) => ser.indexOf(s) !== i); const vins = S.vins.map(v => v.vin); const dupVin = vins.filter((s, i) => vins.indexOf(s) !== i);
  const badCk = S.vins.filter(v => !vinValid(v.vin));
  const ok = !missing.length && !dupSer.length && !dupVin.length && !badCk.length;
  return ok ? `<span class="ok-t">✓ Ledger check: ${issued ? `serials 001–${pad3(issued)} continuous, no duplicates, all check digits valid` : 'empty — first serial will be 001'}</span>`
    : `<span class="bad-t">⚠ Ledger check: ${[missing.length ? 'missing serial(s) ' + missing.join(', ') + ' (restore your last backup)' : '', dupSer.length ? 'duplicate serials ' + dupSer.join(', ') : '', dupVin.length ? 'duplicate VINs' : '', badCk.length ? badCk.length + ' bad check digit(s)' : ''].filter(Boolean).join('; ')}</span>`;
}
function pageLedger() {
  setTop('VIN Ledger', '#/build');
  const recs = [...S.vins].sort((a, b) => a.serial - b.serial);
  CUR.after = () => {
    $('#csvBtn').onclick = exportLedgerCSV;
    $('#q').oninput = e => { const q = e.target.value.toLowerCase(); $('#listBox').innerHTML = recs.filter(v => JSON.stringify(v).toLowerCase().includes(q)).map(vinItem).join(''); };
  };
  return `<div class="card"><div class="row"><div><div class="small muted">Next serial (auto)</div><div style="font-size:26px;font-weight:800;color:var(--accent-d)">${pad3(S.settings.nextSerial)}</div></div><a class="btn" href="#/edit/vins/new" style="flex:none">＋ New VIN</a></div>
    <div class="small" style="margin-top:8px">${ledgerCheck()}</div>
    <div class="small muted" style="margin-top:6px">Serials are never skipped, reused, or renumbered. A mistake gets voided — it stays here marked VOID.</div>
    <div class="btns"><button class="btn sec sm" id="csvBtn">⬇ Export ledger CSV</button><a class="btn sec sm" href="#/list/sales">🤝 Sale records</a><a class="btn sec sm" href="#/binder/4">VIN rules</a></div></div>
  ${offerAllowed() ? '' : `<div class="alert warn small">⏳ 60-day clock: no trailer may be <b>offered or sold</b> before <b>Dec 19, 2026</b>. Those statuses are locked until then.</div>`}
  <input id="q" class="search" type="search" placeholder="Search VIN, model, buyer…"><div class="list" id="listBox">${recs.map(vinItem).join('') || '<div class="card muted center">No VINs yet. Tap ＋ New VIN — the first trailer gets serial 001.</div>'}</div>
  <a class="fab" href="#/edit/vins/new" aria-label="New VIN">＋</a>`;
}
function vinBuilderHTML(sel, serial, locked, vin) {
  const s = (k, o, lbl) => `<label class="f"><span>${lbl}</span><select data-code="${k}" ${locked ? 'disabled' : ''}><option value="">— pick —</option>${o.map(([v, l]) => `<option value="${v}" ${sel[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  return `<div class="row wrap">${s('body', Object.entries(TH.BODY).map(([k, v]) => [k, `${k} — ${v}`]), 'Pos 4 · Body')}${s('hitch', Object.entries(TH.HITCH).map(([k, v]) => [k, `${k} — ${v}`]), 'Pos 5 · Hitch')}</div>
  <div class="row wrap">${s('len', ['14', '16', '18', '20'].map(x => [x, x + "' flat deck"]), 'Pos 6–7 · Deck length')}${s('axles', [['1', '1 — single'], ['2', '2 — tandem']], 'Pos 8 · Axles')}</div>
  <div class="row wrap">${s('year', yearOptions().map(([k, y]) => [k, `${k} — ${y}`]), 'Pos 10 · Model year')}<label class="f"><span>Pos 11–14</span><input value="${esc(locked ? (vin ? vin[10] + ' · ' + vin.slice(11, 14) : '') : vinIds().plant + ' · ' + vinIds().suffix)}" disabled></label></div>
  <label class="f"><span>Pos 15–17 · Serial (auto-assigned)</span><input value="${pad3(serial)}" disabled></label>`;
}
function pageVinEdit(id) {
  const isNew = id === 'new'; const v = isNew ? null : S.vins.find(x => x.id === id);
  if (!isNew && !v) return '<div class="card">VIN not found.</div>';
  if (!isNew && v.status === 'void') { setTop('VIN record', '#/view/vins/' + id); return '<div class="card">This VIN is VOID and locked.</div>'; }
  setTop(isNew ? 'New VIN' : 'Edit VIN ' + pad3(v.serial), isNew ? '#/list/vins' : '#/view/vins/' + id);
  if (isNew && !vinIdsSet()) return `<div class="alert info">Before building a VIN, enter your WMI, WMI suffix and plant letter in Settings. They stay on this phone only.</div><div class="btns"><a class="btn sec" href="#/list/vins">Back to ledger</a><a class="btn" href="#/settings">Open Settings</a></div>`;
  const sel = isNew ? { body: '', hitch: '', len: '', axles: '', year: 'V' } : { body: v.body, hitch: v.hitch, len: v.len, axles: v.axles, year: v.year };
  const serial = isNew ? S.settings.nextSerial : v.serial;
  const rec = isNew ? { status: 'in-build', mfgMonth: today().slice(0, 7) } : v;
  const fields = VIN_FIELDS.map(f => {
    if (f.k === 'status' && !isNew && v.status === 'sold') return `<label class="f"><span>Status</span><input value="Sold — change it from the sale record" disabled></label>`;
    return fieldHTML(f, rec[f.k] ?? '');
  }).join('');
  CUR.after = () => {
    const form = $('#vinForm'); let model = isNew ? '' : v.model;
    const codes = () => Object.fromEntries($$('[data-code]').map(s => [s.dataset.code, s.value]));
    const upd = () => {
      const c = codes(); const vin = isNew ? buildVin({ ...c, serial }) : v.vin;
      const dup = isNew && vin && S.vins.some(x => x.vin === vin);
      $('#vinPrev').innerHTML = `<div class="vin">${vinHTML(vin)}</div>${vin ? `<div class="small" style="margin-top:6px">Check digit (pos 9) per 49 CFR 565.15: <b>${vin[8]}</b> ${vinValid(vin) ? '<span class="ok-t">✓ valid</span>' : '<span class="bad-t">✗</span>'}</div>` : ''}${dup ? '<div class="alert bad">⚠ This VIN is already in the ledger. Duplicates are blocked.</div>' : ''}`;
      const g = num(form.gvwr.value); const ax = isNew ? c.axles : v.axles;
      form.gawr2.closest('label').style.display = ax === '1' ? 'none' : '';
      $('#placardNote').innerHTML = g ? (g <= 10000 ? `🟡 Tire placard <b>required</b> (GVWR ${fmtN(g)} lb ≤ 10,000). Mount forward half, left/driver side.` : `No yellow tire placard — over 10,000 lb GVWR (cert label only).`) : 'Enter GVWR to see whether a tire placard is required.';
      form.placardDone.closest('label').style.display = g && g > 10000 ? 'none' : '';
    };
    if (isNew) $('#model').onchange = e => {
      model = e.target.value; const m = modelOf(model); if (!m) return upd();
      for (const k of ['body', 'hitch', 'len', 'axles']) { const s = document.querySelector(`[data-code="${k}"]`); s.value = m.vin[k] || ''; }
      form.gvwr.value = m.gvwr; if (m.preset) { form.tireSize.value = m.preset.tireSize; form.psi.value = m.preset.psi; }
      const missing = ['body', 'axles'].filter(k => !m.vin[k]); if (missing.length) toast(`Pick the ${missing.join(' and ')} code for the ${m.name} — it isn't recorded yet.`, 4000);
      upd();
    };
    form.oninput = upd; form.onchange = upd; upd();
    form.onsubmit = async e => {
      e.preventDefault(); const o = readForm(form, VIN_FIELDS);
      if (!isNew && v.status === 'sold') o.status = 'sold';
      if (o.status === 'offered' && !offerAllowed()) return toast('Blocked: no offering for sale before Dec 19, 2026 (60-day clock).', 4000);
      if (isNew) {
        if (!model) return toast('Pick the model');
        const c = codes(); const ser = S.settings.nextSerial; const vin = buildVin({ ...c, serial: ser });
        if (!vin) return toast('Pick every VIN code (body, hitch, length, axles, year)');
        if (ser > 999) return toast('Serial 999 reached for this WMI suffix — talk to SAE before building more.');
        if (S.vins.some(x => x.vin === vin || x.serial === ser)) return toast('Blocked: that VIN/serial is already in the ledger.', 4000);
        const rec = { id: uid('v'), serial: ser, vin, model, ...c, plant: vinIds().plant, ...o, created: today(), history: [{ when: nowStamp(), what: `Created — serial ${pad3(ser)} assigned, VIN ${vin}` }] };
        S.vins.push(rec); S.settings.nextSerial = ser + 1; await save(); toast(`VIN ${pad3(ser)} added to the ledger`); location.replace('#/view/vins/' + rec.id);
      } else {
        const ch = diff(v, o, VIN_FIELDS); Object.assign(v, o);
        if (ch.length) (v.history = v.history || []).push({ when: nowStamp(), what: 'Edited — ' + ch.join('; ') });
        await save(); toast('Saved'); location.replace('#/view/vins/' + v.id);
      }
    };
  };
  return `<form id="vinForm" novalidate>
   <div class="card"><h3 style="margin-top:0">${isNew ? 'Build the VIN (Scheme B)' : 'VIN (locked)'}</h3>
   ${isNew ? `<label class="f"><span>Model *</span><select id="model"><option value="">— pick one of the 7 models —</option>${TH.MODELS.map(m => `<option value="${m.id}">${esc(m.name)} — ${fmtN(m.gvwr)} lb</option>`).join('')}</select></label>` : `<div class="small muted">${esc((modelOf(v.model) || {}).name || '')}</div>`}
   ${vinBuilderHTML(sel, serial, !isNew, isNew ? '' : v.vin)}
   <div class="calc" id="vinPrev"></div>
   ${isNew ? '' : '<div class="small muted" style="margin-top:6px">VIN characters can’t be changed. If it’s wrong, void this record and create a new one.</div>'}</div>
   <div class="card"><h3 style="margin-top:0">Trailer & label data</h3>${fields}<div class="alert info small" id="placardNote"></div></div>
   <div class="btns"><button type="button" class="btn sec" onclick="history.back()">Cancel</button><button class="btn" type="submit">${isNew ? 'Add to ledger' : 'Save'}</button></div></form>`;
}
function diff(old, neu, fields) {
  const out = [];
  for (const f of fields) { const a = old[f.k] ?? '', b = neu[f.k] ?? ''; if (String(a) !== String(b)) out.push(`${f.l.replace(/ \(.*\)/, '')}: ${f.t === 'check' ? (a ? 'yes' : 'no') : a || '—'} → ${f.t === 'check' ? (b ? 'yes' : 'no') : b || '—'}`); }
  return out;
}
function vinKV(v) {
  const m = modelOf(v.model) || {};
  const rows = [['Serial', pad3(v.serial)], ['Model', m.name], ['Deck', m.deck], ['Body / hitch', `${v.body} ${TH.BODY[v.body] || ''} · ${v.hitch} ${TH.HITCH[v.hitch] || ''}`], ['Axles', v.axles === '1' ? '1 (single)' : '2 (tandem)'], ['Model year', `${v.year} = ${TH.YEAR[v.year]}`], ['Plant', plantTxt(v.plant)],
    ['GVWR', v.gvwr ? fmtN(v.gvwr) + ' lb' : ''], ['GAWR axle 1', v.gawr1 ? fmtN(v.gawr1) + ' lb' : ''], ...(v.axles === '2' ? [['GAWR axle 2', v.gawr2 ? fmtN(v.gawr2) + ' lb' : '']] : []), ['Tire size', v.tireSize], ['Rim size', v.rimSize], ['Cold PSI', v.psi], ['Manufactured', fmtDate(v.mfgMonth)],
    ['Cert tag', `${v.tagOrdered ? 'ordered ✓' : 'not ordered'} · ${v.tagApplied ? 'applied ✓' : 'not applied'}`], ['Cert notes', v.certNotes], ['Tire placard', placardReq(v) ? (v.placardDone ? 'required — applied ✓' : 'required — NOT applied yet') : (v.gvwr ? 'not required (>10,000 lb)' : '')], ['Notes', v.notes]];
  return `<dl class="kv">${rows.filter(r => r[1] !== '' && r[1] != null).map(([k, x]) => `<dt>${k}</dt><dd class="pre">${esc(x)}</dd>`).join('')}</dl>`;
}
function saleBlockReason(v) {
  if (v.status === 'void') return 'This VIN is void.';
  if (!offerAllowed()) return 'No sales before Dec 19, 2026 (60-day clock from the Part 565 filing).';
  return null;
}
function pageVinView(id) {
  const v = S.vins.find(x => x.id === id); if (!v) { setTop('VIN', '#/list/vins'); return '<div class="card">VIN not found.</div>'; }
  setTop('VIN ' + pad3(v.serial), '#/list/vins', v.status === 'void' ? '' : `<button class="icon-btn" onclick="go('#/edit/vins/${id}')">Edit</button>`);
  const sale = S.sales.find(s => s.vinId === v.id); const block = saleBlockReason(v);
  const warn = [];
  if (v.status !== 'void') { if (!v.tagApplied) warn.push('Certification tag not applied yet'); if (placardReq(v) && !v.placardDone) warn.push('Tire placard required but not applied'); }
  CUR.after = () => {
    $('#csvOne').onclick = () => download(`VIN-${pad3(v.serial)}-${v.vin}.csv`, ledgerCSV([v]), 'text/csv');
    const vb = $('#voidBtn'); if (vb) vb.onclick = async () => {
      if (sale) return toast('Delete the sale record first, then void.');
      const reason = await promptBox(`Void VIN ${v.vin}? Serial ${pad3(v.serial)} stays in the ledger marked VOID and is never reused. Reason (required):`, { label: 'Void VIN', placeholder: 'e.g. typo on tag, frame scrapped' });
      if (reason === null) return; if (!reason.trim()) return toast('A reason is required to void');
      v.status = 'void'; v.voidReason = reason.trim(); v.voidedAt = nowStamp(); (v.history = v.history || []).push({ when: nowStamp(), what: 'VOIDED — ' + reason.trim() }); await save(); toast('VIN voided'); route();
    };
    bindTagPhoto(v);
  };
  return `<div class="card" style="${v.status === 'void' ? 'border:2px solid var(--red)' : ''}"><div class="row"><span class="badge ${v.status === 'void' ? 'low' : 'accent'}" style="flex:none">${STATUS[v.status]}</span><span class="small muted" style="text-align:right">Created ${esc(fmtDate(v.created))}</span></div>
    <div class="vin" style="margin-top:8px;${v.status === 'void' ? 'text-decoration:line-through' : ''}">${vinHTML(v.vin)}</div>
    <div class="small">${vinValid(v.vin) ? '<span class="ok-t">✓ Check digit valid</span>' : '<span class="bad-t">✗ Check digit invalid</span>'}</div>
    ${v.status === 'void' ? `<div class="alert bad">VOID — ${esc(v.voidReason)} (${esc(v.voidedAt)})</div>` : ''}</div>
  ${warn.length ? `<div class="alert warn small">${warn.map(esc).join('<br>')}</div>` : ''}
  <div class="card">${vinKV(v)}</div>
  ${tagPhotoBlock(v)}
  <div class="card"><b>Sale</b>${sale ? `<a class="item" href="#/view/sales/${sale.id}" style="margin-top:8px"><div class="grow"><div class="t">${esc(sale.buyerName || custName(sale.customerId))}</div><div class="s">${esc(fmtDate(sale.saleDate))} · MCO ${esc(sale.mco)}</div></div><span class="right">${money(saleCalc(sale).total)}</span><span class="chev">›</span></a>`
    : block ? `<div class="small muted" style="margin-top:6px">🔒 ${esc(block)}</div>` : `<div class="btns"><a class="btn" href="#/edit/sales/new?v=${v.id}">＋ Record sale</a></div>`}</div>
  <div class="btns"><a class="btn sec" href="#/vinsheet/${v.id}">🖨️ Record sheet</a><button class="btn sec" id="csvOne">⬇ CSV</button></div>
  ${v.status === 'void' ? '' : `<div class="btns"><button class="btn danger" id="voidBtn">⛔ Void this VIN</button></div>`}
  <div class="card"><b>History</b>${(v.history || []).map(hh => `<div class="hist">${esc(hh.when)} — ${esc(hh.what)}</div>`).reverse().join('') || '<div class="small muted">No changes yet.</div>'}</div>
  <p class="small muted">VIN records can’t be deleted — that would break the serial ledger. Void instead.</p>`;
}
function tagPhotoBlock(v) {
  return `<div class="card"><div class="row"><b>Certification tag photo</b></div><div class="photos">${v.tagPhoto ? `<div class="ph" data-view="${v.tagPhoto}"><img data-pid="${v.tagPhoto}" alt="tag photo"><button class="x" data-rmtag="1" aria-label="Remove">✕</button></div>` : ''}${!v.tagPhoto && v.status !== 'void' ? '<div class="ph add" id="addTag" role="button" aria-label="Add tag photo">＋</div>' : ''}</div></div>`;
}
function bindTagPhoto(v) {
  const a = $('#addTag'); if (a) a.onclick = async () => { const im = await pickImage(false); if (!im.length) return; v.tagPhoto = await putPhoto(im[0]); (v.history = v.history || []).push({ when: nowStamp(), what: 'Tag photo added' }); await save(); route(); };
  $$('[data-view]').forEach(el => el.onclick = e => { if (!e.target.closest('.x')) viewPhoto(el.dataset.view); });
  const rm = $('[data-rmtag]'); if (rm) rm.onclick = async e => { e.stopPropagation(); if (!await confirmBox('Remove the tag photo?', 'Remove')) return; await delPhoto(v.tagPhoto); v.tagPhoto = null; (v.history = v.history || []).push({ when: nowStamp(), what: 'Tag photo removed' }); await save(); route(); };
}
function pageVinSheet(id) {
  const v = S.vins.find(x => x.id === id); if (!v) return '<div class="card">Not found.</div>';
  setTop('Record sheet ' + pad3(v.serial), '#/view/vins/' + id); const st = S.settings; const sale = S.sales.find(s => s.vinId === v.id);
  CUR.after = () => { $('#doPrint').onclick = () => window.print(); };
  return `<div class="btns noprint"><button class="btn" id="doPrint">🖨️ Print / Save as PDF</button></div>
  <div class="quote" id="printArea"><div class="qh">${logoHTML('Large')}<div><div style="font-size:20px;font-weight:800">${esc(st.shopName)} — Trailer Record</div><div class="small">T-County Trailers LLC · ${esc(st.address)}<br>${esc(fmtPhone(st.phone))} · ${esc(st.email)}</div></div></div>
  <h4>VIN · serial ${pad3(v.serial)} · ${STATUS[v.status]}</h4><div class="vin" style="${v.status === 'void' ? 'text-decoration:line-through' : ''}">${esc(v.vin)}</div>
  ${v.status === 'void' ? `<p><b>VOID:</b> ${esc(v.voidReason)} (${esc(v.voidedAt)})</p>` : ''}
  <h4>Trailer & label data</h4>${vinKV(v)}
  <h4>Sale</h4>${sale ? (() => { const c = saleCalc(sale); return `<dl class="kv"><dt>Buyer</dt><dd>${esc(sale.buyerName || custName(sale.customerId))}</dd><dt>Buyer address</dt><dd>${esc(sale.buyerAddress || '')}</dd><dt>Sale date</dt><dd>${esc(fmtDate(sale.saleDate))}</dd><dt>Price</dt><dd>${money(c.price)}</dd><dt>Sales tax (${esc(sale.taxRate)}%)</dt><dd>${money(c.tax)}</dd><dt>Total</dt><dd><b>${money(c.total)}</b></dd><dt>MCO #</dt><dd>${esc(sale.mco)}</dd><dt>Bill of sale</dt><dd>${sale.billOfSale ? 'Yes ✓' : 'No'}</dd></dl>`; })() : '<p class="small">Not sold.</p>'}
  <h4>History</h4>${[...(v.history || []), ...(sale ? (sale.history || []).map(h => ({ ...h, what: 'Sale: ' + h.what })) : [])].map(h => `<div class="hist">${esc(h.when)} — ${esc(h.what)}</div>`).join('')}
  <p class="small muted" style="margin-top:14px">Printed ${esc(nowStamp())}</p></div>`;
}
function ledgerCSV(list) {
  const head = ['Serial', 'VIN', 'Status', 'Void reason', 'Model', 'Body', 'Hitch', 'Deck length (ft)', 'Axles', 'Model year', 'Plant', 'GVWR', 'GAWR axle 1', 'GAWR axle 2', 'Tire size', 'Rim size', 'Cold PSI', 'Manufactured (month)', 'Cert tag ordered', 'Cert tag applied', 'Tire placard required', 'Tire placard applied', 'Buyer', 'Sale date', 'Price', 'Sales tax', 'Total', 'MCO #', 'Bill of sale', 'Notes'];
  const rows = [...list].sort((a, b) => a.serial - b.serial).map(v => { const s = S.sales.find(x => x.vinId === v.id); const c = s ? saleCalc(s) : null; const m = modelOf(v.model) || {};
    return [pad3(v.serial), v.vin, STATUS[v.status], v.voidReason || '', m.name || v.model, v.body, v.hitch, v.len, v.axles, TH.YEAR[v.year] || v.year, v.plant || '', v.gvwr, v.gawr1, v.axles === '2' ? v.gawr2 : '', v.tireSize, v.rimSize, v.psi, v.mfgMonth, v.tagOrdered ? 'yes' : 'no', v.tagApplied ? 'yes' : 'no', placardReq(v) ? 'yes' : 'no', placardReq(v) ? (v.placardDone ? 'yes' : 'no') : '', s ? (s.buyerName || custName(s.customerId)) : '', s ? s.saleDate : '', c ? c.price.toFixed(2) : '', c ? c.tax.toFixed(2) : '', c ? c.total.toFixed(2) : '', s ? s.mco : '', s ? (s.billOfSale ? 'yes' : 'no') : '', v.notes || '']; });
  return toCSV([head, ...rows]);
}
function exportLedgerCSV() { download(`vin-ledger-${today()}.csv`, ledgerCSV(S.vins), 'text/csv'); toast('Ledger CSV downloaded'); }

/* ---------- Sale records ---------- */
const SALE_FIELDS = [{ k: 'customerId', l: 'Buyer (customer card)', t: 'select', o: custOpts }, { k: 'buyerName', l: 'Buyer name (if no customer card)' }, { k: 'buyerAddress', l: 'Buyer address' },
  { k: 'saleDate', l: 'Sale date', t: 'date' }, { k: 'price', l: 'Sale price ($)', t: 'number' }, { k: 'taxRate', l: 'Sales tax rate (%)', t: 'number' },
  { k: 'mco', l: 'MCO number', req: 1 }, { k: 'billOfSale', l: 'Bill of sale completed and signed', t: 'check' }, { k: 'notes', l: 'Notes', t: 'textarea' }];
function pageSales() {
  setTop('Sale records', '#/build');
  const recs = [...S.sales].sort((a, b) => (b.saleDate || '').localeCompare(a.saleDate || ''));
  return `<div class="alert info small">Every sale needs an <b>MCO + bill of sale</b>. Start a sale from its VIN in the <a href="#/list/vins">VIN Ledger</a>.${offerAllowed() ? '' : ' Sales are locked until Dec 19, 2026.'}</div>
  <div class="list">${recs.map(s => { const v = S.vins.find(x => x.id === s.vinId) || {}; return `<a class="item" href="#/view/sales/${s.id}"><div class="grow"><div class="t">${pad3(v.serial || 0)} · ${esc(s.buyerName || custName(s.customerId))}</div><div class="s">${esc(fmtDate(s.saleDate))} · MCO ${esc(s.mco)} · ${esc(v.vin || '')}</div></div><span class="right">${money(saleCalc(s).total)}</span><span class="chev">›</span></a>`; }).join('') || '<div class="card muted center">No sales yet (pre-revenue).</div>'}</div>`;
}
function pageSaleEdit(id) {
  const isNew = id.startsWith('new'); const qs = new URLSearchParams(location.hash.split('?')[1] || '');
  const s = isNew ? { vinId: qs.get('v'), taxRate: S.settings.taxRate, saleDate: today(), billOfSale: false } : S.sales.find(x => x.id === id);
  if (!s) return '<div class="card">Not found.</div>';
  const v = S.vins.find(x => x.id === s.vinId);
  setTop(isNew ? 'Record sale' : 'Edit sale', isNew ? (v ? '#/view/vins/' + v.id : '#/list/vins') : '#/view/sales/' + id);
  if (!v) return '<div class="card">Pick a VIN in the ledger first, then tap “Record sale”.</div>';
  const block = saleBlockReason(v); if (isNew && block) return `<div class="alert bad">🔒 ${esc(block)}</div><a class="btn sec" href="#/view/vins/${v.id}">Back to VIN</a>`;
  if (isNew && S.sales.some(x => x.vinId === v.id)) return '<div class="alert bad">This VIN already has a sale record.</div>';
  CUR.after = () => {
    const form = $('#saleForm'); const upd = () => { const o = readForm(form, SALE_FIELDS); const c = saleCalc(o); $('#calcBox').innerHTML = totalsTable([['Price', c.price], [`Sales tax (${fmtN(num(o.taxRate))}%)`, c.tax], ['Total', c.total, 1]]); };
    form.oninput = upd; upd();
    form.onsubmit = async e => {
      e.preventDefault(); const o = readForm(form, SALE_FIELDS); const errs = [];
      if (!o.customerId && !o.buyerName) errs.push('buyer'); if (!o.mco) errs.push('MCO number'); if (!o.billOfSale) errs.push('bill of sale'); if (!o.saleDate) errs.push('sale date');
      if (errs.length) return toast('Blocked — no sale without: ' + errs.join(', '), 4000);
      if (o.saleDate < TH.FIRST_OFFER_DATE || !offerAllowed()) return toast('Blocked: sale date must be on/after Dec 19, 2026.', 4000);
      if (S.sales.some(x => x.mco === o.mco && x !== s)) return toast('Blocked: that MCO number is already used on another sale.', 4000);
      if (isNew) {
        const rec = { id: uid('sale'), vinId: v.id, ...o, created: today(), history: [{ when: nowStamp(), what: `Created — buyer ${o.buyerName || custName(o.customerId)}, ${money(saleCalc(o).total)}, MCO ${o.mco}` }] };
        S.sales.push(rec); v.status = 'sold'; (v.history = v.history || []).push({ when: nowStamp(), what: `SOLD — MCO ${o.mco}` }); await save(); toast('Sale recorded — VIN marked sold'); location.replace('#/view/sales/' + rec.id);
      } else {
        const ch = diff(s, o, SALE_FIELDS.map(f => f.k === 'customerId' ? { ...f, l: 'Buyer card' } : f)); Object.assign(s, o);
        if (ch.length) s.history.push({ when: nowStamp(), what: 'Changed — ' + ch.join('; ') });
        await save(); toast('Saved'); location.replace('#/view/sales/' + s.id);
      }
    };
  };
  return `<div class="card small"><b>VIN ${pad3(v.serial)}</b> · <span style="font-family:monospace">${esc(v.vin)}</span><br>${esc((modelOf(v.model) || {}).name || '')}</div>
  <form id="saleForm" class="card" novalidate>${SALE_FIELDS.map(f => fieldHTML(f, s[f.k] ?? '')).join('')}<div class="calc" id="calcBox"></div>
  <div class="small muted" style="margin-top:8px">Rule: no sale without an MCO number and a signed bill of sale.</div>
  <div class="btns"><button type="button" class="btn sec" onclick="history.back()">Cancel</button><button class="btn" type="submit">Save sale</button></div></form>`;
}
function pageSaleView(id) {
  const s = S.sales.find(x => x.id === id); if (!s) { setTop('Sale', '#/list/sales'); return '<div class="card">Not found.</div>'; }
  const v = S.vins.find(x => x.id === s.vinId) || {}; const c = saleCalc(s);
  setTop('Sale record', '#/list/sales', `<button class="icon-btn" onclick="go('#/edit/sales/${id}')">Edit</button>`);
  CUR.after = () => { $('#delBtn').onclick = async () => { if (!await confirmBox('Delete this sale record? The VIN goes back to “Built”.')) return; S.sales = S.sales.filter(x => x !== s); if (v.id) { v.status = 'built'; (v.history = v.history || []).push({ when: nowStamp(), what: `Sale record (MCO ${s.mco}) deleted — status back to Built` }); } await save(); toast('Deleted'); go('#/list/sales'); }; };
  return `<a class="item" href="#/view/vins/${v.id}"><div style="flex:none;font-weight:800;color:var(--accent-d)">${pad3(v.serial || 0)}</div><div class="grow"><div class="t" style="font-family:monospace">${esc(v.vin)}</div><div class="s">${esc((modelOf(v.model) || {}).name || '')}</div></div><span class="chev">›</span></a>
  <div class="card"><dl class="kv"><dt>Buyer</dt><dd>${esc(s.buyerName || custName(s.customerId))}</dd>${s.buyerAddress ? `<dt>Address</dt><dd>${esc(s.buyerAddress)}</dd>` : ''}<dt>Sale date</dt><dd>${esc(fmtDate(s.saleDate))}</dd><dt>MCO #</dt><dd>${esc(s.mco)}</dd><dt>Bill of sale</dt><dd>${s.billOfSale ? 'Yes ✓' : 'No'}</dd>${s.notes ? `<dt>Notes</dt><dd class="pre">${esc(s.notes)}</dd>` : ''}</dl></div>
  <div class="card">${totalsTable([['Price', c.price], [`Sales tax (${fmtN(num(s.taxRate))}%)`, c.tax], ['Total', c.total, 1]])}</div>
  <div class="card"><b>Change history</b>${[...(s.history || [])].reverse().map(h => `<div class="hist">${esc(h.when)} — ${esc(h.what)}</div>`).join('')}</div>
  <div class="btns"><a class="btn sec" href="#/edit/sales/${id}">✏️ Edit</a><button class="btn danger" id="delBtn">🗑 Delete</button></div>`;
}

/* ---------- Operations Binder ---------- */
const BINDER_TABS = [['1', '§1 Wholesalers'], ['2', '§2 Shop Rate'], ['3', '§3 Cost Worksheets'], ['4', '§4 VIN & Compliance'], ['5', '§5–6 Quick Reference']];
function pageBinder(tab, sub) {
  setTop('Operations Binder', '#/' + binderSide(tab));
  const tabs = `<div class="tabs">${BINDER_TABS.map(([k, l]) => `<a href="#/binder/${k}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  const body = { 1: binderWholesalers, 2: binderRate, 3: binderWorksheets, 4: binderVIN, 5: binderQuickRef }[tab] || binderWholesalers;
  return tabs + body(sub);
}
function supplierCard(s, isNote) {
  const L = (lbl, v) => v ? `<dt>${lbl}</dt><dd>${v}</dd>` : '';
  if (isNote) return `<div class="card" data-s><div class="row"><b>${esc(s.title)}</b><span class="badge accent" style="flex:none">Supplier note</span></div><div class="pre small" style="margin-top:6px">${esc(s.body)}</div><div class="btns"><a class="btn sec sm" href="#/view/notes/${s.id}">Open note</a></div></div>`;
  const web = s.website ? `<a href="https://${esc(s.website.replace(/^https?:\/\//, ''))}" target="_blank" rel="noopener">${esc(s.website)}</a>` : '';
  return `<div class="card" data-s><div class="row"><div><b style="font-size:17px">${esc(s.name)}</b><div class="small muted">${esc(s.category)}</div></div>${s.added ? `<span class="badge approved" style="flex:none">Added ${esc(fmtDate(s.added).replace(/, \d{4}/, ''))}</span>` : ''}</div>
  ${s.status ? `<div class="small" style="margin:6px 0;font-weight:650;color:var(--accent-d)">${esc(s.status)}</div>` : ''}
  <dl class="kv small">${L('Contact', esc(s.contact))}${L('Phone', s.phone ? `<a href="tel:${esc(s.phone.replace(/[^\d+]/g, ''))}">${esc(s.phone)}</a>` : '')}${L('Email', s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : '')}${L('Website', web)}${L('Address', esc(s.address))}${L('Account #', esc(s.account))}${L('Terms', esc(s.terms))}</dl>
  ${s.notes ? `<div class="small pre" style="margin-top:6px">${esc(s.notes)}</div>` : ''}
  <div class="btns"><a class="btn sec sm" href="#/edit/suppliers/${s.id}">✏️ Edit</a><button class="btn danger sm" data-delsup="${s.id}">🗑</button></div></div>`;
}
function binderWholesalers() {
  CUR.after = () => {
    $('#wq').oninput = e => { const q = e.target.value.toLowerCase(); $$('[data-s]').forEach(c => c.style.display = c.textContent.toLowerCase().includes(q) ? '' : 'none'); };
    $$('[data-delsup]').forEach(b => b.onclick = async () => { const s = S.suppliers.find(x => x.id === b.dataset.delsup); if (s && await confirmBox(`Delete the ${s.name} card?`)) { S.suppliers = S.suppliers.filter(x => x !== s); await save(); route(); } });
  };
  const notes = S.notes.filter(n => n.category === 'Supplier');
  return `<p class="quote-txt">“Need an axle, brake parts, or steel? Flip here first — buy from the right place and the margins take care of themselves.”</p>
  <input id="wq" class="search" type="search" placeholder="Search wholesalers (name, part, city…)">
  ${S.suppliers.map(s => supplierCard(s)).join('')}${notes.map(n => supplierCard(n, true)).join('')}
  <div class="btns"><a class="btn sec" href="#/edit/suppliers/new">＋ Add wholesaler card</a></div>
  <div class="alert info small"><b>Rule of thumb:</b> Husky for parcel-size parts, Dexter INDEX for genuine axles. No Alibaba/generic safety-critical parts — tariffs and zero warranty erase the savings.</div>`;
}
function binderRate() {
  CUR.after = () => { const f = () => { const a = num($('#rTake').value), b = num($('#rOver').value), h = num($('#rHrs').value); $('#rOut').textContent = h ? money((a + b) / h) + '/hr' : '—'; }; ['rTake', 'rOver', 'rHrs'].forEach(i => $('#' + i).oninput = f); f(); };
  return `<p class="quote-txt">“What an hour of your time costs — and the honest math behind it. Quote with confidence, not guesswork.”</p>
  <div class="card center"><div style="font-size:44px;font-weight:800;color:var(--accent-d)">$${esc(S.settings.laborRate)}/hr</div><div class="small muted">T-County Trailers shop labor rate — matches the Trailer Pricing Worksheet</div></div>
  <div class="card"><b>The honest math</b> <span class="small muted">(recheck once a year)</span>
  <label class="f"><span>Step 1 — What you need to take home in a year</span><input id="rTake" type="number" inputmode="decimal" value="60000"></label>
  <label class="f"><span>Step 2 — + Yearly shop overhead (electric, consumables, insurance, phone, tool wear)</span><input id="rOver" type="number" inputmode="decimal" value="15000"></label>
  <label class="f"><span>Step 3 — ÷ Realistic billable hours/year (≈ 20 hrs/wk × 50 wks)</span><input id="rHrs" type="number" inputmode="decimal" value="1000"></label>
  <div class="calc"><b>Cost rate: <span id="rOut"></span></b><div class="small">Profit goes on top in the worksheet margin (§3). Example figures from the Rolodex: $75,000 ÷ 1,000 = $75/hr.</div></div></div>
  <div class="card small"><b>Rules for the rate</b><ul style="padding-left:18px;margin:6px 0">
  <li><b>Bill every hour.</b> Cutting, fit-up, welding, axle install, decking, wiring, paint, cleanup, inspection, customer paperwork — if you're working on their trailer, the clock runs.</li>
  <li><b>Materials are always separate.</b> The rate covers labor only. Parts and steel are line items on the worksheet.</li>
  <li><b>Repair work:</b> same $75/hr, 1-hour minimum. Give a written estimate before touching anything; diagnostic time counts.</li>
  <li><b>Revisit yearly</b> or whenever overhead jumps. If the math says $82, the rate is $82 — don't subsidize customers.</li>
  <li><b>Fair-rate gut check:</b> $75/hr for experienced fabrication in rural West Tennessee is fair to both sides — below big-city rates ($95–$125/hr), above handyman pricing. You are the quality option.</li></ul></div>`;
}
function wsCalc(w) {
  const mat = TH.WS_LINES.reduce((a, l) => a + num((w.lines || {})[l]), 0); const labor = r2(num(w.hours) * num(S.settings.laborRate));
  const cost = r2(mat + labor + num(w.overhead)); const profit = r2(cost * num(w.profit) / 100); const sale = r2(cost + profit);
  return { mat: r2(mat), labor, cost, profit, sale, deposit: r2(sale * 0.30) };
}
function binderWorksheets(sub) {
  if (sub) {
    const m = modelOf(sub); if (!m) return '<div class="card">Unknown model.</div>';
    const w = S.worksheets[sub] = S.worksheets[sub] || { lines: {}, hours: '', overhead: '', profit: 25 };
    CUR.after = () => {
      const f = $('#wsForm'); const upd = () => {
        TH.WS_LINES.forEach((l, i) => w.lines[l] = f['l' + i].value); w.hours = f.hours.value; w.overhead = f.overhead.value; w.profit = f.profit.value;
        const c = wsCalc(w); $('#wsCalc').innerHTML = totalsTable([['Materials subtotal', c.mat], [`Labor (${fmtN(num(w.hours))} hrs × $${S.settings.laborRate}/hr)`, c.labor], ['Overhead (per-trailer share)', num(w.overhead)], ['TOTAL COST', c.cost], [`Profit ${fmtN(num(w.profit))}%`, c.profit], ['SALE PRICE', c.sale, 1], ['Deposit due (30%)', c.deposit]]);
        clearTimeout(saveTimer); saveTimer = setTimeout(save, 400);
      };
      f.oninput = upd; upd();
      $('#wsReset').onclick = async () => { if (await confirmBox('Clear this worksheet?', 'Clear')) { delete S.worksheets[sub]; await save(); route(); } };
      $('#wsPrint').onclick = () => window.print();
    };
    return `<div class="quote" id="printArea"><div class="qh">${logoHTML('Medium')}<div><b style="font-size:18px">${esc(m.name)}</b><div class="small">${esc(m.deck)} · GVWR ${fmtN(m.gvwr)} lb · ${esc(m.notes)}</div></div></div>
    <form id="wsForm" novalidate>${TH.WS_LINES.map((l, i) => `<label class="f"><span>${l} ($)</span><input name="l${i}" type="number" step="any" inputmode="decimal" value="${esc(w.lines[l] ?? '')}"></label>`).join('')}
    <label class="f"><span>Labor hours (× $${esc(S.settings.laborRate)}/hr)</span><input name="hours" type="number" step="any" inputmode="decimal" value="${esc(w.hours)}"></label>
    <label class="f"><span>Overhead — per-trailer share ($)</span><input name="overhead" type="number" step="any" inputmode="decimal" value="${esc(w.overhead)}"></label>
    <label class="f"><span>Profit %</span><input name="profit" type="number" step="any" inputmode="decimal" value="${esc(w.profit)}"></label></form>
    ${kitNote(sub) || (S.settings.partsPricesLoaded && TH.PARTS_PRICES && TH.PARTS_PRICES.prices[sub] ? '<p class="small muted">Parts prices loaded Nov 15, 2026 (material only, no freight). Steel, decking, paint and hardware still blank.</p>' : '')}
    <div class="calc" id="wsCalc"></div>
    <p class="small muted">Before you quote: VIN, certification label, title/MCO, and legal-sale requirements must be complete before a manufactured trailer is sold. Saves automatically.</p></div>
    <div class="btns noprint"><a class="btn sec" href="#/binder/3">‹ All models</a><button class="btn sec" id="wsPrint">🖨️ Print</button><button class="btn danger" id="wsReset">Clear</button></div>`;
  }
  return `<p class="quote-txt">“One worksheet per trailer. Materials + labor + overhead + profit = a price you can stand behind.”</p>
  <div class="card small"><table class="grid"><tr><th>Line</th><th>What goes here</th></tr>
  <tr><td>Materials</td><td>Every part at current supplier cost including inbound freight. Use §1 — Husky for parcel parts, Dexter for axles.</td></tr>
  <tr><td>Labor</td><td>Real build hours × $${esc(S.settings.laborRate)}/hr — cutting, fit-up, welding, assembly, wiring, finishing, inspection, cleanup, paperwork.</td></tr>
  <tr><td>Overhead</td><td>Shop costs that don't show on one receipt. Pick a flat per-trailer number and stick to it.</td></tr>
  <tr><td>Profit %</td><td>Margin on top of total cost. This is the business's pay — not optional.</td></tr>
  <tr><td>Deposit</td><td>30% of sale price due before work begins.</td></tr></table></div>
  <h2>All 7 models</h2>${TH.MODELS.some(m => { const w = S.worksheets[m.id]; return !w || !num((w.lines || {})['Steel & framing']) || !num(w.hours); }) ? `<p class="small muted">Sale = all worksheet lines + labor + overhead + profit. Steel, decking, paint and hours still need filling in.</p>` : ''}<div class="list">${TH.MODELS.map(m => { const w = S.worksheets[m.id]; const c = w ? wsCalc(w) : null; const right = (c && (c.sale || c.mat)) ? `<span class="right">${c.sale ? `Sale ${money(c.sale)}` : ''}${c.mat ? `<div class="small muted">Parts ${money(c.mat)}</div>` : ''}</span>` : '<span class="small muted">blank</span>'; return `<a class="item" href="#/binder/3/${m.id}"><div class="grow"><div class="t">${esc(m.name)}</div><div class="s">GVWR ${fmtN(m.gvwr)} lb · ${esc(m.deck)}</div></div>${right}<span class="chev">›</span></a>`; }).join('')}</div>`;
}
function binderVIN() {
  const sample = buildVin({ body: 'C', hitch: 'B', len: '18', axles: '2', year: 'V', serial: 1 }) || '';
  CUR.after = () => {
    const f = () => { const v = $('#vchk').value.toUpperCase().replace(/\s/g, ''); const c = vinCheckDigit(v); $('#vres').innerHTML = !v ? '' : v.length !== 17 ? `<span class="bad-t">${v.length}/17 characters</span>` : c === null ? '<span class="bad-t">Invalid characters (I, O, Q not allowed)</span>' : v[8] === c ? `<span class="ok-t">✓ Valid — check digit ${c}</span>${S.vins.some(x => x.vin === v) ? ' · in your ledger' : ''}` : `<span class="bad-t">✗ Check digit should be ${c}, not ${v[8]}</span>`; };
    $('#vchk').oninput = f; f();
  };
  const st = [['WMI (SAE)', `ASSIGNED 10/14/2026 — ${nv('wmi')} (positions 1–3) + ${nv('wmiSuffix')} (positions 12–14), vehicle type Trailer, country US. Letter on file.`],
    ['NHTSA Part 566', `ACCEPTED 10/19/2026 — NHTSA Manufacturer ID ${nv('nhtsaMid')}, listed in the federal MID library. Filed 10/16/2026.`],
    ['VIN scheme', 'Scheme B locked 10/16/2026 — pos 4 = body (U/C/E/T/S), pos 5 = hitch (B/G), pos 6–7 = flat deck length (dovetail not counted), pos 8 = axles. Advertise "18 + 2"; VIN carries the 18.'],
    ['NHTSA vPIC / Part 565', `PROCESSED 10/21/2026 — filed 10/20/2026 (Submission ID ${nv('part565Id')}). 60-day clock: first offering for sale on/after Dec 19, 2026. vPIC confirmed Nov 4, 2026: sample VIN ${sample ? esc(sample) : NOT_ENTERED} decodes as T-County Trailers LLC, MY 2027, Error Code 0.`],
    ['TN manufacturer license', 'NOT required for utility trailers — TCA §55-17-102 covers only self-propelled vehicles and RVs with living quarters.'],
    ['Certification plates', 'Production route set 10/22/2026 — friend produces finished 5″×3″ weather-resistant heat-transfer tags with all data (VIN, weights, date, tires). Per trailer only the date and VIN serial change. Backup: outsourced serialized plates (VintagWorks from $19.95, Inland from $5.47). Brakes on all axles, every model — TCA §55-9-204(d).'],
    ['Tire placard (FMVSS 110)', 'Required only ≤10,000 lb GVWR (5 of 7 models). Production placard built Nov 14 for the 18′ car hauler (5″×3″, ST225/75R15, 65 PSI, cargo 7,790 lb). Mount forward half, left/driver side. Does not carry the VIN.']];
  const anat = [['1–3', `WMI — ${nv('wmi')}, assigned by SAE 10/14/2026`], ['4', 'Body — U utility · C car hauler · E equipment · T toy hauler · S small car hauler'], ['5', 'Hitch — B bumper pull · G gooseneck'], ['6–7', "Flat deck length in feet — 14 / 16 / 18 / 20 (2' dovetail not counted: “18 + 2”)"], ['8', 'Axles — 1 single · 2 tandem'], ['9', 'Check digit — 49 CFR 565.15'], ['10', 'Model year — V = 2027'], ['11', `Plant — ${vinIds().plant ? esc(vinIds().plant) + (bizVal('plantCity') ? ' = ' + esc(bizVal('plantCity')) : '') : NOT_ENTERED}`], ['12–14', `${nv('wmiSuffix')} — WMI second half`], ['15–17', 'Serial — 001, 002, 003… sequential, never reused']];
  const label = ['Manufacturer name: T-County Trailers LLC', 'Month and year of manufacture', 'GVWR', 'GAWR for each axle', 'Tire size', 'Rim size', 'Cold tire inflation pressure', '17-digit VIN', 'Vehicle type (Trailer)', 'Federal conformance statement'];
  return `<p class="quote-txt">“Nothing sells without this tab.”</p>
  <div class="card"><b>VIN builder & ledger</b><div class="small muted">Build every real VIN from the ledger — it auto-assigns the next serial and blocks duplicates.</div><div class="btns"><a class="btn" href="#/edit/vins/new">＋ New VIN</a><a class="btn sec" href="#/list/vins">Open VIN Ledger</a></div>
  <label class="f"><span>Check any VIN</span><input id="vchk" value="${sample}" autocapitalize="characters" style="font-family:monospace;letter-spacing:1px"></label><div id="vres" class="small" style="margin-top:6px"></div>
  <div class="small muted" style="margin-top:6px">Example — first 18′ car hauler + 2′ dovetail: ${sample ? `<span style="font-family:monospace">${vinHTML(sample)}</span>` : NOT_ENTERED}</div></div>
  <div class="card"><b>VIN anatomy — Scheme B</b><table class="grid" style="margin-top:6px">${anat.map(([a, b]) => `<tr><td style="white-space:nowrap;font-weight:700">${a}</td><td>${b}</td></tr>`).join('')}</table></div>
  <div class="card"><b>Status</b><table class="grid small" style="margin-top:6px">${st.map(([a, b]) => `<tr><td style="font-weight:700">${a}</td><td>${b}</td></tr>`).join('')}</table></div>
  <div class="card"><b>Part 567 certification label — every build</b>${label.map(l => `<div class="small" style="padding:4px 0">☐ ${l}</div>`).join('')}<div class="small muted">QR code optional (label art carries the website QR). Never reproduce another manufacturer's label.</div></div>
  <div class="alert bad small"><b>DO NOT SELL BEFORE THIS IS DONE.</b> A manufactured trailer cannot legally be sold without a proper 17-digit VIN, Part 567 certification label, and FMVSS compliance — fines up to ~$27,000 per trailer. Every sale gets an MCO plus a bill of sale.</div>`;
}
function keyContactRows() {
  const lines = bizVal('keyContacts').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return `<tr><td>${NOT_ENTERED}</td></tr>`;
  const tel = t => esc(t).replace(/(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/g, m => `<a href="tel:${m.replace(/[^\d+]/g, '')}">${m}</a>`);
  return lines.map(l => { const parts = l.split(/\s+—\s+|\s*\|\s*/).filter(Boolean); const isC = x => /@|\d{3}\D{0,3}\d{4}/.test(x); return `<tr><td>${esc(parts.filter(x => !isC(x)).join(' — '))}</td><td>${parts.filter(isC).map(tel).join('<br>')}</td></tr>`; }).join('');
}
function binderQuickRef() {
  const st = S.settings;
  const einSet = !!(st.ein && String(st.ein).trim());
  const taxTxt = `Not registered yet — 9.25% (7% state + 2.25% ${bizVal('county') || 'county'}). Register before the first sale.`
    + (Number(st.taxRate) !== 9.25 ? ` Settings rate is currently ${st.taxRate}%.` : '');
  const einCell = einSet
    ? `<span id="einMask">••-•••••••</span><span id="einVal" hidden>${esc(st.ein)}</span> <button type="button" class="btn sec sm" id="einToggle">Show</button>`
    : `Not entered — add it in <a href="#/settings">Settings</a> (stays on this phone only)`;
  const rows = [['IRS legal name', 'T-COUNTY TRAILERS LLC (single-member LLC)'], ['TN SOS name', `T-COUNTY TRAILERS, LLC — Control #${nv('sosControl')}, active since 02/02/2026, annual report due 04/01/2027`, 1], ['Business tax license', `#${nv('countyLicense')} — issued 07/10/2026, expires 05/15/2027 (${esc(bizVal('county') || 'county')} minimal-activity)`, 1],
    ['Phone', bizVal('phone') ? esc(fmtPhone(bizVal('phone'))) : NOT_ENTERED, 1], ['Email (business)', nv('email'), 1], ['Website', 't-county-trailers.com — build-to-order: /build-your-trailer — repair pickup: /schedule-a-repair-pickup'],
    ['WMI / MID', `${nv('wmi')} + ${nv('wmiSuffix')} · NHTSA Manufacturer ID ${nv('nhtsaMid')}`, 1], ['EIN (federal)', einCell, 1], ['Sales tax', taxTxt],
    ['NHTSA Part 565', `Filed 10/20/2026, processed 10/21/2026, Submission ID ${nv('part565Id')}`, 1],
    ['First legal offer for sale', 'Dec 19, 2026 (60-day clock from 10/20) — launch stays April 2027'],
    ['TN manufacturer license', 'Not required for utility trailers (TCA §55-17-102)'],
    ['Brakes', 'Required on every trailer with a 3,500-lb axle, single or tandem (TCA §55-9-204(d))'],
    ['Sales model', 'Direct only — trailers he builds plus repair work; no third-party trailers, no dealer activity'],
    ['Shop rate', '$' + st.laborRate + '/hr'],
    ['Deposit', '30% of sale price before work begins'],
    ['Logo tagline', st.tagline || 'Welding & Restoration'],
    ['Bank', 'Dedicated business account, debit card only, no checks. For grant paperwork use a bank verification letter or direct-deposit form instead of a voided check.'],
    ['Lineup GVWRs', '3,500 / 7,000 / 9,990 / 14,000 / 6,000 / 7,000 / 12,000 lb — brakes on all axles, all models. 2′ dovetail on every model except the 16′ small car hauler.'], ['Launch target', 'April 2027']];
  CUR.after = () => {
    const btn = $('#einToggle');
    if (!btn) return;
    btn.onclick = () => {
      const show = $('#einVal').hidden;
      $('#einVal').hidden = !show;
      $('#einMask').hidden = show;
      btn.textContent = show ? 'Hide' : 'Show';
    };
  };
  return `<p class="quote-txt">“The numbers you reach for on every form, every call, every application.”</p>
  <div class="card"><table class="grid small">${rows.map(([a, b, raw]) => `<tr><td style="font-weight:700">${a}</td><td>${raw ? b : esc(b)}</td></tr>`).join('')}</table></div>
  <div class="card small"><b>QR codes</b> <span class="muted">— both open t-county-trailers.com</span><div class="row" style="gap:12px;margin-top:8px;flex-wrap:wrap">
  <div style="text-align:center;flex:1;min-width:130px"><img src="qr-website-logo.png" alt="Website QR code with T-County logo" style="width:100%;max-width:170px;background:#fff;border-radius:8px"><div>With logo</div><a class="btn sec sm" href="qr-website-logo.png" download="t-county-qr-logo.png">⬇ Save</a></div>
  <div style="text-align:center;flex:1;min-width:130px"><img src="qr-website.png" alt="Website QR code, plain" style="width:100%;max-width:170px;background:#fff;border-radius:8px"><div>Plain</div><a class="btn sec sm" href="qr-website.png" download="t-county-qr-plain.png">⬇ Save</a></div></div></div>
  <div class="card small"><b>Key phone numbers</b><table class="grid">${keyContactRows()}</table></div>
  <div class="card small"><b>Grant pipeline</b><table class="grid">
  <tr><td>Business Freedom Grant</td><td>$1,000 — submitted 9/28/2026; in the judging pool (don't file a second). Winners announced Jan 15, 2027.</td></tr>
  <tr><td>Coach K Legacy Grant</td><td>$1,000 — submitted 10/26/2026; awaiting outcome.</td></tr>
  <tr><td>R4R Mitigation Grant</td><td>$5,000 — deadline 11/15/2026, 11:59pm ET (as printed in the Rolodex; status not recorded).</td></tr>
  <tr><td>Verizon $10K National Grant</td><td>$10,000 — any 2 free courses unlock the application; 10 awarded monthly, June–Dec 2026.</td></tr></table></div>
  <div class="card small"><b>Also</b><br>Bookkeeping: QuickBooks Solopreneur (owner signs up).<br>CWI exam: The Woodlands, TX seminar 2/28–3/5/2027, exam 3/6/2027 — register before 1/14/2027 (fast-track fee after).</div>
  <h2>§6 Updates since October</h2><div class="card small"><ul style="padding-left:18px;margin:0">
  <li>Nov 15: Private business numbers (SOS, license, NHTSA, WMI, EIN), phone, email and key contacts now live only on this phone. Enter them in Settings; the public app no longer carries them.</li>
  <li>Nov 15: Business Information Record added to Quick Reference.</li>
  <li>vPIC confirmed Nov 4, 2026: ${(() => { const sv = buildVin({ body: 'C', hitch: 'B', len: '18', axles: '2', year: 'V', serial: 1 }); return sv ? 'sample VIN ' + esc(sv) : 'the sample VIN'; })()} resolves as T-County Trailers LLC, MY 2027, Error Code 0.</li>
  <li>Tire placard (FMVSS 110) required only ≤10,000 lb GVWR (5 of 7 models). Production placard built Nov 14 for the 18′ car hauler.</li>
  <li>Wholesalers: Trailer Parts Outlet (Nov 10) and Libra Trailer Parts (Nov 12) cards added; Dexter card gained the general email.</li>
  <li>Stock pull-down: Trailer bearings group added Nov 12.</li>
  <li>Toy hauler worksheet GVWR shown as 6,000 lb; worksheets now cover all 7 models.</li></ul></div>`;
}

/* ---------- Settings ---------- */
function pageSettings() {
  setTop('Settings & branding', '#/office'); const st = S.settings;
  const F = [{ k: 'shopName', l: 'Shop name' }, { k: 'tagline', l: 'Tagline' }, { k: 'phone', l: 'Phone', t: 'tel' }, { k: 'email', l: 'Email', t: 'email' }, { k: 'address', l: 'Address' }, { k: 'website', l: 'Website' },
    { k: 'accent', l: 'Accent color', t: 'color' }, { k: 'logoSize', l: 'Logo size', t: 'select', o: () => opts(['Small', 'Medium', 'Large']) }, { k: 'laborRate', l: 'Shop labor rate ($/hr)', t: 'number' }, { k: 'taxRate', l: 'Sales tax rate (%)', t: 'number' },
    { k: 'ein', l: 'EIN (federal)', hint: 'Stored only on this phone. Never shared.' },
    { k: 'sosControl', l: 'TN SOS control #', hint: 'Stored only on this phone. Never shared.' }, { k: 'countyLicense', l: 'County business license #', hint: 'Stored only on this phone. Never shared.' },
    { k: 'nhtsaMid', l: 'NHTSA manufacturer ID', hint: 'Stored only on this phone. Never shared.' }, { k: 'wmi', l: 'WMI (VIN positions 1–3)', hint: 'Stored only on this phone. Never shared.' },
    { k: 'wmiSuffix', l: 'WMI suffix (VIN positions 12–14)', hint: 'Stored only on this phone. Never shared.' }, { k: 'plantCode', l: 'Plant letter (VIN position 11)', hint: 'Stored only on this phone. Never shared.' },
    { k: 'plantCity', l: 'Plant location (city, state)', hint: 'Stored only on this phone. Never shared.' }, { k: 'county', l: 'County (tax and license wording)', hint: 'Stored only on this phone. Never shared.' }, { k: 'part565Id', l: 'NHTSA Part 565 submission ID', hint: 'Stored only on this phone. Never shared.' },
    { k: 'keyContacts', l: 'Key contacts (one per line: name — phone — email)', t: 'textarea', hint: 'Stored only on this phone. Never shared.' },
    { k: 'invoiceTerms', l: 'Default invoice terms' }, { k: 'payMethods', l: 'Payment methods (printed on invoices)' }];
  CUR.after = () => {
    const form = $('#setForm');
    form.onsubmit = async e => { e.preventDefault(); const o = readForm(form, F); for (const k of ['wmi', 'wmiSuffix', 'plantCode']) o[k] = String(o[k] || '').toUpperCase(); Object.assign(S.settings, o); await save(); applyAccent(); toast('Settings saved'); route(); };
    $('#logoBtn').onclick = async () => { const im = await pickImage(false); if (!im.length) return; if (st.logoPhoto) await delPhoto(st.logoPhoto); st.logoPhoto = await putPhoto(im[0]); await save(); toast('Logo updated'); route(); };
    $('#fillBtn').onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
      i.onchange = async () => {
        try {
          const r = applyPrivateFill(JSON.parse(await i.files[0].text())); await save();
          LAST_FILL = `Filled ${r.filled} field${r.filled === 1 ? '' : 's'}. Kept ${r.kept} you already had.`; toast(LAST_FILL, 4000); route();
        } catch (e) { toast('Load failed: ' + e.message, 4000); }
      };
      i.click();
    };
    const rl = $('#logoRm'); if (rl) rl.onclick = async () => { await delPhoto(st.logoPhoto); st.logoPhoto = null; await save(); route(); };
  };
  return `<div class="card"><div class="row">${logoHTML()}<div><b>Logo</b><div class="small muted">${st.logoPhoto ? 'Your logo shows on Home and printed quotes.' : 'Placeholder “TH” in use — add your approved logo.'}</div></div></div>
  <div class="btns"><button class="btn sec" id="logoBtn">📷 ${st.logoPhoto ? 'Replace' : 'Add'} logo</button>${st.logoPhoto ? '<button class="btn danger" id="logoRm">Remove</button>' : ''}</div></div>
  <form id="setForm" class="card" novalidate>${F.map(f => fieldHTML(f, st[f.k])).join('')}<div class="btns"><button class="btn" type="submit">Save settings</button></div></form>
  <div class="card"><b>Private info file</b><div class="small muted">Fills only blank business fields and key contacts. Never changes the EIN, records or anything you already typed.</div><div class="btns"><button class="btn sec block" id="fillBtn">📂 Load private info file</button></div>${LAST_FILL ? `<div class="alert info small" id="fillSum">${esc(LAST_FILL)}</div>` : ''}</div>
  <p class="small muted center">Third Hand Fab &amp; Welding · test build 1.0.0<br>After an app update: close and reopen the app.</p>`;
}

/* ---------- Backup & restore ---------- */
function pageBackup() {
  setTop('Backup & restore', '#/office'); const st = S.settings;
  CUR.after = () => {
    $('#bJson').onclick = async () => {
      const data = { app: 'Third Hand Fab & Welding', version: 1, exported: new Date().toISOString(), state: { ...S, photos: undefined }, photos: await allPhotos() };
      download(`third-hand-backup-${today()}.json`, JSON.stringify(data), 'application/json'); S.settings.lastBackup = new Date().toISOString(); await save(); toast('Backup downloaded'); route();
    };
    $('#bSales').onclick = () => { const rows = [['Serial', 'VIN', 'Buyer', 'Sale date', 'Price', 'Tax rate %', 'Sales tax', 'Total', 'MCO #', 'Bill of sale', 'Notes', 'History'], ...S.sales.map(s => { const v = S.vins.find(x => x.id === s.vinId) || {}; const c = saleCalc(s); return [pad3(v.serial || 0), v.vin, s.buyerName || custName(s.customerId), s.saleDate, c.price.toFixed(2), s.taxRate, c.tax.toFixed(2), c.total.toFixed(2), s.mco, s.billOfSale ? 'yes' : 'no', s.notes, (s.history || []).map(h => h.when + ': ' + h.what).join(' | ')]; })]; download(`sales-${today()}.csv`, toCSV(rows), 'text/csv'); };
    $('#bVin').onclick = exportLedgerCSV;
    $('#bEst').onclick = () => download(`estimates-${today()}.csv`, toCSV([['Job title', 'Customer', 'Date', 'Status', 'Subtotal', 'Tax', 'Total', 'Invoice #', 'Invoice date', 'Terms', 'Paid', 'Balance due'], ...S.estimates.map(e => { const c = estCalc(e); const paid = r2(num(e.invoicePaid)); return [e.title, custName(e.customerId), e.date, e.status, c.subtotal.toFixed(2), c.tax.toFixed(2), c.total.toFixed(2), e.invoiceNo || '', e.invoiceDate || '', e.invoiceNo ? (e.invoiceTerms || '') : '', e.invoiceNo ? paid.toFixed(2) : '', e.invoiceNo ? r2(c.total - paid).toFixed(2) : '']; })]), 'text/csv');
    $('#bCust').onclick = () => download(`customers-${today()}.csv`, toCSV([['Name', 'Phone', 'Email', 'Address', 'Notes', 'Added'], ...S.customers.map(c => [c.name, c.phone, c.email, c.address, c.notes, c.created])]), 'text/csv');
    $('#bRestore').onclick = () => {
      const i = document.createElement('input'); i.type = 'file'; i.accept = 'application/json,.json';
      i.onchange = async () => {
        try {
          const data = JSON.parse(await i.files[0].text());
          if (data.version !== 1 || !data.state || !Array.isArray(data.state.customers)) throw new Error('Not a version-1 Third Hand backup');
          if (!await confirmBox(`Restore backup from ${data.exported ? new Date(data.exported).toLocaleString() : 'file'}? This REPLACES every record on this phone.`, 'Replace & restore')) return;
          const keepSerial = S.settings.nextSerial; const keepInv = S.settings.nextInvoice || 1;
          await clearPhotos(); S = data.state; migrate(); S.settings.nextSerial = Math.max(S.settings.nextSerial, keepSerial); S.settings.nextInvoice = Math.max(S.settings.nextInvoice, keepInv);
          for (const [id, d] of Object.entries(data.photos || {})) { if (DB) await idbDo('photos', 'readwrite', s => s.put(d, id)); else S.photos[id] = d; }
          await save(); applyAccent(); toast('Backup restored'); go('#/home');
        } catch (e) { toast('Restore failed: ' + e.message, 4000); }
      };
      i.click();
    };
    $('#bReset').onclick = async () => { if (!await confirmBox('Erase everything on this phone and reload the starting records from Nov 14? Your business info in Settings is kept. Make a backup first.', 'Erase & reset')) return; const keepInv = S.settings.nextInvoice || 1; const keepBiz = Object.fromEntries(BIZ_KEYS.filter(k => S.settings[k] != null).map(k => [k, S.settings[k]])); await clearPhotos(); S = structuredClone(TH.SEED); Object.assign(S.settings, keepBiz); migrate(); S.settings.nextInvoice = Math.max(S.settings.nextInvoice, keepInv); await save(); applyAccent(); toast('Reset done'); go('#/home'); };
  };
  return `<div class="card"><b>Back up now</b><div class="small muted">Last backup: ${st.lastBackup ? esc(new Date(st.lastBackup).toLocaleString()) : 'never on this phone'}. Weekly reminder: Sundays.</div>
   <div class="btns"><button class="btn block" id="bJson">💾 Full backup (JSON, includes photos)</button></div>
   <div class="small muted">Save the file to your Google Drive so it's off the phone. It includes your private business info and EIN, so don't email or text it.</div></div>
  <div class="card"><b>Spreadsheet exports (CSV)</b><div class="btns"><button class="btn sec" id="bSales">Sales</button><button class="btn sec" id="bVin">VIN ledger</button><button class="btn sec" id="bCust">Customers</button><button class="btn sec" id="bEst">Estimates</button></div></div>
  <div class="card"><b>Restore</b><div class="small muted">Pick a version-1 backup file. Restoring replaces all current records. The VIN serial counter never goes backwards.</div><div class="btns"><button class="btn sec block" id="bRestore">📂 Restore from backup file</button></div></div>
  <div class="card"><b>Start over</b><div class="btns"><button class="btn danger block" id="bReset">Erase & reload starting records</button></div></div>`;
}

/* ---------- boot ---------- */
(async function init() {
  await loadState(); applyAccent();
  if (!location.hash) location.replace('#/home');
  route();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
