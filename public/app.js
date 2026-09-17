import { $, aiActive, availableCampaignChannels, campaignChannels, channelLabels, chars, date, esc, money, socialActive, statusName, storeName, trendPeriodLabels } from './js/ui.js';
import { today, trendCampaignBrief } from './js/dashboard.js';
import { studio } from './js/studio.js';
import { orders, products } from './js/catalog.js';
import { connections } from './js/connections.js';

let state;
let view = 'today';
let selected = null;
let selectedTrend = null;
let dirty = false;
let toastTimer;
let socialPollTimer;
let storeFilter = 'all';

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').hidden = true, 5000);
}
function fail(error) {
  $('#error-banner').textContent = error.message || String(error);
  $('#error-banner').hidden = false;
  window.scrollTo({ top:0, behavior:'smooth' });
}
async function api(path, body) {
  const options = body === undefined ? { cache:'no-store' } : { method:'POST', headers:{ 'Content-Type':'application/json', 'X-D2C-Token':state.token }, body:JSON.stringify(body) };
  const response = await fetch(path, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '요청을 처리하지 못했습니다.');
  return result;
}
function canLeave() {
  return !dirty || window.confirm('저장하지 않은 수정이 있습니다. 이동하시겠습니까?');
}
function syncSocialPolling() {
  const active = Object.values(state.social || {}).some(item => socialActive(item.status)) || aiActive(state.ai?.status);
  if (!active) {
    clearInterval(socialPollTimer);
    socialPollTimer = null;
    return;
  }
  if (socialPollTimer) return;
  socialPollTimer = setInterval(async () => {
    try {
      state = await api('/api/state');
      render();
      syncSocialPolling();
    } catch {}
  }, 2000);
}
async function refresh() {
  state = await api('/api/state');
  if (!selected || !state.campaigns.some(campaign => campaign.id === selected)) selected = state.campaigns[0]?.id || null;
  const completed = (state.trends || []).filter(item => item.status === 'COMPLETED');
  if (!selectedTrend || !completed.some(item => item.id === selectedTrend)) selectedTrend = completed[0]?.id || null;
  render();
  syncSocialPolling();
}
const current = () => state.campaigns.find(campaign => campaign.id === selected);

function render() {
  const titles = { today:'오늘 할 일', studio:'마케팅 스튜디오', products:'상품 보관함', orders:'주문 · 수집 기록', connections:'연결 · 채널' };
  $('#view-title').textContent = titles[view];
  document.querySelectorAll('[data-view]').forEach(button => button.classList.toggle('active', button.dataset.view === view));
  const enabled = state.naverStores.filter(item => item.enabled && item.configured).length;
  $('#connection').textContent = enabled ? `네이버 ${enabled}개 연결` : '연결 준비';
  $('#connection').className = `pill ${enabled ? 'ready' : ''}`;
  const ai=$('#ai-connection');
  ai.textContent = state.ai?.authMode === 'API_KEY' ? 'API 키 로그인' : state.ai?.authenticated ? (aiActive(state.ai.status) ? statusName[state.ai.status] : '구독 AI 연결') : 'AI 로그인 필요';
  ai.className = `pill ${state.ai?.authenticated && state.ai?.authMode !== 'API_KEY' && !aiActive(state.ai.status) ? 'ready' : aiActive(state.ai?.status) ? 'pending' : ''}`;
  const views = {
    today:() => today(state, selectedTrend),
    studio:() => studio(state, selected),
    products:() => products(state, storeFilter),
    orders:() => orders(state, storeFilter),
    connections:() => connections(state),
  };
  $('#app').innerHTML = (views[view] || views.today)();
  dirty = false;
}

async function copy(value) {
  await navigator.clipboard.writeText(value);
  toast('클립보드에 복사했습니다.');
}
function openProduct() {
  $('#product-form').reset();
  $('#product-form .form-error').textContent = '';
  $('#product-dialog').showModal();
}
function openCampaign(productId, seed = {}) {
  const available = state.products.filter(product => product.status === 'SALE');
  if (!available.length) return openProduct();
  const form = $('#campaign-form');
  form.reset();
  form.querySelector('.form-error').textContent = '';
  $('#campaign-product').innerHTML = available.map(product => `<option value="${esc(product.id)}">${esc(product.name)} · ${money(product.price)} · ${esc(product.source === 'NAVER' ? product.storeName || storeName(state, product.storeId) : '직접 등록')}</option>`).join('');
  if (productId && available.some(product => product.id === productId)) $('#campaign-product').value = productId;
  if (seed.title) form.elements.title.value = seed.title;
  if (seed.brief) form.elements.brief.value = seed.brief;
  const availability = availableCampaignChannels(state,seed.channels || []);
  form.querySelectorAll('[name=targetChannel]').forEach(input => {
    const connected=availability.connected.includes(input.value);
    input.disabled=!connected;
    input.checked=availability.selected.includes(input.value);
    const note=form.querySelector(`[data-channel-state="${input.value}"]`);
    note.textContent=connected?'연결됨':'로그인 필요';
    input.closest('label').classList.toggle('unavailable',!connected);
  });
  form.querySelector('[type=submit]').disabled=!availability.connected.length;
  if (!availability.connected.length) form.querySelector('.form-error').textContent='연결 · 채널에서 게시할 SNS에 먼저 로그인하세요.';
  $('#campaign-dialog').showModal();
}
function openTrendCampaign(trendId, itemId) {
  const trend = (state.trends || []).find(item => item.id === trendId);
  const item = trend?.items.find(entry => entry.id === itemId);
  if (!trend || !item) throw new Error('동향 조사 결과를 찾을 수 없습니다. 새로고침 후 다시 시도하세요.');
  const productId = item.productIds.find(id => state.products.some(product => product.id === id && product.status === 'SALE')) || state.products.find(product => product.status === 'SALE')?.id;
  openCampaign(productId, { title:`${item.title} 활용 캠페인`, brief:trendCampaignBrief(trend, item), channels:item.channels });
}
function openStore(id = '') {
  const item = state.naverStores.find(store => store.id === id);
  const form = $('#store-form');
  form.reset();
  form.querySelector('.form-error').textContent = '';
  $('#store-original-id').value = item?.id || '';
  $('#store-id').value = item?.id || '';
  $('#store-id').readOnly = Boolean(item);
  $('#store-name').value = item?.storeName || '';
  $('#store-enabled').checked = item ? item.enabled : true;
  $('#store-secret-note').textContent = item ? '키를 바꾸지 않으면 비워 두세요.' : '이 스토어용 커머스 API 키를 입력하세요.';
  $('#store-client-id').required = !item;
  $('#store-client-secret').required = !item;
  $('#store-dialog').showModal();
}
async function saveCampaign() {
  const campaign = current();
  const targetChannels = [...document.querySelectorAll('.edit-channel:checked')].map(item => item.value);
  const body = { revision:campaign.revision, title:$('#edit-title').value, brief:$('#edit-brief').value, caption:$('#edit-caption').value, assetId:$('#edit-asset').value, targetChannels };
  if (!dirty) return campaign;
  const saved = await api(`/api/campaigns/${campaign.id}/save`, body);
  dirty = false;
  await refresh();
  return saved;
}
async function syncAction(button, kind) {
  button.textContent = '수집 중…';
  const result = await api('/api/sync', { kind, storeId:button.dataset.store || 'all' });
  await refresh();
  const failures = result.failures || 0;
  toast(`수집 완료 · 상품 ${result.products || 0}개 / 신규 상품 주문 ${result.newOrders || 0}건${failures ? ` / 실패 ${failures}개` : ''}`);
}
async function runAi(kind,id) {
  await api('/api/ai/run',{kind,id});
  await refresh();
  toast(kind==='trend'?'AI 동향 조사를 시작했습니다.':'AI 광고 제작을 시작했습니다.');
}

async function handleAction(button, action) {
  if (action === 'add-product') openProduct();
  else if (action === 'new-campaign') openCampaign();
  else if (action === 'open-store') openStore();
  else if (action === 'edit-store') openStore(button.dataset.store);
  else if (action === 'trend-campaign') openTrendCampaign(button.dataset.trend, button.dataset.item);
  else if (action === 'trend-request') {
    const trend=await api('/api/trends', { period:button.dataset.period, query:'' });
    if (state.ai?.authenticated && !aiActive(state.ai.status)) await runAi('trend',trend.id);
    else { await refresh(); toast(`${trendPeriodLabels[button.dataset.period]} 요청을 저장했습니다.`); }
  } else if (action === 'save') {
    await saveCampaign();
    toast('수정 내용을 저장했습니다.');
  } else if (action === 'request') {
    const campaign = await saveCampaign();
    await api(`/api/campaigns/${campaign.id}/request`, { revision:campaign.revision });
    if (state.ai?.authenticated && !aiActive(state.ai.status)) await runAi('campaign',campaign.id);
    else { await refresh(); toast('제작 요청을 저장했습니다. Codex 로그인 후 화면에서 실행할 수 있습니다.'); }
  } else if (action === 'copy-request') {
    const campaign = await saveCampaign();
    await copy(`codex_version/AGENTS.md를 읽고 캠페인 ${campaign.id}의 brief를 확인해서 카피와 이미지 제작을 진행해줘. 결과를 해당 캠페인에 저장해줘.`);
  } else if (action === 'copy-general') await copy('codex_version의 운영 지침을 읽고, 대기 중인 마케팅 제작 요청을 처리해줘. 별도 AI API는 호출하지 말고 이 대화의 도구로 제작한 결과를 저장해줘.');
  else if (action === 'copy-trend-general') await copy('codex_version의 운영 지침을 읽고, 대기 중인 동향 조사 요청을 처리해줘. 웹에서 최신 출처와 발행일을 확인하고 판매 상품과 연결한 결과를 대시보드에 저장해줘.');
  else if (action === 'ai-login') {
    await api('/api/ai/login',{});
    await refresh();
    toast('열린 브라우저에서 ChatGPT 로그인을 완료하세요.');
  } else if (action === 'ai-run') await runAi(button.dataset.kind,button.dataset.target);
  else if (action === 'ai-run-next') {
    const campaignJob=state.jobs.find(job=>job.status==='PENDING'&&state.campaigns.some(campaign=>campaign.id===job.campaignId&&campaign.revision===job.campaignRevision));
    const trend=(state.trends || []).find(item=>item.status==='PENDING');
    if (campaignJob) await runAi('campaign',campaignJob.campaignId);
    else if (trend) await runAi('trend',trend.id);
    else throw new Error('대기 중인 AI 작업이 없습니다.');
  } else if (action === 'refresh-ai') {
    await refresh();
    toast('Codex 연결 상태를 확인했습니다.');
  }
  else if (action === 'copy-caption') await copy($('#edit-caption')?.value || current().caption);
  else if (action === 'social-login') {
    const channel = button.dataset.channel;
    await api(`/api/social/${channel}/login`, {});
    await refresh();
    toast(`${channelLabels[channel]} 전용 브라우저가 열립니다. 로그인을 완료하세요.`);
  } else if (action === 'social-publish') {
    if (dirty) throw new Error('저장되지 않은 수정이 있습니다. 저장하고 다시 검토하세요.');
    const channel = button.dataset.channel;
    await api(`/api/campaigns/${selected}/social/${channel}/post`, { revision:current().revision, confirmed:$(`#publish-confirm-${channel}`)?.checked === true });
    await refresh();
    toast(`${channelLabels[channel]} 게시 자동화를 시작했습니다. 열린 전용 브라우저를 확인하세요.`);
  } else if (action === 'review') {
    if (dirty) throw new Error('수정 내용을 먼저 저장한 다음 다시 검토하세요.');
    await api(`/api/campaigns/${selected}/transition`, { revision:current().revision, action:'review', confirmed:$('#review-confirmed').checked });
    await refresh();
    toast('검토 완료로 표시했습니다.');
  } else if (action === 'record-publication') {
    if (dirty) throw new Error('저장되지 않은 수정이 있습니다.');
    const channel = button.dataset.channel;
    await api(`/api/campaigns/${selected}/transition`, { revision:current().revision, action:'record-published', channel, confirmed:$(`#record-confirm-${channel}`).checked, postUrl:$(`#post-url-${channel}`).value });
    await refresh();
    toast(`${channelLabels[channel]} 게시 결과를 기록했습니다.`);
  } else if (action === 'export') {
    const result = await api(`/api/campaigns/${selected}/export`, {});
    toast(`게시 파일을 준비했습니다: ${result.directory}`);
  } else if (action === 'backup') {
    const result = await api('/api/backup', {});
    toast(`DB 백업 완료: ${result.path}`);
  } else if (action.startsWith('sync-')) await syncAction(button, action.slice(5));
}

document.addEventListener('click', async event => {
  const button = event.target.closest('button,a');
  if (!button) return;
  if (button.dataset.close) return $('#' + button.dataset.close).close();
  if (button.dataset.view) {
    if (!canLeave()) return;
    view = button.dataset.view;
    render();
    return;
  }
  if (button.dataset.openCampaign) {
    if (!canLeave()) return;
    selected = button.dataset.openCampaign;
    view = 'studio';
    render();
    return;
  }
  if (button.dataset.campaign) {
    if (!canLeave()) return;
    selected = button.dataset.campaign;
    render();
    return;
  }
  if (button.dataset.trendSelect) {
    selectedTrend = button.dataset.trendSelect;
    render();
    return;
  }
  if (button.dataset.product) return openCampaign(button.dataset.product);
  if (button.dataset.variant !== undefined) {
    const variant = current().variants[Number(button.dataset.variant)];
    $('#edit-caption').value = variant.caption;
    $('#edit-caption').dispatchEvent(new Event('input', { bubbles:true }));
    return;
  }
  const action = button.dataset.action;
  if (!action) return;
  $('#error-banner').hidden = true;
  const original = button.textContent;
  button.disabled = true;
  try {
    await handleAction(button, action);
  } catch (error) {
    fail(error);
    if (action.startsWith('sync-')) await refresh().catch(() => {});
  } finally {
    button.disabled = false;
    if (button.isConnected) button.textContent = original;
  }
});

document.addEventListener('input', event => {
  if (['edit-title','edit-brief','edit-caption'].includes(event.target.id)) dirty = true;
  if (event.target.id === 'edit-caption') {
    $('#preview-caption').textContent = event.target.value || '저장할 카피가 이곳에 표시됩니다.';
    $('#caption-count').textContent = `${chars(event.target.value)} / 2,200`;
  }
});

document.addEventListener('change', async event => {
  if (event.target.classList.contains('edit-channel')) dirty = true;
  if (event.target.id === 'store-filter') {
    storeFilter = event.target.value;
    render();
    return;
  }
  if (event.target.id !== 'asset-upload') return;
  const file = event.target.files?.[0];
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) return fail(new Error('이미지는 12MB 이하여야 합니다.'));
  event.target.disabled = true;
  try {
    const response = await fetch('/api/assets', { method:'POST', headers:{ 'Content-Type':'application/octet-stream', 'X-D2C-Token':state.token }, body:file });
    const asset = await response.json();
    if (!response.ok) throw new Error(asset.error);
    $('#edit-asset').value = asset.id;
    $('#preview-image').innerHTML = `<img src="/assets/${asset.id}" alt="게시용 이미지">`;
    dirty = true;
    toast('이미지를 추가했습니다. 수정 내용 저장을 눌러 적용하세요.');
  } catch (error) {
    fail(error);
  } finally {
    event.target.disabled = false;
  }
});

document.addEventListener('submit', async event => {
  const form = event.target;
  if (!['product-form','campaign-form','store-form','trend-form'].includes(form.id) && !form.classList.contains('band-settings-form')) return;
  event.preventDefault();
  const submit = form.querySelector('[type=submit]');
  const formError = form.querySelector('.form-error');
  submit.disabled = true;
  if (formError) formError.textContent = '';
  try {
    if (form.id === 'product-form') {
      await api('/api/products', Object.fromEntries(new FormData(form)));
      $('#product-dialog').close();
      view = 'products';
    } else if (form.id === 'campaign-form') {
      const body = Object.fromEntries(new FormData(form));
      body.targetChannels = [...form.querySelectorAll('[name=targetChannel]:checked')].map(item => item.value);
      const campaign = await api('/api/campaigns', body);
      selected = campaign.id;
      $('#campaign-dialog').close();
      view = 'studio';
    } else if (form.id === 'store-form') {
      const existing = $('#store-original-id').value;
      await api('/api/naver-stores', { id:existing || $('#store-id').value, storeName:$('#store-name').value, clientId:$('#store-client-id').value, clientSecret:$('#store-client-secret').value, enabled:$('#store-enabled').checked });
      $('#store-dialog').close();
      view = 'connections';
    } else if (form.id === 'trend-form') {
      const trend=await api('/api/trends', { period:'keyword', query:new FormData(form).get('query') });
      if (state.ai?.authenticated && !aiActive(state.ai.status)) await api('/api/ai/run',{kind:'trend',id:trend.id});
      form.reset();
    } else {
      await api('/api/social/band/settings', { targetUrl:new FormData(form).get('targetUrl') });
    }
    await refresh();
    toast(form.id === 'trend-form' ? '키워드 조사 요청을 저장했습니다.' : '저장했습니다.');
  } catch (error) {
    if (formError) formError.textContent = error.message;
    else fail(error);
  } finally {
    submit.disabled = false;
  }
});

document.addEventListener('click', async event => {
  if (event.target.id !== 'history-toggle') return;
  try {
    const history = await api(`/api/campaigns/${selected}/history`);
    const labels = { created:'캠페인 생성', edited:'콘텐츠 수정', review:'검토 완료', 'record-published':'게시 결과 기록' };
    $('#history-list').innerHTML = history.map(item => `<div>${date(item.at)} · ${esc(labels[item.action] || item.action)}${item.channel ? ` · ${channelLabels[item.channel]}` : ''} · 버전 ${item.revision}</div>`).join('');
  } catch (error) {
    fail(error);
  }
});

$('#refresh').addEventListener('click', () => { if (canLeave()) refresh().catch(fail); });
window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
refresh().catch(fail);

if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  window.addEventListener('pagehide', () => lifecycle.abort(), { once:true });
  const definitions = [
    { name:'d2c_list_campaigns', description:'Read saved campaigns and current revisions.', inputSchema:{ type:'object', properties:{}, additionalProperties:false }, annotations:{ readOnlyHint:true, untrustedContentHint:true }, execute:async () => { if (dirty) throw new Error('Save current edits first.'); await refresh(); return state.campaigns.map(campaign => ({ id:campaign.id, title:campaign.title, status:campaign.status, revision:campaign.revision })); } },
    { name:'d2c_open_campaign', description:'Open a saved campaign in the local D2C studio.', inputSchema:{ type:'object', properties:{ id:{ type:'string' } }, required:['id'], additionalProperties:false }, annotations:{ readOnlyHint:true }, execute:async ({ id }) => { if (dirty) throw new Error('Save current edits first.'); await refresh(); if (!state.campaigns.some(campaign => campaign.id === id)) throw new Error('Campaign not found.'); selected = id; view = 'studio'; render(); return { id, status:current().status }; } },
  ];
  for (const tool of definitions) Promise.resolve(document.modelContext.registerTool(tool, { signal:lifecycle.signal })).catch(() => {});
}
