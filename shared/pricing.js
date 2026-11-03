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
 * Price a cart from the menu. Client prices are ignored.
 * lines: { type:'item', sku, qty, modifierKeys[] } | { type:'deal', qty, picks:[{sku, qty}] }
 */
export function priceCart(items, deal, lines, currency = 'AUD') {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new PriceError('Your order is empty.');
  }
  if (lines.length > 40) throw new PriceError('That order is too large. Call the shop and we will sort it out.');
  const bySku = new Map(items.map((item) => [item.sku, item]));
  const priced = [];

  for (const line of lines) {
    if (line?.type === 'deal') priced.push(priceDeal(bySku, deal, line, currency));
    else if (line?.type === 'item') priced.push(priceItem(bySku, line, currency));
    else throw new PriceError('Something in the cart is not on the menu.');
  }

  const totalCents = priced.reduce((sum, line) => sum + line.totalCents, 0);
  return { currency, totalCents, lines: priced };
}

function priceItem(bySku, line, currency) {
  const item = bySku.get(line.sku);
  if (!item) throw new PriceError('Something in the cart is no longer on the menu. Refresh and try again.');
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

function priceDeal(bySku, deal, line, currency) {
  if (!deal) throw new PriceError('That deal is not available.');
  const qty = asQty(line.qty, deal.name);
  const picks = Array.isArray(line.picks) ? line.picks : [];
  const count = picks.reduce((sum, pick) => sum + Number(pick?.qty || 0), 0);
  if (count !== deal.required) {
    throw new PriceError(`${deal.name} needs ${deal.required} pizzas.`);
  }
  const expanded = picks.map((pick) => {
    const pickQty = asQty(pick.qty, deal.name);
    const choice = deal.choices.find((entry) => entry.sku === pick.sku);
    if (!choice) throw new PriceError(`That pizza is not part of ${deal.name}.`);
    const item = bySku.get(pick.sku);
    if (!item) throw new PriceError('A pizza in the deal is no longer on the menu.');
    return {
      sku: item.sku,
      name: item.name,
      qty: pickQty,
      upgradeCents: choice.upgradeCents,
      unitCents: item.priceCents,
      variationId: item.variationId || null,
    };
  });
  const upgrade = expanded.reduce((sum, pick) => sum + pick.qty * pick.upgradeCents, 0);
  const promoCents = deal.priceCents + upgrade;
  const naturalCents = expanded.reduce((sum, pick) => sum + pick.qty * pick.unitCents, 0);
  const detail = expanded
    .map((pick) => `${pick.qty}× ${pick.name}${pick.upgradeCents ? ` (+${formatMoney(pick.upgradeCents, currency)})` : ''}`)
    .join(', ');
  const catalogReady = expanded.every((pick) => pick.variationId) && naturalCents >= promoCents;
  return {
    type: 'deal',
    id: deal.id,
    name: deal.name,
    qty,
    unitCents: promoCents,
    totalCents: promoCents * qty,
    naturalCents,
    promoCents,
    discountCents: catalogReady ? (naturalCents - promoCents) * qty : 0,
    catalogReady,
    detail,
    picks: expanded,
    currency,
  };
}
