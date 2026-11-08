import { randomUUID } from 'node:crypto';
import { PriceError, formatMoney, priceCart } from '../shared/pricing.js';
import { toE164 } from './phone.js';
import { resolvePickup } from './time.js';
import { pizzaCount } from './slots.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function buildCheckout({ brand, menuItems, body, currency, now = new Date() }) {
  const location = (brand.locations || []).find((entry) => entry.key === body.locationKey);
  if (!location) throw new PriceError('Choose Findon Rd or Grange Rd for pickup.');
  const name = String(body.name || '').trim();
  if (name.length < 2 || name.length > 80) throw new PriceError('Enter the name for the pickup.');
  const phone = toE164(body.phone);
  const notes = String(body.notes || '').trim().slice(0, 500);
  const sourceId = String(body.sourceId || '').trim();
  if (!sourceId || sourceId.length > 800) throw new PriceError('The card form did not return a payment token. Try the card again.');
  const idempotencyKey = UUID.test(body.idempotencyKey || '') ? body.idempotencyKey : randomUUID();
  const pickup = resolvePickup({
    when: body.when,
    date: body.date,
    time: body.time,
    prepMinutes: brand.prepMinutes,
    now,
  });
  if (body.when === 'time' && Array.isArray(location.openDays)) {
    const [y, m, d] = String(body.date).split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (!location.openDays.includes(weekday)) {
      throw new PriceError(`${location.name} is closed that day. Pick another day or the other shop.`);
    }
  }
  if (body.when === 'time' && brand.pickup?.slotMinutes) {
    const toMin = (v) => { const [a, b] = String(v).split(':').map(Number); return a * 60 + b; };
    const mins = toMin(body.time);
    const step = brand.pickup.slotMinutes;
    let open = toMin(brand.pickup.open || '00:00');
    let close = toMin(brand.pickup.close || '23:59');
    const shopHours = brand.hours?.[location.key];
    if (shopHours) {
      const [y, m, d] = String(body.date).split('-').map(Number);
      const dayKey = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      const ranges = shopHours[dayKey] || [];
      if (!ranges.length) throw new PriceError(`${location.name} is closed that day. Pick another day or the other shop.`);
      open = Math.max(open, toMin(ranges[0][0]));
      close = toMin(ranges[ranges.length - 1][1]) - step;
    }
    if (mins < open || mins > close || (mins - open) % step !== 0) {
      throw new PriceError(`Pick a pickup time from the list (every ${step} minutes).`);
    }
  }
  const priced = priceCart(menuItems, brand.offer, body.lines, currency);
  const pizzas = pizzaCount(priced, menuItems);
  const squareLocationId = location.squareLocationId;
  if (!squareLocationId) throw new PriceError('This store is not linked to a Square location yet.');

  const lineItems = priced.lines.map((line) => itemLine(line, currency));
  // Order-level fixed amount, not a percentage Square would split and round per line.
  // The cents come from shared/pricing.js (half-up on the whole subtotal) so the
  // sandbox total_money matches priced.totalCents exactly.
  const discounts = [];
  if (priced.discountCents > 0) {
    discounts.push({
      uid: 'order-offer',
      name: priced.offer?.name || '10% off',
      type: 'FIXED_AMOUNT',
      scope: 'ORDER',
      amount_money: { amount: priced.discountCents, currency },
    });
  }

  const storeLine = `Pickup · ${location.name} (${location.address})`;
  const note = [storeLine, notes ? `Notes: ${notes}` : null].filter(Boolean).join('\n').slice(0, 500);
  const order = {
    location_id: squareLocationId,
    reference_id: `web-${idempotencyKey.slice(0, 8)}`,
    source: { name: `${brand.name} website` },
    note,
    pricing_options: { auto_apply_discounts: false, auto_apply_taxes: false },
    line_items: lineItems,
    fulfillments: [
      {
        type: 'PICKUP',
        state: 'PROPOSED',
        pickup_details: {
          recipient: { display_name: name, phone_number: phone },
          schedule_type: pickup.scheduleType,
          prep_time_duration: pickup.prepTimeDuration,
          note,
          ...(pickup.pickupAt ? { pickup_at: pickup.pickupAt } : {}),
        },
      },
    ],
  };
  if (discounts.length) order.discounts = discounts;

  const summary = [
    ...priced.lines.map((line) => `${line.qty}× ${line.name}${line.detail ? ` (${line.detail})` : ''} — ${formatMoney(line.totalCents, currency)}`),
    '',
    `Subtotal: ${formatMoney(priced.subtotalCents, currency)}`,
    priced.discountCents > 0 ? `${priced.offer?.name || 'Discount'}: −${formatMoney(priced.discountCents, currency)}` : null,
    `Total: ${formatMoney(priced.totalCents, currency)}`,
    `Pickup: ${location.name}, ${pickup.label}`,
    `Name: ${name} · ${phone}`,
    notes ? `Notes: ${notes}` : null,
  ].filter((line) => line !== null).join('\n');

  return {
    order,
    priced,
    currency,
    idempotencyKey,
    sourceId,
    squareLocationId,
    location,
    pickup,
    pizzas,
    summary,
    customer: { name, phone },
  };
}

function itemLine(line, currency) {
  const catalogMods = line.modifiers.length === 0 || line.modifiers.every((mod) => mod.id);
  if (line.variationId && catalogMods) {
    const entry = {
      catalog_object_id: line.variationId,
      quantity: String(line.qty),
    };
    if (line.modifiers.length) {
      entry.modifiers = line.modifiers.map((mod) => ({ catalog_object_id: mod.id }));
    }
    if (line.detail) entry.note = line.detail;
    return entry;
  }
  const entry = {
    name: line.modifiers.length ? `${line.name} + ${line.modifiers.map((mod) => mod.name).join(', ')}` : line.name,
    quantity: String(line.qty),
    base_price_money: { amount: line.unitCents, currency },
  };
  if (line.detail) entry.note = line.detail;
  return entry;
}

export function paymentBody({ checkout, orderId, amount, currency }) {
  return {
    source_id: checkout.sourceId,
    idempotency_key: `${checkout.idempotencyKey}-pay`,
    amount_money: { amount, currency },
    order_id: orderId,
    location_id: checkout.squareLocationId,
    autocomplete: true,
    reference_id: checkout.order.reference_id,
    note: `Pickup · ${checkout.location.name}`.slice(0, 500),
  };
}
