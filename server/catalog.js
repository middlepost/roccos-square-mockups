import { presentLocalMenu } from './brand.js';
import { pizzaIngredients } from '../shared/pizza.js';

const CATEGORY_KEYS = ['pizza', 'dessert', 'drinks'];

function categoryNames(brand) {
  return brand.categories || { pizza: 'Pizzas', dessert: 'Dessert', drinks: 'Drinks' };
}

function slugId(prefix, value) {
  return `#${prefix}-${String(value).replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

export function indexCatalog(objects) {
  const categories = new Map();
  const modifierLists = new Map();
  const itemsBySku = new Map();
  const imagesById = new Map();
  for (const object of objects || []) {
    if (object.is_deleted) continue;
    if (object.type === 'CATEGORY') categories.set(object.category_data?.name, object);
    if (object.type === 'MODIFIER_LIST') modifierLists.set(object.modifier_list_data?.name, object);
    if (object.type === 'IMAGE') imagesById.set(object.id, object);
    if (object.type === 'ITEM') {
      for (const variation of object.item_data?.variations || []) {
        const sku = variation.item_variation_data?.sku;
        if (sku) itemsBySku.set(sku, { item: object, variation });
      }
    }
  }
  return { categories, modifierLists, itemsBySku, imagesById };
}

function dietaryPreferences(item) {
  const prefs = [];
  if (item.vegetarian) prefs.push({ type: 'STANDARD', standard_name: 'VEGETARIAN' });
  if (item.containsNuts) prefs.push({ type: 'CUSTOM', custom_name: 'CONTAINS_NUTS' });
  return prefs;
}

function modifierListObject(mod, existing, currency) {
  const existingMod = existing?.modifier_list_data?.modifiers?.find((entry) => entry.modifier_data?.name === mod.name);
  const object = {
    type: 'MODIFIER_LIST',
    id: existing?.id || slugId('mod', mod.key),
    present_at_all_locations: true,
    modifier_list_data: {
      name: mod.name,
      selection_type: 'SINGLE',
      modifiers: [
        {
          type: 'MODIFIER',
          id: existingMod?.id || slugId('modopt', mod.key),
          present_at_all_locations: true,
          modifier_data: {
            name: mod.name,
            price_money: { amount: mod.priceCents, currency },
            on_by_default: false,
          },
        },
      ],
    },
  };
  if (existing?.version != null) object.version = existing.version;
  if (existingMod?.version != null) object.modifier_list_data.modifiers[0].version = existingMod.version;
  return object;
}

function itemObject({ item, existing, categoryId, modifierListIds, currency }) {
  const variation = existing?.variation;
  const object = {
    type: 'ITEM',
    id: existing?.item?.id || slugId('item', item.sku),
    present_at_all_locations: true,
    item_data: {
      name: item.name,
      description: item.description || '',
      abbreviation: item.sku,
      available_online: true,
      available_for_pickup: true,
      product_type: item.category === 'drinks' ? 'REGULAR' : 'FOOD_AND_BEV',
      category_id: categoryId,
      categories: [{ id: categoryId }],
      variations: [
        {
          type: 'ITEM_VARIATION',
          id: variation?.id || slugId('var', item.sku),
          present_at_all_locations: true,
          item_variation_data: {
            item_id: existing?.item?.id || slugId('item', item.sku),
            name: 'Regular',
            sku: item.sku,
            pricing_type: 'FIXED_PRICING',
            price_money: { amount: item.priceCents, currency },
            sellable: true,
          },
        },
      ],
    },
  };
  if (existing?.item?.version != null) object.version = existing.item.version;
  if (variation?.version != null) object.item_data.variations[0].version = variation.version;
  const imageIds = existing?.item?.item_data?.image_ids;
  if (imageIds?.length) object.item_data.image_ids = imageIds;
  if (item.category !== 'drinks') {
    object.item_data.food_and_beverage_details = { dietary_preferences: dietaryPreferences(item) };
  }
  if (modifierListIds.length) {
    object.item_data.modifier_list_info = modifierListIds.map((id) => ({
      modifier_list_id: id,
      enabled: true,
      min_selected_modifiers: 0,
      max_selected_modifiers: 1,
    }));
  }
  return object;
}

export function planCatalog(menu, existingObjects, { currency = 'AUD', brand }) {
  const names = categoryNames(brand);
  const index = indexCatalog(existingObjects);
  const objects = [];
  const categoryIds = {};

  for (const key of CATEGORY_KEYS) {
    const name = names[key];
    const existing = index.categories.get(name);
    const object = {
      type: 'CATEGORY',
      id: existing?.id || slugId('cat', key),
      present_at_all_locations: true,
      category_data: { name },
    };
    if (existing?.version != null) object.version = existing.version;
    objects.push(object);
    categoryIds[key] = object.id;
  }

  const modifierByKey = new Map();
  for (const item of menu.items || []) {
    for (const mod of item.modifiers || []) {
      if (!modifierByKey.has(mod.key)) modifierByKey.set(mod.key, mod);
    }
  }
  const modifierIds = new Map();
  for (const mod of modifierByKey.values()) {
    const object = modifierListObject(mod, index.modifierLists.get(mod.name), currency);
    objects.push(object);
    modifierIds.set(mod.key, object.id);
  }

  const imageJobs = [];
  for (const item of menu.items || []) {
    const existing = index.itemsBySku.get(item.sku);
    const listIds = (item.modifiers || []).map((mod) => modifierIds.get(mod.key)).filter(Boolean);
    objects.push(itemObject({
      item,
      existing,
      categoryId: categoryIds[item.category] || categoryIds.pizza,
      modifierListIds: listIds,
      currency,
    }));
    const hasImage = existing?.item?.item_data?.image_ids?.length;
    if (item.image && !hasImage) {
      imageJobs.push({
        sku: item.sku,
        filename: item.image,
        caption: item.name,
      });
    }
  }

  return { objects, imageJobs };
}

function categoryKey(name, brand) {
  const names = categoryNames(brand);
  for (const key of CATEGORY_KEYS) {
    if (names[key] === name) return key;
  }
  return null;
}

function prefsOf(itemData) {
  return itemData?.food_and_beverage_details?.dietary_preferences || null;
}

export function menuFromCatalog(objects, localMenu, brand) {
  const index = indexCatalog(objects);
  const localBySku = new Map((localMenu.items || []).map((item) => [item.sku, item]));
  const prefix = brand.skuPrefix || '';
  const names = categoryNames(brand);
  const ourCategoryIds = new Set();
  for (const object of objects || []) {
    if (object.type === 'CATEGORY' && Object.values(names).includes(object.category_data?.name)) {
      ourCategoryIds.add(object.id);
    }
  }

  const items = [];
  const seen = new Set();
  for (const { item, variation } of index.itemsBySku.values()) {
    const sku = variation.item_variation_data?.sku;
    if (!sku || seen.has(sku)) continue;
    const data = item.item_data || {};
    if (data.is_archived || item.is_deleted) continue;
    if (data.available_online === false) continue;
    const categoryId = data.categories?.[0]?.id || data.category_id;
    const inOurCategory = ourCategoryIds.has(categoryId);
    const prefixed = prefix && sku.startsWith(prefix);
    if (!prefixed && !inOurCategory) continue;
    seen.add(sku);

    const local = localBySku.get(sku);
    const catObject = [...(objects || [])].find((object) => object.type === 'CATEGORY' && object.id === categoryId);
    const key = categoryKey(catObject?.category_data?.name, brand) || local?.category || 'pizza';
    const price = variation.item_variation_data?.price_money?.amount;
    const prefs = prefsOf(data);
    const imageId = data.image_ids?.[0];
    const image = imageId ? index.imagesById.get(imageId) : null;
    const description = data.description ?? local?.description ?? '';
    const modifiers = [];
    for (const info of data.modifier_list_info || []) {
      if (info.enabled === false) continue;
      const list = [...index.modifierLists.values()].find((entry) => entry.id === info.modifier_list_id);
      for (const mod of list?.modifier_list_data?.modifiers || []) {
        const localMod = (local?.modifiers || []).find((entry) => entry.name === mod.modifier_data?.name);
        modifiers.push({
          key: localMod?.key || slugKey(mod.modifier_data?.name || mod.id),
          name: mod.modifier_data?.name || 'Add-on',
          priceCents: mod.modifier_data?.price_money?.amount ?? 0,
          id: mod.id,
        });
      }
    }

    items.push({
      sku,
      number: local?.number ?? numberFromSku(sku),
      name: data.name || local?.name || sku,
      description,
      priceCents: price ?? local?.priceCents ?? 0,
      category: key,
      vegetarian: prefs ? prefs.some((pref) => pref.standard_name === 'VEGETARIAN') : Boolean(local?.vegetarian),
      containsNuts: prefs
        ? prefs.some((pref) => pref.custom_name === 'CONTAINS_NUTS')
        : Boolean(local?.containsNuts),
      toConfirm: /^to confirm/i.test(description),
      imageUrl: image?.image_data?.url || (local?.image ? `/images/products/${local.image}` : null),
      ingredients: key === 'pizza' ? pizzaIngredients({ category: 'pizza', description, ingredients: local?.ingredients }) : [],
      variationId: variation.id,
      modifiers: Array.isArray(data.modifier_list_info)
        ? modifiers
        : (local?.modifiers || []).map((mod) => ({ ...mod, id: null })),
    });
  }

  const priced = [...index.itemsBySku.values()].find((entry) => entry.variation.item_variation_data?.price_money?.currency);
  const currency = priced?.variation.item_variation_data.price_money.currency || localMenu.currency || 'AUD';
  if (!items.length) {
    return { source: 'square', currency, notice: null, items: [] };
  }
  const bySku = new Map(items.map((item) => [item.sku, item]));
  const merged = [];
  const covered = new Set();
  for (const local of presentLocalMenu(localMenu).items) {
    const squareItem = bySku.get(local.sku);
    if (!squareItem) {
      merged.push(local);
      continue;
    }
    covered.add(squareItem.sku);
    merged.push({
      ...local,
      ...squareItem,
      number: local.number ?? squareItem.number,
      imageUrl: squareItem.imageUrl || local.imageUrl,
      ingredients: local.ingredients?.length ? local.ingredients : (squareItem.ingredients || []),
    });
  }
  for (const squareItem of items) {
    if (!covered.has(squareItem.sku)) merged.push(squareItem);
  }
  merged.sort((a, b) => (a.number ?? 999) - (b.number ?? 999) || a.name.localeCompare(b.name));
  return { source: 'square', currency, notice: null, items: merged };
}

function slugKey(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'addon';
}

function numberFromSku(sku) {
  const drink = String(sku).match(/-DR(\d+)$/i);
  if (drink) return 100 + Number(drink[1]);
  const match = String(sku).match(/(\d+)$/);
  return match ? Number(match[1]) : null;
}
