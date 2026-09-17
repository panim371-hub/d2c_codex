import fs from 'node:fs';
import path from 'node:path';
import { Store } from './store.mjs';
import { DATA, configuration } from './config.mjs';
import { syncNaver } from './naver.mjs';
import { addAsset, campaignBrief, exportCampaign } from './assets.mjs';
import { AppError } from './validation.mjs';
import { readSocialStatuses } from './social.mjs';

const store = new Store(DATA);
store.migrateLegacyNaverStore(configuration());
const args = process.argv.slice(2), [cmd, sub, id] = args;
const fileOption = () => { const i=args.indexOf('--file'); if (i < 0 || !args[i+1]) throw new AppError('--file <JSON 파일>이 필요합니다.'); return JSON.parse(fs.readFileSync(path.resolve(args[i+1]),'utf8').replace(/^\uFEFF/,'')); };
try {
  let result;
  if (cmd === 'status') result = { products:store.list('product').length, orders:store.list('order').length, campaigns:store.list('campaign').length, pendingJobs:store.list('job').filter(j=>j.status==='PENDING'), pendingTrends:store.list('trend').filter(j=>j.status==='PENDING'), naverStores:store.listNaverStores(), social:readSocialStatuses(DATA), lastRuns:store.list('run').slice(0,5) };
  else if (cmd === 'naver-stores') result = store.listNaverStores();
  else if (cmd === 'products') result = store.list('product');
  else if (cmd === 'orders') result = store.list('order');
  else if (cmd === 'jobs') result = store.list('job').filter(j=>j.status==='PENDING').map(j=>({ ...j, stale: store.get('campaign',j.campaignId)?.revision !== j.campaignRevision }));
  else if (cmd === 'trend' && sub === 'list') result = store.list('trend');
  else if (cmd === 'trend' && sub === 'brief') result = store.trendBrief(id);
  else if (cmd === 'trend' && sub === 'request') result = store.createTrendRequest(fileOption());
  else if (cmd === 'trend' && sub === 'apply') result = store.applyTrendResult(id,fileOption());
  else if (cmd === 'product' && sub === 'save') result = store.saveProduct(fileOption());
  else if (cmd === 'campaign' && sub === 'create') result = store.createCampaign(fileOption());
  else if (cmd === 'campaign' && sub === 'list') result = store.list('campaign');
  else if (cmd === 'campaign' && sub === 'brief') result = campaignBrief(store,id);
  else if (cmd === 'campaign' && sub === 'apply') {
    const body = fileOption();
    if (!body.caption && !body.variants?.length && !body.imagePath && !body.assetId) throw new AppError('실제 제작 결과(카피·시안·이미지)가 필요합니다.');
    const c = store.require('campaign',id);
    if (body.revision !== c.revision) throw new AppError('캠페인 버전이 변경되었습니다. brief를 다시 읽으세요.',409);
    if (body.imagePath) body.assetId = addAsset(store,fs.readFileSync(path.resolve(body.imagePath))).id;
    result = store.updateCampaign(id,body,'codex');
  }
  else if (cmd === 'campaign' && sub === 'request') result = store.requestGeneration(id,fileOption());
  else if (cmd === 'campaign' && sub === 'review') result = store.transition(id,{...fileOption(),action:'review'});
  else if (cmd === 'campaign' && sub === 'record-published') result = store.transition(id,{...fileOption(),action:'record-published'});
  else if (cmd === 'campaign' && sub === 'export') result = exportCampaign(store,id);
  else if (cmd === 'asset' && sub === 'add') result = addAsset(store,fs.readFileSync(path.resolve(id)));
  else if (cmd === 'sync') {
    const fromIndex=args.indexOf('--from'), storeIndex=args.indexOf('--store');
    const configs=storeIndex>=0?[store.requireNaverStore(args[storeIndex+1])]:store.list('naver-store').filter(item=>item.enabled!==false);
    if(!configs.length)throw new AppError('사용할 네이버 스마트스토어 연결을 먼저 추가하세요.');
    const results=[];for(const config of configs)results.push(await syncNaver(store,config,sub||'all',{from:fromIndex>=0?args[fromIndex+1]:undefined}));
    result=results.length===1?results[0]:{stores:results.length,products:results.reduce((n,item)=>n+item.products,0),newOrders:results.reduce((n,item)=>n+item.newOrders,0),results};
  }
  else if (cmd === 'backup') result = {path:await store.backup()};
  else result = { commands:[ 'status','naver-stores','products','orders','jobs','trend list','trend brief <id>','trend request --file <json>','trend apply <id> --file <json>','product save --file <json>','campaign create --file <json>','campaign list','campaign brief <id>','campaign apply <id> --file <json>','campaign request <id> --file <json>','campaign review <id> --file <json>','campaign record-published <id> --file <json>','campaign export <id>','asset add <image>','sync [all|products|orders] [--store <id>] [--from <ISO>]','backup' ] };
  console.log(JSON.stringify(result,null,2));
} catch (err) { console.error(JSON.stringify({error:err.message})); process.exitCode=1; }
finally { store.close(); }
