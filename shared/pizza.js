/**
 * Ingredients already on a pizza, so a customer can take one off.
 * An explicit ingredients list wins. Otherwise the description is split on
 * commas that are not inside brackets, and a trailing note after a full stop is dropped.
 */
export function pizzaIngredients(item) {
  if (!item || item.category !== 'pizza') return [];
  if (Array.isArray(item.ingredients) && item.ingredients.length) {
    return item.ingredients.map((name) => String(name).trim()).filter(Boolean);
  }
  let text = String(item.description || '').trim();
  text = text.replace(/^to confirm\s*[—–-]\s*/i, '');
  const note = text.search(/\.\s+[A-Z]/);
  if (note >= 0) text = text.slice(0, note);
  text = text.replace(/\.\s*$/, '');
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of text) {
    if (ch === '(') depth += 1;
    else if (ch === ')' && depth) depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts
    .map((part) => part.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}
