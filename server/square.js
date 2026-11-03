import { randomUUID } from 'node:crypto';
import { SQUARE_VERSION } from './constants.js';

export class SquareError extends Error {
  constructor(message, { status = 0, errors = [] } = {}) {
    super(message);
    this.name = 'SquareError';
    this.status = status;
    this.errors = errors;
  }
}

export function createSquareClient({
  accessToken,
  apiBase,
  applicationId,
  locationId,
  environment,
  fetchImpl = fetch,
} = {}) {
  if (!accessToken) throw new Error('Square client requires an access token.');
  if (!apiBase) throw new Error('Square client requires an API host.');
  if (environment === 'sandbox' && !apiBase.includes('squareupsandbox.com')) {
    throw new Error('Sandbox client refused a non-sandbox Square host.');
  }
  if (environment === 'production' && apiBase.includes('squareupsandbox.com')) {
    throw new Error('Production client refused the sandbox Square host.');
  }

  async function request(method, apiPath, body) {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Square-Version': SQUARE_VERSION,
      Accept: 'application/json',
    };
    const init = { method, headers };
    if (body?.form) {
      init.body = body.form;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    let response;
    try {
      response = await fetchImpl(`${apiBase}${apiPath}`, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch (error) {
      throw new SquareError(`Could not reach Square (${error.message || 'network error'}).`, { status: 0 });
    }
    const text = await response.text();
    let data = {};
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = {};
      }
    }
    if (!response.ok) {
      const detail = data.errors?.map((entry) => entry.detail || entry.code).filter(Boolean).join('; ');
      const message = detail || `Square returned HTTP ${response.status}.`;
      throw new SquareError(message, { status: response.status, errors: data.errors || [] });
    }
    return data;
  }

  return {
    environment,
    apiBase,
    applicationId,
    locationId,
    async getLocation(id = locationId) {
      const data = await request('GET', `/v2/locations/${encodeURIComponent(id)}`);
      return data.location;
    },
    async listCatalog() {
      const all = [];
      let cursor;
      do {
        const query = new URLSearchParams({ types: 'ITEM,CATEGORY,MODIFIER_LIST,IMAGE' });
        if (cursor) query.set('cursor', cursor);
        const data = await request('GET', `/v2/catalog/list?${query}`);
        if (data.objects) all.push(...data.objects);
        cursor = data.cursor;
      } while (cursor);
      return all;
    },
    async batchUpsert(objects) {
      return request('POST', '/v2/catalog/batch-upsert', {
        idempotency_key: randomUUID(),
        batches: [{ objects }],
      });
    },
    async createImage({ itemId, filename, bytes, caption }) {
      const form = new FormData();
      form.append('request', JSON.stringify({
        idempotency_key: randomUUID(),
        object_id: itemId,
        is_primary: true,
        image: {
          id: '#image',
          type: 'IMAGE',
          image_data: { name: filename, caption },
        },
      }));
      form.append('file', new Blob([bytes], { type: 'image/jpeg' }), filename);
      return request('POST', '/v2/catalog/images', { form });
    },
    async createOrder(order, idempotencyKey) {
      return request('POST', '/v2/orders', { idempotency_key: idempotencyKey, order });
    },
    async createPayment(payment) {
      return request('POST', '/v2/payments', payment);
    },
  };
}
