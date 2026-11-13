import { pizzaIngredients } from './pizza.js';

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
 * GloriaFood marks a group required, or not, and stores force_min / force_max.
 * force_max of 0 means there is no maximum. A minimum is only enforced when the
 * group is required: on this menu every group is optional, and the widget lets
 * a pizza through with nothing ticked.
 */
export function groupLimits(group) {
  const required = Boolean(group?.required);
  const forceMin = Number.isInteger(group?.forceMin) ? group.forceMin : 0;
  const forceMax = Number.isInteger(group?.forceMax) ? group.forceMax : 0;
  return {
    min: required ? Math.max(1, forceMin) : 0,
    max: forceMax > 0 ? forceMax : null,
    allowQuantity: Boolean(group?.allowQuantity),
  };
}

function findOption(item, key) {
  for (const group of item.groups || []) {
    const option = (group.options || []).find((entry) => entry.key === key);
    if (option) return { group, option };
  }
  return null;
}

/**
 * Price a cart from the menu. Client prices are ignored.
 * lines: { type:'item', sku, qty, modifierKeys[], options:[{key, qty}], removed[] }
 * offer: { percent, minPizzas, name, enabled } or null.
 * Once the cart has minPizzas pizzas (by quantity), percent comes off the whole order.
 * Drinks, desserts, dough balls and extras do not count toward that number, and they are still discounted.
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
  const pizzaQty = priced.reduce((sum, line) => {
    const item = bySku.get(line.sku);
    return sum + (item?.category === 'pizza' ? line.qty : 0);
  }, 0);
  const discount = applyOffer(subtotalCents, offer, pizzaQty);
  return {
    currency,
    subtotalCents,
    discountCents: discount.discountCents,
    totalCents: subtotalCents - discount.discountCents,
    shortfallPizzas: discount.shortfallPizzas,
    pizzaQty,
    offer: discount.offer,
    lines: priced,
  };
}

function applyOffer(subtotalCents, offer, pizzaQty) {
  const idle = { discountCents: 0, shortfallPizzas: 0, offer: null };
  if (!offer || offer.enabled === false) return idle;
  const percent = offer.percent;
  const minPizzas = offer.minPizzas;
  if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
    throw new PriceError('This offer is not set up correctly.');
  }
  if (!Number.isInteger(minPizzas) || minPizzas < 1) {
    throw new PriceError('This offer is not set up correctly.');
  }
  const name = offer.name || `${percent}% off`;
  if (pizzaQty < minPizzas) {
    return {
      discountCents: 0,
      shortfallPizzas: minPizzas - pizzaQty,
      offer: { name, percent, minPizzas, applied: false },
    };
  }
  const discountCents = Math.min(subtotalCents, percentOffCents(subtotalCents, percent));
  return {
    discountCents,
    shortfallPizzas: 0,
    offer: { name, percent, minPizzas, applied: discountCents > 0 },
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
  const requested = Array.isArray(line.removed) ? line.removed : [];
  if (requested.length && item.category !== 'pizza') {
    throw new PriceError(`${item.name} cannot have toppings removed.`);
  }
  const known = pizzaIngredients(item);
  const removed = requested.map((name) => {
    const match = known.find((entry) => entry.toLowerCase() === String(name).trim().toLowerCase());
    if (!match) throw new PriceError(`${item.name} does not come with ${name}.`);
    return match;
  });
  if (new Set(removed.map((name) => name.toLowerCase())).size !== removed.length) {
    throw new PriceError(`Remove the duplicate topping on ${item.name}.`);
  }
  const requestedOptions = Array.isArray(line.options) ? line.options : [];
  const seenOptions = new Set();
  const selections = requestedOptions.map((entry) => {
    const key = String(entry?.key || '');
    if (!key || seenOptions.has(key)) throw new PriceError(`Remove the duplicate add-on on ${item.name}.`);
    seenOptions.add(key);
    const found = findOption(item, key);
    if (!found) throw new PriceError(`${item.name} does not have that add-on.`);
    const limits = groupLimits(found.group);
    const qtyChosen = entry.qty == null ? 1 : Number(entry.qty);
    if (!Number.isInteger(qtyChosen) || qtyChosen < 1 || qtyChosen > 20) {
      throw new PriceError(`Check the quantity for ${found.option.name}.`);
    }
    if (!limits.allowQuantity && qtyChosen !== 1) {
      throw new PriceError(`${found.option.name} can only be chosen once.`);
    }
    return { ...found, qty: qtyChosen };
  });
  for (const group of item.groups || []) {
    const limits = groupLimits(group);
    const count = selections
      .filter((sel) => sel.group.id === group.id)
      .reduce((sum, sel) => sum + sel.qty, 0);
    if (count < limits.min) throw new PriceError(`Choose ${limits.min} from ${group.name}.`);
    if (limits.max != null && count > limits.max) {
      throw new PriceError(`Choose at most ${limits.max} from ${group.name}.`);
    }
  }
  const optionMods = selections.map((sel) => ({
    key: sel.option.key,
    name: sel.qty > 1 ? `${sel.option.name} x${sel.qty}` : sel.option.name,
    priceCents: sel.option.priceCents * sel.qty,
    id: null,
  }));
  const extra = modifiers.reduce((sum, mod) => sum + mod.priceCents, 0)
    + optionMods.reduce((sum, mod) => sum + mod.priceCents, 0);
  const unitCents = item.priceCents + extra;
  const addDetail = modifiers.length ? `+ ${modifiers.map((mod) => mod.name).join(', ')}` : '';
  const optionDetail = selections
    .map((sel) => (sel.qty > 1 ? `${sel.option.name} x${sel.qty}` : sel.option.name))
    .join(' · ');
  const cutDetail = removed.length ? `No ${removed.join(', ')}` : '';
  const detail = [addDetail, optionDetail, cutDetail].filter(Boolean).join(' · ');
  return {
    type: 'item',
    sku: item.sku,
    name: item.name,
    qty,
    unitCents,
    totalCents: unitCents * qty,
    baseCents: item.priceCents,
    detail,
    removed,
    variationId: item.variationId || null,
    modifiers: [
      ...modifiers.map((mod) => ({
        key: mod.key,
        name: mod.name,
        priceCents: mod.priceCents,
        id: mod.id || null,
      })),
      ...optionMods,
    ],
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
