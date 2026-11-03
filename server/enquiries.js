import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const KINDS = {
  catering: ['name', 'phone', 'date', 'people'],
  'gift-card': ['from', 'email', 'amount'],
  club: ['name', 'email'],
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateEnquiry(body) {
  const kind = body?.kind;
  if (!KINDS[kind]) return 'Unknown form.';
  const fields = body.fields && typeof body.fields === 'object' ? body.fields : {};
  for (const key of KINDS[kind]) {
    if (!String(fields[key] ?? '').trim()) return `Missing ${key}.`;
  }
  if (kind === 'catering') {
    const people = Number(fields.people);
    if (!Number.isInteger(people) || people < 5 || people > 500) return 'Catering is for groups of 5 or more.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fields.date))) return 'Enter a date.';
  }
  if (kind === 'gift-card' && !['$25', '$50', '$100'].includes(String(fields.amount))) {
    return 'Choose a $25, $50, or $100 gift card.';
  }
  if ((kind === 'club' || kind === 'gift-card') && !EMAIL.test(String(fields.email))) return 'Enter a valid email.';
  if (kind === 'catering' && fields.email && !EMAIL.test(String(fields.email))) return 'Enter a valid email.';
  return null;
}

export function recordEnquiry({ file, kind, fields, destination }) {
  const entry = {
    id: randomUUID(),
    at: new Date().toISOString(),
    kind,
    destination,
    fields,
    delivery: 'stored',
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(entry)}\n`);
  return entry;
}

export async function notifyEnquiry(entry, { webhook, fetchImpl = fetch } = {}) {
  if (!webhook) return entry;
  try {
    const response = await fetchImpl(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
      signal: AbortSignal.timeout(10_000),
    });
    entry.delivery = response.ok ? 'webhook' : 'stored';
    if (!response.ok) entry.webhookStatus = response.status;
  } catch {
    entry.delivery = 'stored';
    entry.webhookStatus = 0;
  }
  return entry;
}
