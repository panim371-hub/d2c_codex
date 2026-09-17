import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { temporaryStore,product,imageBytes } from './helpers.mjs';
import { addAsset,assetPath,campaignBrief,exportCampaign } from '../src/assets.mjs';
import { socialUrl } from '../src/validation.mjs';

function setup(t){const s=temporaryStore(t),p=s.saveProduct(product),c=s.createCampaign({productId:p.id,brief:'할인 표현 없이 작성'});return{s,p,c};}
test('Threads accepts profile-post and share publication URLs',()=>{
  assert.equal(socialUrl('threads','https://www.threads.com/share/IBB-2pmbs/?x=1'),'https://www.threads.com/share/IBB-2pmbs/');
  assert.equal(socialUrl('threads','https://www.threads.com/@tester/post/ABC_12/'),'https://www.threads.com/@tester/post/ABC_12/');
  assert.throws(()=>socialUrl('threads','https://www.threads.com/share/'),/Threads/);
});
test('fresh workspace is empty; missing product cannot silently become a sample',t=>{const s=temporaryStore(t);assert.deepEqual(s.list('product'),[]);assert.throws(()=>s.createCampaign({productId:'missing'}),/찾을 수/);});
test('product validates money, name and URL schemes',t=>{const s=temporaryStore(t);assert.throws(()=>s.saveProduct({...product,price:-1}),/정수/);assert.throws(()=>s.saveProduct({...product,imageUrl:'javascript:alert(1)'}),/주소/);assert.throws(()=>s.saveProduct({...product,name:''}),/입력/);});
test('campaign records a product snapshot and never invents marketing copy',t=>{const{s,p,c}=setup(t);assert.equal(c.caption,'');assert.equal(c.productSnapshot.price,12900);s.saveProduct({...p,price:15000});assert.equal(s.get('campaign',c.id).productSnapshot.price,12900);assert.equal(campaignBrief(s,c.id).currentProduct.price,15000);});
test('generation requests deduplicate and Codex result completes the matching job',t=>{const{s,c}=setup(t);const job=s.requestGeneration(c.id,{revision:1});assert.equal(s.requestGeneration(c.id,{revision:1}).id,job.id);s.updateCampaign(c.id,{revision:1,caption:'실제 작성한 문구'},'codex');assert.equal(s.get('job',job.id).status,'COMPLETED');});
test('operator edit supersedes pending request; stale writes cannot overwrite',t=>{const{s,c}=setup(t);const job=s.requestGeneration(c.id,{revision:1});s.updateCampaign(c.id,{revision:1,brief:'변경된 제작 방향'});assert.equal(s.get('job',job.id).status,'SUPERSEDED');assert.throws(()=>s.updateCampaign(c.id,{revision:1,caption:'오래된 결과'},'codex'),/수정/);assert.equal(s.get('campaign',c.id).caption,'');});
test('review requires saved text, image and explicit fact check; edits reset review',t=>{const{s,c}=setup(t);assert.throws(()=>s.transition(c.id,{revision:1,action:'review',confirmed:true}),/카피/);const asset=addAsset(s,imageBytes);s.updateCampaign(c.id,{revision:1,caption:'테스트 본문',assetId:asset.id});assert.throws(()=>s.transition(c.id,{revision:2,action:'review'}),/확인/);const ready=s.transition(c.id,{revision:2,action:'review',confirmed:true});assert.equal(ready.status,'READY');const changed=s.updateCampaign(c.id,{revision:3,caption:'수정 본문'});assert.equal(changed.status,'DRAFT');assert.equal(changed.reviewedAt,null);});
test('price change blocks review of stale product snapshot',t=>{const{s,p,c}=setup(t);s.updateCampaign(c.id,{revision:1,caption:'가격 문구',assetId:addAsset(s,imageBytes).id});s.saveProduct({...p,price:9900});assert.throws(()=>s.transition(c.id,{revision:2,action:'review',confirmed:true}),/가격/);});
test('export is not publication, publication records exact reviewed version',t=>{const{s,c}=setup(t);assert.throws(()=>exportCampaign(s,c.id),/검토/);s.updateCampaign(c.id,{revision:1,caption:'최종 본문',assetId:addAsset(s,imageBytes).id});s.transition(c.id,{revision:2,action:'review',confirmed:true});const out=exportCampaign(s,c.id);assert.equal(fs.readFileSync(out.captionPath,'utf8'),'최종 본문');assert.equal(s.get('campaign',c.id).status,'READY');assert.throws(()=>s.transition(c.id,{revision:3,action:'record-published',confirmed:true,postUrl:'https://instagram.com.evil.example/p/test/'}),/Instagram/);const published=s.transition(c.id,{revision:3,action:'record-published',confirmed:true,postUrl:'https://www.instagram.com/p/TEST_ONLY/?tracking=1'});assert.equal(published.verification,'OPERATOR_RECORDED');assert.equal(published.postUrl,'https://www.instagram.com/p/TEST_ONLY/');assert.throws(()=>s.updateCampaign(c.id,{revision:4,caption:'변경'}),/변경할 수/);});
test('assets reject scripts, oversized uploads and path traversal',t=>{const s=temporaryStore(t);assert.throws(()=>addAsset(s,Buffer.from('<svg><script>bad</script></svg>')),/이미지/);assert.throws(()=>assetPath(s,'../../.env'),/이미지/);assert.throws(()=>addAsset(s,Buffer.alloc(13*1024*1024)),/12MB/);});
test('SQLite backup captures consistent persisted records',async t=>{const{s,p}=setup(t);const file=await s.backup();const db=new DatabaseSync(file);assert.equal(JSON.parse(db.prepare("SELECT body FROM records WHERE kind='product' AND id=?").get(p.id).body).price,12900);db.close();});
test('leases prevent concurrent worker and CLI runs',t=>{const s=temporaryStore(t);s.acquire('sync','one');assert.throws(()=>s.acquire('sync','two'),/이미 실행/);s.release('sync','two');assert.throws(()=>s.acquire('sync','two'),/이미 실행/);s.release('sync','one');s.acquire('sync','two');});
test('multiple Naver stores keep credentials private and legacy config migrates only once',t=>{
  const s=temporaryStore(t);
  s.migrateLegacyNaverStore({storeId:'legacy',storeName:'기존 스토어',clientId:'legacy-id',clientSecret:'legacy-secret'});
  s.migrateLegacyNaverStore({storeId:'ignored',storeName:'무시',clientId:'other',clientSecret:'other'});
  s.saveNaverStore({id:'second-store',storeName:'두 번째',clientId:'second-id',clientSecret:'second-secret',enabled:true});
  assert.deepEqual(s.listNaverStores().map(item=>item.id).sort(),['legacy','second-store']);
  assert.equal(JSON.stringify(s.listNaverStores()).includes('secret'),false);
  assert.equal(s.requireNaverStore('legacy').clientSecret,'legacy-secret');
  s.saveNaverStore({id:'legacy',storeName:'이름 변경',enabled:false});
  assert.equal(s.requireNaverStore('legacy').clientId,'legacy-id');
  assert.equal(s.listNaverStores().find(item=>item.id==='legacy').enabled,false);
});
test('multi-channel campaign remains ready until every selected publication is recorded',t=>{
  const s=temporaryStore(t),p=s.saveProduct(product);
  let c=s.createCampaign({productId:p.id,targetChannels:['instagram','threads','band']});
  c=s.updateCampaign(c.id,{revision:c.revision,caption:'500자보다 짧은 테스트 본문',assetId:addAsset(s,imageBytes).id});
  c=s.transition(c.id,{revision:c.revision,action:'review',confirmed:true});
  c=s.transition(c.id,{revision:c.revision,action:'record-published',channel:'threads',confirmed:true,postUrl:'https://www.threads.com/@tester/post/ABC_12/?x=1'});
  assert.equal(c.status,'READY');assert.equal(c.publications[0].url,'https://www.threads.com/@tester/post/ABC_12/');
  assert.throws(()=>s.updateCampaign(c.id,{revision:c.revision,caption:'게시 후 변경'}),/게시 기록/);
  c=s.transition(c.id,{revision:c.revision,action:'record-published',channel:'instagram',confirmed:true,postUrl:'https://www.instagram.com/p/ABC_12/'});
  assert.equal(c.status,'READY');
  c=s.transition(c.id,{revision:c.revision,action:'record-published',channel:'band',confirmed:true,postUrl:'https://band.us/band/123/post/456'});
  assert.equal(c.status,'PUBLISHED');assert.equal(c.publications.length,3);
});
test('Threads campaign cannot pass review with a body longer than 500 characters',t=>{
  const s=temporaryStore(t),p=s.saveProduct(product),c=s.createCampaign({productId:p.id,targetChannels:['threads']});
  const saved=s.updateCampaign(c.id,{revision:1,caption:'가'.repeat(501),assetId:addAsset(s,imageBytes).id});
  assert.throws(()=>s.transition(c.id,{revision:saved.revision,action:'review',confirmed:true}),/500자/);
});
test('trend requests deduplicate and Codex results require dated sources and known products',t=>{
  const s=temporaryStore(t),p=s.saveProduct(product);
  const request=s.createTrendRequest({period:'keyword',query:'캠핑 요리'});
  assert.equal(s.createTrendRequest({period:'keyword',query:'캠핑 요리'}).id,request.id);
  assert.equal(s.trendBrief(request.id).products[0].id,p.id);
  const payload={revision:1,summary:'이번 주 캠핑 먹거리 관심을 광고 아이디어로 검토할 수 있습니다.',items:[{title:'캠핑 먹거리 관심',summary:'확인된 기사 흐름을 요약했습니다.',score:82,sources:[{title:'검증용 기사',url:'https://example.com/news/camping',publishedAt:'2026-09-13'}],whyRelevant:'판매 상품을 주말 캠핑 메뉴로 소개할 수 있습니다.',productIds:[p.id],campaignAngle:'주말 캠핑 한 접시 제안',channels:['instagram','threads'],validUntil:'2026-09-20',cautions:'기사의 통계를 상품 효능처럼 표현하지 않습니다.'}]};
  assert.throws(()=>s.applyTrendResult(request.id,{...payload,items:[{...payload.items[0],sources:[]}]}),/출처/);
  const result=s.applyTrendResult(request.id,payload);
  assert.equal(result.status,'COMPLETED');assert.equal(result.items[0].productIds[0],p.id);assert.equal(result.items[0].sources[0].url,'https://example.com/news/camping');
  assert.throws(()=>s.applyTrendResult(request.id,payload),/이미 처리/);
});
