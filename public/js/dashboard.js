import { aiActive, campaignChannels, channelLabels, date, esc, pill, publications, trendPeriodLabels } from './ui.js';

function aiButton(state,kind,id,label) {
  if (aiActive(state.ai?.status)) return `<button class="button primary" disabled>${esc(state.ai.message || 'AI 작업 중')}</button>`;
  return state.ai?.authenticated
    ? `<button class="button primary" data-action="ai-run" data-kind="${kind}" data-target="${id}">${label}</button>`
    : '<button class="button primary" data-action="ai-login">Codex 로그인</button>';
}

function nextAction(state) {
  const enabled = state.naverStores.filter(item => item.enabled && item.configured);
  const sale = state.products.filter(item => item.status === 'SALE');
  const browserDone = state.campaigns.find(campaign => campaignChannels(campaign).some(channel => {
    const social = state.social[channel];
    return social?.status === 'COMPLETED' && social.action === 'publish' && social.campaignId === campaign.id && social.revision === campaign.revision && !publications(campaign).some(item => item.channel === channel);
  }));
  if (browserDone) return { title:'게시물 주소를 기록하세요', detail:'브라우저 게시가 끝났습니다. 실제 SNS 게시물을 확인하고 주소를 저장하면 이번 작업이 완료됩니다.', html:`<button class="button primary" data-open-campaign="${browserDone.id}">게시 결과 기록하기</button>` };
  if (aiActive(state.ai?.status)) return { title:'Codex가 작업하고 있습니다', detail:state.ai.message || '완료되면 이 화면에 결과가 자동으로 나타납니다.', html:pill(state.ai.status) };
  const pendingCampaign = state.jobs.find(job => job.status === 'PENDING' && state.campaigns.some(campaign => campaign.id === job.campaignId && campaign.revision === job.campaignRevision));
  if (pendingCampaign) return { title:'대기 중인 광고를 제작하세요', detail:state.ai?.authenticated?'Codex가 카피를 만들고 로컬에서 게시 이미지를 렌더링합니다.':'처음 한 번 Codex를 ChatGPT 계정으로 연결해야 합니다.', html:aiButton(state,'campaign',pendingCampaign.campaignId,'AI 광고 제작 시작') };
  const pendingTrend = (state.trends || []).find(item => item.status === 'PENDING');
  if (pendingTrend) return { title:'저장한 동향 조사를 진행하세요', detail:state.ai?.authenticated?'Codex가 최신 웹 자료의 출처와 날짜를 확인하고 상품과 연결합니다.':'처음 한 번 Codex를 ChatGPT 계정으로 연결해야 합니다.', html:aiButton(state,'trend',pendingTrend.id,'AI 동향 조사 시작') };
  const ready = state.campaigns.find(campaign => campaign.status === 'READY' && campaignChannels(campaign).some(channel => !publications(campaign).some(item => item.channel === channel)));
  if (ready) return { title:'검토한 콘텐츠를 게시하세요', detail:'채널 로그인 상태를 확인하고 게시할 계정과 콘텐츠가 맞는지 확인한 뒤 실행하세요.', html:`<button class="button primary" data-open-campaign="${ready.id}">채널 게시로 이동</button>` };
  const review = state.campaigns.find(campaign => campaign.status === 'DRAFT' && campaign.caption && campaign.assetId);
  if (review) return { title:'완성된 콘텐츠를 검토하세요', detail:'가격, 구성, 배송 조건과 이미지가 실제 상품 정보에 맞는지 확인합니다.', html:`<button class="button primary" data-open-campaign="${review.id}">검토 화면 열기</button>` };
  const draft = state.campaigns.find(campaign => campaign.status === 'DRAFT');
  if (draft) return { title:'캠페인 콘텐츠를 완성하세요', detail:'제작 방향을 저장하고 Codex에 카피와 이미지 제작을 요청하세요.', html:`<button class="button primary" data-open-campaign="${draft.id}">제작 계속하기</button>` };
  if (!enabled.length && !sale.length) return { title:'첫 판매 채널을 연결하세요', detail:'네이버 스마트스토어를 추가하거나 상품을 직접 등록하면 시작할 수 있습니다.', html:'<div class="actions"><button class="button primary" data-action="open-store">네이버 스토어 추가</button><button class="button secondary" data-action="add-product">상품 직접 추가</button></div>' };
  if (!sale.length) return { title:'판매 상품을 가져오세요', detail:'연결된 네이버 스토어에서 상품과 주문을 수집합니다.', html:'<button class="button primary" data-action="sync-all" data-store="all">전체 스토어 수집</button>' };
  return { title:'홍보할 상품을 선택하세요', detail:'판매 중인 상품을 골라 게시 채널과 제작 방향을 정합니다.', html:'<button class="button primary" data-action="new-campaign">새 캠페인 만들기</button>' };
}

function dashboardTasks(state) {
  const tasks = [];
  const pendingTrends = (state.trends || []).filter(item => item.status === 'PENDING');
  const pendingCampaigns = state.jobs.filter(job => job.status === 'PENDING' && state.campaigns.some(campaign => campaign.id === job.campaignId && campaign.revision === job.campaignRevision));
  const draft = state.campaigns.find(campaign => campaign.status === 'DRAFT');
  const ready = state.campaigns.find(campaign => campaign.status === 'READY');
  const lastSuccess = state.runs.find(run => run.status === 'SUCCESS');
  const lastSyncAt = Date.parse(lastSuccess?.finishedAt || lastSuccess?.updatedAt || '');
  const syncStale = state.naverStores.some(item => item.enabled) && (!lastSyncAt || Date.now() - lastSyncAt > 24 * 60 * 60 * 1000);
  if (pendingTrends.length) tasks.push(['동향 조사 처리', `${pendingTrends.length}건 · ${trendPeriodLabels[pendingTrends[0].period]}${pendingTrends[0].query ? ` · ${pendingTrends[0].query}` : ''}`, state.ai?.authenticated?'ai-run':'ai-login', state.ai?.authenticated?'AI 조사 시작':'Codex 로그인', pendingTrends[0].id, 'trend']);
  if (pendingCampaigns.length) tasks.push(['마케팅 제작 처리', `${pendingCampaigns.length}건의 제작 요청이 대기 중입니다.`, state.ai?.authenticated?'ai-run':'ai-login', state.ai?.authenticated?'AI 제작 시작':'Codex 로그인', pendingCampaigns[0].campaignId, 'campaign']);
  if (draft) tasks.push(['캠페인 계속 편집', draft.title, 'open-campaign', '편집하기', draft.id]);
  if (ready) tasks.push(['게시 대기 콘텐츠', ready.title, 'open-campaign', '게시하기', ready.id]);
  if (syncStale) tasks.push([lastSuccess ? '스토어 정보 갱신' : '첫 스토어 수집', lastSuccess ? '마지막 성공 후 24시간이 지났습니다.' : '상품과 주문을 최신화하세요.', 'sync-all', '전체 수집']);
  for (const channel of Object.keys(channelLabels).filter(channel => state.social[channel]?.status === 'NOT_CONFIGURED')) tasks.push([`${channelLabels[channel]} 로그인`, '게시 전에 전용 브라우저 로그인이 필요합니다.', 'social-login', '로그인 열기', channel]);
  return tasks.slice(0, 6);
}

export function trendCampaignBrief(trend, item) {
  const sources = item.sources.map(source => `- ${source.title} (${source.publishedAt}): ${source.url}`).join('\n');
  return `동향 조사 결과를 바탕으로 광고 소재를 제작합니다.\n\n동향: ${item.title}\n요약: ${item.summary}\n상품과 연결되는 이유: ${item.whyRelevant}\n제안하는 광고 방향: ${item.campaignAngle}${item.validUntil ? `\n활용 권장 기간: ${item.validUntil}` : ''}${item.cautions ? `\n표현 주의 사항: ${item.cautions}` : ''}\n\n참고 출처:\n${sources}\n\n출처의 사실과 현재 상품 정보를 구분하고, 실제 상품 정보에 없는 할인·재고·배송 조건은 만들지 마세요.`;
}

function trendCard(state, trend, item) {
  const matched = item.productIds.map(id => state.products.find(product => product.id === id)).filter(Boolean);
  const product = matched.find(entry => entry.status === 'SALE') || state.products.find(entry => entry.status === 'SALE');
  return `<article class="trend-card"><div class="trend-card-top"><div><span class="trend-score">상품 연관도 ${item.score}</span><h3>${esc(item.title)}</h3></div>${item.validUntil ? `<span class="pill">${esc(item.validUntil)}까지</span>` : ''}</div><p>${esc(item.summary)}</p><p class="trend-reason"><strong>광고 아이디어</strong>${esc(item.campaignAngle)}</p>${matched.length ? `<div class="product-tags">${matched.map(entry => `<span>${esc(entry.name)}</span>`).join('')}</div>` : ''}<details><summary>근거와 주의 사항 보기</summary><p class="muted">${esc(item.whyRelevant)}</p>${item.cautions ? `<p class="form-error">${esc(item.cautions)}</p>` : ''}<ul class="sources">${item.sources.map(source => `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a> · ${esc(source.publishedAt)}</li>`).join('')}</ul></details><button class="button secondary" data-action="trend-campaign" data-trend="${trend.id}" data-item="${item.id}" ${product ? '' : 'disabled'}>이 아이디어로 캠페인 만들기</button></article>`;
}

function trendCenter(state, selectedTrend) {
  const trends = state.trends || [];
  const pending = trends.filter(item => item.status === 'PENDING');
  const completed = trends.filter(item => item.status === 'COMPLETED');
  const latest = completed.find(item => item.id === selectedTrend) || completed[0];
  const history = completed.length > 1 ? `<div class="trend-history" aria-label="최근 동향 조사">${completed.slice(0, 8).map(item => `<button class="${item.id === latest.id ? 'active' : ''}" data-trend-select="${item.id}">${trendPeriodLabels[item.period]}${item.query ? ` · ${esc(item.query)}` : ''}<small>${date(item.completedAt)}</small></button>`).join('')}</div>` : '';
  const result = latest ? `<div class="trend-summary"><strong>${trendPeriodLabels[latest.period]}${latest.query ? ` · ${esc(latest.query)}` : ''}</strong><p>${esc(latest.summary)}</p></div><div class="trend-list">${latest.items.map(item => trendCard(state, latest, item)).join('')}</div>` : '<div class="trend-empty"><strong>아직 저장된 동향 조사가 없습니다.</strong><span>버튼을 누르면 Codex가 조사하고 결과를 이곳에 표시합니다.</span></div>';
  const waiting = pending[0];
  return `<section class="panel trend-panel"><div class="section-heading"><div><span class="eyebrow">TREND RADAR</span><h2>최근 동향에서 광고 기회 찾기</h2><p class="muted">Codex가 웹 출처와 날짜를 확인하고 판매 상품과 연결합니다.</p></div>${aiActive(state.ai?.status)?pill(state.ai.status):pending.length?pill('PENDING'):latest?`<span class="pill ready">${date(latest.completedAt)} 갱신</span>`:''}</div><div class="trend-actions"><button class="button secondary" data-action="trend-request" data-period="today" ${aiActive(state.ai?.status)?'disabled':''}>오늘의 화제 조사</button><button class="button secondary" data-action="trend-request" data-period="week" ${aiActive(state.ai?.status)?'disabled':''}>이번 주 화제 조사</button><form id="trend-form"><input name="query" maxlength="500" required placeholder="예: 새우, 캠핑 요리, 주말 안주"><button class="button primary" type="submit" ${aiActive(state.ai?.status)?'disabled':''}>키워드 조사</button></form></div>${waiting?`<div class="callout"><strong>AI 조사 대기 ${pending.length}건</strong><br>${state.ai?.authenticated?'화면을 떠나지 않고 조사를 시작할 수 있습니다.':'Codex 로그인 후 버튼으로 바로 처리할 수 있습니다.'}<div class="actions">${aiButton(state,'trend',waiting.id,'AI 조사 시작')}</div></div>`:''}${history}${result}</section>`;
}

function taskPanel(state) {
  const tasks = dashboardTasks(state);
  return `<section class="panel task-panel"><div class="section-heading"><div><h2>오늘의 작업</h2><p class="muted">지금 처리할 항목만 모았습니다.</p></div><span class="pill ${tasks.length ? 'pending' : 'ready'}">${tasks.length}건</span></div>${tasks.length ? tasks.map(([title,note,action,label,target,kind]) => `<div class="task-row"><div><strong>${esc(title)}</strong><small>${esc(note)}</small></div><button class="button subtle" data-action="${action}" ${action === 'open-campaign' ? `data-open-campaign="${target}"` : action === 'social-login' ? `data-channel="${target}"` : action === 'sync-all' ? 'data-store="all"' : action === 'ai-run' ? `data-kind="${kind}" data-target="${target}"` : ''}>${esc(label)}</button></div>`).join('') : '<div class="trend-empty"><strong>급한 작업이 없습니다.</strong><span>새 동향을 조사하거나 캠페인을 시작할 수 있습니다.</span></div>'}</section>`;
}

export function today(state, selectedTrend) {
  const next = nextAction(state);
  const enabled = state.naverStores.filter(item => item.enabled && item.configured).length;
  const lastSuccess = state.runs.find(run => run.status === 'SUCCESS');
  const pendingAi = state.jobs.filter(item => item.status === 'PENDING').length + (state.trends || []).filter(item => item.status === 'PENDING').length;
  const ready = state.campaigns.filter(campaign => campaign.status === 'READY').length;
  const stats = [['연결 스토어',enabled,'네이버 판매 채널'],['판매 상품',state.products.filter(product => product.status === 'SALE').length,'광고 제작 가능'],['Codex 요청',pendingAi,'처리 대기'],['게시 대기',ready,'검토 완료 캠페인']];
  const stores = state.naverStores.length ? state.naverStores.map(item => `<div class="connection-row"><div><strong>${esc(item.storeName)}</strong><small>${item.enabled ? '사용 중' : '사용 안 함'} · 마지막 주문 ${date(state.cursors[item.id])}</small></div><button class="button subtle" data-action="sync-all" data-store="${esc(item.id)}" ${!item.enabled ? 'disabled' : ''}>수집</button></div>`).join('') : '<p class="muted">연결된 스토어가 없습니다.</p>';
  const social = Object.keys(channelLabels).map(channel => { const status = state.social[channel]; return `<div class="connection-row"><div><strong>${channelLabels[channel]}</strong><small>${esc(status.message || '')}</small></div>${pill(status.status)}</div>`; }).join('');
  return `<section class="next-card"><div><span class="eyebrow">가장 먼저 할 일</span><h2>${next.title}</h2><p>${next.detail}</p></div>${next.html}</section><div class="stats dashboard-stats">${stats.map(([title,count,note]) => `<div class="stat"><span class="stat-label">${title}</span><strong class="stat-value">${count}<span class="muted"> 건</span></strong><span class="stat-note">${note}</span></div>`).join('')}</div><div class="dashboard-grid">${trendCenter(state, selectedTrend)}${taskPanel(state)}</div><div class="today-grid operations-grid"><section class="panel"><div class="section-heading"><div><h2>스토어 수집</h2><p class="muted">${lastSuccess ? `최근 성공 ${date(lastSuccess.finishedAt || lastSuccess.updatedAt)}` : '아직 성공한 수집이 없습니다.'}</p></div>${enabled ? '<button class="button secondary" data-action="sync-all" data-store="all">전체 수집</button>' : ''}</div>${stores}</section><section class="panel"><div class="section-heading"><div><h2>SNS 채널</h2><p class="muted">로그인과 게시 준비 상태입니다.</p></div><button class="button subtle" data-view="connections">설정 보기</button></div>${social}</section></div>`;
}
