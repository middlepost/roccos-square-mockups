/* Rocco's proposed deals. Edit this file to change a price.
   Menu amounts match Option A. Each deal is cheaper than those menu prices.
   Sides and drinks have no menu price, so they are not in any bundle.
   A side or drink added later would be marked "price TBC" in this file only.
   See OFFERS.md before anything goes live. */
(function (global) {
  var MENU = {
    margherita: { name: 'Margherita', price: 19 },
    marinara: { name: 'Marinara', price: 16 },
    diavola: { name: 'Diavola', price: 24 },
    gamberi: { name: 'Gamberi', price: 26 },
    funghi: { name: 'Funghi', price: 23 },
    prosciutto: { name: 'Prosciutto', price: 26 },
    patate: { name: 'Patate e Rosmarino', price: 21 },
    special: { name: "Rocco's Special", price: 27 }
  };

  function money(n) { return '$' + n; }

  /* deal: the bundle price. off: dollars off the menu total (deal is calculated). */
  var OFFERS = {
    twoFor: {
      items: [{ id: 'margherita', qty: 2 }],
      deal: 32,
      when: 'Any day',
      headline: function (v) { return '2 pizzas for ' + v.now; },
      rule: function (v) { return '2 Margheritas for ' + v.now + '.'; },
      bar: function (v) { return '2 Margheritas · ' + v.now; },
      ticker: function (v) { return '2 pizzas for ' + v.now + '. Two Margheritas, usually ' + v.was + '.'; }
    },
    threeFor: {
      items: [
        { id: 'margherita', qty: 1 },
        { id: 'diavola', qty: 1 },
        { id: 'funghi', qty: 1 }
      ],
      deal: 54,
      when: 'Any day',
      headline: function (v) { return '3 pizzas for ' + v.now; },
      rule: function (v) { return 'Margherita, Diavola and Funghi, 3 pizzas for ' + v.now + '.'; },
      bar: function (v) { return '3 pizzas · ' + v.now; },
      ticker: function (v) { return '3 pizzas for ' + v.now + '. Margherita, Diavola and Funghi, usually ' + v.was + '.'; }
    },
    buyTwo: {
      items: [
        { id: 'margherita', qty: 1 },
        { id: 'marinara', qty: 1 }
      ],
      off: 6,
      when: 'Any day',
      headline: function (v) { return 'Buy 2, save ' + money(v.off); },
      rule: function (v) { return 'Buy any 2 pizzas and save ' + money(v.off) + '. Margherita and Marinara are ' + v.now + ' together.'; },
      bar: function (v) { return 'Buy 2, save ' + money(v.off); },
      ticker: function (v) { return 'Buy any 2 pizzas and save ' + money(v.off) + '.'; }
    },
    weekday: {
      anyPizza: true,
      off: 3,
      items: [{ id: 'margherita', qty: 1 }],
      when: 'Monday to Friday, 11am to 4pm',
      headline: function () { return 'Weekday Lunch Rate'; },
      rule: function (v) { return 'Weekday Lunch Rate: ' + money(v.off) + ' off any pizza, Monday to Friday, 11am to 4pm.'; },
      bar: function (v) { return 'Weekday lunch · ' + money(v.off) + ' off any pizza'; },
      ticker: function (v) { return 'Weekday Lunch Rate: ' + money(v.off) + ' off any pizza, Monday to Friday, 11am to 4pm.'; }
    },
    weekend: {
      items: [
        { id: 'margherita', qty: 1 },
        { id: 'diavola', qty: 1 }
      ],
      deal: 36,
      when: 'Saturday and Sunday',
      headline: function () { return 'Weekend Rate'; },
      rule: function (v) { return 'Weekend Rate: 2 for ' + v.now + ', Saturday and Sunday. Margherita and Diavola.'; },
      bar: function (v) { return 'Weekend · 2 for ' + v.now; },
      ticker: function (v) { return 'Weekend Rate: 2 for ' + v.now + ', Saturday and Sunday. Margherita and Diavola, usually ' + v.was + '.'; }
    },
    family: {
      items: [
        { id: 'margherita', qty: 1 },
        { id: 'marinara', qty: 1 },
        { id: 'patate', qty: 1 }
      ],
      deal: 48,
      when: 'Any day',
      headline: function () { return 'Family deal'; },
      rule: function (v) { return 'Family deal: 3 pizzas for ' + v.now + '. Margherita, Marinara and Patate e Rosmarino.'; },
      bar: function (v) { return 'Family deal · 3 pizzas ' + v.now; },
      ticker: function (v) { return 'Family deal: 3 pizzas for ' + v.now + '. Margherita, Marinara and Patate e Rosmarino, usually ' + v.was + '.'; }
    },
    pizzaNight: {
      items: [{ id: 'diavola', qty: 2 }],
      deal: 40,
      when: 'Any day',
      headline: function () { return 'Pizza night'; },
      rule: function (v) { return 'Pizza night: 2 Diavola for ' + v.now + '.'; },
      bar: function (v) { return 'Pizza night · 2 Diavola ' + v.now; },
      ticker: function (v) { return 'Pizza night: 2 Diavola for ' + v.now + ', usually ' + v.was + '.'; }
    }
  };

  function present(key, itemId) {
    var src = OFFERS[key];
    if (!src) throw new Error('Unknown offer ' + key);
    var items = src.items;
    if (itemId) {
      if (!src.anyPizza || !MENU[itemId]) throw new Error('Cannot price ' + itemId + ' on ' + key);
      items = [{ id: itemId, qty: 1 }];
    }
    var normal = 0;
    var i;
    for (i = 0; i < items.length; i++) normal += MENU[items[i].id].price * items[i].qty;
    var deal = src.off != null ? normal - src.off : src.deal;
    var save = normal - deal;
    var v = {
      off: src.off || 0,
      normal: normal,
      deal: deal,
      save: save,
      was: money(normal),
      now: money(deal),
      saveText: 'Save ' + money(save),
      when: src.when
    };
    v.headline = src.headline(v);
    v.rule = src.rule(v);
    v.bar = src.bar(v);
    v.ticker = src.ticker(v);
    return v;
  }

  function isWeekend(date) {
    var day = date.getDay();
    return day === 0 || day === 6;
  }

  function todayKey(date) {
    return isWeekend(date || new Date()) ? 'weekend' : 'weekday';
  }

  function todayOffer(date) {
    var v = present(todayKey(date));
    v.headline = "Today's deal";
    v.ticker = "Today's deal. " + v.rule;
    v.bar = "Today's deal · " + present(todayKey(date)).bar;
    return v;
  }

  /* Weekday lunch counts down to 4pm the same day, and only while that window is open.
     Weekend rate counts down to the end of Sunday. */
  function countdownTarget(now) {
    var day = now.getDay();
    if (day === 0 || day === 6) {
      var end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 0);
      if (day === 6) end.setDate(end.getDate() + 1);
      return { end: end, label: 'Ends Sunday' };
    }
    var open = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0, 0);
    var shut = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 16, 0, 0, 0);
    if (now < open || now >= shut) return null;
    return { end: shut, label: 'Ends at 4pm' };
  }

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function viewFor(el) {
    var key = el.getAttribute('data-ro');
    var item = el.getAttribute('data-ro-item');
    if (key === 'today') return todayOffer();
    return present(key, item || undefined);
  }

  function paint(root) {
    var nodes = root.querySelectorAll('[data-ro]');
    var i;
    for (i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var part = el.getAttribute('data-ro-part') || 'rule';
      var v = viewFor(el);
      var text = part === 'save' ? v.saveText : v[part];
      if (text != null) el.textContent = text;
    }
  }

  function startCountdown(el) {
    var mode = el.getAttribute('data-ro-countdown') || 'today';
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function tick() {
      var now = new Date();
      if (mode === 'weekend' && !isWeekend(now)) {
        el.hidden = true;
        el.textContent = '';
        return;
      }
      if (mode === 'weekday' && isWeekend(now)) {
        el.hidden = true;
        el.textContent = '';
        return;
      }
      var target = countdownTarget(now);
      if (!target) {
        el.hidden = true;
        el.textContent = '';
        return;
      }
      el.hidden = false;
      if (reduce) {
        el.textContent = target.label;
        return;
      }
      var secs = Math.max(0, Math.floor((target.end.getTime() - Date.now()) / 1000));
      var h = Math.floor(secs / 3600);
      var m = Math.floor((secs % 3600) / 60);
      var s = secs % 60;
      el.textContent = target.label + ' · ' + pad(h) + ':' + pad(m) + ':' + pad(s);
    }
    tick();
    if (!reduce) global.setInterval(tick, 1000);
  }

  function linesFrom(attr) {
    return (attr || '').split(/[\s,]+/).filter(Boolean).map(function (key) {
      return key === 'today' ? todayOffer().ticker : present(key).ticker;
    });
  }

  function startTickers(root) {
    var nodes = root.querySelectorAll('[data-ro-ticker]');
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var n;
    for (n = 0; n < nodes.length; n++) {
      (function (el) {
        var lines = linesFrom(el.getAttribute('data-ro-ticker'));
        if (!lines.length) return;
        var i = 0;
        el.textContent = lines[0];
        if (!reduce && lines.length > 1) {
          global.setInterval(function () {
            i = (i + 1) % lines.length;
            el.textContent = lines[i];
          }, 4000);
        }
      })(nodes[n]);
    }
    var marks = root.querySelectorAll('[data-ro-marquee]');
    for (n = 0; n < marks.length; n++) {
      var sentence = linesFrom(marks[n].getAttribute('data-ro-marquee')).join(' ★ ');
      if (!sentence) continue;
      var loop = sentence + ' ★ ' + sentence + ' ★ ';
      marks[n].textContent = loop;
    }
  }

  function boot() {
    var doc = global.document;
    if (!doc || !doc.head) return;
    var style = doc.createElement('style');
    style.textContent = '.ro-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}.ro-save{display:inline-block;background:#9d1208;color:#fff;font-weight:800;font-size:13px;letter-spacing:.02em;padding:3px 8px;margin-left:6px;border-radius:8px}s[data-ro-part="was"]{text-decoration:line-through;opacity:.75;margin-right:4px}';
    doc.head.appendChild(style);
    paint(doc);
    startTickers(doc);
    var clocks = doc.querySelectorAll('[data-ro-countdown]');
    var c;
    for (c = 0; c < clocks.length; c++) startCountdown(clocks[c]);
  }

  var api = {
    menu: MENU,
    present: present,
    todayKey: todayKey,
    todayOffer: todayOffer,
    countdownTarget: countdownTarget,
    priceOf: function (id) { return MENU[id] ? MENU[id].price : 0; }
  };
  global.RoccoOffers = api;
  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', boot);
    } else boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
