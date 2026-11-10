import fs from 'node:fs';
import path from 'node:path';
import { presentLocalMenu } from './brand.js';
import { menuFromCatalog } from './catalog.js';
import { recordEnquiry, notifyEnquiry, validateEnquiry } from './enquiries.js';
import { buildCheckout, paymentBody } from './orders.js';
import { buildGiftCardCheckout, placeholderGiftCode } from './giftcards.js';
import { SquareError } from './square.js';
import { createSlotBook } from './slots.js';
import { PriceError, priceCart } from '../shared/pricing.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.mp4': 'video/mp4',
};

function publicBrand(brand) {
  return {
    id: brand.id,
    name: brand.name,
    tagline: brand.tagline,
    status: brand.status || null,
    phone: brand.phone,
    phoneTel: brand.phoneTel,
    logoImage: brand.logoImage || null,
    logoText: brand.logoText || null,
    instagram: brand.instagram || '',
    videoUrl: brand.videoUrl || '',
    videos: brand.videos || [],
    slogan: brand.slogan || '',
    prepMinutes: brand.prepMinutes || 20,
    colors: brand.colors || null,
    hero: brand.hero || null,
    story: brand.story || null,
    hours: brand.hours || {},
    locations: (brand.locations || []).map((location) => ({
      key: location.key,
      name: location.name,
      address: location.address,
      mapQuery: location.mapQuery,
      phone: location.phone || brand.phone,
      phoneTel: location.phoneTel || brand.phoneTel,
      phoneConfirmed: Boolean(location.phoneConfirmed),
      openDays: location.openDays || null,
      daysLabel: location.daysLabel || null,
      squareLocationId: location.squareLocationId,
    })),
    offer: brand.offer && brand.offer.enabled !== false ? {
      id: brand.offer.id,
      name: brand.offer.name,
      percent: brand.offer.percent,
      minPizzas: brand.offer.minPizzas,
      copy: brand.offer.copy,
    } : null,
    features: brand.features || {},
    promos: brand.promos || null,
    bestSellers: brand.bestSellers || [],
    aiOrdering: brand.aiOrdering || null,
    pickup: brand.pickup || null,
  };
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(Object.assign(new Error('Request is too large.'), { status: 413 }));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(Object.assign(new Error('Send JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function sendFile(res, root, rel, req = null) {
  const base = path.resolve(root);
  const target = path.resolve(base, rel);
  if (target !== base && !target.startsWith(`${base}${path.sep}`)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }
  const ext = path.extname(target).toLowerCase();
  const size = fs.statSync(target).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req?.headers?.range || ''));
  if (range && ext === '.mp4') {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2] || 0));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` });
      res.end();
      return;
    }
    res.writeHead(206, {
      'Content-Type': TYPES[ext],
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Cache-Control': 'public, max-age=86400',
    });
    fs.createReadStream(target, { start, end }).pipe(res);
    return;
  }
  res.writeHead(200, {
    'Content-Length': size,
    ...(ext === '.mp4' ? { 'Accept-Ranges': 'bytes' } : {}),
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': ext === '.html' || ext === '.js' || ext === '.css' ? 'no-store' : 'public, max-age=86400',
  });
  fs.createReadStream(target).pipe(res);
}

export function createApp({
  brand,
  menu,
  square = null,
  squareConfig,
  publicDir,
  sharedDir,
  enquiryFile,
  enquiryWebhook = null,
  clock = () => new Date(),
  menuCacheMs = 30_000,
  fetchImpl = fetch,
}) {
  let cache = { at: 0, value: null };
  const slotBook = createSlotBook();

  function configBody() {
    return {
      brand: publicBrand(brand),
      square: {
        environment: squareConfig.environment,
        applicationId: squareConfig.applicationId,
        locationId: squareConfig.locationId,
        sdkUrl: squareConfig.sdkUrl,
        paymentsReady: Boolean(square),
        currency: menu.currency || squareConfig.currency || 'AUD',
      },
    };
  }

  async function currentMenu() {
    const now = Date.now();
    if (cache.value && menuCacheMs > 0 && now - cache.at < menuCacheMs) return cache.value;
    const local = presentLocalMenu(menu);
    if (!square) {
      cache = { at: now, value: { ...local, reason: 'no-token' } };
      return cache.value;
    }
    try {
      const objects = await square.listCatalog();
      const fromSquare = menuFromCatalog(objects, menu, brand);
      if (!fromSquare.items.length) {
        cache = { at: now, value: { ...local, reason: 'catalog-empty' } };
        return cache.value;
      }
      cache = { at: now, value: fromSquare };
      return fromSquare;
    } catch (error) {
      cache = { at: now, value: { ...local, reason: 'square-error', detail: error.message } };
      return cache.value;
    }
  }

  function sendPage(res) {
    const pagePath = path.join(publicDir, 'index.html');
    let page = fs.readFileSync(pagePath, 'utf8');
    const boot = JSON.stringify(configBody()).replace(/</g, '\\u003c');
    page = page.replace('</head>', `<script>window.__BOOT__=${boot}</script></head>`);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(page);
  }

  return async function handle(req, res) {
    const url = new URL(req.url || '/', 'http://localhost');
    const pathname = decodeURIComponent(url.pathname);
    try {
      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          ok: true,
          brand: brand.id,
          square: squareConfig.environment,
          paymentsReady: Boolean(square),
        });
        return;
      }
      if (req.method === 'GET' && pathname === '/api/config') {
        sendJson(res, 200, configBody());
        return;
      }
      if (req.method === 'GET' && pathname === '/api/menu') {
        sendJson(res, 200, await currentMenu());
        return;
      }
      if (req.method === 'POST' && pathname === '/api/quote') {
        const body = await readBody(req);
        const current = await currentMenu();
        sendJson(res, 200, priceCart(current.items, brand.offer, body.lines, current.currency));
        return;
      }
      if (req.method === 'POST' && pathname === '/api/enquiries') {
        const body = await readBody(req);
        const problem = validateEnquiry(body);
        if (problem) {
          sendJson(res, 400, { error: problem });
          return;
        }
        const entry = recordEnquiry({
          file: enquiryFile,
          kind: body.kind,
          fields: body.fields,
          destination: brand.enquiryEmail,
        });
        await notifyEnquiry(entry, { webhook: enquiryWebhook, fetchImpl });
        console.log(`Enquiry ${entry.kind} stored ${entry.id} delivery=${entry.delivery}`);
        sendJson(res, 200, { ok: true, id: entry.id, delivery: entry.delivery, message: "Thanks. We've got your request." });
        return;
      }
      if (req.method === 'GET' && pathname === '/api/slots') {
        const url = new URL(req.url, 'http://x');
        sendJson(res, 200, {
          max: brand.pickup?.maxPizzasPerSlot || null,
          used: slotBook.forDay(url.searchParams.get('location') || '', url.searchParams.get('date') || ''),
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/api/gift-card') {
        if (squareConfig.environment !== 'sandbox') {
          sendJson(res, 403, { error: 'Gift cards stay on the Square sandbox. Nothing was charged.' });
          return;
        }
        if (!square) {
          sendJson(res, 503, {
            error: 'Card payments need a Square sandbox access token on the server. Set SQUARE_ACCESS_TOKEN and restart. Nothing was charged.',
          });
          return;
        }
        const body = await readBody(req);
        const checkout = buildGiftCardCheckout({
          brand,
          body,
          currency: menu.currency || 'AUD',
        });
        let squareCard = null;
        if (typeof square.createGiftCard === 'function') {
          try {
            const created = await square.createGiftCard({
              locationId: checkout.squareLocationId,
              idempotencyKey: `${checkout.idempotencyKey}-card`,
            });
            squareCard = created.gift_card || null;
          } catch (error) {
            console.log(`Gift card issue skipped: ${error.message}`);
            squareCard = null;
          }
        }
        if (squareCard) checkout.order.line_items[0].item_type = 'GIFT_CARD';
        const created = await square.createOrder(checkout.order, `${checkout.idempotencyKey}-order`);
        const order = created.order;
        const amount = order?.total_money?.amount;
        const orderCurrency = order?.total_money?.currency;
        if (!order?.id || amount == null) {
          throw new SquareError('Square did not return an order total. Nothing was charged.', { status: 502 });
        }
        if (amount !== checkout.amountCents || orderCurrency !== checkout.currency) {
          sendJson(res, 409, {
            error: `Square totalled this gift card differently (${amount} ${orderCurrency} vs ${checkout.amountCents} ${checkout.currency}). No card was charged.`,
            orderId: order.id,
          });
          return;
        }
        let paid;
        try {
          paid = await square.createPayment({
            source_id: checkout.sourceId,
            idempotency_key: `${checkout.idempotencyKey}-pay`,
            amount_money: { amount, currency: checkout.currency },
            order_id: order.id,
            location_id: checkout.squareLocationId,
            autocomplete: true,
            reference_id: checkout.order.reference_id,
            note: 'Gift card',
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'The card was declined.';
          sendJson(res, 402, { error: `${message} No charge was completed.`, orderId: order.id });
          return;
        }
        const payment = paid.payment;
        if (!payment || (payment.status !== 'COMPLETED' && payment.status !== 'APPROVED')) {
          sendJson(res, 402, { error: 'The card was not charged.', orderId: order.id, status: payment?.status || 'UNKNOWN' });
          return;
        }
        let issued = false;
        const lineUid = order.line_items?.[0]?.uid;
        if (squareCard?.id && lineUid && typeof square.activateGiftCard === 'function') {
          try {
            await square.activateGiftCard({
              giftCardId: squareCard.id,
              locationId: checkout.squareLocationId,
              orderId: order.id,
              lineItemUid: lineUid,
              idempotencyKey: `${checkout.idempotencyKey}-activate`,
            });
            issued = true;
          } catch (error) {
            console.log(`Gift card activate skipped: ${error.message}`);
          }
        }
        const giftCode = squareCard?.gan || placeholderGiftCode(checkout.idempotencyKey);
        console.log(`Gift card ${order.id} ${amount} ${checkout.currency} issued=${issued}`);
        sendJson(res, 200, {
          ok: true,
          orderId: order.id,
          paymentId: payment.id,
          receiptUrl: payment.receipt_url || null,
          status: payment.status,
          totalCents: amount,
          currency: checkout.currency,
          giftCode,
          issued,
          toName: checkout.toName,
          toEmail: checkout.toEmail,
        });
        return;
      }
      if (req.method === 'POST' && pathname === '/api/checkout') {
        if (!square) {
          sendJson(res, 503, {
            error: 'Card payments need a Square sandbox access token on the server. Set SQUARE_ACCESS_TOKEN and restart. Nothing was charged.',
          });
          return;
        }
        const body = await readBody(req);
        const current = await currentMenu();
        const checkout = buildCheckout({
          brand,
          menuItems: current.items,
          body,
          currency: current.currency || 'AUD',
          now: clock(),
        });
        const cap = brand.pickup?.maxPizzasPerSlot;
        if (cap && body.when === 'time' && checkout.pizzas > 0) {
          const taken = slotBook.used(checkout.location.key, body.date, body.time);
          if (taken + checkout.pizzas > cap) {
            const left = Math.max(0, cap - taken);
            sendJson(res, 409, { error: `That pickup time is full (${cap} pizzas per 15 minutes, ${left} left). Pick another time. Nothing was charged.` });
            return;
          }
        }
        const created = await square.createOrder(checkout.order, `${checkout.idempotencyKey}-order`);
        const order = created.order;
        const amount = order?.total_money?.amount;
        const orderCurrency = order?.total_money?.currency;
        if (!order?.id || amount == null) {
          throw new SquareError('Square did not return an order total. Nothing was charged.', { status: 502 });
        }
        if (amount !== checkout.priced.totalCents || orderCurrency !== checkout.currency) {
          sendJson(res, 409, {
            error: `Square totalled this order differently from the menu (${amount} ${orderCurrency} vs ${checkout.priced.totalCents} ${checkout.currency}). No card was charged.`,
            orderId: order.id,
          });
          return;
        }
        let paid;
        try {
          paid = await square.createPayment(paymentBody({
            checkout,
            orderId: order.id,
            amount,
            currency: checkout.currency,
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : 'The card was declined.';
          sendJson(res, 402, { error: `${message} No charge was completed.`, orderId: order.id });
          return;
        }
        const payment = paid.payment;
        if (!payment || (payment.status !== 'COMPLETED' && payment.status !== 'APPROVED')) {
          sendJson(res, 402, {
            error: 'The card was not charged.',
            orderId: order.id,
            status: payment?.status || 'UNKNOWN',
          });
          return;
        }
        if (body.when === 'time' && checkout.pizzas > 0) slotBook.add(checkout.location.key, body.date, body.time, checkout.pizzas);
        console.log(`Paid ${order.id} ${amount} ${checkout.currency} pickup=${checkout.location.key}`);
        sendJson(res, 200, {
          ok: true,
          orderId: order.id,
          paymentId: payment.id,
          receiptUrl: payment.receipt_url || null,
          status: payment.status,
          totalCents: amount,
          currency: checkout.currency,
          summary: checkout.summary,
        });
        return;
      }
      if (req.method === 'GET' && (pathname === '/' || pathname === '/index.html')) {
        sendPage(res);
        return;
      }
      if (req.method === 'GET' && pathname.startsWith('/shared/')) {
        sendFile(res, sharedDir, pathname.slice('/shared/'.length));
        return;
      }
      if (req.method === 'GET') {
        const rel = pathname.replace(/^\/+/, '');
        if (!rel) {
          sendPage(res);
          return;
        }
        sendFile(res, publicDir, rel, req);
        return;
      }
      sendJson(res, 405, { error: 'Method not allowed.' });
    } catch (error) {
      if (error instanceof PriceError) {
        sendJson(res, 400, { error: error.message });
        return;
      }
      if (error instanceof SquareError) {
        const status = error.status >= 400 && error.status < 500 ? 402 : 502;
        sendJson(res, status, { error: error.message || 'Square could not take that payment.' });
        return;
      }
      const status = error.status || 500;
      if (status >= 500) console.error(error);
      sendJson(res, status, { error: status >= 500 ? 'Something went wrong.' : error.message });
    }
  };
}
