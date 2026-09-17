import test from 'node:test';
import assert from 'node:assert/strict';
import { NaverClient,syncNaver,normalizeOrder } from '../src/naver.mjs';
import { temporaryStore,naverConfig as cfg,orderResponse } from './helpers.mjs';

test('missing API keys fail explicitly without a mock result',async()=>{await assert.rejects(new NaverClient({}).tokenValue(),/자동 샘플/);});
test('network permission denial is explicit, redacted and not retried, including nested socket errors',async()=>{
  for (const failure of [Object.assign(new Error('private-secret'),{code:'EPERM'}),new TypeError('private-secret',{cause:new AggregateError([Object.assign(new Error('private-secret'),{code:'EACCES'})])})]) {
    let calls=0;
    const client=new NaverClient(cfg,{fetcher:async()=>{calls++;throw failure;},wait:async()=>assert.fail('permission denial must not retry')});
    await assert.rejects(client.request('/v1/oauth2/token',{},false),e=>/네트워크 접근을 차단/.test(e.message)&&!e.message.includes('private-secret')&&!e.message.includes('초과'));
    assert.equal(calls,1);
  }
});
test('DNS and timeout failures keep bounded retries and distinct safe messages',async()=>{
  for (const [code,pattern] of [['EAI_AGAIN',/DNS/],['UND_ERR_CONNECT_TIMEOUT',/초과/]]) {
    let calls=0,waits=0;
    const client=new NaverClient(cfg,{fetcher:async()=>{calls++;throw new TypeError('private-secret',{cause:Object.assign(new Error('private-secret'),{code})});},wait:async()=>{waits++;}});
    await assert.rejects(client.request('/v1/oauth2/token',{},false),e=>pattern.test(e.message)&&!e.message.includes('private-secret'));
    assert.equal(calls,4);assert.equal(waits,3);
  }
});
test('official nested productOrder mapping drops customer PII',()=>{const result=normalizeOrder(orderResponse('1'),cfg);assert.equal(result.externalId,'1');assert.equal(result.productId,'naver_test-store_42');assert.equal(result.amount,10000);assert.doesNotMatch(JSON.stringify(result),/private|Do not persist|010-secret/);assert.throws(()=>normalizeOrder({productOrderId:'flat'},cfg),/productOrder/);});
test('product pagination collects beyond the first page and only commits complete snapshot',async t=>{
  const s=temporaryStore(t);let calls=0;
  const client={request:async(_,opts)=>{calls++;const page=opts.body.page;return {totalPages:2,contents:Array.from({length:page===1?100:3},(_,i)=>({originProductNo:page*1000+i,channelProducts:[{name:'상품 '+i,salePrice:100,statusType:'SALE'}]}))};}};
  const result=await syncNaver(s,cfg,'products',{client});assert.equal(result.products,103);assert.equal(calls,2);assert.equal(s.list('product').length,103);
  const failing={request:async(_,opts)=>{if(opts.body.page===2)throw new Error('network');return {totalPages:2,contents:[{originProductNo:1,channelProducts:[{name:'not committed',salePrice:1,statusType:'SALE'}]}]};}};
  await assert.rejects(syncNaver(s,cfg,'products',{client:failing}));assert.equal(s.list('product').length,103);assert.equal(s.get('product','naver_test-store_1'),null);
});
test('moreFrom/moreSequence pagination, 300-ID chunks, repeat sync is idempotent',async t=>{
  const s=temporaryStore(t),end=Date.parse('2026-09-05T00:00:00Z'),start=end-10000;let detailCalls=0,sawSequence=false;
  const client={request:async(endpoint,opts)=>{
    if(endpoint.includes('last-changed-statuses')){const u=new URL('https://example.test'+endpoint);if(u.searchParams.has('moreSequence')){sawSequence=u.searchParams.get('moreSequence')==='9';return {data:{lastChangeStatuses:[{productOrderId:'301'}]}};}return {data:{lastChangeStatuses:Array.from({length:300},(_,i)=>({productOrderId:String(i+1)})),more:{moreFrom:new Date(start+1000).toISOString(),moreSequence:9}}};}
    assert.ok(opts.body.productOrderIds.length<=300);detailCalls++;return {data:opts.body.productOrderIds.map(orderResponse)};
  }};
  const first=await syncNaver(s,cfg,'orders',{client,now:end,from:new Date(start).toISOString()});assert.equal(first.newOrders,301);assert.equal(sawSequence,true);assert.equal(detailCalls,2);
  const second=await syncNaver(s,cfg,'orders',{client,now:end+1000});assert.equal(second.newOrders,0);assert.equal(s.list('order').length,301);
});
test('offline catch-up splits long ranges into <=24h windows',async t=>{
  const s=temporaryStore(t),end=Date.parse('2026-09-05T00:00:00Z');let calls=0;
  s.meta('naver:cursor:test-store',new Date(end-49*3600000).toISOString());
  const client={request:async endpoint=>{calls++;const u=new URL('https://example.test'+endpoint);assert.ok(Date.parse(u.searchParams.get('lastChangedTo'))-Date.parse(u.searchParams.get('lastChangedFrom'))<86400000);return {data:{lastChangeStatuses:[]}};}};
  await syncNaver(s,cfg,'orders',{client,now:end});assert.equal(calls,3);assert.equal(s.meta('naver:cursor:test-store'),new Date(end).toISOString());
});
test('documented empty order envelope completes and advances checkpoint without detail queries',async t=>{
  const s=temporaryStore(t),end=Date.parse('2026-09-05T00:00:00Z');let calls=0;
  const client={request:async endpoint=>{calls++;assert.ok(endpoint.includes('last-changed-statuses'));return {timestamp:new Date(end).toISOString(),traceId:'fixture-trace'};}};
  const run=await syncNaver(s,cfg,'orders',{client,now:end,from:new Date(end-3600000).toISOString()});
  assert.equal(run.status,'SUCCESS');assert.equal(run.changedOrders,0);assert.equal(calls,1);assert.equal(s.list('order').length,0);assert.equal(s.meta('naver:cursor:test-store'),new Date(end).toISOString());
});
test('malformed order response must not be treated as an empty successful interval',async t=>{
  const s=temporaryStore(t),end=Date.parse('2026-09-05T00:00:00Z'),checkpoint=new Date(end-3600000).toISOString();
  s.meta('naver:cursor:test-store',checkpoint);
  for(const response of [{},null,{timestamp:'fixture',traceId:'fixture',data:{}},{timestamp:'fixture',traceId:'fixture',code:'ERROR'},{data:{lastChangeStatuses:null}}]) {
    await assert.rejects(syncNaver(s,cfg,'orders',{client:{request:async()=>response},now:end}),/응답 형식/);
    assert.equal(s.meta('naver:cursor:test-store'),checkpoint);
  }
});
test('failed or missing detail does not advance checkpoint or insert partial window',async t=>{
  const s=temporaryStore(t),end=Date.parse('2026-09-05T00:00:00Z'),checkpoint=new Date(end-100000).toISOString();s.meta('naver:cursor:test-store',checkpoint);
  const client={request:async endpoint=>endpoint.includes('last-changed-statuses')?{data:{lastChangeStatuses:[{productOrderId:'1'},{productOrderId:'2'}]}}:{data:[orderResponse('1')]}};
  await assert.rejects(syncNaver(s,cfg,'orders',{client,now:end}),/누락/);assert.equal(s.meta('naver:cursor:test-store'),checkpoint);assert.equal(s.list('order').length,0);assert.equal(s.list('run')[0].status,'FAILED');
});
test('HTTP transient failure retries; IP denial surfaces without raw response secrets',async()=>{
  let attempts=0;const client=new NaverClient(cfg,{wait:async()=>{},fetcher:async()=>{attempts++;return attempts===1?new Response(JSON.stringify({code:'TEMP'}),{status:429}):new Response(JSON.stringify({contents:[]}));}});client.token='test';client.expiresAt=Date.now()+3600000;await client.request('/v1/products/search');assert.equal(attempts,2);
  client.fetcher=async()=>new Response(JSON.stringify({code:'GW.IP_NOT_ALLOWED',secret:'never disclose'}),{status:403});await assert.rejects(client.request('/v1/products/search'),e=>/호출 IP/.test(e.message)&&!e.message.includes('never disclose'));
});
