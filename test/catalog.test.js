import assert from 'node:assert/strict';
import test from 'node:test';
import { loadBrand } from '../server/brand.js';
import { menuFromCatalog, planCatalog } from '../server/catalog.js';

const { brand, menu } = loadBrand('roccos', new URL('..', import.meta.url).pathname);

test('an empty catalog plans creates, and a second plan updates in place', () => {
  const first = planCatalog(menu, [], { currency: 'AUD', brand });
  assert.ok(first.objects.every((object) => String(object.id).startsWith('#')));
  assert.equal(first.objects.filter((object) => object.type === 'ITEM').length, 23);
  assert.equal(first.objects.filter((object) => object.type === 'MODIFIER_LIST').length, 7);
  assert.equal(first.imageJobs.length, 15);
  const sausageLists = first.objects.filter((object) => object.modifier_list_data?.name === 'Italian sausage');
  assert.equal(sausageLists.length, 1);
  const son = first.objects.find((object) => object.item_data?.variations?.[0]?.item_variation_data?.sku === 'ROCCO-01');
  assert.equal(son.item_data.variations[0].item_variation_data.price_money.amount, 2800);
  assert.equal(son.item_data.modifier_list_info.length, 7); // every pizza now offers the full Extras list
  assert.ok(son.item_data.food_and_beverage_details.dietary_preferences.some((pref) => pref.custom_name === 'CONTAINS_NUTS'));

  const existing = [
    {
      type: 'CATEGORY',
      id: 'CAT_PIZZA',
      version: 3,
      category_data: { name: 'Pizzas' },
    },
    {
      type: 'MODIFIER_LIST',
      id: 'ML_SAUSAGE',
      version: 4,
      modifier_list_data: {
        name: 'Italian sausage',
        modifiers: [{
          type: 'MODIFIER',
          id: 'MOD_SAUSAGE',
          version: 2,
          modifier_data: { name: 'Italian sausage', price_money: { amount: 300, currency: 'AUD' } },
        }],
      },
    },
    {
      type: 'ITEM',
      id: 'ITEM_01',
      version: 9,
      item_data: {
        name: 'Number 1 Son',
        image_ids: ['IMG_01'],
        variations: [{
          type: 'ITEM_VARIATION',
          id: 'VAR_01',
          version: 8,
          item_variation_data: { sku: 'ROCCO-01', name: 'Regular', price_money: { amount: 2800, currency: 'AUD' } },
        }],
      },
    },
  ];
  const second = planCatalog(menu, existing, { currency: 'AUD', brand });
  const updatedSon = second.objects.find((object) => object.item_data?.variations?.[0]?.item_variation_data?.sku === 'ROCCO-01');
  assert.equal(updatedSon.id, 'ITEM_01');
  assert.equal(updatedSon.version, 9);
  assert.deepEqual(updatedSon.item_data.image_ids, ['IMG_01']);
  assert.equal(updatedSon.item_data.variations[0].id, 'VAR_01');
  assert.equal(updatedSon.item_data.variations[0].version, 8);
  assert.equal(updatedSon.item_data.modifier_list_info[0].modifier_list_id, 'ML_SAUSAGE');
  const list = second.objects.find((object) => object.modifier_list_data?.name === 'Italian sausage');
  assert.equal(list.id, 'ML_SAUSAGE');
  assert.equal(list.version, 4);
  assert.equal(list.modifier_list_data.modifiers[0].id, 'MOD_SAUSAGE');
  assert.equal(second.imageJobs.some((job) => job.sku === 'ROCCO-01'), false);
  assert.equal(second.imageJobs.some((job) => job.sku === 'ROCCO-02'), true);
  const fresh = second.objects.find((object) => object.item_data?.variations?.[0]?.item_variation_data?.sku === 'ROCCO-02');
  assert.ok(String(fresh.id).startsWith('#'));
});

test('a Square price wins over the local copy', () => {
  const objects = [
    { type: 'CATEGORY', id: 'CAT_PIZZA', category_data: { name: 'Pizzas' } },
    {
      type: 'MODIFIER_LIST',
      id: 'ML_PROS',
      modifier_list_data: {
        name: 'Prosciutto',
        modifiers: [{
          id: 'MOD_PROS',
          modifier_data: { name: 'Prosciutto', price_money: { amount: 700, currency: 'AUD' } },
        }],
      },
    },
    {
      type: 'ITEM',
      id: 'ITEM_02',
      item_data: {
        name: 'Margherita',
        description: 'Updated in Square',
        category_id: 'CAT_PIZZA',
        categories: [{ id: 'CAT_PIZZA' }],
        image_ids: ['IMG'],
        modifier_list_info: [{ modifier_list_id: 'ML_PROS', enabled: true }],
        food_and_beverage_details: { dietary_preferences: [{ type: 'STANDARD', standard_name: 'VEGETARIAN' }] },
        variations: [{
          id: 'VAR_02',
          item_variation_data: {
            sku: 'ROCCO-02',
            price_money: { amount: 2100, currency: 'AUD' },
          },
        }],
      },
    },
    { type: 'IMAGE', id: 'IMG', image_data: { url: 'https://example.test/margherita.jpg', name: '02' } },
  ];
  const view = menuFromCatalog(objects, menu, brand);
  assert.equal(view.source, 'square');
  assert.equal(view.items.find((entry) => entry.sku === 'ROCCO-03').priceCents, 2000);
  const item = view.items.find((entry) => entry.sku === 'ROCCO-02');
  assert.equal(item.priceCents, 2100);
  assert.equal(item.description, 'Updated in Square');
  assert.equal(item.variationId, 'VAR_02');
  assert.equal(item.imageUrl, 'https://example.test/margherita.jpg');
  assert.equal(item.modifiers[0].id, 'MOD_PROS');
  assert.equal(item.modifiers[0].priceCents, 700);
  assert.equal(item.vegetarian, true);
  assert.equal(item.number, 2);
});
