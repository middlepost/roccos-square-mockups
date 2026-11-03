import { PriceError } from '../shared/pricing.js';

export function zoneOffsetMs(instant, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = Object.fromEntries(dtf.formatToParts(instant).map((part) => [part.type, part.value]));
  let hour = Number(parts.hour);
  if (hour === 24) hour = 0;
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute, +parts.second);
  return asUtc - instant.getTime();
}

export function zonedWallTimeToUtc(date, time, timeZone = 'Australia/Adelaide') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) {
    throw new PriceError('Choose a pickup date and time.');
  }
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) {
    throw new PriceError('Choose a pickup date and time.');
  }
  const wall = Date.UTC(y, m - 1, d, hh, mm, 0);
  let utc = wall - zoneOffsetMs(new Date(wall), timeZone);
  utc = wall - zoneOffsetMs(new Date(utc), timeZone);
  return new Date(utc).toISOString();
}

export function adelaideToday(now = new Date()) {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Adelaide',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return dtf.format(now);
}

export function resolvePickup({ when, date, time, prepMinutes = 20, now = new Date() }) {
  const prep = Math.min(Math.max(Number(prepMinutes) || 20, 5), 120);
  if (when === 'time') {
    const pickupAt = zonedWallTimeToUtc(date, time);
    const at = new Date(pickupAt).getTime();
    if (at < now.getTime() - 60_000) throw new PriceError('That pickup time has already passed.');
    if (at > now.getTime() + 14 * 24 * 60 * 60 * 1000) {
      throw new PriceError('Pickup can be booked up to 14 days ahead.');
    }
    return {
      scheduleType: 'SCHEDULED',
      pickupAt,
      prepTimeDuration: `PT${prep}M`,
      label: `${date} ${time} Adelaide time`,
    };
  }
  return {
    scheduleType: 'ASAP',
    pickupAt: null,
    prepTimeDuration: `PT${prep}M`,
    label: 'As soon as possible',
  };
}
