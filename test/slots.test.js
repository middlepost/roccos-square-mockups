import test from 'node:test';
import assert from 'node:assert/strict';
import { createSlotBook, pizzaCount } from '../server/slots.js';

test('pizza count includes deal picks and skips drinks', () => {
  const menu = [{ sku: 'P', category: 'pizza' }, { sku: 'D', category: 'drinks' }];
  const priced = { lines: [{ type: 'item', sku: 'P', qty: 2 }, { type: 'item', sku: 'D', qty: 3 }, { type: 'deal', qty: 1, picks: [{ sku: 'P', qty: 3 }] }] };
  assert.equal(pizzaCount(priced, menu), 5);
});

test('slot book adds up per shop, day and time', () => {
  const book = createSlotBook();
  book.add('findon', '2026-11-10', '17:30', 6);
  book.add('findon', '2026-11-10', '17:30', 4);
  book.add('grange', '2026-11-10', '17:30', 1);
  assert.equal(book.used('findon', '2026-11-10', '17:30'), 10);
  assert.deepEqual(book.forDay('grange', '2026-11-10'), { '17:30': 1 });
});
