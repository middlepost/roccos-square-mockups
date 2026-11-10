import { formatMoney, priceCart } from '/shared/pricing.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const boot = window.__BOOT__ || null;
let brand = boot?.brand || null;
let square = boot?.square || null;
let menu = { items: [], currency: 'AUD', source: 'local' };
let lines = [];
let tab = 'pizza';
let card = null;
let giftCard = null;
let payments = null;
let giftAmount = 5000;
let cardLocationId = null;
let store = null;
const slotUse = { key: '', used: {}, max: null, loading: false };

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAME = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };

function money(cents) {
  return formatMoney(cents, menu.currency || 'AUD');
}
function locByKey(key) {
  return (brand?.locations || []).find((loc) => loc.key === key) || null;
}
function itemBySku(sku) {
  return menu.items.find((item) => item.sku === sku);
}
function extrasCatalog() {
  const seen = new Map();
  for (const item of menu.items) {
    for (const mod of item.modifiers || []) {
      if (!seen.has(mod.key)) seen.set(mod.key, mod);
    }
  }
  return [...seen.values()];
}

function show(name) {
  const view = name === 'order' || name === 'menu' || name === 'book' || name === 'read' || name === 'gift' ? name : 'home';
  document.body.classList.toggle('home', view === 'home');
  $('#view-home').hidden = view !== 'home';
  $('#view-order').hidden = view !== 'order';
  $('#view-menu').hidden = view !== 'menu';
  $('#view-book').hidden = view !== 'book';
  $('#view-read').hidden = view !== 'read';
  $('#view-gift').hidden = view !== 'gift';
  if (view === 'menu' && !store) {
    location.hash = 'order';
    return;
  }
  if (view === 'menu') renderMenu();
  if (view === 'read') renderReadMenu();
  if (view === 'gift') {
    initGiftCard().catch((error) => {
      const message = error?.message || '';
      if (/secure context|https/i.test(message)) return;
      giftSay(message || 'The card form could not load.', true);
    });
  }
  window.scrollTo(0, 0);
}

function paintStores() {
  const locs = brand?.locations || [];
  $('#storeChoice').innerHTML = locs.map((loc) => `
    <button type="button" class="store-pick" data-choose="${esc(loc.key)}">
      <b>${esc(loc.name)}</b>
      <small>${esc(loc.address)}</small>
      <small>${esc(loc.daysLabel || '')}</small>
    </button>`).join('');
  $('#bookShops').innerHTML = locs.map((loc) => `
    <a class="book-card" href="tel:${esc(loc.phoneTel || brand.phoneTel)}">
      <b>${esc(loc.name)}</b>
      <span>${esc(loc.address)}</span>
      <span>${esc(loc.daysLabel || '')}</span>
      <span>Call ${esc(loc.phone || brand.phone)}</span>
    </a>`).join('');
  $('#coStores').innerHTML = locs.map((loc) => `
    <button type="button" class="store-btn${loc.key === store ? ' active' : ''}" data-store="${esc(loc.key)}">
      <b>${esc(loc.name)}</b><small>${esc(loc.address)}</small>
    </button>`).join('');
  const loc = locByKey(store);
  $('#coWhere').value = store || '';
  $('#drawerStore').textContent = loc ? `${loc.name} · ${loc.address}` : 'Choose a store';
}

function chooseStore(key) {
  if (!locByKey(key)) return;
  if (key !== store) {
    store = key;
    card = null;
    try { sessionStorage.setItem(`store:${brand.id}`, key); } catch { /* ignore */ }
  }
  paintStores();
  buildSlots();
  location.hash = 'menu';
}

document.addEventListener('click', (event) => {
  const choose = event.target.closest('[data-choose]');
  if (choose) chooseStore(choose.dataset.choose);
  const button = event.target.closest('[data-store]');
  if (button && locByKey(button.dataset.store)) {
    store = button.dataset.store;
    card = null;
    try { sessionStorage.setItem(`store:${brand.id}`, store); } catch { /* ignore */ }
    paintStores();
    buildSlots();
    if ($('#drawer').classList.contains('open')) initCard().catch((error) => say(error.message, true));
  }
});

function qtyOf(sku, modifierKeys) {
  const key = modifierKeys ? [...modifierKeys].sort().join(',') : null;
  return lines.filter((line) => line.type === 'item' && line.sku === sku && (key === null || line.modifierKeys.join(',') === key))
    .reduce((sum, line) => sum + line.qty, 0);
}

function renderReadMenu() {
  const extras = extrasCatalog().map((mod) => ({
    name: mod.name,
    priceCents: mod.priceCents,
    description: 'Add on a pizza.',
    plus: true,
  }));
  const groups = [
    ['Pizzas', menu.items.filter((item) => item.category === 'pizza')],
    ['Extras', extras],
    ['Drinks', menu.items.filter((item) => item.category === 'drinks')],
    ['Desserts', menu.items.filter((item) => item.category === 'dessert')],
  ];
  $('#readList').innerHTML = groups.map(([title, group]) => `
    <section class="read-group">
      <h2>${esc(title)}</h2>
      ${group.map((item) => `
        <article class="read-item">
          <div class="read-top"><h3>${esc(item.name)}</h3><span>${item.plus ? '+' : ''}${money(item.priceCents)}</span></div>
          ${item.description ? `<p>${esc(item.description)}</p>` : ''}
          ${item.dineInOnly ? '<p>At the shop</p>' : ''}
        </article>`).join('')}
    </section>`).join('');
}

function renderMenu() {
  const note = $('#catNote');
  const grid = $('#grid');
  if (tab === 'extras') {
    note.textContent = 'Add any of these on a pizza.';
    grid.innerHTML = extrasCatalog().map((mod) => `
      <article class="card extra-card">
        <div class="body">
          <h2>${esc(mod.name)}</h2>
          <div class="price">+${money(mod.priceCents)}</div>
        </div>
      </article>`).join('');
    return;
  }
  if (tab === 'drinks') note.textContent = 'Alcohol is dine-in only. Beer and wine stay at the shop.';
  else if (tab === 'pizza') note.textContent = store ? `Pickup from ${locByKey(store)?.name || ''}` : '';
  else note.textContent = '';

  const items = menu.items.filter((item) => item.category === tab);
  grid.innerHTML = items.map((item) => {
    const extras = (item.modifiers || []).map((mod) => `
      <li><label><input type="checkbox" data-key="${esc(mod.key)}"> ${esc(mod.name)} <span>+${money(mod.priceCents)}</span></label></li>`).join('');
    const qty = qtyOf(item.sku);
    const controls = item.dineInOnly
      ? '<p class="dine">At the shop</p>'
      : `<div class="qtybar"><button type="button" data-qty="-1" aria-label="Remove one ${esc(item.name)}">−</button><output>${qty}</output><button type="button" data-qty="1" aria-label="Add one ${esc(item.name)}">+</button></div>`;
    return `<article class="card" data-sku="${esc(item.sku)}">
      ${item.imageUrl ? `<div class="photo"><img src="${esc(item.imageUrl)}" alt="${esc(item.name)}"></div>` : ''}
      <div class="body">
        <h2>${esc(item.name)}</h2>
        <div class="price">${money(item.priceCents)}</div>
        ${item.description ? `<p>${esc(item.description)}</p>` : ''}
        ${extras ? `<ul class="extras">${extras}</ul>` : ''}
        ${controls}
      </div>
    </article>`;
  }).join('') || '<p class="empty">Nothing in this category.</p>';
}

$('#catbar').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-f]');
  if (!button) return;
  tab = button.dataset.f;
  $$('#catbar button').forEach((el) => el.classList.toggle('active', el === button));
  renderMenu();
});

function selectedMods(article) {
  return $$('input[data-key]:checked', article).map((input) => input.dataset.key).sort();
}

function changeQty(sku, delta, modifierKeys) {
  if (!store) {
    location.hash = 'order';
    return;
  }
  const before = JSON.stringify(lines);
  const keys = [...(modifierKeys || [])].sort();
  const signature = keys.join(',');
  const existing = lines.find((line) => line.type === 'item' && line.sku === sku && line.modifierKeys.join(',') === signature);
  if (delta > 0) {
    if (existing) existing.qty += 1;
    else lines.push({ type: 'item', key: `${sku}|${signature}`, sku, qty: 1, modifierKeys: keys });
  } else if (existing) {
    existing.qty -= 1;
    if (existing.qty <= 0) lines.splice(lines.indexOf(existing), 1);
  } else {
    for (let i = lines.length - 1; i >= 0; i -= 1) {
      if (lines[i].sku === sku) {
        lines[i].qty -= 1;
        if (lines[i].qty <= 0) lines.splice(i, 1);
        break;
      }
    }
  }
  try {
    priceCart(menu.items, brand?.offer, lines, menu.currency || 'AUD');
  } catch (error) {
    lines = JSON.parse(before);
    say(error.message, true);
    return;
  }
  renderCart();
  if (!$('#view-menu').hidden) renderMenu();
}

$('#grid').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-qty]');
  if (!button) return;
  const article = button.closest('[data-sku]');
  const item = itemBySku(article.dataset.sku);
  if (!item || item.dineInOnly) return;
  const delta = Number(button.dataset.qty);
  changeQty(item.sku, delta, delta > 0 ? selectedMods(article) : null);
});

function currentPrice() {
  if (!lines.length) return { totalCents: 0, subtotalCents: 0, discountCents: 0, shortfallPizzas: 0, lines: [] };
  return priceCart(menu.items, brand?.offer, lines, menu.currency || 'AUD');
}

function renderCart() {
  let priced = { totalCents: 0, subtotalCents: 0, discountCents: 0, shortfallPizzas: 0, lines: [] };
  try { priced = currentPrice(); } catch { lines = []; }
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  $('#cartCount').textContent = String(count);
  const box = $('#cartLines');
  if (!count) {
    box.innerHTML = '<p class="empty">Your order is empty.</p>';
    $('#cartFoot').hidden = true;
    return;
  }
  box.innerHTML = priced.lines.map((line, index) => `<div class="line">
    <div class="t">${esc(line.name)}</div>
    <div class="p">${money(line.totalCents)}</div>
    <div class="d">${line.detail ? esc(line.detail) : ''}</div>
    <div class="qty"><button type="button" data-i="${index}" data-d="-1" aria-label="Remove one">−</button><output>${line.qty}</output><button type="button" data-i="${index}" data-d="1" aria-label="Add one">+</button></div>
  </div>`).join('');
  $('#cartSubtotal').textContent = money(priced.subtotalCents || 0);
  const discountRow = $('#cartDiscountRow');
  const hint = $('#cartHint');
  if (priced.discountCents > 0) {
    discountRow.hidden = false;
    $('#cartDiscountLabel').textContent = brand?.offer?.copy || '10% off your entire order when you order two or more pizzas';
    $('#cartDiscount').textContent = `−${money(priced.discountCents)}`;
    hint.hidden = true;
    hint.textContent = '';
  } else {
    discountRow.hidden = true;
    const percent = priced.offer?.percent || brand?.offer?.percent || 10;
    const need = priced.shortfallPizzas || 0;
    if (need > 0) {
      hint.hidden = false;
      hint.textContent = `Add ${need} more pizza${need === 1 ? '' : 's'} for ${percent}% off`;
    } else {
      hint.hidden = true;
      hint.textContent = '';
    }
  }
  $('#cartTotal').textContent = money(priced.totalCents);
  $('#cartFoot').hidden = false;
  $('#payBtn').textContent = `Pay ${money(priced.totalCents)}`;
  try { sessionStorage.setItem(`cart:${brand?.id || 'roccos'}`, JSON.stringify(lines)); } catch { /* ignore */ }
}

$('#cartLines').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-i]');
  if (!button) return;
  const line = lines[+button.dataset.i];
  if (!line) return;
  line.qty += +button.dataset.d;
  if (line.qty <= 0) lines.splice(+button.dataset.i, 1);
  renderCart();
  if (!$('#view-menu').hidden) renderMenu();
});

function openCart() {
  if (!store) {
    location.hash = 'order';
    return;
  }
  buildSlots();
  $('#drawer').classList.add('open');
  $('#overlay').classList.add('open');
  $('#confirm').classList.remove('show');
  $('#confirm').innerHTML = '';
  initCard().catch((error) => say(error.message || 'The card form could not load.', true));
}
function closeCart() {
  $('#drawer').classList.remove('open');
  $('#overlay').classList.remove('open');
}
$('#openCart').addEventListener('click', openCart);
$('#closeCart').addEventListener('click', closeCart);
$('#overlay').addEventListener('click', closeCart);
addEventListener('keydown', (event) => { if (event.key === 'Escape') closeCart(); });

function adelaideNow() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Adelaide', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return { day: parts.weekday.slice(0, 3).toLowerCase(), min: hour * 60 + Number(parts.minute) };
}
const minutes = (value) => { const [h, m] = value.split(':').map(Number); return h * 60 + m; };
const fmt = (value) => {
  let [h, m] = value.split(':').map(Number);
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12 || 12;
  return h + (m ? `:${String(m).padStart(2, '0')}` : '') + suffix;
};
function adelaideParts(at) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Adelaide', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, dow: DAYS.indexOf(parts.weekday.slice(0, 3).toLowerCase()), min: hour * 60 + Number(parts.minute) };
}
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
function pickupWindow() {
  const pickup = brand?.pickup || {};
  return { open: minutes(pickup.open || '11:30'), close: minutes(pickup.close || '21:00'), step: pickup.slotMinutes || 5, ahead: pickup.daysAhead || 7 };
}
function slotsFor(dateIndex) {
  const win = pickupWindow();
  const now = new Date();
  const day = adelaideParts(new Date(now.getTime() + dateIndex * 86_400_000));
  const loc = locByKey(store);
  if (loc?.openDays && !loc.openDays.includes(day.dow)) return { day, times: [] };
  let open = win.open;
  let close = win.close;
  const shopHours = brand?.hours?.[store];
  if (shopHours) {
    const ranges = shopHours[DAYS[day.dow]] || [];
    if (!ranges.length) return { day, times: [] };
    open = Math.max(open, minutes(ranges[0][0]));
    close = minutes(ranges[ranges.length - 1][1]) - win.step;
  }
  let first = open;
  if (dateIndex === 0) {
    const earliest = adelaideParts(now).min + (brand?.prepMinutes || 20);
    first = Math.max(first, Math.ceil((earliest - open) / win.step) * win.step + open);
  }
  const times = [];
  for (let t = first; t <= close; t += win.step) times.push(t);
  return { day, times };
}
function dayLabel(day, index) {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const [y, m, d] = day.date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
function whenValue() {
  return $('input[name=when]:checked')?.value || 'asap';
}
function setWhen(value) {
  const asap = $('input[name=when][value=asap]');
  const timed = value === 'time' || asap?.disabled;
  const radio = $(`input[name=when][value="${timed ? 'time' : 'asap'}"]`);
  if (radio && !radio.disabled) radio.checked = true;
  $('#coTimeWrap').hidden = !timed;
  $('#coDate').required = timed;
  $('#coTime').required = timed;
}
$$('input[name=when]').forEach((radio) => radio.addEventListener('change', () => setWhen(whenValue())));
$('#coDate').addEventListener('change', () => buildTimes());

function buildSlots() {
  if (!brand || !$('#coDate')) return;
  const win = pickupWindow();
  const days = [];
  for (let i = 0; i < win.ahead; i += 1) {
    const slot = slotsFor(i);
    if (slot.times.length) days.push({ ...slot, index: i });
  }
  const previous = $('#coDate').value;
  $('#coDate').innerHTML = days.map((entry) => `<option value="${entry.day.date}" data-i="${entry.index}">${esc(dayLabel(entry.day, entry.index))}</option>`).join('')
    || '<option value="">No pickup days available</option>';
  if (days.some((entry) => entry.day.date === previous)) $('#coDate').value = previous;
  buildTimes();
  const today = slotsFor(0);
  const nowMin = adelaideParts(new Date()).min;
  const openNow = today.times.length && nowMin >= win.open - (brand?.prepMinutes || 20) && nowMin < win.close;
  const asap = $('input[name=when][value=asap]');
  if (openNow) {
    $('#asapLbl').textContent = 'Pick up within 30 minutes';
    asap.disabled = false;
    if (whenValue() !== 'time') setWhen('asap');
  } else {
    $('#asapLbl').textContent = 'Shop closed now, pick a time';
    asap.disabled = true;
    setWhen('time');
  }
}
function buildTimes() {
  const option = $('#coDate').selectedOptions[0];
  const index = option ? Number(option.dataset.i) : 0;
  const { times } = slotsFor(Number.isFinite(index) ? index : 0);
  const previous = $('#coTime').value;
  const used = slotUse.key === `${store}|${option?.value}` ? slotUse.used : {};
  const max = slotUse.max;
  const want = lines.reduce((sum, line) => sum + (itemBySku(line.sku)?.category === 'pizza' ? line.qty : 0), 0);
  const isFull = (t) => max && (used[hhmm(t)] || 0) + Math.max(want, 1) > max;
  $('#coTime').innerHTML = times.map((t) => {
    const full = isFull(t);
    return `<option value="${hhmm(t)}"${full ? ' disabled' : ''}>${fmt(hhmm(t))}${full ? ' · full' : ''}</option>`;
  }).join('') || '<option value="">No times left</option>';
  const open = times.filter((t) => !isFull(t));
  if (open.some((t) => hhmm(t) === previous)) $('#coTime').value = previous;
  else if (open.length) $('#coTime').value = hhmm(open[0]);
  const key = `${store}|${option?.value}`;
  if (option?.value && slotUse.key !== key && !slotUse.loading) {
    slotUse.loading = true;
    fetch(`/api/slots?location=${encodeURIComponent(store || '')}&date=${encodeURIComponent(option.value)}`)
      .then((r) => r.json()).then((data) => { Object.assign(slotUse, { key, used: data.used || {}, max: data.max || null }); })
      .catch(() => {}).finally(() => { slotUse.loading = false; if (slotUse.key === key) buildTimes(); });
  }
}

function giftMoney(cents) {
  return formatMoney(cents, menu.currency || 'AUD');
}
function selectedGiftCents() {
  if (giftAmount !== 'custom') return giftAmount;
  const dollars = Number($('#giftCustom').value);
  if (!Number.isInteger(dollars)) return null;
  return dollars * 100;
}
function paintGiftPay() {
  const cents = selectedGiftCents();
  $('#giftPay').textContent = cents ? `Pay ${giftMoney(cents)}` : 'Pay';
}
$('#giftAmounts').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-amount]');
  if (!button) return;
  giftAmount = button.dataset.amount === 'custom' ? 'custom' : Number(button.dataset.amount);
  $$('#giftAmounts button').forEach((el) => el.classList.toggle('active', el === button));
  $('#giftCustomWrap').hidden = giftAmount !== 'custom';
  paintGiftPay();
});
$('#giftCustom')?.addEventListener('input', paintGiftPay);

function giftSay(message, isError) {
  const el = $('#giftStatus');
  el.className = `status show${isError ? ' err' : ''}`;
  el.textContent = message || '';
}
async function initGiftCard() {
  if (!square?.applicationId || giftCard || !window.isSecureContext) return;
  const location = brand.locations?.[0];
  const locationId = location?.squareLocationId || square.locationId;
  await loadScript(square.sdkUrl);
  if (!payments) payments = window.Square.payments(square.applicationId, locationId);
  giftCard = await payments.card();
  $('#gift-card-container').innerHTML = '';
  await giftCard.attach('#gift-card-container');
}
$('#giftForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('#giftPay');
  button.disabled = true;
  giftSay('', false);
  try {
    const cents = selectedGiftCents();
    if (!cents || cents < 1000 || cents > 50000) throw new Error('Choose a gift card from $10 to $500.');
    if (!giftCard) await initGiftCard();
    if (!giftCard) throw new Error('The card form is not available.');
    const token = await giftCard.tokenize();
    if (token.status !== 'OK') throw new Error(token.errors?.map((entry) => entry.message).join(' ') || 'Check the card details.');
    const data = Object.fromEntries(new FormData(event.target).entries());
    const response = await fetch('/api/gift-card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        sourceId: token.token,
        amountCents: cents,
        toName: data.toName,
        toEmail: data.toEmail,
        fromName: data.fromName,
        message: data.message,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Payment failed.');
    const loaded = body.issued
      ? 'The balance is on this Square gift card.'
      : 'Quote this code at the shop.';
    $('#giftConfirm').innerHTML = `<h2>Gift card paid</h2><p>${esc(giftMoney(body.totalCents))} for ${esc(body.toName)} at ${esc(body.toEmail)}.</p><p class="gift-code">${esc(body.giftCode)}</p><p>${loaded}</p>`;
    $('#giftConfirm').hidden = false;
    $('#giftForm').hidden = true;
  } catch (error) {
    giftSay(error.message || 'Payment failed.', true);
  } finally {
    button.disabled = false;
  }
});

function say(message, isError) {
  const el = $('#coStatus');
  el.className = `status show${isError ? ' err' : ''}`;
  el.textContent = message || '';
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.Square) return resolve();
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the Square card form.'));
    document.head.appendChild(script);
  });
}
async function initCard() {
  if (!square?.applicationId) return;
  const location = locByKey(store) || brand.locations?.[0];
  const locationId = location?.squareLocationId || square.locationId;
  if (card && cardLocationId === locationId) return;
  await loadScript(square.sdkUrl);
  payments = window.Square.payments(square.applicationId, locationId);
  card = await payments.card();
  $('#card-container').innerHTML = '';
  await card.attach('#card-container');
  cardLocationId = locationId;
}

$('#checkout').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  const button = $('#payBtn');
  button.disabled = true;
  say('', false);
  try {
    if (!lines.length) throw new Error('Your order is empty.');
    if (!store) throw new Error('Choose a store.');
    if (!card) await initCard();
    if (!card) throw new Error('The card form is not available.');
    const token = await card.tokenize();
    if (token.status !== 'OK') throw new Error(token.errors?.map((entry) => entry.message).join(' ') || 'Check the card details.');
    const data = Object.fromEntries(new FormData(form).entries());
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        sourceId: token.token,
        locationKey: store,
        when: data.when,
        date: data.date,
        time: data.time,
        name: data.name,
        phone: data.phone,
        notes: data.notes,
        lines,
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Payment failed.');
    const shop = locByKey(store);
    const ready = data.when === 'time'
      ? `Ready for pickup at ${esc(fmt(data.time))}.`
      : 'Pick up within 30 minutes.';
    $('#confirm').innerHTML = `<h2>${ready}</h2><p>Pick up from ${esc(shop?.name || '')}, ${esc(shop?.address || '')}.</p><p>Thanks ${esc(data.name)}. Square order ${esc(body.orderId)} is paid.</p>`;
    $('#confirm').classList.add('show');
    $('#cartFoot').hidden = true;
    lines = [];
    slotUse.key = '';
    renderCart();
    form.reset();
    paintStores();
  } catch (error) {
    say(error.message || 'Payment failed.', true);
  } finally {
    button.disabled = false;
  }
});

function route() {
  show(location.hash.replace('#', ''));
}
addEventListener('hashchange', route);

async function start() {
  if (!brand || !square) {
    const response = await fetch('/api/config');
    const body = await response.json();
    brand = body.brand;
    square = body.square;
  }
  document.title = `${brand.name} — ${brand.tagline}`;
  $('#footerNote').textContent = square?.environment === 'production' ? 'Pickup orders' : 'Sandbox demo · test cards only';
  const pay = $('#payNote');
  const giftNote = $('#giftPayNote');
  if (square?.environment === 'sandbox') {
    const sandboxNote = square.paymentsReady
      ? 'Square sandbox. Test card 4111 1111 1111 1111, any future expiry, any CVV. No real money moves.'
      : 'The card form can load, but the server has no SQUARE_ACCESS_TOKEN yet, so a payment cannot be completed.';
    pay.textContent = sandboxNote;
    if (giftNote) giftNote.textContent = sandboxNote;
  } else {
    pay.textContent = 'Card details go to Square. We never see the card number.';
    if (giftNote) giftNote.textContent = pay.textContent;
  }
  try { store = sessionStorage.getItem(`store:${brand.id}`); } catch { store = null; }
  if (!locByKey(store)) store = null;
  const response = await fetch('/api/menu');
  menu = await response.json();
  try {
    const saved = JSON.parse(sessionStorage.getItem(`cart:${brand.id}`) || '[]');
    if (Array.isArray(saved)) lines = saved.filter((line) => line && line.type === 'item' && menu.items.some((item) => item.sku === line.sku));
  } catch { /* ignore */ }
  const params = new URLSearchParams(location.search);
  if (params.get('store')) store = locByKey(params.get('store')) ? params.get('store') : store;
  if (params.get('cart') === 'demo' && !lines.length) {
    if (!store) store = 'findon';
    lines.push({ type: 'item', key: 'ROCCO-02|', sku: 'ROCCO-02', qty: 2, modifierKeys: [] });
    lines.push({ type: 'item', key: 'ROCCO-DR07|', sku: 'ROCCO-DR07', qty: 1, modifierKeys: [] });
  }
  paintStores();
  renderCart();
  route();
  if (params.get('cart')) openCart();
}

start().catch((error) => {
  const note = $('#catNote');
  if (note) note.textContent = error.message || 'The menu could not load.';
});
