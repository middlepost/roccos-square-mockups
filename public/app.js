import { formatMoney, groupLimits, priceCart } from '/shared/pricing.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

const boot = window.__BOOT__ || null;
let brand = boot?.brand || null;
let square = boot?.square || null;
let menu = { items: [], currency: 'AUD', source: 'local' };
let lines = [];
let tab = '';
let pendingSku = null;
let card = null;
let giftCard = null;
let payments = null;
let giftAmount = 5000;
let cardLocationId = null;
let store = null;
let pizzaSku = null;
let pizzaQty = 1;
const pizzaAdded = new Map();
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
function maxParty() {
  const n = Number(brand?.booking?.maxParty);
  return Number.isInteger(n) && n > 0 ? n : 10;
}

function show(name) {
  closePizza();
  const view = name === 'order' || name === 'menu' || name === 'book' || name === 'read' || name === 'gift' || name === 'contact' ? name : 'home';
  document.body.classList.toggle('home', view === 'home');
  $('#view-home').hidden = view !== 'home';
  $('#view-order').hidden = view !== 'order';
  $('#view-menu').hidden = view !== 'menu';
  $('#view-book').hidden = view !== 'book';
  $('#view-read').hidden = view !== 'read';
  $('#view-gift').hidden = view !== 'gift';
  $('#view-contact').hidden = view !== 'contact';
  if (view === 'menu' && !store) {
    location.hash = 'order';
    return;
  }
  if (view === 'menu') {
    renderMenu();
    if (pendingSku) {
      const sku = pendingSku;
      pendingSku = null;
      openItem(sku);
    }
  } else if (view !== 'order') {
    pendingSku = null;
  }
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
  const chosenShop = $('#bookForm input[name=location]:checked')?.value;
  $('#bookShops').innerHTML = locs.map((loc) => `
    <label class="book-card">
      <input type="radio" name="location" value="${esc(loc.name)}"${loc.name === chosenShop ? ' checked' : ''} required>
      <b>${esc(loc.name)}</b>
      <span>${esc(loc.address)}</span>
      <span>${esc(loc.daysLabel || '')}</span>
    </label>`).join('');
  $('#contactShops').innerHTML = locs.map((loc) => `
    <article class="book-card">
      <b>${esc(loc.name)}</b>
      <span>${esc(loc.address)}</span>
      <span>${esc(loc.daysLabel || '')}</span>
    </article>`).join('');
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

function renderCats() {
  const cats = menu.categories || [];
  if (!cats.some((cat) => cat.id === tab)) tab = cats[0]?.id || '';
  const bar = $('#catbar');
  if (!bar) return;
  bar.innerHTML = cats.map((cat) => `
    <button type="button" data-f="${esc(cat.id)}" role="tab" aria-selected="${cat.id === tab ? 'true' : 'false'}" class="${cat.id === tab ? 'active' : ''}">${esc(cat.name)}</button>`).join('');
}

function renderReadMenu() {
  const cats = menu.categories || [];
  $('#readList').innerHTML = cats.map((cat) => {
    const group = menu.items.filter((item) => item.menuCategory === cat.id);
    if (!group.length) return '';
    return `
    <section class="read-group">
      <h2>${esc(cat.name)}</h2>
      ${cat.description ? `<p class="cat-blurb">${esc(cat.description)}</p>` : ''}
      ${group.map((item) => `
        <button type="button" class="read-item" data-sku="${esc(item.sku)}" aria-label="Order ${esc(item.name)}">
          <div class="read-top"><h3>${esc(item.name)}</h3><span>${money(item.priceCents)}</span></div>
          ${item.description ? `<p>${esc(item.description)}</p>` : ''}
        </button>`).join('')}
    </section>`;
  }).join('');
}

function orderItem(sku) {
  if (!itemBySku(sku)) return;
  pendingSku = sku;
  const target = store ? 'menu' : 'order';
  if (location.hash === `#${target}`) show(target);
  else location.hash = target;
}

function renderMenu() {
  const note = $('#catNote');
  const grid = $('#grid');
  const cat = (menu.categories || []).find((entry) => entry.id === tab);
  note.textContent = cat?.description || '';

  const items = menu.items.filter((item) => item.menuCategory === tab);
  grid.innerHTML = items.map((item) => {
    const qty = qtyOf(item.sku);
    const controls = item.dineInOnly
      ? '<p class="dine">At the shop</p>'
      : `<span class="customise">${qty ? `${qty} in your order` : 'Choose'}</span>`;
    return `<article class="card menu-card" data-sku="${esc(item.sku)}" tabindex="0" role="button" aria-label="Order ${esc(item.name)}">
      ${item.imageUrl ? `<div class="photo"><img src="${esc(item.imageUrl)}" alt="${esc(item.name)}"></div>` : ''}
      <div class="body">
        <h2>${esc(item.name)}</h2>
        <div class="price">${money(item.priceCents)}</div>
        ${item.description ? `<p class="desc">${esc(item.description)}</p>` : '<p class="desc"></p>'}
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

$('#grid').addEventListener('click', (event) => {
  const card = event.target.closest('.menu-card');
  if (!card) return;
  openItem(card.dataset.sku);
});
$('#grid').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const card = event.target.closest('.menu-card');
  if (!card) return;
  event.preventDefault();
  openItem(card.dataset.sku);
});
$('#readList').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-sku]');
  if (!button) return;
  orderItem(button.dataset.sku);
});

function optionSignature(options) {
  return (options || []).map((opt) => `${opt.key}:${opt.qty}`).sort().join(',');
}

function groupHelp(group) {
  const limits = groupLimits(group);
  if (limits.min > 0 && limits.max) return `Choose ${limits.min}${limits.max === limits.min ? '' : ` to ${limits.max}`}`;
  if (limits.min > 0) return `Choose at least ${limits.min}`;
  if (limits.max === 1) return 'Optional · choose 1';
  if (limits.max) return `Optional · up to ${limits.max}`;
  return 'Optional';
}

function chosenOptions() {
  return [...pizzaAdded.entries()].filter(([, qty]) => qty > 0).map(([key, qty]) => ({ key, qty }));
}

function openItem(sku) {
  const item = itemBySku(sku);
  if (!item || item.dineInOnly) return;
  if (!store) {
    pendingSku = sku;
    if (location.hash !== '#order') location.hash = 'order';
    return;
  }
  pizzaSku = sku;
  pizzaQty = 1;
  pizzaAdded.clear();
  $('#pizzaPhoto').hidden = !item.imageUrl;
  if (item.imageUrl) {
    $('#pizzaPhoto').src = item.imageUrl;
    $('#pizzaPhoto').alt = item.name;
  }
  $('#pizzaTitle').textContent = item.name;
  $('#pizzaDesc').textContent = item.description || '';
  const groups = item.groups || [];
  $('#pizzaMods').innerHTML = groups.map((group) => {
    const limits = groupLimits(group);
    const rows = (group.options || []).map((opt) => {
      const price = opt.priceCents ? `<span class="mod-price">+${money(opt.priceCents)}</span>` : '<span class="mod-price"></span>';
      if (limits.allowQuantity) {
        return `<li class="mod-row qty-row">
          <span>${esc(opt.name)}</span>
          ${price}
          <span class="opt-qty">
            <button type="button" data-step="${esc(opt.key)}" data-group="${esc(group.id)}" data-delta="-1" aria-label="Fewer ${esc(opt.name)}">−</button>
            <output>0</output>
            <button type="button" data-step="${esc(opt.key)}" data-group="${esc(group.id)}" data-delta="1" aria-label="More ${esc(opt.name)}">+</button>
          </span>
        </li>`;
      }
      return `<li><label>
        <input type="checkbox" data-opt="${esc(opt.key)}" data-group="${esc(group.id)}">
        <span>${esc(opt.name)}</span>
        ${price}
      </label></li>`;
    }).join('');
    return `<section class="mod-group">
      <h3>${esc(group.name)}</h3>
      <p class="mod-help">${esc(groupHelp(group))}</p>
      <ul class="mods">${rows}</ul>
    </section>`;
  }).join('') || '<p class="mod-help">Nothing to add.</p>';
  $('#pizzaStatus').textContent = '';
  $('#pizzaStatus').className = 'status';
  updatePizzaPrice();
  $('#pizzaPanel').classList.add('open');
  $('#pizzaPanel').setAttribute('aria-hidden', 'false');
  $('#pizzaPanel').inert = false;
  $('#pizzaOverlay').classList.add('open');
  $('#pizzaBody').scrollTop = 0;
  $('#closePizza').focus();
}

function closePizza() {
  const panel = $('#pizzaPanel');
  if (!panel) return;
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
  panel.inert = true;
  $('#pizzaOverlay')?.classList.remove('open');
}

function optionByKey(item, key) {
  for (const group of item.groups || []) {
    const option = (group.options || []).find((entry) => entry.key === key);
    if (option) return { group, option };
  }
  return null;
}

function groupCount(item, group, exceptKey) {
  return (group.options || []).reduce((sum, opt) => {
    if (opt.key === exceptKey) return sum;
    return sum + (pizzaAdded.get(opt.key) || 0);
  }, 0);
}

function updatePizzaPrice() {
  const item = itemBySku(pizzaSku);
  if (!item) return;
  let extra = 0;
  for (const sel of chosenOptions()) {
    const found = optionByKey(item, sel.key);
    if (found) extra += found.option.priceCents * sel.qty;
  }
  const unit = item.priceCents + extra;
  $('#pizzaPrice').textContent = money(unit);
  $('#pizzaQtyOut').textContent = String(pizzaQty);
  const problem = selectionProblem(item);
  $('#pizzaAdd').disabled = Boolean(problem);
  $('#pizzaAdd').textContent = `Add to order · ${money(unit * pizzaQty)}`;
  if (problem) {
    $('#pizzaStatus').className = 'status show err';
    $('#pizzaStatus').textContent = problem;
  } else if ($('#pizzaStatus').classList.contains('err')) {
    $('#pizzaStatus').className = 'status';
    $('#pizzaStatus').textContent = '';
  }
}

function selectionProblem(item) {
  for (const group of item.groups || []) {
    const limits = groupLimits(group);
    const count = groupCount(item, group);
    if (count < limits.min) return `Choose ${limits.min} from ${group.name}.`;
    if (limits.max != null && count > limits.max) return `Choose at most ${limits.max} from ${group.name}.`;
  }
  return '';
}

$('#pizzaMods').addEventListener('change', (event) => {
  const input = event.target;
  const key = input.dataset.opt;
  if (!key) return;
  const item = itemBySku(pizzaSku);
  const found = item && optionByKey(item, key);
  if (!found) return;
  const limits = groupLimits(found.group);
  if (input.checked && limits.max === 1) {
    for (const other of $$(`input[data-group="${found.group.id}"]`, $('#pizzaMods'))) {
      if (other !== input) {
        other.checked = false;
        pizzaAdded.delete(other.dataset.opt);
      }
    }
  }
  if (input.checked) pizzaAdded.set(key, 1);
  else pizzaAdded.delete(key);
  updatePizzaPrice();
});
$('#pizzaMods').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-step]');
  if (!button) return;
  const item = itemBySku(pizzaSku);
  const found = item && optionByKey(item, button.dataset.step);
  if (!found) return;
  const limits = groupLimits(found.group);
  const delta = Number(button.dataset.delta);
  const next = Math.max(0, (pizzaAdded.get(found.option.key) || 0) + delta);
  if (next > 20) return;
  if (limits.max != null && groupCount(item, found.group, found.option.key) + next > limits.max) return;
  if (next === 0) pizzaAdded.delete(found.option.key);
  else pizzaAdded.set(found.option.key, next);
  button.parentElement.querySelector('output').textContent = String(next);
  updatePizzaPrice();
});
$('#pizzaLess').addEventListener('click', () => {
  pizzaQty = Math.max(1, pizzaQty - 1);
  updatePizzaPrice();
});
$('#pizzaMore').addEventListener('click', () => {
  pizzaQty = Math.min(30, pizzaQty + 1);
  updatePizzaPrice();
});
$('#pizzaAdd').addEventListener('click', () => {
  const item = itemBySku(pizzaSku);
  if (!item) return;
  const before = JSON.stringify(lines);
  const options = chosenOptions();
  const signature = optionSignature(options);
  const existing = lines.find((line) => line.type === 'item' && line.sku === item.sku && optionSignature(line.options) === signature && !(line.modifierKeys || []).length && !(line.removed || []).length);
  if (existing) existing.qty += pizzaQty;
  else lines.push({ type: 'item', key: `${item.sku}|${signature}`, sku: item.sku, qty: pizzaQty, modifierKeys: [], removed: [], options });
  try {
    priceCart(menu.items, brand?.offer, lines, menu.currency || 'AUD');
  } catch (error) {
    lines = JSON.parse(before);
    $('#pizzaStatus').className = 'status show err';
    $('#pizzaStatus').textContent = error.message;
    return;
  }
  renderCart();
  if (!$('#view-menu').hidden) renderMenu();
  closePizza();
});
$('#closePizza').addEventListener('click', closePizza);
$('#pizzaOverlay').addEventListener('click', closePizza);

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
addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if ($('#pizzaPanel').classList.contains('open')) closePizza();
  else closeCart();
});

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
function syncPartyRule() {
  const party = Number($('#bookParty').value);
  const limit = maxParty();
  const over = Number.isInteger(party) && party > limit;
  const note = $('#bookPreorder');
  const ack = $('#bookPreorderAck');
  note.hidden = !over;
  ack.hidden = !over;
  note.textContent = over
    ? `Parties larger than ${limit} must pre-order. Order the food online before you arrive, and tick the box so we know.`
    : '';
  const box = $('input[name=preorder]', ack);
  box.required = over;
  if (!over) box.checked = false;
}
$('#bookParty').addEventListener('input', syncPartyRule);

function bookSay(message, isError) {
  const el = $('#bookStatus');
  el.className = `status show${isError ? ' err' : ''}`;
  el.textContent = message || '';
}
$('#bookForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button[type=submit]');
  button.disabled = true;
  bookSay('', false);
  try {
    const data = Object.fromEntries(new FormData(event.target).entries());
    const party = Number(data.party);
    const limit = maxParty();
    if (!data.location) throw new Error('Choose Findon Rd or Grange Rd.');
    if (party > limit && data.preorder !== 'yes') throw new Error(`Parties larger than ${limit} must pre-order.`);
    const response = await fetch('/api/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        kind: 'booking',
        fields: {
          name: data.name,
          phone: data.phone,
          email: data.email,
          date: data.date,
          time: data.time,
          party: String(party),
          location: data.location,
          preorder: party > limit ? 'yes' : 'no',
          notes: data.notes || '',
        },
      }),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'The booking could not be sent.');
    const extra = party > limit ? ` Parties larger than ${limit} must pre-order, so please order the food as well.` : '';
    $('#bookConfirm').innerHTML = `<h2>Booking requested</h2><p>Table for ${party} at ${esc(data.location)} on ${esc(data.date)} at ${esc(fmt(data.time))}. We'll confirm by email.${esc(extra)}</p>`;
    $('#bookConfirm').hidden = false;
    $('#bookForm').hidden = true;
  } catch (error) {
    bookSay(error.message || 'The booking could not be sent.', true);
  } finally {
    button.disabled = false;
  }
});

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
  renderCats();
  paintStores();
  renderCart();
  route();
  if (params.get('cart')) openCart();
}

start().catch((error) => {
  const note = $('#catNote');
  if (note) note.textContent = error.message || 'The menu could not load.';
});
