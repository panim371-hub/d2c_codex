import test from 'node:test';
import assert from 'node:assert/strict';
import { codexAuthStatus, codexEnvironment } from '../src/ai.mjs';
import { buildCampaignPrompt, buildTrendPrompt, campaignOutputSchema, trendOutputSchema } from '../src/ai-task.mjs';
import { marketingHtml, renderMarketingImage } from '../src/marketing-image.mjs';

test('Codex worker environment excludes store and API billing secrets',()=>{
  const before={naver:process.env.NAVER_CLIENT_SECRET,openai:process.env.OPENAI_API_KEY};
  process.env.NAVER_CLIENT_SECRET='store-secret';process.env.OPENAI_API_KEY='api-secret';
  const env=codexEnvironment();
  assert.equal(env.NAVER_CLIENT_SECRET,undefined);assert.equal(env.OPENAI_API_KEY,undefined);
  if(before.naver===undefined)delete process.env.NAVER_CLIENT_SECRET;else process.env.NAVER_CLIENT_SECRET=before.naver;
  if(before.openai===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=before.openai;
});

test('Codex authentication distinguishes subscription and API-key billing',()=>{
  assert.deepEqual(codexAuthStatus(()=>({status:0,stdout:'Logged in using ChatGPT',stderr:''})).authMode,'CHATGPT');
  assert.deepEqual(codexAuthStatus(()=>({status:0,stdout:'Logged in using API key',stderr:''})).authMode,'API_KEY');
  assert.equal(codexAuthStatus(()=>({status:1,stdout:'Not logged in',stderr:''})).authenticated,false);
});

test('AI prompts contain exact revisions and schemas require structured results',()=>{
  const campaign=buildCampaignPrompt({campaignId:'c1',revision:3,title:'제목',brief:'방향',currentCaption:'',product:{id:'p1',name:'상품',price:1000,stock:2,facts:'실제 정보',productUrl:'',imageUrl:'',storeName:'상점',source:'NAVER'}});
  const trend=buildTrendPrompt({request:{id:'t1',revision:2,period:'today',query:''},products:[{id:'p1',name:'상품'}]});
  assert.match(campaign,/"revision": 3/);assert.match(campaign,/실제 정보/);assert.match(trend,/"revision": 2/);
  assert.deepEqual(campaignOutputSchema.required,['caption','variants','sources','media']);
  assert.deepEqual(trendOutputSchema.required,['summary','items']);
});

test('local marketing template escapes AI and product text',()=>{
  const html=marketingHtml({name:'<상품>',price:1000,imageUrl:'https://example.com/a.jpg'},{headline:'<script>alert(1)</script>',subheadline:'설명',badge:'추천',footer:'확인',theme:'ocean'});
  assert.doesNotMatch(html,/<script>alert/);assert.match(html,/&lt;script&gt;/);assert.match(html,/1,000원/);assert.match(html,/1080px/);
});

test('local marketing renderer creates a PNG without an image API',async()=>{
  const bytes=await renderMarketingImage({name:'테스트 상품',price:12000,imageUrl:''},{headline:'오늘의 한 접시',subheadline:'확인된 상품 정보로 준비했습니다',badge:'추천 메뉴',footer:'판매 정보를 확인하세요',theme:'clean'});
  assert.equal(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),true);
  assert.ok(bytes.length>10_000);
});
