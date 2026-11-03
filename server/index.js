import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyRuntime, loadBrand } from './brand.js';
import { createApp } from './app.js';
import { loadDotEnv, resolveSquareConfig } from './env.js';
import { createSquareClient } from './square.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(path.join(root, '.env'));

const squareConfig = resolveSquareConfig();
const { brand: loaded, menu } = loadBrand(process.env.BRAND || 'roccos', root);
const brand = applyRuntime(loaded);
const square = squareConfig.accessToken ? createSquareClient(squareConfig) : null;
const handle = createApp({
  brand,
  menu,
  square,
  squareConfig,
  publicDir: path.join(root, 'public'),
  sharedDir: path.join(root, 'shared'),
  enquiryFile: path.join(root, 'data', 'enquiries.jsonl'),
  enquiryWebhook: process.env.ENQUIRY_WEBHOOK_URL || null,
});

const port = Number(process.env.PORT || 3000);
const server = http.createServer((req, res) => {
  Promise.resolve(handle(req, res)).catch((error) => {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Something went wrong.' }));
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`${brand.name}  http://localhost:${port}`);
  console.log(`Square ${squareConfig.environment}  ${squareConfig.apiBase}`);
  console.log(square
    ? 'Payments: ready. Card checkouts create sandbox orders.'
    : 'Payments: waiting for SQUARE_ACCESS_TOKEN. The menu is the local 1 Nov list until you seed Square.');
  if (squareConfig.environment === 'sandbox') console.log('This process will only call the Square sandbox.');
});

if (square) {
  square.getLocation(squareConfig.locationId).then((location) => {
    console.log(`Location ${location?.name || squareConfig.locationId} · ${location?.currency || 'currency unknown'}`);
    if (location?.currency && location.currency !== (menu.currency || 'AUD')) {
      console.log(`WARNING: Square location currency is ${location.currency}. Run npm run seed so prices are stored in that currency.`);
    }
  }).catch((error) => {
    console.log(`Could not read the Square location: ${error.message}`);
  });
}
