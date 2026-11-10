import fs from 'node:fs';
import path from 'node:path';
import { pizzaIngredients } from '../shared/pizza.js';

const SAFE_ID = /^[a-z0-9-]+$/;

export function loadBrand(id = 'roccos', root = process.cwd()) {
  const brandId = String(id || 'roccos');
  if (!SAFE_ID.test(brandId)) throw new Error('BRAND may only contain lowercase letters, numbers, and hyphens.');
  const file = path.join(root, 'config', 'brands', `${brandId}.json`);
  if (!fs.existsSync(file)) throw new Error(`No brand config at config/brands/${brandId}.json.`);
  const brand = JSON.parse(fs.readFileSync(file, 'utf8'));
  const menuPath = path.resolve(root, brand.menuFile);
  const menuRoot = path.resolve(root, 'data');
  if (!menuPath.startsWith(`${menuRoot}${path.sep}`)) throw new Error('Brand menuFile must stay inside data/.');
  const menu = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
  return { brand, menu };
}

export function applyRuntime(brand, env = process.env) {
  const next = structuredClone(brand);
  if (env.ENQUIRY_EMAIL) next.enquiryEmail = env.ENQUIRY_EMAIL.trim();
  const fallback = env.SQUARE_LOCATION_ID;
  for (const location of next.locations || []) {
    const specific = env[`SQUARE_LOCATION_${location.key.toUpperCase()}`];
    if (specific) location.squareLocationId = specific.trim();
    else if (fallback) location.squareLocationId = fallback.trim();
  }
  return next;
}

export function presentLocalItem(item) {
  return {
    sku: item.sku,
    number: item.number ?? null,
    name: item.name,
    description: item.description || '',
    priceCents: item.priceCents,
    category: item.category,
    vegetarian: Boolean(item.vegetarian),
    containsNuts: Boolean(item.containsNuts),
    dineInOnly: Boolean(item.dineInOnly),
    alcohol: Boolean(item.alcohol),
    toConfirm: Boolean(item.toConfirm) || /^to confirm/i.test(item.description || ''),
    imageUrl: item.image ? `/images/products/${item.image}` : null,
    ingredients: item.category === 'pizza' ? pizzaIngredients(item) : [],
    variationId: null,
    modifiers: (item.modifiers || []).map((mod) => ({
      key: mod.key,
      name: mod.name,
      priceCents: mod.priceCents,
      id: null,
    })),
  };
}

export function presentLocalMenu(menu) {
  const items = (menu.items || []).map(presentLocalItem);
  items.sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name));
  return {
    source: 'local',
    currency: menu.currency || 'AUD',
    notice: menu.notice || null,
    items,
  };
}
