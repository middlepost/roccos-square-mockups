import assert from 'node:assert/strict';
import test from 'node:test';
import { PriceError, deliveryCents, priceCart } from '../shared/pricing.js';
import { loadBrand } from '../server/brand.js';
import { presentLocalMenu } from '../server/brand.js';
import { buildCheckout } from '../server/orders.js';

const { brand, menu } = loadBrand('roccos', pathRoot());
const items = presentLocalMenu(menu).items;

function pathRoot() {
  return new URL('..', import.meta.url).pathname;
}

test('add-ons and the $50 deal use the 1 Nov prices', () => {
  const margherita = priceCart(items, brand.deal, [
    { type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: ['prosciutto'] },
  ]);
  assert.equal(margherita.totalCents, 2600);
  assert.equal(margherita.lines[0].detail, '+ Prosciutto');

  const plain = priceCart(items, brand.deal, [
    { type: 'deal', qty: 1, picks: [{ sku: 'ROCCO-02', qty: 3 }] },
  ]);
  assert.equal(plain.totalCents, 5000);

  const upgraded = priceCart(items, brand.deal, [
    { type: 'deal', qty: 1, picks: [
      { sku: 'ROCCO-02', qty: 1 },
      { sku: 'ROCCO-04', qty: 1 },
      { sku: 'ROCCO-07', qty: 1 },
    ] },
  ]);
  assert.equal(upgraded.totalCents, 5300);
  assert.match(upgraded.lines[0].detail, /Vegetariana \(\+\$1\)/);
  assert.match(upgraded.lines[0].detail, /Sopressa Salame \(\+\$2\)/);

  const withDrink = priceCart(items, brand.deal, [
    { type: 'deal', qty: 1, picks: [{ sku: 'ROCCO-03', qty: 3 }] },
    { type: 'item', sku: 'ROCCO-DR06', qty: 2, modifierKeys: [] },
  ]);
  const water = items.find((item) => item.sku === 'ROCCO-DR06').priceCents;
  assert.equal(withDrink.totalCents, 5000 + water * 2);
});

test('the deal rejects the wrong count and pizzas that are not on it', () => {
  assert.throws(() => priceCart(items, brand.deal, [
    { type: 'deal', qty: 1, picks: [{ sku: 'ROCCO-02', qty: 2 }] },
  ]), PriceError);
  assert.throws(() => priceCart(items, brand.deal, [
    { type: 'deal', qty: 1, picks: [{ sku: 'ROCCO-01', qty: 3 }] },
  ]), PriceError);
  assert.throws(() => priceCart(items, brand.deal, [
    { type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: ['gold-leaf'] },
  ]), PriceError);
});

test('checkout ignores any price the browser sends and names the store', () => {
  const checkout = buildCheckout({
    brand,
    menuItems: items,
    currency: 'AUD',
    now: new Date('2026-11-03T00:00:00.000Z'),
    body: {
      locationKey: 'findon',
      when: 'asap',
      name: 'Alex',
      phone: '0412 345 678',
      notes: 'No onion',
      sourceId: 'cnon:card-nonce',
      idempotencyKey: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      lines: [
        { type: 'item', sku: 'ROCCO-05', qty: 1, modifierKeys: ['pineapple'], unitCents: 1 },
      ],
    },
  });
  assert.equal(checkout.priced.totalCents, 2300);
  assert.equal(checkout.order.location_id, 'LFXEWDVVKRYC0');
  assert.match(checkout.order.note, /Findon Rd/);
  assert.match(checkout.order.note, /No onion/);
  assert.equal(checkout.order.fulfillments[0].pickup_details.schedule_type, 'ASAP');
  assert.equal(checkout.order.fulfillments[0].pickup_details.prep_time_duration, 'PT20M');
  assert.equal(checkout.order.fulfillments[0].pickup_details.recipient.phone_number, '+61412345678');
  assert.equal(checkout.order.pricing_options.auto_apply_taxes, false);
  const line = checkout.order.line_items[0];
  assert.equal(line.base_price_money.amount, 2300);
  assert.match(line.name, /Pineapple/);
  assert.equal(checkout.order.line_items[0].catalog_object_id, undefined);
});

test('a seeded catalog deal becomes real pizzas plus a discount', () => {
  const seeded = items.map((item) => ({ ...item, variationId: `VAR-${item.sku}` }));
  const checkout = buildCheckout({
    brand,
    menuItems: seeded,
    currency: 'AUD',
    now: new Date('2026-11-03T00:00:00.000Z'),
    body: {
      locationKey: 'grange',
      when: 'time',
      date: '2026-11-04',
      time: '18:30',
      name: 'Sam',
      phone: '0870784471',
      sourceId: 'cnon:card-nonce',
      lines: [
        { type: 'deal', qty: 1, picks: [{ sku: 'ROCCO-02', qty: 2 }, { sku: 'ROCCO-04', qty: 1 }] },
        { type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: [], variationId: 'ignore-me' },
      ],
    },
  });
  assert.equal(checkout.priced.totalCents, 5100 + 2000);
  assert.equal(checkout.order.fulfillments[0].pickup_details.schedule_type, 'SCHEDULED');
  assert.equal(checkout.order.fulfillments[0].pickup_details.pickup_at, '2026-11-04T08:00:00.000Z');
  const margheritas = checkout.order.line_items.filter((line) => line.catalog_object_id === 'VAR-ROCCO-02');
  assert.equal(margheritas.reduce((sum, line) => sum + Number(line.quantity), 0), 3);
  assert.equal(checkout.order.discounts[0].amount_money.amount, (2000 + 2000 + 2200) - 5100);
  assert.match(checkout.order.note, /Grange Rd/);
});

test('every pizza offers the full extras list', () => {
  const pizza = items.find((item) => item.sku === 'ROCCO-02');
  const keys = pizza.modifiers.map((mod) => mod.key).sort();
  assert.deepEqual(keys, ['anchovy', 'chicken', 'chilli-salsa', 'hot-honey', 'pineapple', 'prosciutto', 'sausage']);
  const total = priceCart(items, brand.deal, [
    { type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: ['hot-honey', 'pineapple'] },
  ]).totalCents;
  assert.equal(total, pizza.priceCents + 200);
});

test('alcohol is dine-in only and cannot go in a pickup order', () => {
  for (const sku of ['ROCCO-DR01', 'ROCCO-DR02', 'ROCCO-DR03', 'ROCCO-DR04', 'ROCCO-DR05']) {
    assert.throws(() => priceCart(items, brand.deal, [
      { type: 'item', sku, qty: 1, modifierKeys: [] },
    ]), /dine-in only/);
  }
});

test('a switched-off deal cannot be ordered', () => {
  assert.throws(() => priceCart(items, { ...brand.deal, enabled: false }, [
    { type: 'deal', qty: 1, picks: [{ sku: 'ROCCO-02', qty: 3 }] },
  ]), PriceError);
});

test('delivery-app price is in-store plus 33%, rounded to the nearest dollar, with overrides', () => {
  assert.equal(deliveryCents(2200), 2900);
  assert.equal(deliveryCents(2400), 3200);
  assert.equal(deliveryCents(5000), 6700);
  assert.equal(deliveryCents(390), 500);
  assert.equal(deliveryCents(2200, 0.33, 2800), 2800);
});

test('a timed pickup on a day the shop is closed is refused', () => {
  // Grange Rd opens Wednesday to Sunday; 9 Nov 2026 is a Monday.
  assert.throws(() => buildCheckout({
    brand,
    menuItems: items,
    currency: 'AUD',
    now: new Date('2026-11-04T00:00:00.000Z'),
    body: {
      locationKey: 'grange', when: 'time', date: '2026-11-09', time: '18:05',
      name: 'Alex', phone: '0412 345 678', sourceId: 'cnon:card-nonce',
      lines: [{ type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: [] }],
    },
  }), /closed that day/);
});
