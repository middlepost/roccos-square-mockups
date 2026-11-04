// Prints delivery-app prices: in-store price + 33%, rounded to the nearest dollar.
// Per-item override: set "deliveryOverrideCents" on an item in data/menu.roccos.json.
// Usage: node scripts/delivery-prices.js [brand] > delivery-prices.csv
import { loadBrand, presentLocalMenu } from '../server/brand.js';
import { deliveryCents } from '../shared/pricing.js';

const root = new URL('..', import.meta.url).pathname;
const { menu } = loadBrand(process.argv[2] || 'roccos', root);
const raw = new Map(menu.items.map((item) => [item.sku, item]));
const dollars = (cents) => (cents / 100).toFixed(2);
const csv = (value) => `"${String(value).replaceAll('"', '""')}"`;
console.log('sku,name,in_store,delivery_app,override,extra_in_store,extra_delivery_app');
for (const item of presentLocalMenu(menu).items) {
  if (item.dineInOnly) continue;
  const override = raw.get(item.sku)?.deliveryOverrideCents ?? null;
  console.log([item.sku, csv(item.name), dollars(item.priceCents), dollars(deliveryCents(item.priceCents, 0.33, override)), override == null ? '' : 'yes', '', ''].join(','));
  for (const mod of item.modifiers || []) {
    if (item.sku !== 'ROCCO-02') continue; // extras are the same on every pizza; list them once
    console.log(['', csv(`Extra: ${mod.name}`), '', '', '', dollars(mod.priceCents), dollars(deliveryCents(mod.priceCents))].join(','));
  }
}
