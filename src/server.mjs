import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ROOT, DATA, configuration } from './config.mjs';
import { Store } from './store.mjs';
import { AppError, socialChannel } from './validation.mjs';
import { syncNaver } from './naver.mjs';
import { addAsset, assetPath, campaignBrief, exportCampaign } from './assets.mjs';
import { readSocialStatus, readSocialStatuses, startSocialTask, socialActiveStatuses } from './social.mjs';
import { readAiStatus, startAiTask, startCodexLogin } from './ai.mjs';

async function readBody(req, limit = 1024*1024) {
  const chunks=[]; let size=0;
  for await (const chunk of req) { size+=chunk.length; if (size>limit) throw new AppError('파일 또는 요청 내용이 너무 큽니다.',413); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw new AppError('JSON 형식이 필요합니다.',415);
  try { return JSON.parse((await readBody(req)).toString('utf8')); }
  catch (error) { if (error instanceof AppError) throw error; throw new AppError('올바른 JSON을 입력하세요.'); }
}

export function createServer({ dataDir=DATA, config=configuration(), allowSettings=true, sync=syncNaver, social={status:readSocialStatus,statuses:readSocialStatuses,start:startSocialTask}, ai={status:readAiStatus,start:startAiTask,login:startCodexLogin}, instagram }={}) {
  const store=new Store(dataDir), token=randomBytes(32).toString('hex');
  store.migrateLegacyNaverStore(config);
  const oneSocialStatus = channel => instagram && channel === 'instagram' ? instagram.status(dataDir) : social.status(dataDir,channel);
  const allSocialStatuses = () => ({ instagram:oneSocialStatus('instagram'), threads:oneSocialStatus('threads'), band:oneSocialStatus('band') });
  const startSocial = (channel,input) => instagram && channel === 'instagram' ? instagram.start(dataDir,input) : social.start(dataDir,{...input,channel});

  const server=http.createServer(async(req,res)=>{
    const port=server.address()?.port, host=req.headers.host;
    const origins=[`http://127.0.0.1:${port}`,`http://localhost:${port}`];
    res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff'); res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: http: data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      if (!origins.includes(`http://${host}`)||req.headers['sec-fetch-site']==='cross-site'||(req.headers.origin&&!origins.includes(req.headers.origin))) throw new AppError('이 운영 도구는 같은 PC의 로컬 화면에서만 접근할 수 있습니다.',403);
      const url=new URL(req.url,origins[0]), route=decodeURIComponent(url.pathname);
      if(req.method==='GET'){
        if(route==='/api/health')return send({app:'d2c-codex-workspace',version:'0.5.0',workspace:ROOT,pid:process.pid});
        if(route==='/api/state'){
          const naverStores=store.listNaverStores(), socialStatuses=allSocialStatuses();
          const cursors=Object.fromEntries(naverStores.map(item=>[item.id,store.meta(`naver:cursor:${item.id}`)]));
          return send({token,products:store.list('product'),campaigns:store.list('campaign'),orders:store.list('order'),jobs:store.list('job'),trends:store.list('trend'),runs:store.list('run').slice(0,50),naverStores,cursors,social:socialStatuses,socialSettings:Object.fromEntries(store.socialSettings().map(item=>[item.id,item])),ai:ai.status(dataDir),instagram:socialStatuses.instagram,config:{configured:naverStores.some(item=>item.enabled&&item.configured),storeId:naverStores[0]?.id||config.storeId,storeName:naverStores[0]?.storeName||config.storeName}});
        }
        const brief=route.match(/^\/api\/campaigns\/([a-f0-9-]+)\/brief$/); if(brief)return send(campaignBrief(store,brief[1]));
        const trendBrief=route.match(/^\/api\/trends\/([a-f0-9-]+)\/brief$/); if(trendBrief)return send(store.trendBrief(trendBrief[1]));
        const history=route.match(/^\/api\/campaigns\/([a-f0-9-]+)\/history$/); if(history)return send(store.history(history[1]));
        const asset=route.match(/^\/assets\/([^/]+)$/); if(asset){const item=store.require('asset',asset[1]);const bytes=fs.readFileSync(assetPath(store,asset[1]));res.writeHead(200,{'Content-Type':item.mime});return res.end(bytes);}
        const download=route.match(/^\/api\/campaigns\/([a-f0-9-]+)\/download\/(caption|image)$/);
        if(download){const c=store.require('campaign',download[1]);if(!['READY','PUBLISHED'].includes(c.status))throw new AppError('검토를 먼저 완료하세요.',409);const isImage=download[2]==='image';const fileName=isImage?`campaign${path.extname(c.assetId)}`:'caption.txt';res.writeHead(200,{'Content-Type':isImage?store.require('asset',c.assetId).mime:'text/plain; charset=utf-8','Content-Disposition':`attachment; filename="${fileName}"`});return res.end(isImage?fs.readFileSync(assetPath(store,c.assetId)):c.caption);}
        const files={
          '/':'index.html',
          '/app.js':'app.js',
          '/styles.css':'styles.css',
          '/js/ui.js':'js/ui.js',
          '/js/dashboard.js':'js/dashboard.js',
          '/js/studio.js':'js/studio.js',
          '/js/catalog.js':'js/catalog.js',
          '/js/connections.js':'js/connections.js',
          '/css/base.css':'css/base.css',
          '/css/operations.css':'css/operations.css',
          '/css/dashboard.css':'css/dashboard.css',
          '/css/responsive.css':'css/responsive.css',
        };
        if(files[route]){const file=files[route];res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript; charset=utf-8':file.endsWith('.css')?'text/css; charset=utf-8':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(ROOT,'public',file)));}
        throw new AppError('페이지를 찾을 수 없습니다.',404);
      }
      if(req.method!=='POST')throw new AppError('지원하지 않는 요청입니다.',405);
      if(req.headers['x-d2c-token']!==token)throw new AppError('화면을 새로고침한 후 다시 시도하세요.',403);
      if(route==='/api/assets')return send(addAsset(store,await readBody(req,12*1024*1024)),201);
      const body=await jsonBody(req); if(!body||typeof body!=='object'||Array.isArray(body))throw new AppError('요청 객체가 필요합니다.');
      if(route==='/api/ai/login')return send(ai.login(dataDir),202);
      if(route==='/api/ai/run')return send(ai.start(dataDir,body,store),202);
      if(route==='/api/shutdown'){send({stopping:true});setImmediate(()=>server.close());return;}
      if(route==='/api/products')return send(store.saveProduct(body),201);
      if(route==='/api/campaigns')return send(store.createCampaign(body),201);
      if(route==='/api/trends')return send(store.createTrendRequest(body),201);

      const trend=route.match(/^\/api\/trends\/([a-f0-9-]+)\/apply$/);
      if(trend)return send(store.applyTrendResult(trend[1],body));

      if(route==='/api/naver-stores'||route==='/api/settings'){
        if(!allowSettings)throw new AppError('이 실행 환경에서 설정 변경은 비활성화되어 있습니다.',403);
        if(store.hasActiveLease())throw new AppError('수집 중에는 설정을 바꿀 수 없습니다.',409);
        return send(store.saveNaverStore({...body,id:body.id||body.storeId}),route==='/api/naver-stores'?201:200);
      }
      const socialSettings=route.match(/^\/api\/social\/(instagram|threads|band)\/settings$/);
      if(socialSettings){if(!allowSettings)throw new AppError('이 실행 환경에서 설정 변경은 비활성화되어 있습니다.',403);return send(store.saveSocialSettings(socialSettings[1],body));}
      const socialLogin=route.match(/^\/api\/social\/(instagram|threads|band)\/login$/);
      if(socialLogin)return send(startSocial(socialLogin[1],{action:'login'}),202);
      if(route==='/api/instagram/login')return send(startSocial('instagram',{action:'login'}),202);

      const socialPost=route.match(/^\/api\/campaigns\/([a-f0-9-]+)\/social\/(instagram|threads|band)\/post$/);
      const legacyInstagramPost=route.match(/^\/api\/campaigns\/([a-f0-9-]+)\/instagram-post$/);
      if(socialPost||legacyInstagramPost){
        const id=(socialPost||legacyInstagramPost)[1], channel=socialChannel(socialPost?socialPost[2]:'instagram'), c=store.require('campaign',id);
        if(c.status!=='READY'||c.revision!==body.revision||body.confirmed!==true)throw new AppError('최신 검토 완료 캠페인과 실제 게시 확인이 필요합니다.',409);
        if(!c.targetChannels.includes(channel))throw new AppError('이 캠페인에서 선택한 게시 채널이 아닙니다.',409);
        if(c.publications.some(item=>item.channel===channel))throw new AppError('이 채널의 게시 결과가 이미 기록되어 있습니다.',409);
        const status=oneSocialStatus(channel);
        if(status.status==='COMPLETED'&&status.action==='publish'&&status.campaignId===c.id&&status.revision===c.revision&&status.publishedInBrowser===true)throw new AppError(`${{instagram:'Instagram',threads:'Threads',band:'네이버 밴드'}[channel]} 게시 완료가 확인되었습니다. 실제 게시물 주소를 기록하세요.`,409);
        const settings=store.get('social-channel',channel)||{};
        return send(startSocial(channel,{action:'publish',campaignId:c.id,revision:c.revision,targetUrl:settings.targetUrl||''}),202);
      }

      const campaign=route.match(/^\/api\/campaigns\/([a-f0-9-]+)\/(save|request|transition|export)$/);
      if(campaign){
        const[,id,action]=campaign;
        const active=Object.values(allSocialStatuses()).find(status=>status.action==='publish'&&status.campaignId===id&&socialActiveStatuses.has(status.status));
        if(active&&action!=='export')throw new AppError('SNS 게시가 진행 중인 캠페인은 변경할 수 없습니다.',409);
        if(action==='save')return send(store.updateCampaign(id,body));
        if(action==='request')return send(store.requestGeneration(id,body),201);
        if(action==='transition')return send(store.transition(id,body));
        return send(exportCampaign(store,id));
      }
      if(route==='/api/sync'){
        const kind=body.kind||'all', requested=body.storeId||'all';
        const configs=requested==='all'?store.list('naver-store').filter(item=>item.enabled!==false):[store.requireNaverStore(requested)];
        if(!configs.length)throw new AppError('사용할 네이버 스마트스토어 연결을 먼저 추가하세요.',409);
        if(configs.length===1)return send(await sync(store,configs[0],kind));
        const results=[];
        for(const item of configs){try{results.push({storeId:item.id,storeName:item.storeName,ok:true,result:await sync(store,item,kind)});}catch(error){results.push({storeId:item.id,storeName:item.storeName,ok:false,error:error instanceof AppError?error.message:'수집에 실패했습니다.'});}}
        return send({stores:results.length,products:results.reduce((n,item)=>n+(item.result?.products||0),0),newOrders:results.reduce((n,item)=>n+(item.result?.newOrders||0),0),changedOrders:results.reduce((n,item)=>n+(item.result?.changedOrders||0),0),failures:results.filter(item=>!item.ok).length,results},results.some(item=>!item.ok)?207:200);
      }
      if(route==='/api/backup')return send({path:await store.backup()});
      throw new AppError('지원하지 않는 작업입니다.',404);
    }catch(error){if(!res.headersSent)send({error:error instanceof AppError?error.message:'처리하지 못했습니다. 입력과 로컬 저장소 상태를 확인하세요.'},error.status||500);else res.end();}
  });
  server.on('close',()=>store.close()); return {server,store};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const config=configuration(); if(!Number.isInteger(config.port)||config.port<1024||config.port>65535)throw new Error('PORT must be an integer between 1024 and 65535.');
  const{server}=createServer({config}); server.on('error',error=>{console.error(error.code==='EADDRINUSE'?'이미 실행 중이거나 포트가 사용 중입니다. 기존 화면을 확인하거나 .env의 PORT를 바꾸세요.':'서버 시작 실패. 포트와 폴더 권한을 확인하세요.');process.exitCode=1;});
  server.listen(config.port,'127.0.0.1',()=>console.log(`D2C Codex Workspace: http://127.0.0.1:${config.port}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close());
}
