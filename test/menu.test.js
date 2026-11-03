import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { presentLocalMenu } from '../server/brand.js';

const root = path.resolve(import.meta.dirname, '..');
const menu = JSON.parse(fs.readFileSync(path.join(root, 'data/menu.roccos.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'public/styles.css'), 'utf8');

test('1 Nov menu is the one the site serves', () => {
  const pizzas = menu.items.filter((item) => item.category === 'pizza');
  const dessert = menu.items.filter((item) => item.category === 'dessert');
  const drinks = menu.items.filter((item) => item.category === 'drinks');
  assert.equal(pizzas.length, 14);
  assert.equal(dessert.length, 1);
  assert.equal(drinks.length, 8);
  const bySku = Object.fromEntries(menu.items.map((item) => [item.sku, item]));
  assert.equal(bySku['ROCCO-01'].name, 'Number 1 Son');
  assert.equal(bySku['ROCCO-01'].priceCents, 2800);
  assert.equal(bySku['ROCCO-01'].containsNuts, true);
  assert.equal(bySku['ROCCO-02'].name, 'Margherita');
  assert.equal(bySku['ROCCO-02'].priceCents, 2000);
  assert.equal(bySku['ROCCO-02'].modifiers[0].priceCents, 600);
  assert.equal(bySku['ROCCO-03'].name, 'Cheesy Garlic');
  assert.equal(bySku['ROCCO-03'].priceCents, 2000);
  assert.equal(bySku['ROCCO-07'].name, 'Sopressa Salame');
  assert.equal(bySku['ROCCO-07'].toConfirm, true);
  assert.match(bySku['ROCCO-07'].description, /^To confirm/i);
  assert.equal(bySku['ROCCO-12'].name, 'Honey Pesto Chicken');
  assert.equal(bySku['ROCCO-12'].priceCents, 2600);
  assert.equal(bySku['ROCCO-12'].containsNuts, true);
  assert.equal(bySku['ROCCO-12'].toConfirm, true);
  assert.match(bySku['ROCCO-12'].description, /^To confirm/i);
  assert.equal(bySku['ROCCO-15'].name, 'Nutella Bomb');
  assert.equal(bySku['ROCCO-15'].priceCents, 1800);
  assert.equal(bySku['ROCCO-15'].category, 'dessert');
  assert.equal(bySku['ROCCO-DR01'].priceCents, 890);
  assert.equal(bySku['ROCCO-DR06'].priceCents, 290);
  assert.equal(bySku['ROCCO-DR08'].priceCents, 490);
  const names = menu.items.map((item) => item.name).join(' | ');
  assert.doesNotMatch(names, /President|Hot Salame|Big Nutella|Cheesy Garlic Mozzarella/);
  const confirm = menu.items.filter((item) => item.toConfirm).map((item) => item.sku).sort();
  assert.deepEqual(confirm, ['ROCCO-07', 'ROCCO-12']);
  const veg = pizzas.filter((item) => item.vegetarian).map((item) => item.sku).sort();
  assert.deepEqual(veg, ['ROCCO-02', 'ROCCO-03', 'ROCCO-04', 'ROCCO-06', 'ROCCO-08']);
});

test('each food photo is the approved file and is not a text overlay', () => {
  for (const item of menu.items.filter((entry) => entry.image)) {
    const file = path.join(root, 'public/images/products', item.image);
    const stat = fs.statSync(file);
    assert.ok(stat.size > 100_000, item.image);
    const bytes = fs.readFileSync(file);
    assert.equal(bytes[0], 0xff);
    assert.equal(bytes[1], 0xd8);
  }
  const presented = presentLocalMenu(menu);
  const son = presented.items.find((item) => item.sku === 'ROCCO-01');
  assert.equal(son.imageUrl, '/images/products/01_Roccos_Number_1_Son.jpg');
  assert.equal(son.variationId, null);
});

test('the page keeps the v3 wording and the 1 Nov names', () => {
  assert.match(html, /Pizza that <em>loves you back\.<\/em>/);
  assert.match(html, /Fourteen pizzas\. No unnecessary extras\./);
  assert.match(html, /Takeaway pizza deserves better\./);
  assert.match(html, /Cheesy Garlic/);
  assert.match(html, /Nutella Bomb/);
  assert.match(html, /Sopressa Salame/);
  assert.doesNotMatch(html, /President|Hot Salame|Big Nutella|Cheesy Garlic Mozzarella/);
  assert.match(html, /roccos-approved-wordmark\.png/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /\.item\.photo-card \.photo\{[^}]*background:\s*#fff/);
});
