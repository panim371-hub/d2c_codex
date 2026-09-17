import { aiActive, channelHomes, channelLabels, date, esc, pill, socialActive, socialNotice } from './ui.js';

function socialConnectionCard(state, channel) {
  const social = state.social[channel];
  const setting = state.socialSettings[channel] || {};
  const description = channel === 'instagram' ? '사진 중심 피드 게시' : channel === 'threads' ? '500자 이하의 글과 이미지 게시' : '지정한 밴드에 글과 이미지 게시';
  const bandSettings = channel === 'band' ? `<form class="band-settings-form"><label>게시할 밴드 홈 주소<input name="targetUrl" type="url" value="${esc(setting.targetUrl || '')}" placeholder="https://band.us/band/숫자"></label><p class="form-error"></p><button class="button secondary" type="submit">밴드 주소 저장</button></form>` : '';
  return `<article class="social-card"><div class="social-title"><strong>${channelLabels[channel]}</strong>${pill(social.status)}</div><p class="muted">${description}</p>${socialNotice(state, channel)}${bandSettings}<div class="actions"><button class="button primary" data-action="social-login" data-channel="${channel}" ${socialActive(social.status) ? 'disabled' : ''}>전용 브라우저 로그인</button><a class="button secondary" href="${channelHomes[channel]}" target="_blank" rel="noopener noreferrer">직접 열기 ↗</a></div></article>`;
}

function aiConnection(state) {
  const ai=state.ai || {status:'NOT_CONFIGURED',authenticated:false,message:'Codex 상태를 확인할 수 없습니다.'};
  const pending=state.jobs.filter(job=>job.status==='PENDING').length+(state.trends || []).filter(item=>item.status==='PENDING').length;
  const controls=ai.authMode==='API_KEY'
    ? '<button class="button primary" disabled>ChatGPT 로그인 필요</button>'
    : ai.authenticated
    ? `<button class="button primary" data-action="ai-run-next" ${!pending || aiActive(ai.status) ? 'disabled' : ''}>대기 작업 실행${pending ? ` · ${pending}건` : ''}</button>`
    : '<button class="button primary" data-action="ai-login">ChatGPT로 Codex 로그인</button>';
  const billing=ai.authMode==='API_KEY'?'<div class="callout warning">API 키 로그인은 별도 API 요금이 발생할 수 있어 자동 작업을 차단했습니다. Codex에서 로그아웃한 뒤 ChatGPT 계정으로 다시 로그인하세요.</div>':'';
  return `<section class="panel connection-section"><div class="section-heading"><div><h2>구독 Codex AI</h2><p class="muted">동향 조사와 광고 카피를 화면의 버튼으로 처리합니다.</p></div>${pill(ai.status)}</div><div class="callout ${ai.status==='FAILED'?'warning':''}"><strong>${esc(ai.message)}</strong>${ai.updatedAt?`<br><span class="muted">${date(ai.updatedAt)}</span>`:''}</div>${billing}<div class="actions">${controls}<button class="button secondary" data-action="refresh-ai">상태 다시 확인</button></div><details><summary class="muted">수동 처리 방법</summary><p class="code-prompt">codex_version의 운영 지침을 읽고 대기 중인 AI 작업을 처리해줘.</p><button class="button subtle" data-action="copy-general">문장 복사</button></details></section>`;
}

export function connections(state) {
  const stores = state.naverStores.length ? `<div class="store-grid">${state.naverStores.map(item => `<article class="store-card"><div class="social-title"><strong>${esc(item.storeName)}</strong>${pill(item.enabled ? 'SUCCESS' : 'INTERRUPTED')}</div><p class="muted">식별자 ${esc(item.id)}<br>마지막 주문 수집 ${date(state.cursors[item.id])}</p><div class="actions"><button class="button secondary" data-action="sync-all" data-store="${esc(item.id)}" ${!item.enabled ? 'disabled' : ''}>지금 수집</button><button class="button subtle" data-action="edit-store" data-store="${esc(item.id)}">설정 수정</button></div></article>`).join('')}</div>` : '<div class="callout">스토어를 추가하면 기존 상품과 섞이지 않도록 연결별 ID로 저장합니다.</div>';
  return `<div class="section-heading"><div><h2>판매 채널과 자동화 연결</h2><p class="muted">한 번 연결하면 조사, 제작, 게시를 화면에서 이어서 실행할 수 있습니다.</p></div><button class="button primary" data-action="open-store">＋ 네이버 스토어 추가</button></div>${aiConnection(state)}<section class="panel connection-section"><div class="section-heading"><div><h2>네이버 스마트스토어 ${state.naverStores.length}개</h2><p class="muted">각 스토어는 별도 키와 수집 위치를 사용합니다.</p></div>${state.naverStores.length ? '<button class="button secondary" data-action="sync-all" data-store="all">전체 스토어 수집</button>' : ''}</div>${stores}<div class="callout">현재 PC의 인터넷 출구 IP를 각 애플리케이션의 네이버 API 호출 IP에 등록해야 합니다.</div><a class="button secondary" href="https://apicenter.commerce.naver.com/ko/member/application/manage/list" target="_blank" rel="noopener noreferrer">커머스 API 센터 ↗</a></section><section class="panel connection-section"><h2>SNS Playwright 연결</h2><p class="muted">채널마다 독립된 전용 브라우저 프로필을 사용합니다. 비밀번호와 추가 인증은 열린 채널 화면에서만 입력합니다.</p><div class="social-grid">${Object.keys(channelLabels).map(channel => socialConnectionCard(state, channel)).join('')}</div><div class="callout warning">SNS 웹 화면이 바뀌거나 보안 확인이 나타나면 자동화가 멈출 수 있습니다. 실패 또는 중단이면 실제 계정에 게시됐는지 먼저 확인하세요.</div></section>`;
}
