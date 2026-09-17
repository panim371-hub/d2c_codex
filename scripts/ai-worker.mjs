import fs from 'node:fs';
import path from 'node:path';
import { Codex } from '@openai/codex-sdk';
import { ROOT, DATA } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { addAsset, campaignBrief } from '../src/assets.mjs';
import { campaignOutputSchema, trendOutputSchema, buildCampaignPrompt, buildTrendPrompt } from '../src/ai-task.mjs';
import { codexEnvironment, writeAiStatus } from '../src/ai.mjs';
import { renderMarketingImage } from '../src/marketing-image.mjs';

const [kind,targetId,taskId] = process.argv.slice(2);
const dataDir=process.env.D2C_DATA_DIR?path.resolve(process.env.D2C_DATA_DIR):DATA;
const store=new Store(dataDir);
function update(status,message,extra={}) { writeAiStatus(dataDir,{taskId,pid:process.pid,action:'run',kind,targetId,status,message,...extra}); }
function parseResult(value) {
  try { return JSON.parse(value); }
  catch { throw new Error('Codex가 구조화된 JSON 결과를 반환하지 못했습니다. 다시 실행하세요.'); }
}
async function runCodex(prompt,schema,webSearch) {
  const workspace=path.join(dataDir,'ai-workspace'); fs.mkdirSync(workspace,{recursive:true});
  const codex=new Codex({env:codexEnvironment()});
  const thread=codex.startThread({workingDirectory:workspace,skipGitRepoCheck:true,sandboxMode:'read-only',approvalPolicy:'never',modelReasoningEffort:'medium',webSearchMode:webSearch?'live':'disabled',networkAccessEnabled:webSearch});
  const result=await thread.run(prompt,{outputSchema:schema});
  return {data:parseResult(result.finalResponse),threadId:thread.id,usage:result.usage};
}

try {
  if (kind==='trend') {
    const brief=store.trendBrief(targetId);
    update('RESEARCHING','Codex가 최신 웹 출처와 상품 연관성을 조사하고 있습니다.');
    const result=await runCodex(buildTrendPrompt(brief),trendOutputSchema,true);
    update('APPLYING','출처와 상품 연결 결과를 검증해 저장하고 있습니다.',{threadId:result.threadId});
    const saved=store.applyTrendResult(targetId,{revision:brief.request.revision,...result.data});
    update('COMPLETED',`동향 ${saved.items.length}건을 대시보드에 저장했습니다.`,{threadId:result.threadId,usage:result.usage});
  } else if (kind==='campaign') {
    const brief=campaignBrief(store,targetId);
    update('GENERATING','Codex가 상품 사실에 맞는 카피와 광고 구성을 만들고 있습니다.');
    const result=await runCodex(buildCampaignPrompt(brief),campaignOutputSchema,false);
    update('RENDERING','상품 사진과 카피로 1080×1350 광고 이미지를 만들고 있습니다.',{threadId:result.threadId});
    const bytes=await renderMarketingImage(brief.product,result.data.media);
    const asset=addAsset(store,bytes);
    update('APPLYING','카피와 이미지를 캠페인에 저장하고 있습니다.',{threadId:result.threadId});
    store.updateCampaign(targetId,{revision:brief.revision,caption:result.data.caption,variants:result.data.variants,sources:result.data.sources,assetId:asset.id},'codex');
    update('COMPLETED','카피 시안과 광고 이미지를 캠페인에 저장했습니다.',{threadId:result.threadId,usage:result.usage});
  } else throw new Error('지원하지 않는 AI 작업입니다.');
} catch (error) {
  update('FAILED',String(error?.message || error).replace(/[\r\n]+/g,' ').slice(0,1000));
  process.exitCode=1;
} finally { store.close(); }
