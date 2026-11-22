// =====================================================
//  Burger Oila — Kassa tizimi
//  Ma'lumotlar brauzerning IndexedDB'sida saqlanadi
// =====================================================

// ---------- Yordamchi funksiyalar ----------
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => (n < 0 ? '−' : '') + String(Math.round(Math.abs(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const som = n => fmt(n) + " so'm";
const onlyNum = v => +String(v).replace(/\D/g, '') || 0;
const dayKey = (d = new Date()) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const hm = ts => { const d = new Date(ts); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
const dmy = key => key.split('-').reverse().join('.');
const dt = ts => dmy(dayKey(new Date(ts))) + ' ' + hm(ts);
const sumBy = (arr, f) => arr.reduce((a, x) => a + f(x), 0);
const keyToDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (k, n) => { const d = keyToDate(k); d.setDate(d.getDate() + n); return dayKey(d); };
const WD = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

const PAY = { naqd: 'Naqd', karta: 'Karta', click: 'Click / Payme' };
const OT = { zal: 'Shu yerda', olib: 'Olib ketish', yetkaz: 'Yetkazish' };
const DEFAULT_CATS = ['Burgerlar', 'Lavash va hot-dog', 'Gazaklar', 'Ichimliklar', 'Kombo'];
const FAV = '★ Sevimlilar';
const NOTE_TAGS = ['Piyozsiz', 'Achchiq', 'Pishloqsiz', 'Mayonezsiz', 'Ketchupsiz', 'Ko\'proq sous', 'Tezroq'];
const EXP_CATS = ['Go\'sht', 'Non', 'Sabzavot', 'Ichimliklar', 'Yog\'', 'Qadoq', 'Gaz / svet / suv', 'Ijara', 'Ish haqi', 'Transport', 'Boshqa'];

// =====================================================
//  SAQLASH: IndexedDB (katta hajm, yillar davomida yetadi)
//  Ma'lumot xotirada turadi, har o'zgarishda IndexedDB'ga yoziladi.
//  IndexedDB ishlamasa, localStorage'ga qaytadi.
// =====================================================
const KEYS = ['bo_menu', 'bo_sales', 'bo_shifts', 'bo_exp', 'bo_set', 'bo_hold', 'bo_theme', 'bo_lastBackup'];

const DB = {
  mem: {},
  idb: null,

  // Ochish, eski localStorage ma'lumotini ko'chirish va hammasini xotiraga yuklash
  async init() {
    try {
      this.idb = await new Promise((res, rej) => {
        const r = indexedDB.open('burger-oila', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const all = await this._readAll();
      if (!all.bo_migrated) {
        // Birinchi ishga tushish: localStorage'dagi eski ma'lumotni ko'chiramiz
        for (const k of KEYS) {
          if (all[k] !== undefined) continue;
          try { const v = JSON.parse(localStorage.getItem(k)); if (v != null) { all[k] = v; await this._put(k, v); } } catch (e) {}
        }
        await this._put('bo_migrated', true);
      }
      this.mem = all;
    } catch (e) {
      console.warn('IndexedDB ishlamadi, localStorage ishlatiladi', e);
      this.idb = null;
      for (const k of KEYS) { try { const v = JSON.parse(localStorage.getItem(k)); if (v != null) this.mem[k] = v; } catch (err) {} }
    }
    // Brauzerdan ma'lumotni o'chirmaslikni so'raymiz
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  },

  _readAll() {
    return new Promise((res, rej) => {
      const out = {};
      const tx = this.idb.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').openCursor();
      req.onsuccess = () => { const c = req.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
      req.onerror = () => rej(req.error);
    });
  },

  _put(key, val) {
    return new Promise((res, rej) => {
      const tx = this.idb.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
      tx.onabort = () => rej(tx.error);
    });
  },

  get(key, def) { return this.mem[key] ?? def; },

  set(key, val) {
    this.mem[key] = val;
    if (this.idb) {
      // structuredClone: keyin o'zgartirilsa ham yozilayotgan nusxa buzilmaydi
      this._put(key, structuredClone(val)).catch(e => alertMsg('Saqlab bo\'lmadi: ' + (e && e.name === 'QuotaExceededError' ? 'xotira to\'lgan' : 'xatolik')));
      return true;
    }
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { alertMsg('Saqlab bo\'lmadi: xotira to\'lgan bo\'lishi mumkin'); return false; }
  },

  // Qancha joy ishlatilgani (MB)
  async usage() {
    try { const e = await navigator.storage.estimate(); return { used: e.usage / 1048576, quota: e.quota / 1048576 }; }
    catch (err) { return null; }
  }
};

// ---------- Chek sozlamalari (standart) ----------
const DEFAULT_SET = {
  name: 'Burger Oila',
  addr: '',
  phone: '',
  foot: 'Xaridingiz uchun rahmat!\nYoqimli ishtaha!',
  width: '80',
  autoPrint: false
};

// ---------- Tungi rejim ----------
let theme = 'light';
function applyTheme() {
  document.documentElement.dataset.theme = theme;
  const b = $('#themeBtn'); if (b) b.textContent = theme === 'dark' ? 'Kunduzgi rejim' : 'Tungi rejim';
}

// ---------- Holat (DB.init() dan keyin loadState() to'ldiradi) ----------
let menu = [];                          // [{id, code, n, c, p, cost, fav}]
let sales = [];                         // [{id, no, day, ts, items, total, pay, shiftId, note, status ...}]
let shifts = [];                        // [{id, open, openCash, close, closeCash}]
let expenses = [];                      // [{id, ts, day, shiftId, amount, cat, note, src}]
let settings = { ...DEFAULT_SET };
let held = [];                          // kutishdagi buyurtmalar [{id, ts, cart, otype, note, disc}]
let today = dayKey();
let cart = [];                          // [{id, n, p, cost, q}]
const defaultCat = () => menu.some(m => m.fav) ? FAV : 'Hammasi';
let cat = 'Hammasi';
let otype = 'zal';
let pay = 'naqd';
let draft = null;                       // menyu tahrirlash nusxasi
let printable = '';                     // oynada ko'rsatilgan chek / hisobot
let rMode = 'day';                      // 'day' — kunlik, 'range' — davr
let rFrom = today, rTo = today;         // hisobot oralig'i
let query = '';                         // qidiruv matni

function loadState() {
  theme = DB.get('bo_theme', 'light');
  menu = DB.get('bo_menu', []);
  sales = DB.get('bo_sales', []);
  shifts = DB.get('bo_shifts', []);
  expenses = DB.get('bo_exp', []);
  settings = { ...DEFAULT_SET, ...DB.get('bo_set', {}) };
  held = DB.get('bo_hold', []);
  // Kodsiz taomlarga avtomatik raqam beramiz
  const used = new Set(menu.map(m => +m.code).filter(Boolean));
  let next = 1, changed = false;
  menu.forEach(m => { if (!m.code) { while (used.has(next)) next++; m.code = next; used.add(next); changed = true; } });
  if (changed) DB.set('bo_menu', menu);
  cat = defaultCat();
}

function alertMsg(t) { const el = $('#change'); if (el) { el.textContent = t; el.className = 'change bad'; } }

// ---------- Hisob-kitob ----------
const okSales = list => list.filter(s => s.status !== 'cx');
const daySales = day => sales.filter(s => s.day === day);
const nextNo = () => daySales(today).reduce((m, s) => Math.max(m, s.no || 0), 0) + 1;
const subtotal = () => cart.reduce((a, l) => a + l.p * l.q, 0);
const total = () => Math.round(subtotal() * (1 - (+$('#disc').value) / 100) / 100) * 100;

const currentShift = () => shifts.find(s => !s.close) || null;

// Yalpi foyda: sotuv narxi (chegirma bilan) minus tannarx.
// Faqat tannarxi yozilgan taomlar hisoblanadi; yozilmaganlari "miss" da sanaladi.
function grossOf(list) {
  let rev = 0, cost = 0, miss = 0;
  list.forEach(s => s.items.forEach(i => {
    if (i.cost > 0) { rev += i.p * i.q * (1 - (s.disc || 0) / 100); cost += i.cost * i.q; }
    else miss += i.q;
  }));
  return { rev, cost, profit: rev - cost, miss, pct: rev ? Math.round((rev - cost) / rev * 100) : 0 };
}

// Smena bo'yicha hisob: savdo, xarajat, kassada bo'lishi kerak bo'lgan naqd
function shiftCalc(sh) {
  const ss = okSales(sales.filter(s => s.shiftId === sh.id));
  const ex = expenses.filter(e => e.shiftId === sh.id);
  const byPay = {};
  Object.keys(PAY).forEach(k => byPay[k] = sumBy(ss.filter(s => s.pay === k), s => s.total));
  const revenue = sumBy(ss, s => s.total);
  const expAll = sumBy(ex, e => e.amount);
  const expCash = sumBy(ex.filter(e => e.src === 'kassa'), e => e.amount);
  const expected = sh.openCash + byPay.naqd - expCash;
  return { ss, ex, byPay, revenue, expAll, expCash, expected, profit: revenue - expAll };
}

// =====================================================
//  KASSA
// =====================================================
function renderMenu() {
  const cats = [...(menu.some(m => m.fav) ? [FAV] : []), 'Hammasi', ...new Set(menu.map(m => m.c || 'Boshqa'))];
  if (!cats.includes(cat)) cat = defaultCat();

  $('#chips').innerHTML = menu.length
    ? cats.map(c => `<button type="button" data-c="${esc(c)}" class="${c === FAV ? 'favchip ' : ''}${c === cat && !query.trim() ? 'active' : ''}">${esc(c)}</button>`).join('')
    : '';

  const list = filteredMenu();
  $('#grid').innerHTML = list.length
    ? list.map(m => {
        const l = cart.find(x => x.id === m.id);
        return `<button type="button" class="item" data-id="${esc(m.id)}">
          ${l ? `<span class="badge">${l.q}</span>` : ''}${m.code ? `<span class="code">${m.code}</span>` : ''}
          <b>${highlight(m.n)}</b><span>${som(m.p)}</span></button>`;
      }).join('')
    : !menu.length
      ? `<div class="empty">Menyu hali bo'sh. <a href="#menyu">Menyu bo'limida</a> taomlarni qo'shing.</div>`
      : `<div class="empty">${codeQuery() ? `${codeQuery().code}-kodli taom yo'q.` : `“${esc(query)}” bo'yicha hech narsa topilmadi.`}</div>`;
}

// Kod bo'yicha qidiruv: "7" — 7-taom, "7*3" — 7-taomdan 3 ta
const codeQuery = () => { const m = query.trim().match(/^(\d+)(?:\s*[*xX]\s*(\d+))?$/); return m ? { code: +m[1], qty: +(m[2] || 1) } : null; };

// Qidiruv: matn yozilgan bo'lsa barcha bo'limlardan qidiradi
function filteredMenu() {
  const q = query.trim().toLowerCase();
  const cq = codeQuery();
  if (cq) return menu.filter(m => +m.code === cq.code);
  if (q) return menu.filter(m => m.n.toLowerCase().includes(q) || (m.c || '').toLowerCase().includes(q));
  if (cat === FAV) return menu.filter(m => m.fav);
  return menu.filter(m => cat === 'Hammasi' || (m.c || 'Boshqa') === cat);
}

function highlight(name) {
  const q = query.trim();
  if (!q) return esc(name);
  const i = name.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return esc(name);
  return esc(name.slice(0, i)) + '<mark>' + esc(name.slice(i, i + q.length)) + '</mark>' + esc(name.slice(i + q.length));
}

function renderCart() {
  $('#ordno').textContent = 'Buyurtma #' + nextNo();
  $('#noShift').classList.toggle('on', !currentShift());

  $('#lines').innerHTML = cart.length
    ? cart.map((l, i) => `
      <div class="line">
        <span class="nm">${esc(l.n)}</span><span class="lt">${som(l.p * l.q)}</span>
        <div class="qty">
          <button type="button" data-d="-1" data-i="${i}">−</button>
          <output>${l.q}</output>
          <button type="button" data-d="1" data-i="${i}">+</button>
          <button type="button" class="x" data-x="${i}">O'chirish</button>
        </div>
      </div>`).join('')
    : '<div class="empty">Taomni tanlang — u shu yerda chiqadi.</div>';

  renderTags();
  renderHolds();
  $('#holdbtn').disabled = !cart.length;
  $('#subt').textContent = som(subtotal());
  $('#tot').textContent = som(total());

  $$('#otype button').forEach(b => b.classList.toggle('active', b.dataset.v === otype));
  $$('#paym button').forEach(b => b.classList.toggle('active', b.dataset.v === pay));
  $('#cashbox').style.display = pay === 'naqd' ? '' : 'none';

  const t = total();
  const quick = t ? [t, ...[50000, 100000, 200000].filter(v => v > t)].slice(0, 4) : [];
  $('#quick').innerHTML = quick.map((v, i) => `<button type="button" data-g="${v}">${i ? fmt(v) : 'Aniq summa'}</button>`).join('');

  renderChange();
}

function renderChange() {
  const t = total(), g = onlyNum($('#given').value), el = $('#change');
  let ok = cart.length > 0 && !!currentShift();
  el.textContent = ''; el.className = 'change';
  if (pay === 'naqd' && cart.length && g) {
    if (g < t) { el.textContent = 'Yetmaydi: ' + som(t - g); el.className = 'change bad'; ok = false; }
    else el.textContent = 'Qaytim: ' + som(g - t);
  }
  $('#paybtn').disabled = !ok;
}

// ---------- Buyurtma izohi ----------
const noteParts = () => $('#onote').value.split(',').map(x => x.trim()).filter(Boolean);

function renderTags() {
  const parts = noteParts().map(x => x.toLowerCase());
  $('#tags').innerHTML = NOTE_TAGS.map(t =>
    `<button type="button" data-t="${esc(t)}" class="${parts.includes(t.toLowerCase()) ? 'on' : ''}">${esc(t)}</button>`).join('');
}

function toggleTag(t) {
  const parts = noteParts();
  const i = parts.findIndex(x => x.toLowerCase() === t.toLowerCase());
  if (i >= 0) parts.splice(i, 1); else parts.push(t);
  $('#onote').value = parts.join(', ');
  renderTags();
}

// ---------- Kutishga qo'yish ----------
function holdOrder() {
  if (!cart.length) return;
  held.push({ id: 'h' + Date.now(), ts: Date.now(), cart: cart.map(l => ({ ...l })), otype, note: $('#onote').value.trim(), disc: $('#disc').value });
  DB.set('bo_hold', held);
  cart = []; $('#given').value = ''; $('#onote').value = ''; $('#disc').value = '0';
  renderMenu(); renderCart();
}

// Kutishdagi buyurtmani qaytarish. Savatda boshqa buyurtma bo'lsa, u kutishga o'tadi.
function resumeHold(id) {
  const h = held.find(x => x.id === id); if (!h) return;
  held = held.filter(x => x.id !== id);
  if (cart.length) held.push({ id: 'h' + Date.now(), ts: Date.now(), cart: cart.map(l => ({ ...l })), otype, note: $('#onote').value.trim(), disc: $('#disc').value });
  DB.set('bo_hold', held);
  cart = h.cart; otype = h.otype || 'zal'; $('#onote').value = h.note || ''; $('#disc').value = h.disc || '0'; $('#given').value = '';
  renderMenu(); renderCart();
}

function renderHolds() {
  $('#holds').innerHTML = held.length
    ? `<div class="htitle">Kutishda: ${held.length} ta</div>` + held.map(h => {
        const sum = h.cart.reduce((a, l) => a + l.p * l.q, 0);
        const cnt = h.cart.reduce((a, l) => a + l.q, 0);
        return `<button type="button" class="hold" data-h="${esc(h.id)}">
          <span>${hm(h.ts)} · ${cnt} ta taom${h.note ? `<small>${esc(h.note)}</small>` : ''}</span><b>${som(sum)}</b></button>`;
      }).join('')
    : '';
}

function addItem(id, qty = 1) {
  const m = menu.find(x => x.id === id);
  if (!m) return;
  const l = cart.find(x => x.id === id);
  if (l) l.q += qty; else cart.push({ id: m.id, n: m.n, p: +m.p, cost: +m.cost || 0, q: qty });
  renderMenu(); renderCart();
}

function checkout() {
  const sh = currentShift();
  if (!cart.length || !sh) return;
  const t = total(), g = onlyNum($('#given').value);
  if (pay === 'naqd' && g && g < t) return;

  const sale = {
    id: 's' + Date.now(),
    no: nextNo(),
    day: today,
    ts: Date.now(),
    shiftId: sh.id,
    items: cart.map(l => ({ n: l.n, p: l.p, q: l.q, cost: l.cost || 0 })),   // tannarx sotuv paytidagi qiymat bilan saqlanadi
    sub: subtotal(),
    disc: +$('#disc').value,
    total: t,
    pay,
    type: otype,
    given: pay === 'naqd' ? (g || t) : t,
    change: pay === 'naqd' && g ? g - t : 0,
    note: $('#onote').value.trim(),
    status: 'ok'
  };

  sales.push(sale);
  if (!DB.set('bo_sales', sales)) { sales.pop(); return; }

  showModal(receiptHTML(sale));
  if (settings.autoPrint) printHTML(receiptHTML(sale));
  cart = []; $('#given').value = ''; $('#disc').value = '0'; $('#onote').value = '';
  query = ''; $('#q').value = ''; cat = defaultCat();
  renderMenu(); renderCart(); renderHeader();
}

// ---------- Chek va oyna ----------
// Chek sarlavhasi: nom, manzil, telefon (sozlamalardan)
function headHTML(st = settings) {
  return `<h3>${esc(st.name || 'Burger Oila')}</h3>
    ${st.addr ? `<div class="info">${esc(st.addr)}</div>` : ''}
    ${st.phone ? `<div class="info">Tel: ${esc(st.phone)}</div>` : ''}`;
}
function footHTML(st = settings) {
  return st.foot ? `<hr><div class="c">${esc(st.foot).replace(/\n/g, '<br>')}</div>` : '';
}

function receiptHTML(s, st = settings) {
  return `${headHTML(st)}<hr>
    <div class="c">Buyurtma #${s.no} · ${OT[s.type]}</div>
    <div class="c">${dmy(s.day)} ${hm(s.ts)}</div><hr>
    ${s.note ? `<div class="big">Izoh: ${esc(s.note)}</div><hr>` : ''}
    ${s.items.map(i => `<div>${esc(i.n)}</div><div class="r"><span>${i.q} × ${fmt(i.p)}</span><span>${fmt(i.p * i.q)}</span></div>`).join('')}
    <hr>
    ${s.disc ? `<div class="r"><span>Chegirma ${s.disc}%</span><span>−${fmt(s.sub - s.total)}</span></div>` : ''}
    <div class="r big"><span>JAMI</span><span>${som(s.total)}</span></div>
    <div class="r"><span>To'lov</span><span>${PAY[s.pay]}</span></div>
    ${s.pay === 'naqd' ? `<div class="r"><span>Berildi</span><span>${fmt(s.given)}</span></div><div class="r"><span>Qaytim</span><span>${fmt(s.change)}</span></div>` : ''}
    ${footHTML(st)}`;
}

function showModal(html) {
  printable = html;
  $('#rcpt').innerHTML = html;
  $('#modal').classList.add('on');
  $('#rnew').focus();
}
function closeModal() { $('#modal').classList.remove('on'); }

function printHTML(html) {
  $('#printArea').innerHTML = html;
  $('#printArea').className = settings.width === '58' ? 'w58' : '';
  window.print();
}

// =====================================================
//  SMENA VA XARAJATLAR
// =====================================================
function renderHeader() {
  const sh = currentShift();
  $('#shiftStat').innerHTML = sh
    ? `<a class="pill" href="#smena"><i></i>Smena ochiq · ${hm(sh.open)} dan</a>`
    : `<a class="pill off" href="#smena"><i></i>Smena yopiq</a>`;
}

function openShift() {
  if (currentShift()) return;
  const sh = { id: 'sh' + Date.now(), open: Date.now(), openCash: onlyNum($('#openCash').value), close: null, closeCash: null };
  shifts.push(sh);
  if (!DB.set('bo_shifts', shifts)) { shifts.pop(); return; }
  $('#openCash').value = '';
  renderAll();
  location.hash = '#kassa';
}

function addExpense() {
  const sh = currentShift(); if (!sh) return;
  const amount = onlyNum($('#exAmount').value);
  const catName = $('#exCat').value.trim();
  if (!amount) { $('#exMsg').textContent = 'Summani yozing.'; return; }
  if (!catName) { $('#exMsg').textContent = 'Nima uchunligini yozing.'; return; }
  const ex = {
    id: 'e' + Date.now(), ts: Date.now(), day: today, shiftId: sh.id,
    amount, cat: catName, note: $('#exNote').value.trim(), src: $('#exSrc').value
  };
  expenses.push(ex);
  if (!DB.set('bo_exp', expenses)) { expenses.pop(); return; }
  $('#exAmount').value = ''; $('#exNote').value = ''; $('#exCat').value = '';
  $('#exMsg').textContent = 'Qo\'shildi ✓';
  setTimeout(() => $('#exMsg').textContent = '', 1500);
  renderShift(); renderReport();
}

let armedEx = null;
function deleteExpense(id, btn) {
  if (armedEx !== id) {
    armedEx = id; btn.textContent = 'Rostdanmi?';
    setTimeout(() => { if (armedEx === id) { armedEx = null; btn.textContent = 'O\'chirish'; } }, 3000);
    return;
  }
  armedEx = null;
  expenses = expenses.filter(e => e.id !== id);
  DB.set('bo_exp', expenses);
  renderShift(); renderReport();
}

function renderCloseDiff() {
  const sh = currentShift(); if (!sh) return;
  const el = $('#closeDiff');
  if (!$('#closeCash').value) { el.textContent = ''; el.className = 'diff'; return; }
  const d = onlyNum($('#closeCash').value) - shiftCalc(sh).expected;
  if (d === 0) { el.textContent = 'Kassa to\'g\'ri ✓'; el.className = 'diff plus'; }
  else if (d > 0) { el.textContent = 'Ortiqcha: ' + som(d); el.className = 'diff plus'; }
  else { el.textContent = 'Kamomad: ' + som(-d); el.className = 'diff minus'; }
}

let armedClose = false;
function closeShift() {
  const sh = currentShift(); if (!sh) return;
  if (!$('#closeCash').value) { $('#closeDiff').textContent = 'Avval kassadagi pulni yozing.'; $('#closeDiff').className = 'diff minus'; return; }
  if (!armedClose) {
    armedClose = true; $('#closeBtn').textContent = 'Tasdiqlash uchun yana bosing';
    setTimeout(() => { armedClose = false; $('#closeBtn').textContent = 'Smenani yopish'; }, 3000);
    return;
  }
  armedClose = false; $('#closeBtn').textContent = 'Smenani yopish';
  sh.close = Date.now();
  sh.closeCash = onlyNum($('#closeCash').value);
  DB.set('bo_shifts', shifts);
  $('#closeCash').value = '';
  renderAll();
  showModal(shiftReportHTML(sh));
}

function shiftReportHTML(sh) {
  const c = shiftCalc(sh);
  const diff = sh.closeCash != null ? sh.closeCash - c.expected : null;
  return `${headHTML()}<hr><div class="c">SMENA HISOBOTI</div>
    <div class="c">${dt(sh.open)} — ${sh.close ? hm(sh.close) : 'ochiq'}</div><hr>
    <div class="r"><span>Buyurtmalar</span><span>${c.ss.length}</span></div>
    ${Object.keys(PAY).map(k => `<div class="r"><span>${PAY[k]}</span><span>${fmt(c.byPay[k])}</span></div>`).join('')}
    <div class="r big"><span>TUSHUM</span><span>${fmt(c.revenue)}</span></div><hr>
    ${c.ex.map(e => `<div class="r"><span>${esc(e.cat)}${e.src === 'kassa' ? '' : ' *'}</span><span>−${fmt(e.amount)}</span></div>`).join('') || '<div>Xarajat yo\'q</div>'}
    <div class="r big"><span>XARAJAT</span><span>−${fmt(c.expAll)}</span></div>
    <div class="r big"><span>SOF FOYDA</span><span>${fmt(c.profit)}</span></div><hr>
    <div class="r"><span>Boshlang'ich naqd</span><span>${fmt(sh.openCash)}</span></div>
    <div class="r"><span>+ Naqd savdo</span><span>${fmt(c.byPay.naqd)}</span></div>
    <div class="r"><span>− Kassadan xarajat</span><span>${fmt(c.expCash)}</span></div>
    <div class="r big"><span>Bo'lishi kerak</span><span>${fmt(c.expected)}</span></div>
    ${sh.closeCash != null ? `<div class="r"><span>Sanaldi</span><span>${fmt(sh.closeCash)}</span></div>
    <div class="r big"><span>${diff === 0 ? 'Farq yo\'q' : diff > 0 ? 'Ortiqcha' : 'Kamomad'}</span><span>${fmt(Math.abs(diff))}</span></div>` : ''}
    ${c.ex.some(e => e.src !== 'kassa') ? '<hr><div>* kassadan tashqari to\'langan</div>' : ''}`;
}

function renderShift() {
  const sh = currentShift();
  $('#shiftClosed').style.display = sh ? 'none' : '';
  $('#shiftOpen').style.display = sh ? '' : 'none';
  $('#exCats').innerHTML = [...new Set([...EXP_CATS, ...expenses.map(e => e.cat)])].map(c => `<option value="${esc(c)}">`).join('');

  if (sh) {
    const c = shiftCalc(sh);
    $('#shiftSub').textContent = `${dt(sh.open)} da ochilgan · ${c.ss.length} ta buyurtma`;
    $('#shiftKpis').innerHTML = [
      ['Tushum', som(c.revenue)],
      ['Xarajatlar', som(c.expAll)],
      ['Sof foyda', som(c.profit)],
      ['Kassada bo\'lishi kerak', som(c.expected), 'main']
    ].map(k => `<div class="kpi ${k[2] || ''}"><small>${k[0]}</small><b class="${k[2] ? '' : (k[0] === 'Sof foyda' && c.profit < 0 ? 'neg' : '')}">${k[1]}</b></div>`).join('');

    const rows = [...c.ex].sort((a, b) => b.ts - a.ts);
    $('#exTable').innerHTML = `<thead><tr><th>Vaqt</th><th>Nima uchun</th><th>Izoh</th><th>Qayerdan</th><th class="n">Summa</th><th></th></tr></thead><tbody>` +
      (rows.length ? rows.map(e => `<tr><td>${hm(e.ts)}</td><td>${esc(e.cat)}</td><td>${esc(e.note)}</td><td>${e.src === 'kassa' ? 'Kassadan' : 'Boshqa'}</td><td class="n">${som(e.amount)}</td><td><button class="sm" type="button" data-dex="${esc(e.id)}">O'chirish</button></td></tr>`).join('')
        : '<tr><td colspan="6" class="note">Hali xarajat yo\'q</td></tr>') + '</tbody>';
    renderCloseDiff();
  }

  const hist = shifts.filter(s => s.close).sort((a, b) => b.open - a.open).slice(0, 30);
  $('#shiftHist').innerHTML = `<thead><tr><th>Ochilgan</th><th>Yopilgan</th><th class="n">Tushum</th><th class="n">Xarajat</th><th class="n">Sof foyda</th><th class="n">Kassa farqi</th><th></th></tr></thead><tbody>` +
    (hist.length ? hist.map(s => {
      const c = shiftCalc(s), d = s.closeCash - c.expected;
      return `<tr><td>${dt(s.open)}</td><td>${dt(s.close)}</td><td class="n">${som(c.revenue)}</td><td class="n">${som(c.expAll)}</td>
        <td class="n ${c.profit < 0 ? 'neg' : ''}">${som(c.profit)}</td><td class="n ${d < 0 ? 'neg' : ''}">${d === 0 ? '0' : (d > 0 ? '+' : '') + fmt(d)}</td>
        <td><button class="sm" type="button" data-shr="${esc(s.id)}">Hisobot</button></td></tr>`;
    }).join('') : '<tr><td colspan="7" class="note">Hali yopilgan smena yo\'q</td></tr>') + '</tbody>';
}

// =====================================================
//  HISOBOT (kunlik va davr)
// =====================================================
const inRange = day => day >= rFrom && day <= rTo;
const rangeSales = () => sales.filter(s => inRange(s.day));
const rangeExp = () => expenses.filter(e => inRange(e.day));

// Oraliqdagi barcha kunlar (bugundan keyingilarini olmaymiz)
function rangeDays() {
  const out = [];
  for (let k = rFrom; k <= rTo && k <= today && out.length < 400; k = addDays(k, 1)) out.push(k);
  return out;
}

// Tez tanlov: bugun, kecha, shu hafta, o'tgan hafta, shu oy, o'tgan oy
function quickRange(q) {
  const t = keyToDate(today);
  const monday = addDays(today, -((t.getDay() + 6) % 7));
  if (q === 'today') { rFrom = rTo = today; }
  if (q === 'yesterday') { rFrom = rTo = addDays(today, -1); }
  if (q === 'week') { rFrom = monday; rTo = addDays(monday, 6); }
  if (q === 'lastweek') { rFrom = addDays(monday, -7); rTo = addDays(monday, -1); }
  if (q === 'month') { rFrom = dayKey(new Date(t.getFullYear(), t.getMonth(), 1)); rTo = dayKey(new Date(t.getFullYear(), t.getMonth() + 1, 0)); }
  if (q === 'lastmonth') { rFrom = dayKey(new Date(t.getFullYear(), t.getMonth() - 1, 1)); rTo = dayKey(new Date(t.getFullYear(), t.getMonth(), 0)); }
  renderReport();
}

function rangeTitle() {
  if (rFrom === rTo) return rFrom === today ? 'Bugungi savdo' : dmy(rFrom) + ' savdosi';
  return dmy(rFrom) + ' — ' + dmy(rTo);
}

// Kunlik jami (grafik va Excel uchun)
function dailyTotals() {
  return rangeDays().map(k => {
    const ok = okSales(sales.filter(s => s.day === k));
    const row = { day: k, count: ok.length, rev: sumBy(ok, s => s.total), exp: sumBy(expenses.filter(e => e.day === k), e => e.amount) };
    Object.keys(PAY).forEach(p => row[p] = sumBy(ok.filter(s => s.pay === p), s => s.total));
    row.profit = row.rev - row.exp;
    return row;
  });
}

function renderReport() {
  if (rFrom > rTo) [rFrom, rTo] = [rTo, rFrom];
  const single = rFrom === rTo;
  const list = rangeSales();
  const ok = okSales(list);
  const sum = sumBy(ok, s => s.total);
  const ex = rangeExp();
  const exSum = sumBy(ex, e => e.amount);
  const cx = list.length - ok.length;

  $$('#rmode button').forEach(b => b.classList.toggle('active', b.dataset.v === rMode));
  $('#rDayBar').style.display = rMode === 'day' ? '' : 'none';
  $('#rRangeBar').style.display = rMode === 'range' ? '' : 'none';
  $('#rday').value = rFrom; $('#rfrom').value = rFrom; $('#rto').value = rTo;

  $('#rtitle').textContent = rangeTitle();
  $('#rsub').textContent = ok.length
    ? `${ok.length} ta buyurtma${single ? `, oxirgisi ${hm(Math.max(...ok.map(s => s.ts)))} da` : ''}${cx ? `, ${cx} ta bekor qilingan` : ''}`
    : 'Bu davrda savdo yo\'q.';

  const activeDays = new Set(ok.map(s => s.day)).size;
  const g = grossOf(ok);
  const gNote = !g.rev ? 'tannarx yozilmagan' : `marja ${g.pct}%${g.miss ? ` · ${g.miss} ta taom tannarxsiz` : ''}`;
  $('#kpis').innerHTML = [
    ['Tushum', som(sum)],
    ['Yalpi foyda (tannarx bo\'yicha)', g.rev ? som(g.profit) : '—', g.profit < 0 ? 'neg' : '', gNote],
    ['Xarajatlar', som(exSum)],
    ['Sof foyda (tushum − xarajat)', som(sum - exSum), sum - exSum < 0 ? 'neg' : ''],
    single ? ['O\'rtacha chek', som(ok.length ? sum / ok.length : 0)]
           : ['O\'rtacha kunlik tushum', som(activeDays ? sum / activeDays : 0)]
  ].map(k => `<div class="kpi"><small>${k[0]}</small><b class="${k[2] || ''}">${k[1]}</b>${k[3] ? `<small>${k[3]}</small>` : ''}</div>`).join('');

  // Kunlar bo'yicha grafik (faqat davr uchun)
  $('#dailyBox').style.display = single ? 'none' : '';
  if (!single) {
    const rows = dailyTotals();
    const mx = Math.max(1, ...rows.map(r => Math.max(r.rev, r.exp)));
    $('#daily').innerHTML = rows.length ? rows.map(r => `
      <div class="drow ${r.rev || r.exp ? '' : 'off'}">
        <div class="d"><b>${dmy(r.day).slice(0, 5)}</b><small>${WD[keyToDate(r.day).getDay()]}</small></div>
        <div class="bars"><i class="in" style="width:${r.rev / mx * 100}%"></i><i class="out" style="width:${r.exp / mx * 100}%"></i></div>
        <div class="v"><b class="${r.profit < 0 ? 'neg' : ''}">${fmt(r.profit)}</b>${r.count} ta buyurtma</div>
      </div>`).join('') : '<div class="note">Bu davr hali boshlanmagan.</div>';
  }

  const bp = Object.keys(PAY).map(k => [PAY[k], sumBy(ok.filter(s => s.pay === k), s => s.total)]);
  $('#bypay').innerHTML = bp.map(([n, v]) =>
    `<div class="hb"><span>${n}</span><div class="t"><i style="width:${sum ? v / sum * 100 : 0}%"></i></div><span>${som(v)}</span></div>`).join('');

  // Har bir taom: nechta sotildi va (tannarxi bo'lsa) qancha foyda keltirdi
  const agg = {};
  ok.forEach(s => s.items.forEach(i => {
    const a = agg[i.n] = agg[i.n] || { q: 0, profit: 0, hasCost: false };
    a.q += i.q;
    if (i.cost > 0) { a.profit += i.p * i.q * (1 - (s.disc || 0) / 100) - i.cost * i.q; a.hasCost = true; }
  }));
  const top = Object.entries(agg).sort((a, b) => b[1].q - a[1].q).slice(0, 10);
  const mx = top.length ? top[0][1].q : 1;
  $('#top').innerHTML = top.length
    ? top.map(([n, a]) => `<div class="hb"><span>${esc(n)}</span><div class="t"><i style="width:${a.q / mx * 100}%"></i></div>
        <span>${a.q} ta${a.hasCost ? ` · <span class="${a.profit < 0 ? 'neg' : ''}">foyda ${fmt(a.profit)}</span>` : ''}</span></div>`).join('')
    : '<div class="note">Hozircha ma\'lumot yo\'q.</div>';

  const exAgg = {};
  ex.forEach(e => exAgg[e.cat] = (exAgg[e.cat] || 0) + e.amount);
  const exTop = Object.entries(exAgg).sort((a, b) => b[1] - a[1]);
  $('#rexp').innerHTML = exTop.length
    ? exTop.map(([n, v]) => `<div class="hb"><span>${esc(n)}</span><div class="t"><i style="width:${v / exSum * 100}%"></i></div><span>${som(v)}</span></div>`).join('')
    : '<div class="note">Bu davrda xarajat yozilmagan.</div>';

  // Buyurtmalar ro'yxati — faqat bitta kun uchun
  $('#ordersBox').style.display = single ? '' : 'none';
  if (single) {
    const rows = [...list].sort((a, b) => b.ts - a.ts);
    $('#orders').innerHTML = `<thead><tr><th>№</th><th>Vaqt</th><th>Tarkibi</th><th>Turi</th><th>To'lov</th><th class="n">Summa</th><th></th></tr></thead><tbody>` +
      (rows.length ? rows.map(s => `
        <tr class="${s.status === 'cx' ? 'cx' : ''}">
          <td>#${s.no}</td><td>${hm(s.ts)}</td>
          <td>${s.items.map(i => esc(i.n) + (i.q > 1 ? ' ×' + i.q : '')).join(', ')}${s.note ? `<div class="onote">Izoh: ${esc(s.note)}</div>` : ''}</td>
          <td>${OT[s.type] || ''}</td><td>${PAY[s.pay] || ''}</td>
          <td class="n">${som(s.total)}</td>
          <td>${s.status === 'cx' ? 'Bekor' : `<button class="sm" type="button" data-rp="${esc(s.id)}">Chek</button> <button class="sm" type="button" data-cx="${esc(s.id)}">Bekor qilish</button>`}</td>
        </tr>`).join('')
        : '<tr><td colspan="7" class="note">Buyurtmalar yo\'q</td></tr>') + '</tbody>';
  }
}

function zReportHTML() {
  const ok = okSales(rangeSales());
  const sum = sumBy(ok, s => s.total);
  const exSum = sumBy(rangeExp(), e => e.amount);
  const title = rFrom === rTo ? `Z-HISOBOT · ${dmy(rFrom)}` : `HISOBOT<br>${dmy(rFrom)} — ${dmy(rTo)}`;
  return `${headHTML()}<hr><div class="c">${title}</div><hr>
    <div class="r"><span>Buyurtmalar</span><span>${ok.length}</span></div>
    ${Object.keys(PAY).map(k => `<div class="r"><span>${PAY[k]}</span><span>${fmt(sumBy(ok.filter(s => s.pay === k), s => s.total))}</span></div>`).join('')}
    <hr><div class="r big"><span>TUSHUM</span><span>${fmt(sum)}</span></div>
    <div class="r"><span>Xarajatlar</span><span>−${fmt(exSum)}</span></div>
    <div class="r big"><span>SOF FOYDA</span><span>${fmt(sum - exSum)}</span></div>
    <div class="c">Chop etildi: ${dt(Date.now())}</div>`;
}

// =====================================================
//  EXCEL (CSV) EKSPORT
// =====================================================
// Excel o'zbek/rus sozlamalarida ";" ajratgichni to'g'ri o'qiydi
function csvCell(v) {
  const t = String(v ?? '');
  return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function downloadCSV(name, header, rows) {
  if (!rows.length) { $('#xMsg').textContent = 'Bu davrda ma\'lumot yo\'q.'; return; }
  const text = '\uFEFF' + [header, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = `${name}_${rFrom}_${rTo}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  $('#xMsg').textContent = `Yuklandi: ${rows.length} qator.`;
}

function exportSales() {
  const rows = [...rangeSales()].sort((a, b) => a.ts - b.ts).map(s => [
    dmy(s.day), hm(s.ts), s.no,
    s.items.map(i => i.n + (i.q > 1 ? ' x' + i.q : '')).join(', '),
    s.note || '', OT[s.type] || '', PAY[s.pay] || '', s.disc || 0, s.total,
    s.status === 'cx' ? 'Bekor qilingan' : 'Sotildi'
  ]);
  downloadCSV('savdolar', ['Sana', 'Vaqt', '№', 'Tarkibi', 'Izoh', 'Turi', 'To\'lov', 'Chegirma %', 'Summa', 'Holat'], rows);
}

function exportExpenses() {
  const rows = [...rangeExp()].sort((a, b) => a.ts - b.ts).map(e => [
    dmy(e.day), hm(e.ts), e.cat, e.note || '', e.src === 'kassa' ? 'Kassadan' : 'Boshqa joydan', e.amount
  ]);
  downloadCSV('xarajatlar', ['Sana', 'Vaqt', 'Nima uchun', 'Izoh', 'Qayerdan', 'Summa'], rows);
}

function exportDaily() {
  const rows = dailyTotals().map(r => [
    dmy(r.day), WD[keyToDate(r.day).getDay()], r.count, r.naqd, r.karta, r.click, r.rev, r.exp, r.profit
  ]);
  if (rows.length) {
    const t = i => sumBy(rows, r => r[i]);
    rows.push(['JAMI', '', t(2), t(3), t(4), t(5), t(6), t(7), t(8)]);
  }
  downloadCSV('kunlik-jami', ['Sana', 'Hafta kuni', 'Buyurtmalar', 'Naqd', 'Karta', 'Click / Payme', 'Tushum', 'Xarajat', 'Sof foyda'], rows);
}

let armed = null;
function cancelSale(id, btn) {
  if (armed !== id) {   // ikki marta bosish bilan tasdiqlash
    armed = id; btn.textContent = 'Rostdanmi?';
    setTimeout(() => { if (armed === id) { armed = null; btn.textContent = 'Bekor qilish'; } }, 3000);
    return;
  }
  armed = null;
  sales = sales.map(s => s.id === id ? { ...s, status: 'cx' } : s);
  DB.set('bo_sales', sales);
  renderReport(); renderCart(); renderShift();
}

// =====================================================
//  MENYU TAHRIRLASH
// =====================================================
function renderEditor() {
  draft = draft || menu.map(m => ({ ...m }));
  const cats = [...new Set([...DEFAULT_CATS, ...draft.map(d => d.c).filter(Boolean)])];
  $('#catlist').innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
  $('#mrows').innerHTML = draft.length
    ? draft.map((m, i) => `
      <tr>
        <td class="code"><input data-k="code" data-i="${i}" value="${m.code || ''}" inputmode="numeric" placeholder="auto"></td>
        <td><input data-k="n" data-i="${i}" value="${esc(m.n)}" placeholder="Masalan: Chizburger"></td>
        <td><input data-k="c" data-i="${i}" value="${esc(m.c)}" list="catlist" placeholder="Bo'lim"></td>
        <td class="n"><input data-k="p" data-i="${i}" value="${m.p ? fmt(m.p) : ''}" inputmode="numeric" placeholder="0" style="text-align:right"></td>
        <td class="n"><input data-k="cost" data-i="${i}" value="${m.cost ? fmt(m.cost) : ''}" inputmode="numeric" placeholder="0" style="text-align:right"></td>
        <td class="fav"><input type="checkbox" data-k="fav" data-i="${i}" ${m.fav ? 'checked' : ''} aria-label="Sevimli"></td>
        <td><button class="sm" type="button" data-del="${i}">O'chirish</button></td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="note">Hali taom yo\'q. “+ Taom qo\'shish”ni bosing.</td></tr>';
}

function saveMenu() {
  const clean = draft
    .filter(d => String(d.n).trim())
    .map(d => ({ id: d.id, code: onlyNum(d.code), n: String(d.n).trim(), c: String(d.c || '').trim() || 'Boshqa', p: onlyNum(d.p), cost: onlyNum(d.cost), fav: !!d.fav }));
  // Bir xil kodlarni tekshirish
  const seen = {};
  for (const m of clean) {
    if (!m.code) continue;
    if (seen[m.code]) { $('#mmsg').textContent = `${m.code}-kod ikki marta yozilgan: “${seen[m.code]}” va “${m.n}”.`; return; }
    seen[m.code] = m.n;
  }
  // Kodi yo'qlarga keyingi bo'sh raqamni berish
  let next = 1;
  for (const m of clean) {
    if (m.code) continue;
    while (seen[next]) next++;
    m.code = next; seen[next] = m.n;
  }
  if (DB.set('bo_menu', clean)) {
    menu = clean; draft = null; cat = defaultCat();
    renderEditor(); renderMenu();
    const loss = clean.filter(m => m.cost && m.cost >= m.p).map(m => m.n);
    $('#mmsg').textContent = 'Saqlandi ✓ (' + clean.length + ' ta taom)' + (loss.length ? ` · Diqqat: tannarx narxdan yuqori yoki teng — ${loss.join(', ')}` : '');
  }
}

// =====================================================
//  CHEK SOZLAMALARI
// =====================================================
let sDraft = null;   // saqlanmagan sozlamalar

function applySettings() {
  $('#brandName').textContent = settings.name || 'Burger Oila';
  document.title = (settings.name || 'Burger Oila') + ' — Kassa';
  $('#pageSize').textContent = `@media print { @page { size: ${settings.width === '58' ? '58mm' : '80mm'} auto; margin: ${settings.width === '58' ? '2mm' : '3mm'}; } }`;
}

function renderSettings() {
  sDraft = { ...settings };
  $('#sName').value = sDraft.name;
  $('#sAddr').value = sDraft.addr;
  $('#sPhone').value = sDraft.phone;
  $('#sFoot').value = sDraft.foot;
  $('#sAuto').checked = !!sDraft.autoPrint;
  $('#sMsg').textContent = '';
  renderPreview();
}

function renderPreview() {
  $$('#sWidth button').forEach(b => b.classList.toggle('active', b.dataset.v === sDraft.width));
  const sample = {
    no: 12, type: 'olib', day: today, ts: Date.now(), disc: 0, sub: 0, pay: 'naqd', note: '',
    items: [{ n: 'Chizburger', p: 36000, q: 2 }, { n: 'Kartoshka fri', p: 15000, q: 1 }],
    total: 87000, given: 100000, change: 13000
  };
  $('#sPreview').innerHTML = receiptHTML(sample, sDraft);
  $('#sPreview').className = 'rcpt' + (sDraft.width === '58' ? ' w58' : '');
}

function saveSettings() {
  settings = {
    name: $('#sName').value.trim() || 'Burger Oila',
    addr: $('#sAddr').value.trim(),
    phone: $('#sPhone').value.trim(),
    foot: $('#sFoot').value.trim(),
    width: sDraft.width,
    autoPrint: $('#sAuto').checked
  };
  if (DB.set('bo_set', settings)) {
    applySettings(); renderSettings();
    $('#sMsg').textContent = 'Saqlandi ✓';
  }
}

// ---------- Zaxira ----------
function exportBackup() {
  const data = { app: 'BurgerOila', saved: new Date().toISOString(), menu, sales, shifts, expenses, settings };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'burger-oila-zaxira-' + today + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  DB.set('bo_lastBackup', Date.now());
  $('#bmsg').textContent = 'Zaxira yuklab olindi.';
  renderStorage();
}

// Zaxira va xotira holati
async function renderStorage() {
  const last = DB.get('bo_lastBackup', 0);
  const days = last ? Math.floor((Date.now() - last) / 864e5) : null;
  const u = await DB.usage();
  $('#storeInfo').innerHTML = [
    DB.idb ? 'Saqlash: IndexedDB ✓' : 'Saqlash: localStorage (cheklangan)',
    u ? `Ishlatilgan: ${u.used.toFixed(1)} MB` : '',
    last ? `Oxirgi zaxira: ${dt(last)}${days >= 3 ? ` <b class="neg">(${days} kun oldin)</b>` : ''}` : '<b class="neg">Hali zaxira olinmagan</b>'
  ].filter(Boolean).join(' · ');
}

function importBackup(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.menu) || !Array.isArray(d.sales)) throw new Error();
      menu = d.menu; sales = d.sales;
      shifts = Array.isArray(d.shifts) ? d.shifts : [];
      expenses = Array.isArray(d.expenses) ? d.expenses : [];
      if (d.settings && typeof d.settings === 'object') settings = { ...DEFAULT_SET, ...d.settings };
      DB.set('bo_menu', menu); DB.set('bo_sales', sales); DB.set('bo_shifts', shifts); DB.set('bo_exp', expenses); DB.set('bo_set', settings);
      draft = null; cat = defaultCat(); applySettings(); renderEditor(); renderSettings(); renderAll();
      $('#bmsg').textContent = `Tiklandi: ${menu.length} ta taom, ${sales.length} ta savdo, ${shifts.length} ta smena.`;
    } catch (e) { $('#bmsg').textContent = 'Fayl noto\'g\'ri.'; }
  };
  r.readAsText(file);
}

// =====================================================
//  BO'LIMLAR VA SOAT
// =====================================================
const VIEWS = ['kassa', 'smena', 'hisobot', 'menyu'];

function route() {
  const h = (location.hash || '#kassa').slice(1);
  const v = VIEWS.includes(h) ? h : 'kassa';
  VIEWS.forEach(k => {
    $('#v-' + k).classList.toggle('on', k === v);
    $('#t-' + k).classList.toggle('active', k === v);
  });
  if (v === 'menyu') { draft = null; renderEditor(); renderSettings(); renderStorage(); $('#mmsg').textContent = ''; }
  if (v === 'hisobot') renderReport();
  if (v === 'smena') {
    renderShift();
    const f = currentShift() ? $('#exAmount') : $('#openCash');
    setTimeout(() => f.focus(), 0);
  }
}

function renderAll() { renderHeader(); renderMenu(); renderCart(); renderShift(); renderReport(); }

function tick() {
  const d = new Date();
  $('#clock').textContent = dmy(dayKey(d)) + ' · ' + hm(d);
  const k = dayKey(d);
  if (k !== today) {           // yarim tundan keyin yangi kun
    if (rFrom === today && rTo === today) rFrom = rTo = k;
    today = k;
    renderCart(); renderReport();
  }
}

// =====================================================
//  HODISALAR
// =====================================================
const moneyInput = el => el.addEventListener('input', () => { const v = onlyNum(el.value); el.value = v ? fmt(v) : ''; });

$('#chips').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { cat = b.dataset.c; query = ''; $('#q').value = ''; renderMenu(); } });
$('#grid').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b) addItem(b.dataset.id); });

$('#lines').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.x !== undefined) cart.splice(+b.dataset.x, 1);
  else { const l = cart[+b.dataset.i]; l.q += +b.dataset.d; if (l.q < 1) cart.splice(+b.dataset.i, 1); }
  renderMenu(); renderCart();
});

$('#clear').addEventListener('click', () => { cart = []; $('#given').value = ''; $('#onote').value = ''; renderMenu(); renderCart(); });

// Qidiruv
$('#q').addEventListener('input', e => { query = e.target.value; renderMenu(); });
$('#q').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    const first = filteredMenu()[0];
    const cq = codeQuery();
    if (first) { addItem(first.id, cq ? Math.max(1, cq.qty) : 1); query = ''; e.target.value = ''; renderMenu(); }
  }
  if (e.key === 'Escape') { query = ''; e.target.value = ''; renderMenu(); }
});

// Izoh
$('#tags').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) toggleTag(b.dataset.t); });
$('#onote').addEventListener('input', renderTags);

$('#otype').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { otype = b.dataset.v; renderCart(); } });
$('#paym').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { pay = b.dataset.v; renderCart(); } });
$('#disc').addEventListener('change', renderCart);
moneyInput($('#given'));
$('#given').addEventListener('input', renderChange);
$('#quick').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) { $('#given').value = fmt(+b.dataset.g); renderChange(); } });
$('#paybtn').addEventListener('click', checkout);
$('#holdbtn').addEventListener('click', holdOrder);
$('#holds').addEventListener('click', e => { const b = e.target.closest('[data-h]'); if (b) resumeHold(b.dataset.h); });

$('#rnew').addEventListener('click', closeModal);
$('#rprint2').addEventListener('click', () => { if (printable) printHTML(printable); });
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });

// Smena
moneyInput($('#openCash'));
moneyInput($('#exAmount'));
moneyInput($('#closeCash'));
$('#openBtn').addEventListener('click', openShift);
$('#openCash').addEventListener('keydown', e => { if (e.key === 'Enter') openShift(); });
$('#exAdd').addEventListener('click', addExpense);
['#exAmount', '#exCat', '#exNote'].forEach(s => $(s).addEventListener('keydown', e => { if (e.key === 'Enter') addExpense(); }));
$('#exTable').addEventListener('click', e => { const b = e.target.closest('[data-dex]'); if (b) deleteExpense(b.dataset.dex, b); });
$('#closeCash').addEventListener('input', renderCloseDiff);
$('#closeBtn').addEventListener('click', closeShift);
$('#shiftHist').addEventListener('click', e => { const b = e.target.closest('[data-shr]'); if (b) { const s = shifts.find(x => x.id === b.dataset.shr); if (s) showModal(shiftReportHTML(s)); } });

// Hisobot
$('#rmode').addEventListener('click', e => {
  const b = e.target.closest('[data-v]'); if (!b) return;
  rMode = b.dataset.v;
  if (rMode === 'day') { rFrom = rTo = today; renderReport(); }
  else quickRange('week');
});
$('#rday').addEventListener('change', e => { if (e.target.value) { rFrom = rTo = e.target.value; renderReport(); } });
$('#rfrom').addEventListener('change', e => { if (e.target.value) { rFrom = e.target.value; renderReport(); } });
$('#rto').addEventListener('change', e => { if (e.target.value) { rTo = e.target.value; renderReport(); } });
$$('[data-q]').forEach(b => b.addEventListener('click', () => quickRange(b.dataset.q)));
$('#rprint').addEventListener('click', () => printHTML(zReportHTML()));
$('#xSales').addEventListener('click', exportSales);
$('#xExp').addEventListener('click', exportExpenses);
$('#xDaily').addEventListener('click', exportDaily);
$('#orders').addEventListener('click', e => {
  const c = e.target.closest('[data-cx]'); if (c) return cancelSale(c.dataset.cx, c);
  const p = e.target.closest('[data-rp]'); if (p) { const s = sales.find(x => x.id === p.dataset.rp); if (s) showModal(receiptHTML(s)); }
});

// Menyu
const editField = e => {
  const t = e.target; if (!t.dataset.k) return;
  if (e.type === 'input' && (t.dataset.k === 'p' || t.dataset.k === 'cost')) { const v = onlyNum(t.value); t.value = v ? fmt(v) : ''; }
  draft[+t.dataset.i][t.dataset.k] = t.type === 'checkbox' ? t.checked : t.value;
};
$('#mrows').addEventListener('input', editField);
$('#mrows').addEventListener('change', editField);
$('#mrows').addEventListener('click', e => { const b = e.target.closest('[data-del]'); if (b) { draft.splice(+b.dataset.del, 1); renderEditor(); } });
$('#madd').addEventListener('click', () => {
  draft.push({ id: 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), n: '', c: cat !== 'Hammasi' && cat !== FAV ? cat : '', p: 0 });
  renderEditor();
  const ins = $$('#mrows input[data-k=n]'); ins[ins.length - 1]?.focus();
});
$('#msave').addEventListener('click', saveMenu);

// Tungi rejim
$('#themeBtn').addEventListener('click', () => { theme = theme === 'dark' ? 'light' : 'dark'; DB.set('bo_theme', theme); applyTheme(); });

// Chek sozlamalari — yozganingiz darhol namunada ko'rinadi
[['#sName', 'name'], ['#sAddr', 'addr'], ['#sPhone', 'phone'], ['#sFoot', 'foot']].forEach(([sel, key]) =>
  $(sel).addEventListener('input', e => { sDraft[key] = e.target.value; renderPreview(); }));
$('#sWidth').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { sDraft.width = b.dataset.v; renderPreview(); } });
$('#sAuto').addEventListener('change', e => { sDraft.autoPrint = e.target.checked; });
$('#sSave').addEventListener('click', saveSettings);

$('#bexport').addEventListener('click', exportBackup);
$('#bimport').addEventListener('change', e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; });

// Klaviatura: F2 — to'lov, F4 — kutishga qo'yish, Esc — oynani yopish, harf — qidiruv
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
  const onKassa = location.hash === '' || location.hash === '#kassa';
  if (e.key === 'F2' && onKassa) { e.preventDefault(); if (!$('#paybtn').disabled) checkout(); }
  if (e.key === 'F4' && onKassa) { e.preventDefault(); holdOrder(); }
  // Kassada istalgan harfni yozsangiz, qidiruvga o'tadi
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
  if (onKassa && !typing && !$('#modal').classList.contains('on') && e.key.length === 1 && /\S/.test(e.key) && !e.ctrlKey && !e.altKey && !e.metaKey) {
    $('#q').focus();
  }
});

window.addEventListener('hashchange', route);

// =====================================================
//  PWA: oflayn ishlash va ilova sifatida o'rnatish
// =====================================================
let installEvt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault(); installEvt = e;
  $('#installBtn').hidden = false;
});
$('#installBtn').addEventListener('click', async () => {
  if (!installEvt) return;
  installEvt.prompt();
  await installEvt.userChoice;
  installEvt = null; $('#installBtn').hidden = true;
});
window.addEventListener('appinstalled', () => { $('#installBtn').hidden = true; });

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('service-worker.js').catch(e => console.warn('Service worker:', e));
}

// ---------- Ishga tushirish ----------
DB.init().then(() => {
  loadState();
  applyTheme();
  applySettings();
  renderAll();
  route();
  tick();
  setInterval(tick, 30000);
});