import assert from 'node:assert/strict';
import test from 'node:test';
import { PriceError, deliveryCents, percentOffCents, priceCart } from '../shared/pricing.js';
import { loadBrand } from '../server/brand.js';
import { presentLocalMenu } from '../server/brand.js';
import { buildCheckout } from '../server/orders.js';

const { brand, menu } = loadBrand('roccos', pathRoot());
const items = presentLocalMenu(menu).items;

function pathRoot() {
  return new URL('..', import.meta.url).pathname;
}

test('add-ons use the 1 Nov prices and the old deal is refused', () => {
  const margherita = priceCart(items, brand.offer, [
    { type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: ['prosciutto'] },
  ]);
  assert.equal(margherita.subtotalCents, 2600);
  assert.equal(margherita.discountCents, 0);
  assert.equal(margherita.totalCents, 2600);
  assert.equal(margherita.lines[0].detail, '+ Prosciutto');
  assert.throws(() => priceCart(items, brand.offer, [
    { type: 'deal', qty: 1, picks: [{ sku: 'ROCCO-02', qty: 3 }] },
  ]), /no longer on the menu/);
  assert.throws(() => priceCart(items, brand.offer, [
    { type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: ['gold-leaf'] },
  ]), PriceError);
});

test('10% off applies at $40, stays off below it, and rounds half up', () => {
  const below = priceCart(items, brand.offer, [
    { type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: [] },
  ]);
  assert.equal(below.subtotalCents, 2000);
  assert.equal(below.discountCents, 0);
  assert.equal(below.totalCents, 2000);
  assert.equal(below.shortfallCents, 2000);

  const at = priceCart(items, brand.offer, [
    { type: 'item', sku: 'ROCCO-02', qty: 2, modifierKeys: [] },
  ]);
  assert.equal(at.subtotalCents, 4000);
  assert.equal(at.discountCents, 400);
  assert.equal(at.totalCents, 3600);
  assert.equal(at.shortfallCents, 0);

  const odd = [{ sku: 'ODD', name: 'Odd', priceCents: 4005, category: 'pizza', modifiers: [] }];
  const rounded = priceCart(odd, brand.offer, [{ type: 'item', sku: 'ODD', qty: 1, modifierKeys: [] }]);
  assert.equal(percentOffCents(4005, 10), 401);
  assert.equal(rounded.discountCents, 401);
  assert.equal(rounded.totalCents, 3604);
  const down = priceCart([{ ...odd[0], priceCents: 4004 }], brand.offer, [
    { type: 'item', sku: 'ODD', qty: 1, modifierKeys: [] },
  ]);
  assert.equal(down.discountCents, 400);
  assert.equal(down.totalCents, 3604);
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

test('Square order-level discount matches the shared 10% total, including a half-cent round', () => {
  const custom = [
    { sku: 'ODD', name: 'Odd pizza', priceCents: 2003, category: 'pizza', modifiers: [] },
    { sku: 'ODD2', name: 'Odd two', priceCents: 2002, category: 'pizza', modifiers: [] },
  ];
  const checkout = buildCheckout({
    brand,
    menuItems: custom,
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
        { type: 'item', sku: 'ODD', qty: 1, modifierKeys: [] },
        { type: 'item', sku: 'ODD2', qty: 1, modifierKeys: [] },
      ],
    },
  });
  assert.equal(checkout.priced.subtotalCents, 4005);
  assert.equal(checkout.priced.discountCents, 401);
  assert.equal(checkout.priced.totalCents, 3604);
  assert.equal(checkout.order.fulfillments[0].pickup_details.schedule_type, 'SCHEDULED');
  assert.equal(checkout.order.fulfillments[0].pickup_details.pickup_at, '2026-11-04T08:00:00.000Z');
  const perLine = percentOffCents(2003, 10) + percentOffCents(2002, 10);
  assert.equal(perLine, 400);
  const discount = checkout.order.discounts[0];
  assert.equal(discount.scope, 'ORDER');
  assert.equal(discount.type, 'FIXED_AMOUNT');
  assert.equal(discount.amount_money.amount, 401);
  const squareSubtotal = checkout.order.line_items.reduce((sum, line) => sum + line.base_price_money.amount * Number(line.quantity), 0);
  const squareDiscount = checkout.order.discounts.reduce((sum, entry) => sum + entry.amount_money.amount, 0);
  assert.equal(squareSubtotal - squareDiscount, checkout.priced.totalCents);
  assert.match(checkout.order.note, /Grange Rd/);

  const under = buildCheckout({
    brand,
    menuItems: items,
    currency: 'AUD',
    now: new Date('2026-11-03T00:00:00.000Z'),
    body: {
      locationKey: 'findon', when: 'asap', name: 'Sam', phone: '0870784471', sourceId: 'cnon:card-nonce',
      lines: [{ type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: [] }],
    },
  });
  assert.equal(under.priced.totalCents, 2000);
  assert.equal(under.order.discounts, undefined);
});

test('every pizza offers the full extras list', () => {
  const pizza = items.find((item) => item.sku === 'ROCCO-02');
  const keys = pizza.modifiers.map((mod) => mod.key).sort();
  assert.deepEqual(keys, ['anchovy', 'chicken', 'chilli-salsa', 'hot-honey', 'pineapple', 'prosciutto', 'sausage']);
  const total = priceCart(items, brand.offer, [
    { type: 'item', sku: 'ROCCO-02', qty: 1, modifierKeys: ['hot-honey', 'pineapple'] },
  ]).totalCents;
  assert.equal(total, pizza.priceCents + 200);
});

test('alcohol is dine-in only and cannot go in a pickup order', () => {
  for (const sku of ['ROCCO-DR01', 'ROCCO-DR02', 'ROCCO-DR03', 'ROCCO-DR04', 'ROCCO-DR05']) {
    assert.throws(() => priceCart(items, brand.offer, [
      { type: 'item', sku, qty: 1, modifierKeys: [] },
    ]), /dine-in only/);
  }
});

test('a switched-off offer does not discount a $40 order', () => {
  const priced = priceCart(items, { ...brand.offer, enabled: false }, [
    { type: 'item', sku: 'ROCCO-02', qty: 2, modifierKeys: [] },
  ]);
  assert.equal(priced.discountCents, 0);
  assert.equal(priced.totalCents, 4000);
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
