import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { loadBrand } from '../server/brand.js';
import { planCatalog } from '../server/catalog.js';
import { loadDotEnv, resolveSquareConfig } from '../server/env.js';
import { createSquareClient } from '../server/square.js';
import { formatMoney } from '../shared/pricing.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function redact(message, token) {
  if (!token || !message) return String(message || '');
  return String(message).split(token).join('[token]');
}

function findItem(objects, sku) {
  return (objects || []).find((object) => (
    object.type === 'ITEM'
    && object.item_data?.variations?.some((variation) => variation.item_variation_data?.sku === sku)
  ));
}

export async function seedCatalog({
  square,
  menu,
  brand,
  imageDir,
  currency = 'AUD',
  dryRun = false,
  logger = console,
}) {
  if (dryRun) {
    logger.log('Dry run only. No requests were sent to Square.');
    for (const item of menu.items || []) {
      const mods = (item.modifiers || [])
        .map((mod) => `+ ${mod.name} ${formatMoney(mod.priceCents, currency)}`)
        .join(', ');
      logger.log(`  ${item.sku.padEnd(12)} ${item.name.padEnd(44)} ${formatMoney(item.priceCents, currency)}${mods ? `  ${mods}` : ''}`);
    }
    const preview = planCatalog(menu, [], { currency, brand });
    const images = (menu.items || []).filter((item) => item.image).length;
    logger.log(`Would upsert ${preview.objects.length} catalog objects and upload up to ${images} images.`);
    logger.log('The real seed updates these SKUs in place. Running it again does not duplicate them.');
    return { dryRun: true, objects: preview.objects.length, images };
  }

  const location = await square.getLocation();
  const moneyCurrency = location?.currency || currency;
  logger.log(`Location: ${location?.name || location?.id || 'unknown'} · ${moneyCurrency}`);
  if (location?.currency && location.currency !== 'AUD') {
    logger.log(`WARNING: this location uses ${location.currency}, not AUD. The 1 Nov prices will be stored as ${location.currency} amounts (2000 = 20.00).`);
  }

  const existing = await square.listCatalog();
  const plan = planCatalog(menu, existing, { currency: moneyCurrency, brand });
  const created = plan.objects.filter((object) => String(object.id).startsWith('#')).length;
  logger.log(`Upserting ${plan.objects.length} objects (${created} new, ${plan.objects.length - created} updates)…`);
  const result = await square.batchUpsert(plan.objects);
  const returned = result.objects || [];

  let uploaded = 0;
  let skipped = 0;
  const failures = [];
  for (const job of plan.imageJobs) {
    const item = findItem(returned, job.sku);
    if (!item?.id || String(item.id).startsWith('#')) {
      failures.push(`${job.sku}: Square did not return an item id`);
      continue;
    }
    if (item.item_data?.image_ids?.length) {
      skipped += 1;
      continue;
    }
    const filepath = path.join(imageDir, job.filename);
    if (!fs.existsSync(filepath)) {
      failures.push(`${job.sku}: missing file ${job.filename}`);
      continue;
    }
    try {
      const bytes = fs.readFileSync(filepath);
      await square.createImage({
        itemId: item.id,
        filename: job.filename,
        bytes,
        caption: job.caption,
      });
      uploaded += 1;
      logger.log(`  image ${job.filename}`);
    } catch (error) {
      failures.push(`${job.sku}: ${error.message}`);
    }
  }

  logger.log(`Images: ${uploaded} uploaded, ${skipped} already on the item, ${failures.length} failed.`);
  if (failures.length) {
    for (const failure of failures) logger.log(`  ${failure}`);
    throw new Error('Image upload did not finish. Re-run npm run seed — items already written will be updated, not duplicated.');
  }
  logger.log('Done.');
  logger.log('Re-run this command any time. It updates these SKUs in place and does not create duplicates.');
  logger.log('A re-run resets names, prices, descriptions, and add-ons for these SKUs back to the 1 Nov menu.');
  logger.log('Items with any other SKU are left alone.');
  return { uploaded, skipped, objects: plan.objects.length, currency: moneyCurrency };
}

async function main() {
  loadDotEnv(path.join(root, '.env'));
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('-d');
  const { brand, menu } = loadBrand(process.env.BRAND || 'roccos', root);
  let config;
  try {
    config = resolveSquareConfig();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }

  console.log(`${brand.name} catalog seed`);
  console.log(`Environment: ${config.environment}`);
  console.log(`API host:    ${config.apiBase}`);
  console.log(`Application: ${config.applicationId}`);
  console.log(`Location:    ${config.locationId}`);

  if (dryRun) {
    console.log('Token:       not used in a dry run');
    await seedCatalog({
      menu,
      brand,
      currency: menu.currency || config.currency,
      dryRun: true,
      imageDir: path.join(root, 'public', 'images', 'products'),
    });
    return;
  }

  if (!config.accessToken) {
    console.error('Missing SQUARE_ACCESS_TOKEN.');
    console.error('Put the sandbox access token in .env (see .env.example) or export it in the shell, then run npm run seed.');
    console.error('Preview without a token: npm run seed -- --dry-run');
    process.exit(1);
  }
  console.log(`Token:       set (${config.accessToken.length} characters, not shown)`);
  console.log(config.environment === 'sandbox'
    ? 'Writing to the Square SANDBOX only.'
    : 'WARNING: this writes to a PRODUCTION Square catalog.');

  const square = createSquareClient(config);
  try {
    await seedCatalog({
      square,
      menu,
      brand,
      imageDir: path.join(root, 'public', 'images', 'products'),
      currency: menu.currency || config.currency,
    });
  } catch (error) {
    console.error(redact(error.message, config.accessToken));
    if (error.status === 401) {
      console.error(`Square rejected the token. Use a sandbox access token for ${config.applicationId}.`);
    }
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
