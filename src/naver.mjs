import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { AppError } from './validation.mjs';

const BASE = 'https://api.commerce.naver.com/external';
const DAY = 24 * 60 * 60 * 1000;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function networkCodes(error, depth = 0) {
  if (!error || depth > 5) return [];
  return [error.code, error.name, ...networkCodes(error.cause, depth + 1),
    ...(Array.isArray(error.errors) ? error.errors.flatMap(e => networkCodes(e, depth + 1)) : [])];
}
export class NaverClient {
  constructor(config, { fetcher = fetch, wait = sleep } = {}) { this.config = config; this.fetcher = fetcher; this.wait = wait; this.token = null; this.expiresAt = 0; }
  async tokenValue() {
    const { clientId, clientSecret } = this.config;
    if (!clientId || !clientSecret) throw new AppError('연결 · 채널에서 네이버 Client ID와 Client Secret을 설정하세요. 자동 샘플 모드는 사용하지 않습니다.', 409);
    if (this.token && this.expiresAt > Date.now() + 300000) return this.token;
    const timestamp = String(Date.now());
    let signature;
    try { signature = Buffer.from(await bcrypt.hash(`${clientId}_${timestamp}`, clientSecret)).toString('base64'); }
    catch { throw new AppError('네이버 Client Secret 형식을 확인하세요.'); }
    const data = await this.request('/v1/oauth2/token', { method: 'POST', form: { client_id: clientId, timestamp, client_secret_sign: signature, grant_type: 'client_credentials', type: 'SELF' } }, false);
    if (!data.access_token) throw new AppError('네이버 인증 응답에 토큰이 없습니다.', 502);
    this.token = data.access_token; this.expiresAt = Date.now() + Number(data.expires_in || 10800)*1000;
    return this.token;
  }
  async request(endpoint, { method = 'GET', body, form } = {}, auth = true) {
    for (let attempt = 0; attempt < 4; attempt++) {
      let response;
      try {
        const headers = form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : { 'Content-Type': 'application/json' };
        if (auth) headers.Authorization = `Bearer ${await this.tokenValue()}`;
        response = await this.fetcher(`${BASE}${endpoint}`, {
          method, headers, body: form ? new URLSearchParams(form) : body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(20000), redirect: 'error',
        });
      } catch (err) {
        if (err instanceof AppError) throw err;
        const codes = networkCodes(err);
        if (codes.some(code => ['EACCES', 'EPERM'].includes(code))) {
          throw new AppError('앱 실행 환경이 네이버로의 네트워크 접근을 차단했습니다 (EACCES/EPERM). Codex에서 실행했다면 네트워크 접근이 허용된 환경으로 서버를 재시작하거나, PC에서 stop.bat 실행 후 start.bat으로 다시 시작하세요. 계속되면 방화벽 설정을 확인하세요.', 502);
        }
        if (attempt === 3) {
          if (codes.some(code => ['TimeoutError', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT'].includes(code))) throw new AppError('네이버 연결 시간이 초과되었습니다. 인터넷 연결 상태를 확인하고 다시 수집하세요.', 502);
          if (codes.some(code => ['ENOTFOUND', 'EAI_AGAIN'].includes(code))) throw new AppError('네이버 서버 주소를 찾지 못했습니다. 인터넷 및 DNS 연결 상태를 확인하세요.', 502);
          throw new AppError('네이버 네트워크 연결에 실패했습니다. 인터넷 연결 상태를 확인하고 다시 수집하세요.', 502);
        }
        await this.wait(500 * 2 ** attempt); continue;
      }
      let data;
      try { data = await response.json(); } catch { throw new AppError('네이버에서 JSON이 아닌 응답을 받았습니다.', 502); }
      if (response.ok) return data;
      if (data.code === 'GW.IP_NOT_ALLOWED') throw new AppError('현재 호출 IP가 네이버에 등록되어 있지 않습니다. 커머스 API 센터의 API 호출 IP를 확인하세요.', 403);
      if (response.status === 401 && auth && attempt < 3) { this.token = null; continue; }
      if ((response.status === 429 || response.status >= 500) && attempt < 3) {
        const retryAfter = Number(response.headers.get('retry-after'));
        await this.wait(Math.min(10000, Math.max(500 * 2 ** attempt, Number.isFinite(retryAfter) ? retryAfter * 1000 : 0))); continue;
      }
      // Do not log raw vendor responses, credentials, or order PII.
      const code = String(data.code || 'UNKNOWN').replace(/[^A-Z0-9_.-]/gi, '').slice(0,80);
      throw new AppError(`네이버 요청 실패 (HTTP ${response.status}, ${code}). 권한과 API 설정을 확인하세요.`, 502);
    }
    throw new AppError('네이버 요청 재시도 한도를 초과했습니다.', 502);
  }
}

export function normalizeProduct(item, config) {
  const channel = item.channelProducts?.find(p => p.channelServiceType === 'STOREFARM') || item.channelProducts?.[0] || item;
  if (!item.originProductNo || !channel.name) throw new AppError('네이버 상품 응답 형식이 예상과 다릅니다.', 502);
  const price = channel.salePrice ?? item.salePrice;
  if (price === undefined || !Number.isSafeInteger(Number(price)) || Number(price) < 0) throw new AppError('네이버 상품 응답의 판매가를 확인할 수 없습니다.', 502);
  return {
    id: `naver_${config.storeId}_${item.originProductNo}`, externalId: String(item.originProductNo),
    channelProductId: String(channel.channelProductNo || ''), storeId: config.storeId, storeName: config.storeName,
    name: channel.name, price: Number(price), stock: channel.stockQuantity ?? item.stockQuantity ?? null,
    status: channel.statusType || 'UNKNOWN', imageUrl: channel.representativeImage?.url || item.images?.representativeImage?.url || '',
    productUrl: '', facts: '', source: 'NAVER', updatedAt: new Date().toISOString(),
  };
}
export function normalizeOrder(item, config) {
  const po = item.productOrder;
  if (!po?.productOrderId) throw new AppError('네이버 주문 상세 응답에 productOrder.productOrderId가 없습니다.', 502);
  return {
    id: `naver_${config.storeId}_${po.productOrderId}`, externalId: String(po.productOrderId),
    orderId: item.order?.orderId || '', storeId: config.storeId,
    productId: po.originalProductId ? `naver_${config.storeId}_${po.originalProductId}` : '',
    channelProductId: String(po.productId || ''), productName: po.productName || '',
    quantity: Number(po.quantity || 0), amount: Number(po.totalPaymentAmount || 0),
    status: po.productOrderStatus || 'UNKNOWN', claimStatus: po.claimStatus || '',
    paymentDate: item.order?.paymentDate || '', source: 'NAVER', updatedAt: new Date().toISOString(),
    // Deliberately exclude recipient, phone, address and the raw response from the marketing workspace.
  };
}

export async function syncNaver(store, config, kind = 'all', options = {}) {
  if (!['all','products','orders'].includes(kind)) throw new AppError('수집 종류는 all, products, orders 중 하나입니다.');
  const client = options.client || new NaverClient(config);
  const owner = randomUUID(), lease = `naver:${config.storeId}`;
  store.acquire(lease, owner);
  for (const old of store.list('run')) if (old.storeId === config.storeId && old.status === 'RUNNING') store.put('run', { ...old, status: 'INTERRUPTED', error: '이전 프로세스가 완료 기록 없이 종료되었습니다. 마지막 성공 위치부터 재개합니다.', updatedAt: new Date().toISOString() });
  const run = { id: owner, kind, storeId: config.storeId, status: 'RUNNING', startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), products: 0, changedOrders: 0, newOrders: 0, windows: 0 };
  store.put('run', run);
  const renew = () => store.acquire(lease, owner);
  try {
    if (kind === 'all' || kind === 'products') {
      const all = [], seen = new Set();
      for (let page = 1; ; page++) {
        renew();
        const data = await client.request('/v1/products/search', { method: 'POST', body: { page, size: 100 } });
        if (!Array.isArray(data.contents)) throw new AppError('네이버 상품 목록 응답 형식을 확인하세요.', 502);
        for (const raw of data.contents) {
          const p = normalizeProduct(raw, config);
          if (seen.has(p.id)) throw new AppError('상품 목록 페이지가 반복되었습니다. 수집을 중단합니다.', 502);
          seen.add(p.id); all.push(p);
        }
        if (data.contents.length === 0 || data.last === true || (Number.isFinite(data.totalPages) && page >= data.totalPages) || (Number.isFinite(data.totalCount) && all.length >= data.totalCount)) break;
        if (page >= 10000) throw new AppError('상품 페이지 수집 한도를 초과했습니다.', 502);
      }
      store.transaction(() => {
        renew();
        for (const p of all) store.put('product', p);
        for (const old of store.list('product')) if (old.source === 'NAVER' && old.storeId === config.storeId && !seen.has(old.id)) store.put('product', { ...old, status: 'UNAVAILABLE', updatedAt: new Date().toISOString() });
        store.meta(`naver:products:${config.storeId}`, new Date().toISOString());
      });
      run.products = all.length;
    }
    if (kind === 'all' || kind === 'orders') {
      const end = options.now ?? Date.now();
      const key = `naver:cursor:${config.storeId}`;
      const previous = store.meta(key);
      let start = options.from ? Date.parse(options.from) : previous ? Date.parse(previous)-60000 : end-DAY;
      if (!Number.isFinite(start) || start >= end) throw new AppError('수집 시작 시각은 현재보다 이전의 ISO 날짜여야 합니다.');
      const seenOrders = new Set();
      while (start < end) {
        const until = Math.min(end, start + DAY - 1000);
        let cursor = new Date(start).toISOString(), sequence;
        const seenCursors = new Set(), collected = new Map();
        for (;;) {
          renew();
          const params = new URLSearchParams({ lastChangedFrom: cursor, lastChangedTo: new Date(until).toISOString(), limitCount: '300' });
          if (sequence !== undefined) params.set('moreSequence', String(sequence));
          const data = await client.request(`/v1/pay-order/seller/product-orders/last-changed-statuses?${params}`);
          // Naver omits data entirely for an empty interval (official notice #321).
          if (data && typeof data.timestamp === 'string' && typeof data.traceId === 'string'
            && Object.keys(data).every(key => ['timestamp', 'traceId'].includes(key))) break;
          if (!Array.isArray(data?.data?.lastChangeStatuses)) throw new AppError('네이버 주문 변경 응답 형식을 확인하세요.', 502);
          const ids = [...new Set(data.data.lastChangeStatuses.map(s => String(s.productOrderId)))];
          for (let i = 0; i < ids.length; i+=300) {
            renew();
            const batch = ids.slice(i, i+300);
            const details = await client.request('/v1/pay-order/seller/product-orders/query', { method: 'POST', body: { productOrderIds: batch } });
            if (!Array.isArray(details.data)) throw new AppError('네이버 주문 상세 응답 형식을 확인하세요.', 502);
            const returned = new Set();
            for (const raw of details.data) { const order = normalizeOrder(raw, config); returned.add(order.externalId); collected.set(order.id, order); }
            if (batch.some(id => !returned.has(id))) throw new AppError('일부 주문 상세가 누락되어 수집 위치를 갱신하지 않았습니다. 다시 수집하세요.', 502);
          }
          const more = data.data.more;
          if (!more) break;
          if (!more.moreFrom || more.moreSequence === undefined) throw new AppError('주문 다음 페이지 정보가 올바르지 않습니다.', 502);
          const next = `${more.moreFrom}:${more.moreSequence}`;
          if (seenCursors.has(next)) throw new AppError('주문 다음 페이지가 반복되었습니다.', 502);
          seenCursors.add(next); cursor = more.moreFrom; sequence = more.moreSequence;
        }
        store.transaction(() => {
          renew();
          for (const order of collected.values()) {
            if (!store.get('order', order.id)) run.newOrders++;
            store.put('order', order); seenOrders.add(order.id);
          }
          // Never move an existing successful checkpoint backwards during an explicit backfill.
          const oldCursor = store.meta(key);
          if (!oldCursor || Date.parse(oldCursor) < until) store.meta(key, new Date(until).toISOString());
        });
        run.windows++; run.changedOrders = seenOrders.size;
        start = until; // Inclusive overlap is safe because product-order IDs are upserted.
      }
    }
    run.status = 'SUCCESS';
    return run;
  } catch (err) { run.status = 'FAILED'; run.error = err instanceof AppError ? err.message : '수집 처리 중 오류가 발생했습니다. 설정과 데이터 형식을 확인하세요.'; throw err; }
  finally { run.finishedAt = new Date().toISOString(); run.updatedAt = run.finishedAt; store.put('run', run); store.release(lease, owner); }
}
