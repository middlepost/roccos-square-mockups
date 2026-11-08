export class PriceError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
    this.name = 'PriceError';
  }
}

export function formatMoney(cents, currency = 'AUD') {
  const n = cents / 100;
  const body = Number.isInteger(n) ? `$${n}` : `$${n.toFixed(2)}`;
  return currency === 'AUD' ? body : `${currency} ${body}`;
}

function asQty(value, label) {
  const q = Number(value);
  if (!Number.isInteger(q) || q < 1 || q > 30) {
    throw new PriceError(`Check the quantity for ${label}.`);
  }
  return q;
}

/**
 * Half-up to the nearest cent. Square's order total uses the same rounding
 * for a percentage taken off the whole order (400.5 cents becomes 401).
 * Integer math avoids a binary float landing on the wrong side of .5.
 */
export function percentOffCents(subtotalCents, percent) {
  return Math.floor((subtotalCents * percent + 50) / 100);
}

/**
 * Price a cart from the menu. Client prices are ignored.
 * lines: { type:'item', sku, qty, modifierKeys[] }
 * offer: { percent, thresholdCents, name, enabled } or null.
 * At or above the threshold, percent comes off the subtotal automatically.
 */
export function priceCart(items, offer, lines, currency = 'AUD') {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new PriceError('Your order is empty.');
  }
  if (lines.length > 40) throw new PriceError('That order is too large. Call the shop and we will sort it out.');
  const bySku = new Map(items.map((item) => [item.sku, item]));
  const priced = [];

  for (const line of lines) {
    if (line?.type === 'deal') throw new PriceError('That deal is no longer on the menu.');
    if (line?.type === 'item') priced.push(priceItem(bySku, line, currency));
    else throw new PriceError('Something in the cart is not on the menu.');
  }

  const subtotalCents = priced.reduce((sum, line) => sum + line.totalCents, 0);
  const discount = applyOffer(subtotalCents, offer);
  return {
    currency,
    subtotalCents,
    discountCents: discount.discountCents,
    totalCents: subtotalCents - discount.discountCents,
    shortfallCents: discount.shortfallCents,
    offer: discount.offer,
    lines: priced,
  };
}

function applyOffer(subtotalCents, offer) {
  const idle = { discountCents: 0, shortfallCents: 0, offer: null };
  if (!offer || offer.enabled === false) return idle;
  const percent = offer.percent;
  const thresholdCents = offer.thresholdCents;
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new PriceError('This offer is not set up correctly.');
  }
  if (!Number.isInteger(thresholdCents) || thresholdCents < 1) {
    throw new PriceError('This offer is not set up correctly.');
  }
  const name = offer.name || `${percent}% off`;
  if (subtotalCents < thresholdCents) {
    return {
      discountCents: 0,
      shortfallCents: thresholdCents - subtotalCents,
      offer: { name, percent, thresholdCents, applied: false },
    };
  }
  const discountCents = Math.min(subtotalCents, percentOffCents(subtotalCents, percent));
  return {
    discountCents,
    shortfallCents: 0,
    offer: { name, percent, thresholdCents, applied: discountCents > 0 },
  };
}

function priceItem(bySku, line, currency) {
  const item = bySku.get(line.sku);
  if (!item) throw new PriceError('Something in the cart is no longer on the menu. Refresh and try again.');
  if (item.dineInOnly) throw new PriceError(`${item.name} is dine-in only. Order it at the shop.`);
  const qty = asQty(line.qty, item.name);
  const keys = Array.isArray(line.modifierKeys) ? line.modifierKeys : [];
  if (new Set(keys).size !== keys.length) throw new PriceError(`Remove the duplicate add-on on ${item.name}.`);
  const modifiers = keys.map((key) => {
    const mod = (item.modifiers || []).find((entry) => entry.key === key);
    if (!mod) throw new PriceError(`${item.name} does not have that add-on.`);
    return mod;
  });
  const extra = modifiers.reduce((sum, mod) => sum + mod.priceCents, 0);
  const unitCents = item.priceCents + extra;
  const detail = modifiers.length ? `+ ${modifiers.map((mod) => mod.name).join(', ')}` : '';
  return {
    type: 'item',
    sku: item.sku,
    name: item.name,
    qty,
    unitCents,
    totalCents: unitCents * qty,
    baseCents: item.priceCents,
    detail,
    variationId: item.variationId || null,
    modifiers: modifiers.map((mod) => ({
      key: mod.key,
      name: mod.name,
      priceCents: mod.priceCents,
      id: mod.id || null,
    })),
    currency,
  };
}

/**
 * Uber Eats / DoorDash price: in-store price plus 33%, rounded to the nearest dollar.
 * Rocco agreed per-item dollar steps are fine, so an override per SKU wins when set.
 */
export function deliveryCents(inStoreCents, markup = 0.33, overrideCents = null) {
  if (Number.isInteger(overrideCents)) return overrideCents;
  return Math.round((inStoreCents * (1 + markup)) / 100) * 100;
}
