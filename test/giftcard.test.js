import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createApp } from '../server/app.js';
import { loadBrand, applyRuntime } from '../server/brand.js';
import { buildGiftCardCheckout, placeholderGiftCode } from '../server/giftcards.js';
import { SANDBOX_API, SANDBOX_SDK } from '../server/constants.js';

const root = new URL('..', import.meta.url).pathname;
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
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const body = {
  idempotencyKey: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
  sourceId: 'cnon:card-nonce',
  amountCents: 5000,
  toName: 'Jane',
  toEmail: 'jane@example.com',
  fromName: 'Alex',
  message: 'Happy birthday',
};

test('a gift card order is the amount paid, with no pizza discount', () => {
  const checkout = buildGiftCardCheckout({ brand, currency: 'AUD', body });
  assert.equal(checkout.amountCents, 5000);
  assert.equal(checkout.order.discounts, undefined);
  assert.equal(checkout.order.line_items[0].base_price_money.amount, 5000);
  assert.equal(checkout.order.line_items[0].name, 'Gift card');
  assert.equal(checkout.order.fulfillments, undefined);
  assert.match(checkout.note, /Jane/);
  assert.throws(() => buildGiftCardCheckout({ brand, currency: 'AUD', body: { ...body, amountCents: 900 } }), /\$10 to \$500/);
  assert.throws(() => buildGiftCardCheckout({ brand, currency: 'AUD', body: { ...body, amountCents: 50001 } }), /\$10 to \$500/);
  assert.equal(placeholderGiftCode(body.idempotencyKey), 'ROCCO-AAAAAAAA');
});

test('sandbox gift card payment issues a Square card, or a code if Square cannot', async () => {
  const calls = [];
  const square = {
    async createGiftCard() {
      calls.push('create');
      return { gift_card: { id: 'gftc:1', gan: '7783320001001635' } };
    },
    async createOrder(order) {
      calls.push(order.line_items[0].item_type || 'plain');
      assert.equal(order.discounts, undefined);
      return { order: { id: 'G1', total_money: { amount: 5000, currency: 'AUD' }, line_items: [{ uid: 'line-1' }] } };
    },
    async createPayment() {
      calls.push('pay');
      return { payment: { id: 'P1', status: 'COMPLETED' } };
    },
    async activateGiftCard() {
      calls.push('activate');
      return { gift_card_activity: { id: 'gcact_1' } };
    },
  };
  const handler = createApp({
    brand, menu, square, squareConfig,
    publicDir: '/tmp', sharedDir: '/tmp', enquiryFile: '/tmp/none.jsonl', menuCacheMs: 0,
  });
  const server = await listen(handler);
  const { port } = server.address();
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/gift-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const paid = await response.json();
    assert.equal(response.status, 200, JSON.stringify(paid));
    assert.equal(paid.giftCode, '7783320001001635');
    assert.equal(paid.issued, true);
    assert.equal(paid.totalCents, 5000);
    assert.deepEqual(calls, ['create', 'GIFT_CARD', 'pay', 'activate']);
    assert.doesNotMatch(JSON.stringify(paid), /EAAAsuper-secret-token/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }

  const fallbackCalls = [];
  const fallback = {
    async createGiftCard() {
      throw new Error('Gift Cards API is not enabled for this location.');
    },
    async createOrder(order) {
      fallbackCalls.push(order.line_items[0].item_type || 'plain');
      return { order: { id: 'G2', total_money: { amount: 2500, currency: 'AUD' }, line_items: [{ uid: 'line-2' }] } };
    },
    async createPayment() {
      return { payment: { id: 'P2', status: 'COMPLETED' } };
    },
    async activateGiftCard() {
      throw new Error('should not activate');
    },
  };
  const fallbackApp = createApp({
    brand, menu, square: fallback, squareConfig,
    publicDir: '/tmp', sharedDir: '/tmp', enquiryFile: '/tmp/none.jsonl', menuCacheMs: 0,
  });
  const server2 = await listen(fallbackApp);
  const port2 = server2.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port2}/api/gift-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, amountCents: 2500 }),
    });
    const paid = await response.json();
    assert.equal(response.status, 200, JSON.stringify(paid));
    assert.equal(paid.issued, false);
    assert.equal(paid.giftCode, 'ROCCO-AAAAAAAA');
    assert.deepEqual(fallbackCalls, ['plain']);
  } finally {
    await new Promise((resolve) => server2.close(resolve));
  }

  const live = { async createOrder() { throw new Error('should not charge'); } };
  const blocked = createApp({
    brand, menu, square: live,
    squareConfig: { ...squareConfig, environment: 'production' },
    publicDir: '/tmp', sharedDir: '/tmp', enquiryFile: '/tmp/none.jsonl', menuCacheMs: 0,
  });
  const server3 = await listen(blocked);
  try {
    const response = await fetch(`http://127.0.0.1:${server3.address().port}/api/gift-card`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const denied = await response.json();
    assert.equal(response.status, 403);
    assert.match(denied.error, /sandbox/);
  } finally {
    await new Promise((resolve) => server3.close(resolve));
  }
});
