import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { loadBrand, applyRuntime } from '../server/brand.js';
import { SANDBOX_API, SANDBOX_SDK } from '../server/constants.js';

const root = path.resolve(import.meta.dirname, '..');
const { brand: loaded, menu } = loadBrand('roccos', root);
const brand = applyRuntime(loaded, {});
const squareConfig = {
  environment: 'sandbox',
  applicationId: 'sandbox-sq0idb-rqkEoTTcR7FYJQCQiDjBYw',
  locationId: 'LFXEWDVVKRYC0',
  sdkUrl: SANDBOX_SDK,
  apiBase: SANDBOX_API,
  currency: 'AUD',
  accessToken: 'EAAAsuper-secret-token',
};

function listen(handler) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function withServer(square, fn) {
  const enquiryFile = path.join(os.tmpdir(), `roccos-enquiries-${Date.now()}-${Math.random().toString(16).slice(2)}.jsonl`);
  const handler = createApp({
    brand,
    menu,
    square,
    squareConfig,
    publicDir: path.join(root, 'public'),
    sharedDir: path.join(root, 'shared'),
    enquiryFile,
    menuCacheMs: 0,
  });
  const server = await listen(handler);
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`, enquiryFile);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(enquiryFile, { force: true });
  }
}

test('the site serves the v3 page, local menu, and photos without a token', async () => {
  await withServer(null, async (base) => {
    const page = await fetch(`${base}/`);
    const html = await page.text();
    assert.equal(page.status, 200);
    assert.match(html, /Choose a store/);
    assert.match(html, /Book a table/);
    assert.match(html, /Pick up within 30 minutes/);
    assert.match(html, /sandbox-sq0idb-rqkEoTTcR7FYJQCQiDjBYw/);
    assert.doesNotMatch(html, /EAAAsuper-secret-token/);
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.equal(config.square.paymentsReady, false);
    assert.equal(config.square.environment, 'sandbox');
    assert.match(config.brand.offer.copy, /10% off your entire order when you order two or more pizzas/);
    assert.match(html, /10% off your entire order when you order two or more pizzas/);
    assert.match(html, /id="cartSubtotal"/);
    assert.match(html, /id="cartHint"/);
    assert.match(html, /id="view-read"/);
    assert.doesNotMatch(html, /hero-strip|ticker-bottom|3 Pizza Deal|Build your deal/);
    assert.equal(config.brand.offer.percent, 10);
    assert.equal(config.brand.offer.minPizzas, 2);
    assert.equal(config.brand.offer.thresholdCents, undefined);
    assert.equal(config.brand.deal, undefined);
    assert.equal(config.accessToken, undefined);
    const current = await (await fetch(`${base}/api/menu`)).json();
    assert.equal(current.source, 'local');
    assert.equal(current.items.filter((item) => item.category === 'pizza').length, 14);
    assert.equal(current.items.find((item) => item.sku === 'ROCCO-03').priceCents, 1800);
    const photo = await fetch(`${base}/images/products/15_Roccos_Nutella_Bomb.jpg`);
    assert.equal(photo.status, 200);
    assert.match(photo.headers.get('content-type'), /image\/jpeg/);
    const hidden = await fetch(`${base}/data/menu.roccos.json`);
    assert.equal(hidden.status, 404);
    const checkout = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lines: [] }),
    });
    const denied = await checkout.json();
    assert.equal(checkout.status, 503);
    assert.match(denied.error, /SQUARE_ACCESS_TOKEN/);
    assert.doesNotMatch(JSON.stringify(denied), /EAAAsuper-secret-token/);
  });
});

test('a table booking is stored, and a party over the limit must pre-order', async () => {
  await withServer(null, async (base, enquiryFile) => {
    const config = await (await fetch(`${base}/api/config`)).json();
    assert.equal(config.brand.booking.maxParty, 10);
    const tooBig = await fetch(`${base}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'booking',
        fields: { name: 'Alex', phone: '0412345678', email: 'alex@example.com', date: '2026-12-01', time: '18:00', party: '12', location: 'Findon Rd' },
      }),
    });
    const denied = await tooBig.json();
    assert.equal(tooBig.status, 400);
    assert.match(denied.error, /larger than 10 must pre-order/);
    const ok = await fetch(`${base}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'booking',
        fields: { name: 'Alex', phone: '0412345678', email: 'alex@example.com', date: '2026-12-01', time: '18:00', party: '4', location: 'Grange Rd', preorder: 'no' },
      }),
    });
    assert.equal(ok.status, 200);
    const big = await fetch(`${base}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'booking',
        fields: { name: 'Alex', phone: '0412345678', email: 'alex@example.com', date: '2026-12-01', time: '18:30', party: '12', location: 'Findon Rd', preorder: 'yes' },
      }),
    });
    assert.equal(big.status, 200);
    const lines = fs.readFileSync(enquiryFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines.length, 2);
    assert.equal(lines[0].kind, 'booking');
    assert.equal(lines[1].fields.preorder, 'yes');
    assert.doesNotMatch(JSON.stringify(lines), /EAAAsuper-secret-token/);
  });
});

test('forms are stored for the configured inbox', async () => {
  await withServer(null, async (base, enquiryFile) => {
    const ok = await fetch(`${base}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: 'catering',
        fields: { name: 'Alex', phone: '0412345678', email: 'alex@example.com', date: '2026-12-01', people: '20', location: 'Findon Rd', details: 'Office lunch' },
      }),
    });
    const body = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(body.delivery, 'stored');
    const gift = await fetch(`${base}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'gift-card', fields: { from: 'Alex', email: 'alex@example.com', amount: '$50' } }),
    });
    assert.equal(gift.status, 200);
    const club = await fetch(`${base}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'club', fields: { name: 'Alex', email: 'alex@example.com' } }),
    });
    assert.equal(club.status, 200);
    const bad = await fetch(`${base}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'gift-card', fields: { from: 'Alex', email: 'nope', amount: '$50' } }),
    });
    assert.equal(bad.status, 400);
    const lines = fs.readFileSync(enquiryFile, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    assert.equal(lines.length, 3);
    assert.equal(lines[0].destination, 'placeholder@example.com');
    assert.equal(lines[0].fields.people, '20');
    assert.equal(lines[2].kind, 'club');
  });
});

test('checkout creates a sandbox order and payment, and refuses a mismatched total', async () => {
  const calls = [];
  const square = {
    async listCatalog() {
      return [];
    },
    async createOrder(order) {
      calls.push({ type: 'order', order });
      const amount = order.line_items.reduce((sum, line) => sum + line.base_price_money.amount * Number(line.quantity), 0)
        - (order.discounts || []).reduce((sum, discount) => sum + discount.amount_money.amount, 0);
      return { order: { id: 'ORDER1', total_money: { amount, currency: 'AUD' } } };
    },
    async createPayment(payment) {
      calls.push({ type: 'payment', payment });
      return { payment: { id: 'PAY1', status: 'COMPLETED', order_id: 'ORDER1', receipt_url: 'https://squareup.com/receipt/preview/test' } };
    },
  };
  await withServer(square, async (base) => {
    const response = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        sourceId: 'cnon:card-nonce',
        locationKey: 'grange',
        when: 'asap',
        name: 'Alex',
        phone: '0412345678',
        notes: 'Gate code 12',
        lines: [
          { type: 'item', sku: 'ROCCO-02', qty: 2, modifierKeys: [] },
        ],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.orderId, 'ORDER1');
    assert.equal(body.paymentId, 'PAY1');
    assert.equal(body.totalCents, 3600);
    assert.equal(calls[0].order.discounts[0].scope, 'ORDER');
    assert.equal(calls[0].order.discounts[0].amount_money.amount, 400);
    assert.equal(calls[0].type, 'order');
    assert.match(calls[0].order.note, /Grange Rd/);
    assert.match(calls[0].order.note, /Gate code 12/);
    assert.equal(calls[1].payment.amount_money.amount, 3600);
    assert.equal(calls[1].payment.order_id, 'ORDER1');
    assert.equal(calls[1].payment.location_id, 'LFXEWDVVKRYC0');
    assert.equal(calls[1].payment.idempotency_key, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee-pay');
    assert.doesNotMatch(JSON.stringify(calls), /EAAAsuper-secret-token/);
  });

  const mismatch = {
    async listCatalog() { return []; },
    async createOrder() {
      return { order: { id: 'ORDER2', total_money: { amount: 9999, currency: 'AUD' } } };
    },
    async createPayment() {
      throw new Error('payment should not run');
    },
  };
  await withServer(mismatch, async (base) => {
    const response = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'cnon:card-nonce',
        locationKey: 'findon',
        when: 'asap',
        name: 'Alex',
        phone: '0412345678',
        lines: [{ type: 'item', sku: 'ROCCO-03', qty: 1, modifierKeys: [] }],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.match(body.error, /No card was charged/);
    assert.equal(body.orderId, 'ORDER2');
  });
});

test('a stale Square catalog price does not change what checkout charges', async () => {
  const square = {
    async listCatalog() {
      return [{
        type: 'CATEGORY',
        id: 'CAT',
        category_data: { name: 'Pizzas' },
      }, {
        type: 'CATEGORY',
        id: 'CAT_DRINKS',
        category_data: { name: 'Drinks' },
      }, {
        type: 'ITEM',
        id: 'ITEM',
        item_data: {
          name: 'Margherita',
          description: 'From Square',
          category_id: 'CAT',
          categories: [{ id: 'CAT' }],
          food_and_beverage_details: { dietary_preferences: [{ type: 'STANDARD', standard_name: 'VEGETARIAN' }] },
          variations: [{
            id: 'VAR',
            item_variation_data: { sku: 'ROCCO-02', price_money: { amount: 2100, currency: 'AUD' } },
          }],
        },
      }, {
        type: 'ITEM',
        id: 'BEER',
        item_data: {
          name: 'Peroni',
          category_id: 'CAT_DRINKS',
          categories: [{ id: 'CAT_DRINKS' }],
          variations: [{
            id: 'VAR_BEER',
            item_variation_data: { sku: 'ROCCO-DR01', price_money: { amount: 890, currency: 'AUD' } },
          }],
        },
      }];
    },
    async createOrder(order) {
      assert.equal(order.line_items[0].catalog_object_id, undefined);
      assert.equal(order.line_items[0].base_price_money.amount, 2000);
      return { order: { id: 'ORDER3', total_money: { amount: 2000, currency: 'AUD' } } };
    },
    async createPayment(payment) {
      assert.equal(payment.amount_money.amount, 2000);
      return { payment: { id: 'PAY3', status: 'COMPLETED', receipt_url: null } };
    },
  };
  await withServer(square, async (base) => {
    const current = await (await fetch(`${base}/api/menu`)).json();
    assert.equal(current.source, 'square');
    const margherita = current.items.find((item) => item.sku === 'ROCCO-02');
    assert.equal(margherita.name, 'MARGHERITA (v)');
    assert.equal(margherita.priceCents, 2000);
    assert.equal(current.items.some((item) => /peroni|hahn|stone|shiraz|squire/i.test(item.name)), false);
    const response = await fetch(`${base}/api/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourceId: 'cnon:card-nonce',
        locationKey: 'findon',
        when: 'asap',
        name: 'Alex',
        phone: '0412345678',
        lines: [{ type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: [] }],
      }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    assert.equal(body.totalCents, 2000);
  });
});
