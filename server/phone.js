import { PriceError } from '../shared/pricing.js';

export function toE164(input) {
  const raw = String(input || '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    throw new PriceError('Enter a phone number we can call about the pickup.');
  }
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('61')) return `+${digits}`;
  if (digits.startsWith('0')) return `+61${digits.slice(1)}`;
  return `+61${digits}`;
}
