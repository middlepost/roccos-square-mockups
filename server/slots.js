// Pickup slot capacity: each 15-minute slot at a shop takes at most N pizzas.
// Kept in memory (sandbox demo). A restart clears it.
export function pizzaCount(priced, menuItems) {
  const bySku = new Map(menuItems.map((item) => [item.sku, item]));
  let count = 0;
  for (const line of priced.lines) {
    if (line.type === 'item' && bySku.get(line.sku)?.category === 'pizza') count += line.qty;
  }
  return count;
}

export function createSlotBook() {
  const used = new Map();
  const key = (loc, date, time) => `${loc}|${date}|${time}`;
  return {
    used: (loc, date, time) => used.get(key(loc, date, time)) || 0,
    forDay(loc, date) {
      const out = {};
      for (const [k, v] of used) {
        const [l, d, t] = k.split('|');
        if (l === loc && d === date) out[t] = v;
      }
      return out;
    },
    add(loc, date, time, n) { used.set(key(loc, date, time), (used.get(key(loc, date, time)) || 0) + n); },
  };
}
