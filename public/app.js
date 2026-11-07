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
let payments = null;
let cardLocationId = null;
let store = null;
const dealCounts = [];
const PHONE_ICON = '<svg class="ic" aria-hidden="true"><use href="#ph"/></svg>';
const on = (flag) => Boolean(brand?.features?.[flag]);

const header = $('#top');
const onScroll = () => header.classList.toggle('scrolled', scrollY > 30);
onScroll();
addEventListener('scroll', onScroll, { passive: true });
const burger = $('.burger');
const links = $('#links');
burger.addEventListener('click', () => {
  const open = links.classList.toggle('open');
  burger.setAttribute('aria-expanded', String(open));
});
$$('#links a').forEach((link) => link.addEventListener('click', () => links.classList.remove('open')));
const io = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      io.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });
$$('.reveal').forEach((el) => io.observe(el));

function money(cents) {
  return formatMoney(cents, menu.currency || 'AUD');
}

function applyBrand() {
  if (!brand) return;
  document.title = brand.id === 'roccos' ? `${brand.name} — ${brand.tagline}, Adelaide` : `${brand.name} — ${brand.tagline}`;
  if (brand.colors) {
    for (const [key, value] of Object.entries(brand.colors)) {
      document.documentElement.style.setProperty(`--${key}`, value);
    }
  }
  if (brand.logoText) {
    $$('.logo-box').forEach((box) => {
      box.innerHTML = `<span class="logo-text">${esc(brand.logoText)}</span>`;
    });
  } else if (brand.logoImage) {
    $$('.logo-box img').forEach((img) => { img.src = brand.logoImage; img.alt = `${brand.name} — ${brand.tagline}`; });
  }
  const hero = brand.hero;
  if (hero) {
    if (hero.eyebrow) $('#heroEyebrow').textContent = hero.eyebrow;
    if (hero.title) {
      const title = $('#heroTitle');
      const safe = esc(hero.title);
      title.innerHTML = hero.titleEmphasis && hero.title.includes(hero.titleEmphasis)
        ? safe.replace(esc(hero.titleEmphasis), `<em>${esc(hero.titleEmphasis)}</em>`)
        : safe;
    }
    if (hero.lead) $('#heroLead').textContent = hero.lead;
  }
  const story = brand.story;
  if (story) {
    if (story.heading) $('#storyHeading').textContent = story.heading;
    if (story.paragraphs) {
      $('#storyBody').innerHTML = story.paragraphs.map((paragraph) => `<p>${esc(paragraph)}</p>`).join('');
    }
    if (story.quote) {
      const safe = esc(story.quote);
      const html = story.quoteEmphasis && story.quote.includes(story.quoteEmphasis)
        ? safe.replace(esc(story.quoteEmphasis), `<span>${esc(story.quoteEmphasis)}</span>`)
        : safe;
      $('#storyQuote').innerHTML = `“${html}”`;
    }
    if (story.cite) $('#storyCite').textContent = story.cite;
  }
  $$('a[href^="tel:"]').forEach((link) => {
    link.href = `tel:${brand.phoneTel}`;
    if (link.id === 'heroPhone' || link.closest('footer') || link.id === 'mbarCall') {
      if (link.id !== 'mbarCall') link.textContent = brand.phone;
    }
  });
  $('#botPhone').textContent = brand.phone;
  const club = $('#clubTitle');
  if (club && brand.id === 'roccos') club.textContent = "Rocco's Club";
  else if (club && brand.name) club.textContent = `${brand.name} Club`;
  // Feature toggles: anything marked data-feature="x" shows only when brand.features.x is true.
  $$('[data-feature]').forEach((el) => { el.hidden = !on(el.dataset.feature); });
  const locs = brand.locations || [];
  const ai = brand.aiOrdering?.enabled ? brand.aiOrdering : null;
  $('#footerMeta').innerHTML = locs.map((loc) => `<div class="fm-shop"><b>${esc(loc.name)}</b><span class="fm-addr">${esc(loc.address)}</span>${phoneLink(loc)}${ai ? `<span class="fm-ai">AI phone line: call <a href="tel:${esc(ai.phoneTel || loc.phoneTel || brand.phoneTel)}">${esc(ai.phone || loc.phone || brand.phone)}</a> and order in any language</span>` : ''}</div>`).join('')
    || `<a href="tel:${esc(brand.phoneTel)}">${esc(brand.phone)}</a>`;
  $('#footerNote').textContent = square?.environment === 'production' ? 'Pickup orders' : 'Sandbox demo · test cards only';
  const heroMeta = $('#heroMeta');
  if (heroMeta) heroMeta.innerHTML = locs.map((loc) => `<div><b>${esc(loc.name)}</b><span class="badge" data-status="${esc(loc.key)}">Checking hours…</span></div>`).join('');
  if (!locs.length && heroMeta) {
    heroMeta.innerHTML = `<div><b>Call</b><a href="tel:${esc(brand.phoneTel)}" style="text-decoration:none">${esc(brand.phone)}</a></div>`;
  }
  try { store = sessionStorage.getItem(`store:${brand.id}`); } catch { store = null; }
  if (!locs.some((loc) => loc.key === store)) store = locs[0]?.key || null;
  buildVisit();
  buildStoreButtons();
  paintAi();
  paintVideos();
  buildLocs();
  paintStatus();
  if (brand.instagram) {
    $('#igWrap').hidden = false;
    $('#igLink').href = brand.instagram;
  }
  if (brand.videoUrl && !(brand.videos || []).length) {
    const frame = $('#vidFrame');
    frame.innerHTML = /\.mp4($|\?)/i.test(brand.videoUrl)
      ? `<video src="${esc(brand.videoUrl)}" controls playsinline></video>`
      : `<iframe src="${esc(brand.videoUrl)}" title="Story" allowfullscreen loading="lazy"></iframe>`;
  }
  const doughShops = locs.map((loc) => `<a class="btn btn-primary btn-sm" href="tel:${esc(loc.phoneTel || brand.phoneTel)}">${PHONE_ICON} ${esc(loc.name)}</a>`).join('');
  if ($('#doughActs')) $('#doughActs').innerHTML = doughShops;
  if ($('#bookActs') && locs.length) $('#bookActs').innerHTML = locs.map((loc) => `<a class="btn btn-primary" href="tel:${esc(loc.phoneTel || brand.phoneTel)}">${PHONE_ICON} Book at ${esc(loc.name)} · ${esc(loc.phone || brand.phone)}</a>`).join('');
  const pay = $('#payNote');
  if (square?.environment === 'sandbox') {
    pay.textContent = square.paymentsReady
      ? 'Square sandbox. Test card 4111 1111 1111 1111, any future expiry, any CVV, any postcode. No real money moves.'
      : 'The card form can load, but the server has no SQUARE_ACCESS_TOKEN yet, so a payment cannot be completed.';
  } else {
    pay.textContent = 'Card details go to Square. We never see the card number.';
  }
}

function locByKey(key) {
  return (brand?.locations || []).find((loc) => loc.key === key) || null;
}
function phoneLink(loc, cls = 'tel') {
  const phone = loc?.phone || brand.phone;
  const tel = loc?.phoneTel || brand.phoneTel;
  return `<a class="${cls}" href="tel:${esc(tel)}">${PHONE_ICON}<span>${esc(phone)}</span></a>`;
}
function mapsUrl(loc) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.mapQuery || loc.address)}`;
}
function buildVisit() {
  const grid = $('#visitGrid');
  if (!grid) return;
  grid.innerHTML = (brand.locations || []).map((loc) => `<article class="visit-card">
      <div class="vk">Visit us</div>
      <h3>${esc(loc.name)}</h3>
      <p class="va">${esc(loc.address)}</p>
      ${loc.daysLabel ? `<p class="vd">${esc(loc.daysLabel)}</p>` : ''}
      ${phoneLink(loc, 'tel big-tel')}
      <div class="vacts"><a class="btn btn-light btn-sm" target="_blank" rel="noopener" href="${mapsUrl(loc)}">Visit us · directions</a>
      <a class="btn btn-ghost btn-sm" href="#menu" data-order="${esc(loc.key)}">Order from ${esc(loc.name)}</a></div>
    </article>`).join('');
}
function buildStoreButtons() {
  const locs = brand.locations || [];
  const btn = (loc, cls) => `<button type="button" class="${cls}${loc.key === store ? ' active' : ''}" role="radio" aria-checked="${loc.key === store}" data-store="${esc(loc.key)}"><b>${esc(loc.name)}</b><small>${esc(loc.address)}</small></button>`;
  $('#coStores').innerHTML = locs.map((loc) => btn(loc, 'store-btn')).join('');
  $('#ssBtns').innerHTML = locs.map((loc) => btn(loc, 'ss-btn')).join('');
  const today = (loc) => {
    const day = DAYS[adelaideParts(new Date()).dow];
    const ranges = brand?.hours?.[loc.key]?.[day] || [];
    return ranges.length ? `Today ${ranges.map((r) => `${fmt(r[0])}–${fmt(r[1])}`).join(', ')}` : 'Closed today';
  };
  $('#osCards').innerHTML = locs.map((loc) => `<a href="#menu" class="os-card" role="radio" data-order="${esc(loc.key)}" data-store="${esc(loc.key)}" aria-checked="false">
      <span class="os-pin">📍</span>
      <b>${esc(loc.name)}</b>
      <span class="os-addr">${esc(loc.address)}</span>
      <span class="badge" data-status="${esc(loc.key)}">Checking hours…</span>
      <span class="os-today">${esc(today(loc))} · ${esc(loc.daysLabel || '')}</span>
      <span class="os-go">Order from ${esc(loc.name)} →</span>
    </a>`).join('');
  paintStatus();
  paintStore();
}
function paintStore() {
  const loc = locByKey(store);
  $('#coWhere').value = store || '';
  $$('[data-store]').forEach((el) => {
    const active = el.dataset.store === store;
    el.classList.toggle('active', active);
    el.setAttribute('aria-checked', String(active));
  });
  const label = loc ? `${loc.name} · ${loc.address}` : '';
  $('#drawerStore').innerHTML = loc ? `Ordering from <b>${esc(loc.name)}</b> (${esc(loc.address)})` : '';
  $('#cartStore').textContent = loc ? `· ${loc.name}` : '';
  $('#storeSwitch').dataset.current = label;
  paintChosen();
  buildSlots();
}
function isChosen() { try { return sessionStorage.getItem(`chosen:${brand?.id}`) === '1'; } catch { return false; } }
function markChosen() {
  try { sessionStorage.setItem(`chosen:${brand.id}`, '1'); } catch { /* ignore */ }
  paintChosen();
}
function paintChosen() {
  const chosen = isChosen();
  document.body.classList.toggle('shop-chosen', chosen);
  $$('.os-card').forEach((el) => {
    const on = chosen && el.dataset.store === store;
    el.classList.toggle('active', on);
    el.setAttribute('aria-checked', String(on));
  });
  $$('.os-steps li').forEach((li, i) => li.classList.toggle('on', i === (chosen ? 1 : 0)));
}
function needShop() {
  if (isChosen()) return false;
  const step = $('#order');
  step.scrollIntoView({ behavior: 'smooth', block: 'start' });
  step.classList.remove('nudge'); void step.offsetWidth; step.classList.add('nudge');
  return true;
}
function setStore(key) {
  if (!locByKey(key) || key === store) return;
  store = key;
  card = null;
  try { sessionStorage.setItem(`store:${brand.id}`, key); } catch { /* ignore */ }
  paintStore();
  if ($('#drawer').classList.contains('open')) initCard().catch((error) => say(error.message || 'The card form could not load.', true));
}
document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-store]');
  if (button) setStore(button.dataset.store);
  const order = event.target.closest('[data-order]');
  if (order) setStore(order.dataset.order);
  if (button || order) markChosen();
});
function paintAi() {
  const ai = brand.aiOrdering;
  $('#ai-order').hidden = !ai?.enabled;
  $('#heroAi').hidden = !ai?.enabled;
  if (!ai?.enabled) return;
  const tel = ai.phoneTel || brand.phoneTel;
  const phone = ai.phone || brand.phone;
  $$('#heroAi,#aiCall').forEach((link) => { link.href = `tel:${tel}`; });
  $('#aiNum').textContent = phone;
  $('#heroAiNum').textContent = `AI phone ordering · ${phone}`;
  if (ai.headline) $('#aiHead').textContent = ai.headline;
  if (ai.body) $('#aiBody').textContent = ai.body;
}
function paintHeroPhotos() {
  const box = $('#heroPhotos');
  if (!box) return;
  const pizzas = (menu.items || []).filter((item) => item.category === 'pizza' && item.imageUrl);
  const best = (brand?.bestSellers || []).map((entry) => pizzas.find((item) => item.sku === entry.sku)).filter(Boolean);
  const picks = [...new Set([...best, ...pizzas])].slice(0, 5);
  box.innerHTML = picks.map((item, i) => `<button type="button" class="hp hp-${i}" data-sku="${esc(item.sku)}" aria-label="${esc(item.name)}"><img src="${esc(item.imageUrl)}" alt="${esc(item.name)}"><span class="hp-name">${esc(item.name)} · ${money(item.priceCents)}</span></button>`).join('');
  box.onclick = (event) => {
    const btn = event.target.closest('.hp');
    if (!btn) return;
    const was = btn.classList.contains('show');
    $$('.hp', box).forEach((b) => b.classList.remove('show'));
    if (!was) btn.classList.add('show');
  };
}
function paintVideos() {
  const videos = brand.videos || [];
  if (!videos.length) return;
  const hero = $('#heroVideo');
  let index = 0;
  const dots = $('#hvDots');
  dots.innerHTML = videos.map((video, i) => `<button type="button" data-v="${i}" aria-label="Video ${i + 1}: ${esc(video.caption || '')}"></button>`).join('');
  const play = (i) => {
    index = (i + videos.length) % videos.length;
    hero.src = videos[index].src;
    hero.poster = videos[index].poster || '';
    hero.muted = true;
    hero.play().catch(() => {});
    $$('button', dots).forEach((dot, n) => dot.classList.toggle('on', n === index));
  };
  hero.addEventListener('ended', () => play(index + 1));
  dots.addEventListener('click', (event) => {
    const dot = event.target.closest('[data-v]');
    if (dot) play(+dot.dataset.v);
  });
  play(0);
  const frame = $('#vidFrame');
  const showMain = (i) => {
    const video = videos[i];
    frame.innerHTML = `<video src="${esc(video.src)}" poster="${esc(video.poster || '')}" controls playsinline preload="none"></video>`;
    $$('#vidList button').forEach((button, n) => button.classList.toggle('on', n === i));
  };
  $('#vidList').innerHTML = videos.map((video, i) => `<button type="button" data-i="${i}"><img src="${esc(video.poster || '')}" alt="" loading="lazy"><span>${esc(video.caption || `Video ${i + 1}`)}</span></button>`).join('');
  $('#vidList').addEventListener('click', (event) => {
    const button = event.target.closest('button[data-i]');
    if (button) {
      showMain(+button.dataset.i);
      $('video', frame).play().catch(() => {});
    }
  });
  showMain(1 % videos.length);
}

function renderBestSellers() {
  const grid = $('#bsGrid');
  const picks = (brand?.bestSellers || []).map((entry) => ({ ...entry, item: itemBySku(entry.sku) })).filter((entry) => entry.item);
  $('#bestsellers').hidden = !picks.length && !brand?.deal;
  grid.innerHTML = picks.map(({ item, badge }) => `<article class="bs-tile" data-sku="${esc(item.sku)}">
      <div class="bs-photo">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" loading="lazy">` : ''}<span class="bs-badge${/new/i.test(badge) ? ' new' : ''}">${esc(badge || 'Top seller')}</span></div>
      <div class="bs-body"><h3>${esc(item.name)}</h3><span class="bs-price">${money(item.priceCents)}</span>
      <button class="btn btn-primary btn-sm bs-add" type="button">Add to order</button></div>
    </article>`).join('');
}
$('#bsGrid').addEventListener('click', (event) => {
  const button = event.target.closest('.bs-add');
  if (!button) return;
  const sku = button.closest('[data-sku]').dataset.sku;
  addLine(sku, []);
  button.textContent = 'Added ✓';
  setTimeout(() => { button.textContent = 'Add to order'; }, 900);
});

function addLine(sku, modifierKeys) {
  const item = itemBySku(sku);
  if (!item) return false;
  const key = `${item.sku}|${modifierKeys.join(',')}`;
  const existing = lines.find((line) => line.type === 'item' && line.key === key);
  if (existing) existing.qty += 1;
  else lines.push({ type: 'item', key, sku: item.sku, qty: 1, modifierKeys });
  if (!safePrice()) {
    if (existing) existing.qty -= 1;
    else lines.pop();
    return false;
  }
  renderCart();
  bump();
  return true;
}

function paintDeal() {
  const deal = brand?.deal;
  const card = $('#dealCard');
  if (!deal) {
    card.hidden = true;
    $('#promoCard').hidden = true;
    $('#promoBar').hidden = true;
    return;
  }
  card.hidden = false;
  $('#dealName').textContent = deal.name;
  $('#dealPrice').textContent = money(deal.priceCents);
  $('#promoName').textContent = deal.name;
  $('#promoPrice').textContent = money(deal.priceCents);
  $('#promoBlurb').textContent = deal.blurb || `Any ${deal.required} from the list.`;
  $('#promoText').textContent = brand.promos?.bar || `${deal.name}: ${deal.required} pizzas for ${money(deal.priceCents)}`;
  const named = deal.choices.map((choice) => {
    const item = menu.items.find((entry) => entry.sku === choice.sku);
    return { ...choice, name: item?.name || choice.sku };
  });
  const included = named.filter((choice) => !choice.upgradeCents).map((choice) => choice.name);
  const upgrades = named
    .filter((choice) => choice.upgradeCents)
    .map((choice) => `${choice.name} (+${money(choice.upgradeCents)})`);
  $('#dealIncluded').textContent = included.join(' · ');
  $('#dealUpgrades').textContent = upgrades.length ? `Upgrades: ${upgrades.join(' · ')}` : '';
  dealCounts.length = deal.choices.length;
  dealCounts.fill(0);
  renderDeal();
}

function itemBySku(sku) {
  return menu.items.find((item) => item.sku === sku);
}

function renderMenu() {
  const itemsEl = $('#items');
  const food = menu.items.filter((item) => item.category === 'pizza' || item.category === 'dessert');
  const drinks = menu.items.filter((item) => item.category === 'drinks');
  itemsEl.innerHTML = food.map((item) => {
    const tags = [
      item.vegetarian && item.category === 'pizza' ? '<span class="tag">Vegetarian</span>' : '',
      item.containsNuts ? '<span class="tag nut">Contains nuts</span>' : '',
      item.toConfirm ? '<span class="tag confirm">To confirm</span>' : '',
    ].join('');
    const bestTag = (brand?.bestSellers || []).find((entry) => entry.sku === item.sku);
    const opts = (item.modifiers || []).map((mod) => (
      `<label class="opt"><input type="checkbox" data-key="${esc(mod.key)}"> ${esc(mod.name)} <span>+${money(mod.priceCents)}</span></label>`
    )).join('');

    const num = item.category === 'dessert' ? '★' : String(item.number ?? '');
    return `<article class="item photo-card" data-cat="${esc(item.category)}" data-v="${item.vegetarian ? 1 : 0}" data-n="${item.containsNuts ? 1 : 0}" data-sku="${esc(item.sku)}">
      <div class="photo">${item.imageUrl ? `<img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" loading="lazy">` : ''}</div>
      <div class="body">
        <div class="meta"><span class="num">${esc(num)}</span>${bestTag ? `<span class="tag best">${esc(bestTag.badge || 'Top seller')}</span>` : ''}${tags}</div>
        <h3>${esc(item.name)}</h3>
        <div class="price">${money(item.priceCents)}</div>
        ${item.description ? `<p>${esc(item.description)}</p>` : ''}
        ${opts ? `<button class="extras-btn" type="button" aria-expanded="false">+ Extras <span class="xc"></span></button><div class="opts" hidden>${opts}</div>` : ''}
        <div class="buy"><span class="live">${money(item.priceCents)}</span><label class="tick"><input type="checkbox" class="tick-in" aria-label="Add ${esc(item.name)} to order"><span class="box" aria-hidden="true"></span><span class="tl">Add to order</span></label></div>
      </div>
    </article>`;
  }).join('');
  const softFirst = [...drinks].sort((a, b) => Number(Boolean(a.dineInOnly)) - Number(Boolean(b.dineInOnly)));
  $('#drinkList').innerHTML = softFirst.map((item) => (
    `<article class="item drink${item.dineInOnly ? ' dine-in' : ''}" data-cat="drinks" data-sku="${esc(item.sku)}">
      <span class="nm">${esc(item.name)}${item.dineInOnly ? ' <span class="tag dine">Dine-in only</span>' : ''}</span><span class="price">${money(item.priceCents)}</span>
      <div class="buy">${item.dineInOnly ? '<span class="dine-note">At the shop</span>' : '<button class="btn btn-primary btn-sm add" type="button">Add</button>'}</div>
    </article>`
  )).join('');
  $('#drinks').hidden = !drinks.length;
  const source = $('#menuSource');
  if (menu.notice) source.textContent = menu.notice;
  else if (menu.source === 'square') source.textContent = 'Menu loaded from the Square catalog.';
  else if (menu.reason === 'square-error') source.textContent = 'Square did not respond, so this is the saved 1 Nov menu.';
  else if (menu.reason === 'catalog-empty') source.textContent = 'Square has none of these items yet, so this is the saved 1 Nov menu. Run the seed to load them.';
  else source.textContent = 'Showing the saved 1 Nov menu. After the Square catalog is seeded, this page reads from Square.';
  applyFilters();
  renderGallery();
  renderBestSellers();
}

function liveUnit(article) {
  const item = itemBySku(article.dataset.sku);
  if (!item) return 0;
  const extra = $$('input[data-key]:checked', article).reduce((sum, input) => {
    const mod = item.modifiers.find((entry) => entry.key === input.dataset.key);
    return sum + (mod?.priceCents || 0);
  }, 0);
  return item.priceCents + extra;
}

function paintExtrasCount(article) {
  const count = $$('input[data-key]:checked', article).length;
  const badge = $('.extras-btn .xc', article);
  if (badge) badge.textContent = count ? `(${count} added)` : '';
}
$('#items').addEventListener('change', (event) => {
  const article = event.target.closest('.item');
  if (!article || article.dataset.cat === 'drinks') return;
  const live = $('.live', article);
  if (live) live.textContent = money(liveUnit(article));
  paintExtrasCount(article);
});

function onAdd(event) {
  const toggle = event.target.closest('.extras-btn');
  if (toggle) {
    const panel = toggle.nextElementSibling;
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    toggle.classList.toggle('open', !panel.hidden);
    return;
  }
  const button = event.target.closest('.add');
  if (!button) return;
  if (needShop()) return;
  const article = button.closest('.item');
  const item = itemBySku(article.dataset.sku);
  if (!item) return;
  const modifierKeys = $$('input[data-key]:checked', article).map((input) => input.dataset.key).sort();
  if (!addLine(item.sku, modifierKeys)) return;
  $$('input[data-key]', article).forEach((input) => { input.checked = false; });
  const live = $('.live', article);
  if (live) live.textContent = money(item.priceCents);
  paintExtrasCount(article);
  button.textContent = 'Added ✓';
  setTimeout(() => { button.textContent = item.category === 'drinks' ? 'Add' : 'Add to order'; }, 900);
}
$('#items').addEventListener('click', onAdd);
$('#items').addEventListener('change', (event) => {
  const tick = event.target.closest('.tick-in');
  if (!tick) return;
  if (tick.checked && needShop()) { tick.checked = false; return; }
  const article = tick.closest('.item');
  const item = itemBySku(article.dataset.sku);
  if (!item) return;
  if (tick.checked) {
    const modifierKeys = $$('input[data-key]:checked', article).map((input) => input.dataset.key).sort();
    if (!addLine(item.sku, modifierKeys)) { tick.checked = false; return; }
  } else {
    for (let i = lines.length - 1; i >= 0; i -= 1) if (lines[i].type === 'item' && lines[i].sku === item.sku) lines.splice(i, 1);
    renderCart();
  }
  syncTicks();
});
function syncTicks() {
  $$('#items .item').forEach((article) => {
    const tick = $('.tick-in', article);
    if (!tick) return;
    const qty = lines.filter((line) => line.type === 'item' && line.sku === article.dataset.sku).reduce((sum, line) => sum + line.qty, 0);
    tick.checked = qty > 0;
    article.classList.toggle('ticked', qty > 0);
    const label = $('.tl', article);
    if (label) label.textContent = qty > 1 ? `Added ×${qty}` : qty ? 'Added' : 'Add to order';
  });
}
$('#drinkList').addEventListener('click', onAdd);

function applyFilters() {
  const veg = $('#fVeg').checked;
  const nuts = $('#fNut').checked;
  const itemsEl = $('#items');
  $$('.item', itemsEl).forEach((article) => {
    let show = article.dataset.cat === tab;
    if (show && tab === 'pizza') {
      if (veg && article.dataset.v !== '1') show = false;
      if (nuts && article.dataset.n === '1') show = false;
    }
    article.hidden = !show;
  });
  $('#filters').style.display = tab === 'pizza' ? 'flex' : 'none';
}
$$('.tab').forEach((button) => button.addEventListener('click', () => {
  $$('.tab').forEach((tabButton) => tabButton.classList.remove('active'));
  button.classList.add('active');
  tab = button.dataset.f;
  applyFilters();
}));
$('#fVeg').addEventListener('change', applyFilters);
$('#fNut').addEventListener('change', applyFilters);

function renderDeal() {
  const deal = brand?.deal;
  if (!deal) return;
  $('#pickGrid').innerHTML = deal.choices.map((choice, index) => {
    const item = itemBySku(choice.sku);
    const name = item?.name || choice.sku;
    return `<div class="pick"><span class="nm">${esc(name)}${choice.upgradeCents ? `<span class="up">+${money(choice.upgradeCents)}</span>` : ''}</span>
      <span class="qty"><button type="button" data-i="${index}" data-d="-1" aria-label="Fewer ${esc(name)}">−</button><output>${dealCounts[index] || 0}</output><button type="button" data-i="${index}" data-d="1" aria-label="More ${esc(name)}">+</button></span></div>`;
  }).join('');
  const count = dealCounts.reduce((sum, value) => sum + value, 0);
  const upgrade = dealCounts.reduce((sum, value, index) => sum + value * deal.choices[index].upgradeCents, 0);
  const ready = count === deal.required;
  $('#dealNeed').textContent = ready
    ? `Ready: ${money(deal.priceCents + upgrade)}${upgrade ? ` (includes +${money(upgrade)} upgrades)` : ''}`
    : `Pick ${deal.required} pizzas (${count}/${deal.required})`;
  $('#dealAdd').disabled = !ready;
}
$('#pickGrid').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-i]');
  if (!button || !brand?.deal) return;
  const count = dealCounts.reduce((sum, value) => sum + value, 0);
  const index = +button.dataset.i;
  const delta = +button.dataset.d;
  if (delta > 0 && count >= brand.deal.required) return;
  if (delta < 0 && !dealCounts[index]) return;
  dealCounts[index] += delta;
  renderDeal();
});
$('#dealAdd').addEventListener('click', () => {
  const deal = brand.deal;
  const picks = deal.choices
    .map((choice, index) => ({ sku: choice.sku, qty: dealCounts[index] }))
    .filter((pick) => pick.qty > 0);
  lines.push({ type: 'deal', qty: 1, picks });
  if (!safePrice()) {
    lines.pop();
    return;
  }
  dealCounts.fill(0);
  renderDeal();
  renderCart();
  bump();
});
$('#dealToggle').addEventListener('click', (event) => {
  const open = $('#builder').classList.toggle('open');
  event.target.setAttribute('aria-expanded', String(open));
  event.target.textContent = open ? 'Close builder' : 'Build your deal';
});

function safePrice() {
  try {
    priceCart(menu.items, brand?.deal, lines, menu.currency || 'AUD');
    return true;
  } catch (error) {
    const status = $('#coStatus');
    status.className = 'status show err';
    status.textContent = error.message;
    return false;
  }
}

function currentPrice() {
  if (!lines.length) return { totalCents: 0, lines: [] };
  return priceCart(menu.items, brand?.deal, lines, menu.currency || 'AUD');
}

function renderCart() {
  let priced = { totalCents: 0, lines: [] };
  try { priced = currentPrice(); } catch { lines = []; }
  const count = lines.reduce((sum, line) => sum + line.qty, 0);
  syncTicks();
  $('#cartCount').textContent = String(count);
  $('#mbarCount').textContent = count ? `(${count})` : '';
  const box = $('#cartLines');
  if (!count) {
    box.innerHTML = '<div class="empty">Your order is empty.<br>Add something delicious from the menu.</div>';
    $('#cartFoot').hidden = true;
    return;
  }
  box.innerHTML = priced.lines.map((line, index) => `<div class="line"><div class="t">${esc(line.name)}</div><div class="p">${money(line.totalCents)}</div>
    <div class="d">${line.detail ? esc(line.detail) : ''}</div>
    <div class="qty"><button type="button" data-i="${index}" data-d="-1" aria-label="Remove one">−</button><output>${line.qty}</output><button type="button" data-i="${index}" data-d="1" aria-label="Add one">+</button></div></div>`).join('');
  $('#cartTotal').textContent = money(priced.totalCents);
  $('#cartFoot').hidden = false;
  $('#payBtn').textContent = `Pay ${money(priced.totalCents)}`;
  try { sessionStorage.setItem(`cart:${brand?.id || 'roccos'}`, JSON.stringify(lines)); } catch { /* ignore */ }
}
$('#cartLines').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-i]');
  if (!button) return;
  const line = lines[+button.dataset.i];
  line.qty += +button.dataset.d;
  if (line.qty <= 0) lines.splice(+button.dataset.i, 1);
  renderCart();
});
function bump() {
  $('#openCart').animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 280 });
}
function openCart() {
  buildSlots();
  $('#drawer').classList.add('open');
  $('#overlay').classList.add('open');
  $('#confirm').classList.remove('show');
  initCard().catch((error) => say(error.message || 'The card form could not load.', true));
}
function closeCart() {
  $('#drawer').classList.remove('open');
  $('#overlay').classList.remove('open');
}
$('#openCart').addEventListener('click', openCart);
$('#mbarOrder').addEventListener('click', () => { if (lines.length) openCart(); else if (!needShop()) $('#menu').scrollIntoView(); });
$('#closeCart').addEventListener('click', closeCart);
$('#overlay').addEventListener('click', closeCart);
addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeCart();
    closeLb();
  }
});
function whenValue() {
  return $('input[name=when]:checked')?.value || 'asap';
}
function setWhen(value) {
  const radio = $(`input[name=when][value="${value}"]`);
  if (radio) radio.checked = true;
  const timed = value === 'time';
  $('#coTimeWrap').hidden = !timed;
  $('#coDate').required = timed;
  $('#coTime').required = timed;
}
$$('input[name=when]').forEach((radio) => radio.addEventListener('change', () => setWhen(whenValue())));
$('#coDate').addEventListener('change', () => buildTimes());

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
// Exact pickup times for one day: every few minutes from (now + prep) until close.
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
function buildSlots() {
  if (!brand) return;
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
    const ready = Math.max(win.open, nowMin + (brand?.prepMinutes || 20));
    $('#asapLbl').innerHTML = `As soon as possible <b>· ready about ${fmt(hhmm(ready))}</b>`;
    asap.disabled = false;
  } else {
    $('#asapLbl').innerHTML = 'As soon as possible <b>· shop closed now, pick a time</b>';
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
  const want = cartPizzas();
  const isFull = (t) => max && (used[hhmm(t)] || 0) + Math.max(want, 1) > max;
  $('#coTime').innerHTML = times.map((t) => {
    const full = isFull(t);
    const left = max ? max - (used[hhmm(t)] || 0) : null;
    return `<option value="${hhmm(t)}"${full ? ' disabled' : ''}>${fmt(hhmm(t))}${full ? ' · full' : left !== null && left < max ? ` · ${left} pizza${left === 1 ? '' : 's'} left` : ''}</option>`;
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
var slotUse = { key: '', used: {}, max: null, loading: false };
function cartPizzas() {
  let n = 0;
  for (const line of lines) {
    if (line.type === 'item') { if (itemBySku(line.sku)?.category === 'pizza') n += line.qty; }
    else for (const pick of line.picks || []) if (itemBySku(pick.sku)?.category === 'pizza') n += pick.qty * line.qty;
  }
  return n;
}

function say(message, isError) {
  const el = $('#coStatus');
  el.className = `status show${isError ? ' err' : ''}`;
  el.textContent = message;
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
  $('#coStatus').className = 'status';
  try {
    if (!lines.length) throw new Error('Your order is empty.');
    if (!card) await initCard();
    if (!card) throw new Error('The card form is not available.');
    const token = await card.tokenize();
    if (token.status !== 'OK') {
      throw new Error(token.errors?.map((entry) => entry.message).join(' ') || 'Check the card details.');
    }
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
    const confirm = $('#confirm');
    const shop = locByKey(store);
    const ready = data.when === 'time' ? `Ready for pickup at <b>${esc(fmt(data.time))}</b>.` : '<b>Pick up within 30 minutes.</b>';
    confirm.innerHTML = `<h4>Order received</h4><p class="cf-ready">${ready}</p><p class="cf-store">Pick up from <b>${esc(shop?.name || '')}</b>, ${esc(shop?.address || '')}</p><p>Thanks ${esc(data.name)}. Square order <strong>${esc(body.orderId)}</strong> is paid (${esc(body.status)}).</p>
      <pre>${esc(body.summary)}</pre>
      <div class="acts">${body.receiptUrl ? `<a class="btn btn-primary btn-sm" href="${esc(body.receiptUrl)}" target="_blank" rel="noopener">View receipt</a>` : ''}<a class="btn btn-ghost btn-sm" href="tel:${esc(shop?.phoneTel || brand.phoneTel)}">Call ${esc(shop?.name || '')} ${esc(shop?.phone || brand.phone)}</a></div>`;
    confirm.classList.add('show');
    lines = [];
    slotUse.key = '';
    renderCart();
    form.reset();
    paintStore();
    confirm.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (error) {
    say(error.message || 'Payment failed.', true);
  } finally {
    button.disabled = false;
  }
});

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_NAME = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };
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
function status(key) {
  const hours = brand?.hours?.[key];
  if (!hours) {
    const loc = locByKey(key);
    if (loc?.openDays) {
      const open = loc.openDays.includes(adelaideParts(new Date()).dow);
      return { cls: open ? '' : 'closed', text: open ? `${loc.daysLabel || 'Open today'}` : `Closed today · ${loc.daysLabel || ''}` };
    }
    return { cls: '', text: 'Call for today’s hours' };
  }
  const now = adelaideNow();
  const today = hours[now.day] || [];
  for (const [open, close] of today) {
    if (now.min >= minutes(open) && now.min < minutes(close)) return { cls: 'open', text: `Open now · until ${fmt(close)}` };
  }
  const next = today.find(([open]) => now.min < minutes(open));
  if (next) return { cls: 'closed', text: `Closed · opens ${fmt(next[0])}` };
  for (let i = 1; i <= 7; i += 1) {
    const day = DAYS[(DAYS.indexOf(now.day) + i) % 7];
    const ranges = hours[day];
    if (ranges?.length) return { cls: 'closed', text: `Closed · opens ${i === 1 ? 'tomorrow' : DAY_NAME[day]} ${fmt(ranges[0][0])}` };
  }
  return { cls: 'closed', text: 'Closed' };
}
function hoursTable(key) {
  const hours = brand?.hours?.[key];
  if (!hours) return `<p class="hours-note">${esc(locByKey(key)?.daysLabel || '')}${locByKey(key)?.daysLabel ? '. ' : ''}Exact hours will be listed here. Please call to check before you head over.</p>`;
  const now = adelaideNow();
  return `<table class="hours">${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((day) => `<tr class="${day === now.day ? 'today' : ''}"><td>${DAY_NAME[day]}</td><td>${hours[day]?.length ? hours[day].map((range) => `${fmt(range[0])} – ${fmt(range[1])}`).join(', ') : 'Closed'}</td></tr>`).join('')}</table>`;
}
function paintStatus() {
  $$('[data-status]').forEach((el) => {
    const state = status(el.dataset.status);
    el.className = `badge ${state.cls}`;
    el.textContent = state.text;
  });
}
function buildLocs() {
  const locs = brand?.locations || [];
  if (!locs.length) {
    $('#locTabs').innerHTML = '';
    $('#locPanels').innerHTML = '<p>Stores for this brand are not listed yet.</p>';
    return;
  }
  $('#locTabs').innerHTML = locs.map((loc, index) => `<button class="loc-tab${index ? '' : ' active'}" type="button" role="tab" data-k="${esc(loc.key)}">${esc(loc.name)}</button>`).join('');
  $('#locPanels').innerHTML = locs.map((loc, index) => `<div class="loc-panel${index ? '' : ' active'}" id="loc-${esc(loc.key)}" data-k="${esc(loc.key)}">
    <div class="loc-info"><h3>${esc(loc.name)}</h3><div class="addr">${esc(loc.address)}</div>
      <span class="badge" data-status="${esc(loc.key)}"></span>
      ${hoursTable(loc.key)}
      <div class="acts"><a class="btn btn-primary btn-sm" href="tel:${esc(loc.phoneTel || brand.phoneTel)}">${PHONE_ICON} ${esc(loc.phone || brand.phone)}</a>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(loc.mapQuery)}">Directions</a>
      <a class="btn btn-ghost btn-sm" href="#menu" data-order="${esc(loc.key)}">Order from here</a></div></div>
    <div class="map" data-q="${esc(loc.mapQuery)}"></div></div>`).join('');
  const query = locs[0]?.mapQuery || brand.name;
  $('#gReview').href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
function showLoc(key, scroll) {
  $$('.loc-tab').forEach((tabButton) => tabButton.classList.toggle('active', tabButton.dataset.k === key));
  $$('.loc-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.k === key));
  const map = $(`#loc-${key} .map`);
  if (map && !map.firstChild) {
    map.innerHTML = `<iframe loading="lazy" title="Map of ${esc(key)}" referrerpolicy="no-referrer-when-downgrade" src="https://maps.google.com/maps?q=${encodeURIComponent(map.dataset.q)}&output=embed"></iframe>`;
  }
  if (scroll) $('#locations').scrollIntoView();
}
$('#locTabs').addEventListener('click', (event) => {
  const tabButton = event.target.closest('.loc-tab');
  if (tabButton) {
    showLoc(tabButton.dataset.k);
    history.replaceState(null, '', `#${tabButton.dataset.k}`);
  }
});
function routeHash() {
  const hash = location.hash.slice(1);
  if ((brand?.locations || []).some((loc) => loc.key === hash)) showLoc(hash, true);
}
addEventListener('hashchange', routeHash);

function renderGallery() {
  const shots = menu.items.filter((item) => item.imageUrl && item.category !== 'drinks').slice(0, 6);
  $('#grid6').innerHTML = shots.map((item, index) => (
    `<button class="tile" type="button" data-i="${index}" aria-label="${esc(item.name)}"><img src="${esc(item.imageUrl)}" alt="${esc(item.name)}" loading="lazy"><span class="cap">${esc(item.name)}</span></button>`
  )).join('');
  $('#grid6').dataset.shots = JSON.stringify(shots.map((item) => ({ src: item.imageUrl, name: item.name })));
}
function closeLb() { $('#lightbox').classList.remove('open'); }
$('#grid6').addEventListener('click', (event) => {
  const tile = event.target.closest('.tile');
  if (!tile) return;
  const shots = JSON.parse($('#grid6').dataset.shots || '[]');
  const shot = shots[+tile.dataset.i];
  if (!shot) return;
  $('#lbBox').innerHTML = `<button aria-label="Close" id="lbClose" type="button">✕</button><img src="${esc(shot.src)}" alt="${esc(shot.name)}">`;
  $('#lightbox').classList.add('open');
  $('#lbClose').addEventListener('click', closeLb);
});
$('#lightbox').addEventListener('click', (event) => { if (event.target.id === 'lightbox') closeLb(); });

const FORM_KIND = {
  'Gift card request': 'gift-card',
  "Rocco's Club signup": 'club',
};
$$('form[data-form]').forEach((form) => form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('button[type=submit]', form);
  const status = $('.status', form);
  button.disabled = true;
  const fields = Object.fromEntries(new FormData(form).entries());
  if (form.dataset.form === "Rocco's Club signup") fields.specials = form.elements.specials?.checked ? 'yes' : 'no';
  try {
    const response = await fetch('/api/enquiries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ kind: FORM_KIND[form.dataset.form], fields }),
    });
    const body = await response.json();
    status.className = `status show${response.ok ? '' : ' err'}`;
    status.textContent = response.ok ? "Thanks! We've got it and we'll be in touch." : (body.error || `Sorry, that didn't send. Please call ${brand?.phone || 'the shop'}.`);
    if (response.ok) form.reset();
  } catch {
    status.className = 'status show err';
    status.textContent = `Sorry, that didn't send. Please call ${brand?.phone || 'the shop'}.`;
  }
  button.disabled = false;
}));

function setupBot() {
  const bot = $('#bot');
  const log = $('#botLog');
  const chips = $('#botChips');
  const input = $('#botInput');
  const link = (href, text) => `<a href="${href}" data-go>${text}</a>`;
  const tel = () => `<a href="tel:${esc(brand?.phoneTel || '')}">${esc(brand?.phone || '')}</a>`;
  function answer(question) {
    const text = question.toLowerCase();
    const pizzas = menu.items.filter((item) => item.category === 'pizza');
    const nuts = menu.items.filter((item) => item.containsNuts).map((item) => item.name);
    const veg = pizzas.filter((item) => item.vegetarian);
    const prices = pizzas.map((item) => item.priceCents);
    const min = prices.length ? Math.min(...prices) : 0;
    const max = prices.length ? Math.max(...prices) : 0;
    const intents = [
      { k: [/\b(hi|hello|hey|g'?day)\b/], a: () => 'Hi! Ask me about the menu, the two shops, ordering, or dietary needs.' },
      { k: [/thank|cheers|thx/], a: () => 'Any time. Enjoy the pizza.' },
      { k: [/hour|open|clos|what time|when/], a: () => `Right now: ${(brand.locations || []).map((loc) => `${esc(loc.name)} is <b>${esc(status(loc.key).text)}</b>`).join(' and ') || 'call us'}. Full hours are in the ${link('#locations', 'Locations section')}.` },
      { k: [/where|address|location|find you|findon|grange|direction|map/], a: () => `We have ${(brand.locations || []).map((loc) => esc(loc.address)).join(' and ') || 'shops listed soon'}. Maps are in the ${link('#locations', 'Locations section')}.` },
      { k: [/phone|call|number|contact|ring/], a: () => `Call us on ${tel()}.` },
      { k: [/order|pick ?up|collect|online|takeaway|take away|pay/], a: () => `Add pizzas from the ${link('#menu', 'menu')}, tap Findon Rd or Grange Rd, pick an exact pickup time and pay by card. Pickup only. You can also call ${tel()} and order in any language.` },
      { k: [/language|italian|chinese|mandarin|vietnam|greek|arabic|speak|\bai\b/], a: () => `Call ${tel()} and our AI phone line will take your order in the language you prefer.` },
      { k: [/dough|base to take|make at home/], a: () => `Yes, we sell our sourdough dough. Ask at either shop or call ${tel()} to put some aside.` },
      { k: [/scissor|cut|slice|dine|eat in|sit/], a: () => 'Dining in, we cut your pizza with scissors and hand it straight over. The wood oven is in the open kitchen, so you can watch.' },
      { k: [/deliver|uber|menulog|doordash/], a: () => `This site is pickup only. For delivery, use the delivery apps or call ${tel()}.` },
      { k: [/price|cost|how much|\$/], a: () => `Pizzas run from ${money(min)} to ${money(max)}. The Nutella Bomb and drinks are on the ${link('#menu', 'menu')} too.` },
      { k: [/vegetarian|veggie|vego|meat.?free/], a: () => `Vegetarian pizzas: <ul>${veg.map((item) => `<li>${esc(item.name)} (${money(item.priceCents)})</li>`).join('')}</ul>` },
      { k: [/vegan|dairy/], a: () => `Nothing is marked vegan. The pizzas use mozzarella. Call ${tel()} and ask what we can do.` },
      { k: [/gluten|coeliac|celiac|wheat/], a: () => `The base is sourdough. Call ${tel()} before you count on a gluten-free option.` },
      { k: [/allerg|nut|pesto|hazelnut/], a: () => `${nuts.join(', ') || 'Some items'} contain nuts. Tell us about allergies in the order notes, and call ${tel()} if you need to check.` },
      { k: [/deal|promo|special|combo|best ?sell|popular|\b50\b/], a: () => brand.deal ? `${esc(brand.deal.name)} is ${money(brand.deal.priceCents)} for ${brand.deal.required} from the list in the ${link('#menu', 'menu')}, with a small upgrade on a few pizzas.` : 'There is no deal on this menu yet.' },
      { k: [/pineapple|hawaiian/], a: () => 'Yes. Add pineapple to the Smoked Ham & Mushroom.' },
      { k: [/dessert|nutella|sweet|calzone/], a: () => 'The Nutella Bomb is a half-circle calzone with Nutella cream and powdered sugar. It contains nuts.' },
      { k: [/drink|beer|wine|alcohol|byo|corkage|soft|juice|water/], a: () => `Soft drinks can go in a pickup order. Alcohol is dine-in only, and BYO has no corkage. Call ${tel()} if you want to check.` },
      { k: [/gift|voucher|present/], a: () => `Request a $25, $50, or $100 card from the ${link('#gift', 'gift card form')}. It is a request, not a charge.` },
      ...(on('club') ? [{ k: [/club|newsletter|subscribe/], a: () => `Join from the ${link('#club', 'club form')}.` }] : []),
    ];
    let best = null;
    let score = 0;
    for (const intent of intents) {
      const hits = intent.k.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
      if (hits > score) { score = hits; best = intent; }
    }
    return best ? best.a() : `I'm not sure about that one. Call us on ${tel()} and we will help.`;
  }
  function add(cls, html) {
    const node = document.createElement('div');
    node.className = `msg ${cls}`;
    node.innerHTML = html;
    log.appendChild(node);
    log.scrollTop = log.scrollHeight;
    return node;
  }
  async function ask(question) {
    const value = question.trim();
    if (!value) return;
    add('me', esc(value));
    const pending = add('bot typing', '•••');
    await new Promise((resolve) => setTimeout(resolve, 280));
    pending.className = 'msg bot';
    pending.innerHTML = answer(value);
    log.scrollTop = log.scrollHeight;
  }
  chips.innerHTML = ['Opening hours', 'Where are you?', 'Vegetarian options', 'Allergies & nuts', 'How do I order?', 'Promos', 'Order in any language']
    .map((label) => `<button type="button">${label}</button>`).join('');
  chips.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (button) ask(button.textContent);
  });
  $('#botForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const value = input.value;
    input.value = '';
    ask(value);
  });
  add('bot', `Hi, I'm the automated FAQ. Ask about the menu, pickup, or allergies. For anything else, call ${esc(brand?.phone || '')}.`);
  const setOpen = (open) => {
    bot.classList.toggle('open', open);
    $('#botBubble').setAttribute('aria-expanded', String(open));
    if (open) input.focus({ preventScroll: true });
  };
  $('#botMin').addEventListener('click', () => setOpen(false));
  let dragged = false;
  $('#botBubble').addEventListener('click', () => { if (!dragged) setOpen(true); });
  addEventListener('keydown', (event) => { if (event.key === 'Escape' && bot.classList.contains('open')) setOpen(false); });
  setTimeout(() => bot.classList.add('notip'), 9000);
  const drag = (handle) => {
    let startX = 0; let startY = 0; let originX = 0; let originY = 0; let moving = false; let id = null;
    handle.addEventListener('pointerdown', (event) => {
      if (event.target.closest('#botMin')) return;
      const rect = bot.getBoundingClientRect();
      startX = event.clientX; startY = event.clientY; originX = rect.left; originY = rect.top; moving = false; id = event.pointerId;
      handle.setPointerCapture(id);
    });
    handle.addEventListener('pointermove', (event) => {
      if (id === null) return;
      const dx = event.clientX - startX; const dy = event.clientY - startY;
      if (!moving && Math.hypot(dx, dy) < 6) return;
      moving = true;
      bot.classList.add('moved');
      const rect = bot.getBoundingClientRect();
      bot.style.left = `${Math.max(8, Math.min(innerWidth - rect.width - 8, originX + dx))}px`;
      bot.style.top = `${Math.max(8, Math.min(innerHeight - rect.height - 8, originY + dy))}px`;
      bot.style.right = 'auto';
      bot.style.bottom = 'auto';
    });
    const end = () => {
      if (id === null) return;
      try { handle.releasePointerCapture(id); } catch { /* ignore */ }
      id = null;
      if (moving) { dragged = true; setTimeout(() => { dragged = false; }, 60); }
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  };
  drag($('#botBubble'));
  drag($('#botHead'));
}

async function start() {
  if (!brand || !square) {
    const response = await fetch('/api/config');
    const body = await response.json();
    brand = body.brand;
    square = body.square;
  }
  applyBrand();
  const response = await fetch('/api/menu');
  menu = await response.json();
  try {
    const saved = JSON.parse(sessionStorage.getItem(`cart:${brand.id}`) || '[]');
    if (Array.isArray(saved)) lines = saved.filter((line) => line && (line.type === 'deal' || menu.items.some((item) => item.sku === line.sku)));
  } catch { /* ignore */ }
  renderMenu();
  paintHeroPhotos();
  paintDeal();
  const locations = $('#locations');
  if (locations) {
    new IntersectionObserver((entries, observer) => {
      if (entries[0].isIntersecting) {
        const active = $('.loc-tab.active');
        if (active) showLoc(active.dataset.k);
        observer.disconnect();
      }
    }, { rootMargin: '300px' }).observe(locations);
  }
  routeHash();
  setInterval(paintStatus, 60_000);
  setInterval(() => { if ($('#drawer').classList.contains('open')) buildSlots(); }, 60_000);
  setupBot();
  renderCart();
  // Preview helper: ?cart=demo fills a sample order and opens the pickup drawer (used for screenshots).
  const params = new URLSearchParams(location.search);
  if (params.get('store')) setStore(params.get('store'));
  if (params.get('cart') === 'demo' && !lines.length) {
    addLine('ROCCO-02', ['prosciutto']);
    addLine('ROCCO-DR07', []);
  }
  if (params.get('cart')) openCart();
  if (params.get('extras') === 'open') {
    const first = $('#items .extras-btn');
    if (first) first.click();
  }
}

start().catch((error) => {
  $('#menuSource').textContent = error.message || 'The menu could not load.';
});
