import test from 'node:test';
import assert from 'node:assert/strict';
import { today } from '../public/js/dashboard.js';
import { availableCampaignChannels, socialConnected } from '../public/js/ui.js';

function dashboardState() {
  return {
    naverStores:[{id:'store-1',storeName:'테스트 스토어',enabled:true,configured:true}],
    products:[{id:'product-1',name:'테스트 상품',status:'SALE'}],
    campaigns:[], jobs:[], trends:[], runs:[], cursors:{'store-1':'2026-09-13T01:00:00.000Z'},
    ai:{status:'AI_READY',authenticated:true,authMode:'CHATGPT',message:'구독 AI 연결'},
    social:{
      instagram:{status:'COMPLETED',message:'로그인 완료',action:'login'},
      threads:{status:'NOT_CONFIGURED',message:'로그인 필요'},
      band:{status:'NOT_CONFIGURED',message:'로그인 필요'},
    },
  };
}

test('dashboard renders current work and escapes completed trend content',()=>{
  const state=dashboardState();
  const empty=today(state,null);
  assert.match(empty,/홍보할 상품을 선택하세요/);
  assert.match(empty,/오늘의 화제 조사/);
  state.trends=[{id:'pending-trend',period:'today',query:'',status:'PENDING'}];
  assert.match(today(state,null),/data-action="ai-run" data-kind="trend"/);

  state.trends=[{
    id:'trend-1',period:'today',status:'COMPLETED',completedAt:'2026-09-13T02:00:00.000Z',summary:'요약',
    items:[{id:'item-1',title:'<주말 화제>',summary:'확인한 내용',score:90,whyRelevant:'상품과 연결',campaignAngle:'주말 메뉴',productIds:['product-1'],channels:['instagram'],sources:[{title:'출처',url:'https://example.com/news',publishedAt:'2026-09-13'}]}],
  }];
  const completed=today(state,'trend-1');
  assert.match(completed,/&lt;주말 화제&gt;/);
  assert.doesNotMatch(completed,/<주말 화제>/);
  assert.match(completed,/data-action="trend-campaign"/);
});

test('new campaign channels only include completed SNS logins',()=>{
  const state=dashboardState();
  const options=availableCampaignChannels(state,['instagram','threads']);
  assert.deepEqual(options.connected,['instagram']);
  assert.deepEqual(options.selected,['instagram']);
  assert.equal(socialConnected(state.social.threads),false);
  assert.equal(socialConnected({status:'COMPLETED',action:'publish'}),true);
});
