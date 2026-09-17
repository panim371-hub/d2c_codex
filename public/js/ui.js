export const $ = selector => document.querySelector(selector);
export const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
export const money = value => new Intl.NumberFormat('ko-KR').format(value || 0) + '원';
export const date = value => value ? new Date(value).toLocaleString('ko-KR', { month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '아직 없음';
export const chars = value => [...String(value ?? '')].length;

export const channelLabels = { instagram:'Instagram', threads:'Threads', band:'네이버 밴드' };
export const channelHomes = { instagram:'https://www.instagram.com/', threads:'https://www.threads.com/', band:'https://band.us/' };
export const trendPeriodLabels = { today:'오늘의 화제', week:'이번 주 화제', keyword:'키워드 조사' };
export const statusName = {
  DRAFT:'제작 중', READY:'게시 준비', PUBLISHED:'게시 완료', PENDING:'처리 대기', SALE:'판매 중',
  OUTOFSTOCK:'품절', UNAVAILABLE:'목록에서 제외', SUCCESS:'수집 완료', FAILED:'실패', RUNNING:'실행 중',
  INTERRUPTED:'실행 중단', NOT_CONFIGURED:'로그인 필요', STARTING:'시작 중', OPENING_BROWSER:'브라우저 여는 중',
  WAITING_LOGIN:'로그인 대기', PREPARING:'게시 준비 중', PUBLISHING:'게시 중', COMPLETED:'완료', PAYED:'결제 완료',
  AI_READY:'AI 사용 가능', AUTHENTICATING:'로그인 중', RESEARCHING:'동향 조사 중', GENERATING:'카피 제작 중', RENDERING:'이미지 제작 중', APPLYING:'결과 저장 중',
  PAYMENT_WAITING:'결제 대기', DELIVERING:'배송 중', DELIVERED:'배송 완료', PURCHASE_DECIDED:'구매 확정', CANCELED:'취소', RETURNED:'반품',
};

export function pill(value) {
  const tone = ['READY','SUCCESS','COMPLETED','AI_READY'].includes(value) ? 'ready' : value === 'PUBLISHED' ? 'published' : ['PENDING','AUTHENTICATING','STARTING','RESEARCHING','GENERATING','RENDERING','APPLYING'].includes(value) ? 'pending' : value === 'FAILED' ? 'failed' : '';
  return `<span class="pill ${tone}">${esc(statusName[value] || value)}</span>`;
}
export function blank(title, description, button = '') { return `<div class="empty"><div class="empty-symbol">✦</div><h2>${title}</h2><p>${description}</p>${button}</div>`; }
export const addProduct = '<button class="button primary" data-action="add-product">＋ 상품 추가</button>';
export const newCampaign = '<button class="button primary" data-action="new-campaign">＋ 새 캠페인</button>';
export const socialActive = status => ['STARTING','OPENING_BROWSER','WAITING_LOGIN','PREPARING','PUBLISHING'].includes(status);
export const socialConnected = item => item?.connected === true || (item?.connected === undefined && item?.status === 'COMPLETED');
export function availableCampaignChannels(state, requested = []) {
  const connected = Object.keys(channelLabels).filter(channel => socialConnected(state.social?.[channel]));
  let selected = connected.filter(channel => requested.includes(channel));
  if (!selected.length && connected.length) selected = [connected[0]];
  return { connected, selected };
}
export const aiActive = status => ['AUTHENTICATING','STARTING','RESEARCHING','GENERATING','RENDERING','APPLYING'].includes(status);
export const campaignChannels = campaign => campaign.targetChannels?.length ? campaign.targetChannels : ['instagram'];
export const publications = campaign => Array.isArray(campaign.publications) ? campaign.publications : campaign.postUrl ? [{ channel:'instagram', url:campaign.postUrl, publishedAt:campaign.publishedAt }] : [];
export const storeName = (state, id) => state.naverStores.find(item => item.id === id)?.storeName || id || '직접 등록';
export function socialNotice(state, channel, campaignId = '') {
  const item = state.social?.[channel];
  if (!item || (campaignId && item.action === 'publish' && item.campaignId && item.campaignId !== campaignId)) return '';
  const kind = ['FAILED','INTERRUPTED'].includes(item.status) ? 'warning' : '';
  return `<div class="callout ${kind}"><strong>${channelLabels[channel]} · ${esc(statusName[item.status] || item.status)}</strong><br>${esc(item.message || '')}${item.updatedAt ? `<br><span class="muted">${date(item.updatedAt)}</span>` : ''}</div>`;
}
