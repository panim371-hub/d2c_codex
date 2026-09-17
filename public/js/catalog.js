import { addProduct, blank, date, esc, money, pill, storeName } from './ui.js';

function filterBar(state, storeFilter) {
  if (!state.naverStores.length) return '';
  return `<label class="inline-filter">스토어<select id="store-filter"><option value="all">전체</option><option value="manual" ${storeFilter === 'manual' ? 'selected' : ''}>직접 등록</option>${state.naverStores.map(item => `<option value="${esc(item.id)}" ${storeFilter === item.id ? 'selected' : ''}>${esc(item.storeName)}</option>`).join('')}</select></label>`;
}

export function products(state, storeFilter) {
  const items = state.products.filter(product => storeFilter === 'all' || (storeFilter === 'manual' ? product.source === 'MANUAL' : product.storeId === storeFilter));
  const actions = `<div class="actions">${filterBar(state, storeFilter)}<button class="button secondary" data-action="sync-products" data-store="${esc(storeFilter === 'manual' ? 'all' : storeFilter)}" ${!state.config.configured ? 'disabled' : ''}>네이버 상품 수집</button>${addProduct}</div>`;
  const cards = items.map(product => `<article class="panel product-card"><div class="product-picture">${product.imageUrl ? `<img src="${esc(product.imageUrl)}" alt="${esc(product.name)}" loading="lazy" referrerpolicy="no-referrer">` : '등록된 사진 없음'}</div><div class="product-card-body"><p class="small-heading">${product.source === 'NAVER' ? `NAVER · ${esc(product.storeName || storeName(state, product.storeId))}` : '직접 등록'}</p><h3>${esc(product.name)}</h3><span class="price">${money(product.price)}</span>${pill(product.status)} <span class="muted">재고 ${product.stock === null ? '미확인' : product.stock + '개'}</span>${product.productUrl ? `<p><a href="${esc(product.productUrl)}" target="_blank" rel="noopener noreferrer">판매 페이지 ↗</a></p>` : ''}<button class="button secondary" data-product="${esc(product.id)}" ${product.status !== 'SALE' ? 'disabled' : ''}>이 상품으로 캠페인 만들기</button></div></article>`).join('');
  return `<div class="section-heading"><div><h2>상품 ${items.length}개</h2><p class="muted">스토어별 상품을 확인하고 캠페인을 시작하세요.</p></div>${actions}</div>${items.length ? `<div class="product-grid">${cards}</div>` : blank('조건에 맞는 상품이 없습니다.', '스토어 필터를 바꾸거나 상품을 수집하세요.', addProduct)}`;
}

function runs(state, storeFilter) {
  const items = state.runs.filter(run => storeFilter === 'all' || run.storeId === storeFilter);
  if (!items.length) return '<p class="muted">아직 수집 작업을 실행하지 않았습니다.</p>';
  return items.map(run => `<div class="run"><div><strong>${esc(storeName(state, run.storeId))} · ${run.kind === 'all' ? '상품 · 주문' : run.kind === 'products' ? '상품' : '주문'} 수집</strong><small>${date(run.startedAt)} · 상품 ${run.products}개 · 신규 상품 주문 ${run.newOrders}건 · 조회 ${run.changedOrders}건</small>${run.error ? `<p class="form-error">${esc(run.error)}</p>` : ''}</div>${pill(run.status)}</div>`).join('');
}

export function orders(state, storeFilter) {
  const items = state.orders.filter(order => storeFilter === 'all' || order.storeId === storeFilter);
  const cursor = storeFilter === 'all' ? Object.values(state.cursors).filter(Boolean).sort().at(-1) : state.cursors[storeFilter];
  const actions = `<div class="actions">${filterBar(state, storeFilter)}<button class="button primary" data-action="sync-orders" data-store="${esc(storeFilter === 'manual' ? 'all' : storeFilter)}" ${!state.config.configured ? 'disabled' : ''}>주문 수집</button></div>`;
  const table = items.length ? `<div class="panel table-wrap"><table><thead><tr><th>스토어</th><th>상품 주문 번호</th><th>상품</th><th>수량</th><th>결제 금액</th><th>상태</th><th>결제 시각</th></tr></thead><tbody>${items.map(order => `<tr><td>${esc(storeName(state, order.storeId))}</td><td>${esc(order.externalId)}</td><td>${esc(order.productName)}</td><td>${order.quantity}</td><td>${money(order.amount)}</td><td>${pill(order.status)}</td><td>${date(order.paymentDate)}</td></tr>`).join('')}</tbody></table></div>` : blank('수집된 주문이 없습니다.', '연결된 스토어를 선택해 주문을 수집하세요.', '<button class="button secondary" data-view="connections">연결 설정</button>');
  return `<div class="section-heading"><div><h2>수집된 상품 주문 ${items.length}건</h2><p class="muted">선택 범위의 최근 정상 수집 위치: ${date(cursor)}</p></div>${actions}</div>${table}<div class="section-heading"><h2>수집 이력</h2></div><section class="panel">${runs(state, storeFilter)}</section>`;
}
