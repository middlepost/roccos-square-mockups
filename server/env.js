import fs from 'node:fs';
import path from 'node:path';
import {
  PRODUCTION_API,
  PRODUCTION_SDK,
  SANDBOX_API,
  SANDBOX_APP_ID,
  SANDBOX_LOCATION_ID,
  SANDBOX_SDK,
} from './constants.js';

export function loadDotEnv(file = path.resolve('.env')) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function resolveSquareConfig(env = process.env) {
  const environment = String(env.SQUARE_ENVIRONMENT || env.SQUARE_ENV || 'sandbox').trim().toLowerCase();
  const allowProduction = env.SQUARE_ALLOW_PRODUCTION === 'yes';
  const applicationId = String(env.SQUARE_APPLICATION_ID || SANDBOX_APP_ID).trim();
  const locationId = String(env.SQUARE_LOCATION_ID || SANDBOX_LOCATION_ID).trim();
  const accessToken = String(env.SQUARE_ACCESS_TOKEN || '').trim();
  const currency = String(env.SQUARE_CURRENCY || 'AUD').trim() || 'AUD';

  if (environment !== 'sandbox' && environment !== 'production') {
    throw new Error(`SQUARE_ENVIRONMENT or SQUARE_ENV must be "sandbox" or "production" (got "${environment}").`);
  }
  if (environment === 'production' && !allowProduction) {
    throw new Error(
      'Refusing to use a production Square account. Keep SQUARE_ENVIRONMENT=sandbox. Production is only used when that value is production and SQUARE_ALLOW_PRODUCTION=yes.',
    );
  }
  if (environment === 'sandbox' && !applicationId.startsWith('sandbox-')) {
    throw new Error('Sandbox mode requires an application id starting with "sandbox-". Refusing to continue.');
  }
  if (environment === 'production' && applicationId.startsWith('sandbox-')) {
    throw new Error('Production mode cannot use a sandbox application id. Refusing to continue.');
  }

  const sandbox = environment === 'sandbox';
  return {
    environment,
    applicationId,
    locationId,
    accessToken,
    currency,
    paymentsReady: Boolean(accessToken),
    apiBase: sandbox ? SANDBOX_API : PRODUCTION_API,
    sdkUrl: sandbox ? SANDBOX_SDK : PRODUCTION_SDK,
  };
}
