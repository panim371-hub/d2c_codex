import { DatabaseSync, backup } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, text, integer, webUrl, socialChannel, socialChannels, socialUrl, revision } from './validation.mjs';

const now = () => new Date().toISOString();
const trendPeriods = new Set(['today','week','keyword']);
function trendPeriod(value) {
  const period = text(value, '조사 기간', 20, true).toLowerCase();
  if (!trendPeriods.has(period)) throw new AppError('조사 기간은 오늘, 이번 주, 키워드 중 하나여야 합니다.');
  return period;
}
function trendSources(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 5) throw new AppError('동향마다 1~5개의 출처가 필요합니다.');
  const sources = value.map(source => ({
    title:text(source.title, '출처 제목', 300, true),
    url:webUrl(source.url, '출처 URL'),
    publishedAt:text(source.publishedAt, '출처 발행일', 100, true),
  }));
  if (sources.some(source => !source.url)) throw new AppError('각 동향의 출처 URL을 입력하세요.');
  return sources;
}
export class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true });
    this.db = new DatabaseSync(path.join(dataDir, 'd2c.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(kind,id));
      CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS leases(key TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,kind TEXT NOT NULL,record_id TEXT NOT NULL,body TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_events_record ON events(kind,record_id,id);
      PRAGMA user_version=1;`);
    for (const campaign of this.list('campaign')) {
      let changed = false;
      if (!Array.isArray(campaign.targetChannels) || !campaign.targetChannels.length) { campaign.targetChannels = ['instagram']; changed = true; }
      if (!Array.isArray(campaign.publications)) {
        campaign.publications = campaign.postUrl ? [{ channel: 'instagram', url: campaign.postUrl, publishedAt: campaign.publishedAt, verification: campaign.verification || 'OPERATOR_RECORDED' }] : [];
        changed = true;
      }
      if (changed) this.put('campaign', campaign);
    }
  }
  close() { this.db.close(); }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  get(kind, id) { const row = this.db.prepare('SELECT body FROM records WHERE kind=? AND id=?').get(kind, id); return row ? JSON.parse(row.body) : null; }
  require(kind, id) { const result = this.get(kind, id); if (!result) throw new AppError('항목을 찾을 수 없습니다.', 404); return result; }
  list(kind) { return this.db.prepare('SELECT body FROM records WHERE kind=? ORDER BY updated_at DESC,id').all(kind).map(r => JSON.parse(r.body)); }
  put(kind, item) {
    this.db.prepare('INSERT INTO records VALUES(?,?,?,?) ON CONFLICT(kind,id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at')
      .run(kind, item.id, JSON.stringify(item), item.updatedAt || now());
    return item;
  }
  meta(key, value) {
    if (value === undefined) { const row = this.db.prepare('SELECT value FROM meta WHERE key=?').get(key); return row ? JSON.parse(row.value) : null; }
    this.db.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  }
  event(kind, id, body) { this.db.prepare('INSERT INTO events(kind,record_id,body,created_at) VALUES(?,?,?,?)').run(kind, id, JSON.stringify(body), now()); }
  history(id) { return this.db.prepare('SELECT body,created_at FROM events WHERE kind=? AND record_id=? ORDER BY id DESC LIMIT 30').all('campaign', id).map(r => ({ ...JSON.parse(r.body), at: r.created_at })); }
  acquire(key, owner, ttl = 600000) {
    const result = this.db.prepare('INSERT INTO leases VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at WHERE leases.expires_at < ? OR leases.owner = excluded.owner').run(key, owner, Date.now()+ttl, Date.now());
    if (result.changes !== 1) throw new AppError('같은 수집 작업이 이미 실행 중입니다. 완료 후 다시 시도하세요.', 409);
  }
  release(key, owner) { this.db.prepare('DELETE FROM leases WHERE key=? AND owner=?').run(key, owner); }
  hasActiveLease() { return Boolean(this.db.prepare('SELECT 1 FROM leases WHERE expires_at > ? LIMIT 1').get(Date.now())); }
  naverStoreSummary(item) {
    return { id:item.id, storeId:item.storeId, storeName:item.storeName, enabled:item.enabled !== false, configured:Boolean(item.clientId && item.clientSecret), createdAt:item.createdAt, updatedAt:item.updatedAt };
  }
  listNaverStores() { return this.list('naver-store').map(item => this.naverStoreSummary(item)); }
  requireNaverStore(id) { return this.require('naver-store', text(id, '스토어 식별자', 60, true)); }
  saveNaverStore(input) {
    const id = text(input.id || input.storeId, '스토어 식별자', 60, true);
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new AppError('스토어 식별자는 영문·숫자·밑줄·하이픈만 사용할 수 있습니다.');
    return this.transaction(() => {
      const old = this.get('naver-store', id);
      const clientId = text(input.clientId || old?.clientId, 'Client ID', 200, true);
      const clientSecret = text(input.clientSecret || old?.clientSecret, 'Client Secret', 300, true);
      if (/\r|\n/.test(clientId + clientSecret)) throw new AppError('연결 정보에는 줄바꿈을 넣을 수 없습니다.');
      const item = {
        id, storeId:id, storeName:text(input.storeName || old?.storeName, '스토어 이름', 100, true),
        clientId, clientSecret, enabled:input.enabled === undefined ? old?.enabled !== false : input.enabled === true,
        createdAt:old?.createdAt || now(), updatedAt:now(),
      };
      this.put('naver-store', item);
      return this.naverStoreSummary(item);
    });
  }
  migrateLegacyNaverStore(config) {
    if (this.list('naver-store').length || !config?.clientId || !config?.clientSecret) return null;
    return this.saveNaverStore({ id:config.storeId || 'my-store', storeName:config.storeName || '내 스마트스토어', clientId:config.clientId, clientSecret:config.clientSecret, enabled:true });
  }
  socialSettings() {
    return ['instagram','threads','band'].map(id => this.get('social-channel', id) || { id, targetUrl:'', updatedAt:null });
  }
  saveSocialSettings(channelValue, input) {
    const channel = socialChannel(channelValue);
    let targetUrl = webUrl(input.targetUrl, '게시 대상 주소');
    if (channel === 'band' && targetUrl) {
      const u = new URL(targetUrl);
      if (!['band.us','www.band.us'].includes(u.hostname) || !/^\/band\/\d+\/?$/.test(u.pathname)) throw new AppError('밴드 홈 주소를 https://band.us/band/숫자 형식으로 입력하세요.');
      u.search = ''; u.hash = ''; targetUrl = u.href;
    }
    const item = { id:channel, targetUrl, updatedAt:now() };
    this.put('social-channel', item); return item;
  }
  saveProduct(input) {
    if (input.price === undefined || input.price === null || input.price === '') throw new AppError('판매가를 입력하세요. 알 수 없는 가격을 0원으로 저장하지 않습니다.');
    const id = input.id ? text(input.id, '상품 ID', 150, true) : `manual_${randomUUID()}`;
    return this.transaction(() => {
      const old = this.get('product', id);
      if (old?.source === 'NAVER') throw new AppError('네이버 상품은 수집된 원본으로 관리합니다. 변경은 판매자센터에서 진행하세요.', 409);
      const item = {
        id, name: text(input.name, '상품명', 300, true), price: integer(input.price, '판매가'),
        stock: input.stock === null || input.stock === '' || input.stock === undefined ? null : integer(input.stock, '재고'),
        imageUrl: webUrl(input.imageUrl, '상품 사진 URL'), productUrl: webUrl(input.productUrl, '상품 링크'),
        facts: text(input.facts, '확인된 상품 정보', 8000), status: input.status === 'OUTOFSTOCK' ? 'OUTOFSTOCK' : 'SALE',
        source: 'MANUAL', updatedAt: now(), createdAt: old?.createdAt || now(),
      };
      return this.put('product', item);
    });
  }
  createCampaign(input) {
    return this.transaction(() => {
      const product = this.require('product', text(input.productId, '상품', 150, true));
      if (product.status !== 'SALE') throw new AppError('판매 중인 상품을 선택하세요.');
      const c = {
        id: randomUUID(), title: text(input.title || `${product.name} 홍보`, '캠페인 제목', 300, true),
        productId: product.id, productSnapshot: product, brief: text(input.brief, '제작 요청', 6000),
        caption: '', variants: [], sources: [], assetId: '', status: 'DRAFT', revision: 1,
        targetChannels: socialChannels(input.targetChannels), publications: [],
        createdAt: now(), updatedAt: now(), reviewedAt: null, postUrl: '', publishedAt: null,
      };
      this.put('campaign', c); this.event('campaign', c.id, { action: 'created', revision: 1 });
      return c;
    });
  }
  updateCampaign(id, input, actor = 'operator') {
    return this.transaction(() => {
      const c = this.require('campaign', id);
      if (c.revision !== revision(input.revision)) throw new AppError('다른 작업에서 수정되었습니다. 새로고침 후 다시 저장하세요.', 409);
      if (c.status === 'PUBLISHED' || c.publications?.length) throw new AppError('게시 기록이 있는 캠페인은 변경할 수 없습니다. 새 캠페인을 만드세요.', 409);
      for (const [key, max] of [['title',300],['brief',6000],['caption',2200]]) if (input[key] !== undefined) c[key] = text(input[key], key, max, key === 'title');
      if (input.variants !== undefined) {
        if (!Array.isArray(input.variants) || input.variants.length > 5) throw new AppError('카피 시안은 최대 5개입니다.');
        c.variants = input.variants.map(v => ({ title: text(v.title, '시안 이름', 100, true), caption: text(v.caption, '시안 본문', 2200, true) }));
      }
      if (input.sources !== undefined) {
        if (!Array.isArray(input.sources) || input.sources.length > 20) throw new AppError('출처는 최대 20개입니다.');
        c.sources = input.sources.map(s => ({ title: text(s.title, '출처 제목', 300, true), url: webUrl(s.url), publishedAt: text(s.publishedAt, '발행일', 100) }));
        if (c.sources.some(s => !s.url)) throw new AppError('출처 URL을 입력하세요.');
      }
      if (input.assetId !== undefined) { c.assetId = text(input.assetId, '이미지', 100); if (c.assetId) this.require('asset', c.assetId); }
      if (input.targetChannels !== undefined) c.targetChannels = socialChannels(input.targetChannels);
      c.status = 'DRAFT'; c.reviewedAt = null; c.updatedAt = now(); c.revision++;
      this.put('campaign', c);
      this.event('campaign', id, { action: 'edited', actor, revision: c.revision, caption: c.caption, assetId: c.assetId });
      // A Codex result resolves only requests based on the exact version it read.
      for (const job of this.list('job')) {
        if (job.campaignId === id && job.status === 'PENDING') this.put('job', { ...job, status: actor === 'codex' && job.campaignRevision === input.revision ? 'COMPLETED' : 'SUPERSEDED', updatedAt: now() });
      }
      return c;
    });
  }
  requestGeneration(id, input) {
    return this.transaction(() => {
      const c = this.require('campaign', id);
      if (c.revision !== revision(input.revision) || c.status === 'PUBLISHED' || c.publications?.length) throw new AppError('캠페인을 새로고침하고 다시 요청하세요.', 409);
      const existing = this.list('job').find(j => j.campaignId === id && j.campaignRevision === c.revision && j.status === 'PENDING');
      if (existing) return existing;
      return this.put('job', { id: randomUUID(), campaignId: id, campaignRevision: c.revision, status: 'PENDING', createdAt: now(), updatedAt: now() });
    });
  }
  createTrendRequest(input) {
    const period = trendPeriod(input.period || 'today');
    const query = text(input.query, '조사 키워드', 500, period === 'keyword');
    const existing = this.list('trend').find(item => item.status === 'PENDING' && item.period === period && item.query === query);
    if (existing) return existing;
    const item = {
      id:randomUUID(), period, query, status:'PENDING', revision:1, summary:'', items:[],
      createdAt:now(), updatedAt:now(), completedAt:null,
    };
    this.put('trend', item); this.event('trend', item.id, { action:'requested', revision:1, period, query });
    return item;
  }
  trendBrief(id) {
    return {
      request:this.require('trend', id),
      products:this.list('product').filter(item => item.status === 'SALE').map(item => ({
        id:item.id, name:item.name, price:item.price, stock:item.stock, facts:item.facts,
        productUrl:item.productUrl, storeId:item.storeId, storeName:item.storeName, source:item.source,
      })),
    };
  }
  applyTrendResult(id, input) {
    return this.transaction(() => {
      const trend = this.require('trend', id);
      if (trend.revision !== revision(input.revision) || trend.status !== 'PENDING') throw new AppError('동향 조사 요청이 변경되었거나 이미 처리되었습니다. brief를 다시 읽으세요.',409);
      if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 12) throw new AppError('동향 항목은 1~12개가 필요합니다.');
      const products = new Map(this.list('product').map(item => [item.id,item]));
      const items = input.items.map(item => {
        const score = integer(item.score, '상품 연관도');
        if (score > 100) throw new AppError('상품 연관도는 0~100 사이여야 합니다.');
        const productIds = [...new Set(Array.isArray(item.productIds) ? item.productIds.map(value => text(value, '상품 ID', 150, true)) : [])];
        if (productIds.length > 5) throw new AppError('연결 상품은 동향마다 최대 5개입니다.');
        for (const productId of productIds) if (!products.has(productId)) throw new AppError(`연결할 상품을 찾을 수 없습니다: ${productId}`);
        return {
          id:randomUUID(), title:text(item.title, '동향 제목', 300, true), summary:text(item.summary, '동향 요약', 2000, true),
          score, sources:trendSources(item.sources), whyRelevant:text(item.whyRelevant, '상품 연관 이유', 2000, true),
          productIds, campaignAngle:text(item.campaignAngle, '캠페인 아이디어', 2000, true),
          channels:item.channels?.length ? socialChannels(item.channels) : [], validUntil:text(item.validUntil, '활용 권장 기간', 100),
          cautions:text(item.cautions, '표현 주의 사항', 1000),
        };
      });
      trend.summary = text(input.summary, '조사 요약', 6000, true);
      trend.items = items; trend.status = 'COMPLETED'; trend.revision++; trend.completedAt = now(); trend.updatedAt = trend.completedAt;
      this.put('trend', trend); this.event('trend', id, { action:'completed', revision:trend.revision, items:items.length });
      return trend;
    });
  }
  transition(id, input) {
    return this.transaction(() => {
      const c = this.require('campaign', id);
      if (c.revision !== revision(input.revision)) throw new AppError('내용이 변경되었습니다. 새로고침 후 다시 확인하세요.', 409);
      if (input.action === 'review') {
        if (c.status !== 'DRAFT' || !c.caption || !c.assetId || input.confirmed !== true) throw new AppError('카피와 게시용 이미지를 저장하고 상품 정보 확인에 체크하세요.');
        if (c.targetChannels.includes('threads') && [...c.caption].length > 500) throw new AppError('Threads에 게시할 본문은 500자 이하여야 합니다. 본문을 줄여 저장하세요.');
        this.require('asset', c.assetId);
        const current = this.require('product', c.productId);
        if (current.status !== 'SALE' || current.price !== c.productSnapshot.price) throw new AppError('상품 가격 또는 판매 상태가 바뀌었습니다. 현재 상품으로 새 캠페인을 만드세요.', 409);
        c.status = 'READY'; c.reviewedAt = now();
      } else if (input.action === 'record-published') {
        if (c.status !== 'READY' || input.confirmed !== true) throw new AppError('검토 완료된 캠페인만 실제 게시 확인 후 기록할 수 있습니다.');
        const channel = socialChannel(input.channel || 'instagram');
        if (!c.targetChannels.includes(channel)) throw new AppError('이 캠페인에서 선택한 게시 채널이 아닙니다.');
        if (c.publications.some(item => item.channel === channel)) throw new AppError('이 채널의 게시 결과가 이미 기록되어 있습니다.', 409);
        const publication = { channel, url:socialUrl(channel, input.postUrl), publishedAt:now(), verification:'OPERATOR_RECORDED' };
        c.publications.push(publication);
        c.status = c.targetChannels.every(target => c.publications.some(item => item.channel === target)) ? 'PUBLISHED' : 'READY';
        if (channel === 'instagram') { c.postUrl = publication.url; c.publishedAt = publication.publishedAt; c.verification = publication.verification; }
      } else throw new AppError('지원하지 않는 상태 변경입니다.');
      c.revision++; c.updatedAt = now(); this.put('campaign', c);
      this.event('campaign', id, { action: input.action, channel:input.channel || null, revision: c.revision, caption: c.caption, assetId: c.assetId, postUrl: input.action === 'record-published' ? c.publications.at(-1)?.url : c.postUrl });
      return c;
    });
  }
  async backup() {
    const dir = path.join(this.dataDir, 'backups'); fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `d2c-${Date.now()}-${randomUUID().slice(0,8)}.sqlite`);
    await backup(this.db, dest); return dest;
  }
}
