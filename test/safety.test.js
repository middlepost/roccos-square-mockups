import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { SANDBOX_API } from '../server/constants.js';
import { resolveSquareConfig } from '../server/env.js';
import { createSquareClient } from '../server/square.js';
import { zonedWallTimeToUtc } from '../server/time.js';

const root = path.resolve(import.meta.dirname, '..');

test('Adelaide pickup times convert across daylight saving', () => {
  assert.equal(zonedWallTimeToUtc('2026-11-03', '18:30'), '2026-11-03T08:00:00.000Z');
  assert.equal(zonedWallTimeToUtc('2026-07-15', '18:30'), '2026-07-15T09:00:00.000Z');
});

test('sandbox is the default and production is refused', () => {
  const sandbox = resolveSquareConfig({});
  assert.equal(sandbox.environment, 'sandbox');
  assert.equal(sandbox.apiBase, SANDBOX_API);
  assert.equal(sandbox.applicationId, 'sandbox-sq0idb-rqkEoTTcR7FYJQCQiDjBYw');
  assert.equal(sandbox.locationId, 'LFXEWDVVKRYC0');
  assert.equal(sandbox.paymentsReady, false);

  assert.throws(() => resolveSquareConfig({
    SQUARE_ENV: 'production',
    SQUARE_APPLICATION_ID: 'sq0idp-live',
    SQUARE_ACCESS_TOKEN: 'EAAAsecret-token-value',
  }), /production/i);

  assert.throws(() => resolveSquareConfig({
    SQUARE_ENV: 'sandbox',
    SQUARE_APPLICATION_ID: 'sq0idp-live',
  }), /sandbox-/);

  assert.throws(() => resolveSquareConfig({
    SQUARE_ENV: 'production',
    SQUARE_ALLOW_PRODUCTION: 'yes',
    SQUARE_APPLICATION_ID: 'sandbox-sq0idb-rqkEoTTcR7FYJQCQiDjBYw',
  }), /cannot use a sandbox/);
});

test('the Square client will not call production from sandbox mode', async () => {
  const calls = [];
  const client = createSquareClient({
    accessToken: 'EAAAsecret-token-value',
    apiBase: SANDBOX_API,
    applicationId: 'sandbox-sq0idb-rqkEoTTcR7FYJQCQiDjBYw',
    locationId: 'LFXEWDVVKRYC0',
    environment: 'sandbox',
    fetchImpl: async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization });
      return new Response(JSON.stringify({ location: { id: 'LFXEWDVVKRYC0', currency: 'AUD', name: 'Sandbox' } }), { status: 200 });
    },
  });
  await client.getLocation();
  assert.match(calls[0].url, /^https:\/\/connect\.squareupsandbox\.com\//);
  assert.equal(calls[0].auth, 'Bearer EAAAsecret-token-value');
  assert.throws(() => createSquareClient({
    accessToken: 'token',
    apiBase: 'https://connect.squareup.com',
    environment: 'sandbox',
  }), /non-sandbox/);
});

function runSeed(extraEnv, args = []) {
  return spawnSync(process.execPath, ['scripts/seed-square.js', ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
  });
}

test('seed dry-run needs no token and prints the 1 Nov menu', () => {
  const result = runSeed({
    SQUARE_ENV: 'sandbox',
    SQUARE_ACCESS_TOKEN: '',
    SQUARE_ALLOW_PRODUCTION: '',
    SQUARE_APPLICATION_ID: 'sandbox-sq0idb-rqkEoTTcR7FYJQCQiDjBYw',
  }, ['--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Dry run only/);
  assert.match(result.stdout, /Number 1 Son/);
  assert.match(result.stdout, /Honey Pesto Chicken/);
  assert.match(result.stdout, /squareupsandbox\.com/);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /President|EAAA/);
});

test('seed without a token exits and a production flag is not enough to hide the refusal', () => {
  const missing = runSeed({
    SQUARE_ENV: 'sandbox',
    SQUARE_ACCESS_TOKEN: '',
    SQUARE_ALLOW_PRODUCTION: '',
    SQUARE_APPLICATION_ID: 'sandbox-sq0idb-rqkEoTTcR7FYJQCQiDjBYw',
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /SQUARE_ACCESS_TOKEN/);

  const production = runSeed({
    SQUARE_ENV: 'production',
    SQUARE_ALLOW_PRODUCTION: '',
    SQUARE_APPLICATION_ID: 'sq0idp-example',
    SQUARE_ACCESS_TOKEN: 'EAAAsecret-token-value',
  });
  assert.equal(production.status, 1);
  assert.match(production.stderr, /Refusing/);
  assert.doesNotMatch(`${production.stdout}${production.stderr}`, /EAAAsecret-token-value/);
});
