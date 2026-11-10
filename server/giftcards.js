import { randomUUID } from 'node:crypto';
import { PriceError } from '../shared/pricing.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function placeholderGiftCode(idempotencyKey) {
  const body = String(idempotencyKey).replace(/-/g, '').slice(0, 8).toUpperCase();
  return `ROCCO-${body}`;
}

export function buildGiftCardCheckout({ brand, body, currency }) {
  const amountCents = Number(body.amountCents);
  if (!Number.isInteger(amountCents) || amountCents < 1000 || amountCents > 50000) {
    throw new PriceError('Choose a gift card from $10 to $500.');
  }
  const toName = String(body.toName || '').trim();
  const fromName = String(body.fromName || '').trim();
  const toEmail = String(body.toEmail || '').trim();
  const message = String(body.message || '').trim().slice(0, 200);
  if (toName.length < 2 || toName.length > 80) throw new PriceError('Enter the recipient’s name.');
  if (fromName.length < 2 || fromName.length > 80) throw new PriceError('Enter your name.');
  if (!EMAIL.test(toEmail) || toEmail.length > 120) throw new PriceError('Enter the recipient’s email.');
  const sourceId = String(body.sourceId || '').trim();
  if (!sourceId || sourceId.length > 800) throw new PriceError('The card form did not return a payment token. Try the card again.');
  const idempotencyKey = UUID.test(body.idempotencyKey || '') ? body.idempotencyKey : randomUUID();
  const location = (brand.locations || []).find((entry) => entry.squareLocationId);
  if (!location?.squareLocationId) throw new PriceError('Gift cards are not linked to a Square location yet.');

  const note = [
    `Gift card for ${toName} <${toEmail}>`,
    `From ${fromName}`,
    message ? `Message: ${message}` : null,
  ].filter(Boolean).join('\n').slice(0, 500);

  const order = {
    location_id: location.squareLocationId,
    reference_id: `gift-${idempotencyKey.slice(0, 8)}`,
    source: { name: `${brand.name} website` },
    note,
    pricing_options: { auto_apply_discounts: false, auto_apply_taxes: false },
    line_items: [{
      name: 'Gift card',
      quantity: '1',
      base_price_money: { amount: amountCents, currency },
    }],
  };

  return {
    order,
    amountCents,
    currency,
    idempotencyKey,
    sourceId,
    squareLocationId: location.squareLocationId,
    toName,
    toEmail,
    fromName,
    message,
    note,
  };
}
