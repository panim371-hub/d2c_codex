import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ROOT } from './config.mjs';
import { AppError } from './validation.mjs';

export const aiActiveStatuses = new Set(['AUTHENTICATING','STARTING','RESEARCHING','GENERATING','RENDERING','APPLYING']);
const statusPath = dataDir => path.join(dataDir,'ai-status.json');
const codexScript = path.join(ROOT,'node_modules','@openai','codex','bin','codex.js');
let authCache={at:0,value:null};

export function codexEnvironment() {
  const names=['PATH','PATHEXT','SYSTEMROOT','COMSPEC','USERPROFILE','HOMEDRIVE','HOMEPATH','APPDATA','LOCALAPPDATA','TEMP','TMP','PROGRAMFILES','PROGRAMFILES(X86)','CODEX_HOME'];
  return Object.fromEntries(names.filter(name => process.env[name]).map(name => [name,process.env[name]]));
}
function processExists(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid,0); return true; } catch { return false; }
}
export function codexAuthStatus(run = spawnSync, fresh = false) {
  if (run===spawnSync && !fresh && authCache.value && Date.now()-authCache.at<5000) return authCache.value;
  if (!fs.existsSync(codexScript)) return {authenticated:false,authMode:'',message:'Codex SDK 실행 파일을 찾지 못했습니다. npm install을 실행하세요.'};
  const result=run(process.execPath,[codexScript,'login','status'],{cwd:ROOT,env:codexEnvironment(),encoding:'utf8',windowsHide:true,timeout:5000});
  const output=`${result.stdout || ''}\n${result.stderr || ''}`.trim();
  const authenticated=result.status===0 && !/not logged in/i.test(output);
  const authMode=/api key/i.test(output)?'API_KEY':authenticated?'CHATGPT':'';
  const message=authenticated?(authMode==='CHATGPT'?'ChatGPT 구독으로 Codex를 사용할 수 있습니다.':'Codex가 API 키로 로그인되어 있습니다. 별도 API 요금이 발생할 수 있습니다.'):'Codex CLI에 ChatGPT 로그인이 필요합니다.';
  const value={authenticated,authMode,message};
  if (run===spawnSync) authCache={at:Date.now(),value};
  return value;
}
export function writeAiStatus(dataDir,status) {
  fs.mkdirSync(dataDir,{recursive:true});
  const target=statusPath(dataDir),temp=`${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp,JSON.stringify({...status,updatedAt:new Date().toISOString()},null,2),{mode:0o600});
  fs.renameSync(temp,target);
}
export function readAiStatus(dataDir,authReader=codexAuthStatus) {
  const auth=authReader(); let status;
  try { status=JSON.parse(fs.readFileSync(statusPath(dataDir),'utf8')); } catch {}
  if (status && aiActiveStatuses.has(status.status)) {
    if (processExists(status.pid)) return {...status,...auth};
    if (status.action==='login' && auth.authenticated) return {status:'AI_READY',action:'',message:auth.message,updatedAt:status.updatedAt,...auth};
    return {...status,status:'INTERRUPTED',message:'PC 재부팅 또는 프로세스 종료로 AI 작업이 중단되었습니다. 다시 실행하세요.',...auth};
  }
  if (status && ['COMPLETED','FAILED','INTERRUPTED'].includes(status.status)) return {...status,...auth};
  return {status:auth.authenticated?'AI_READY':'NOT_CONFIGURED',action:'',kind:'',targetId:'',updatedAt:null,...auth};
}
export function startCodexLogin(dataDir,spawnProcess=spawn) {
  const current=readAiStatus(dataDir);
  if (current.authenticated) return current;
  if (aiActiveStatuses.has(current.status)) throw new AppError('Codex 로그인 또는 AI 작업이 이미 진행 중입니다.',409);
  const child=spawnProcess(process.execPath,[codexScript,'login'],{cwd:ROOT,env:codexEnvironment(),detached:true,windowsHide:true,stdio:'ignore'});
  child.unref?.();
  const status={taskId:randomUUID(),pid:child.pid,action:'login',kind:'',targetId:'',status:'AUTHENTICATING',message:'브라우저에서 ChatGPT 로그인을 완료하세요.'};
  writeAiStatus(dataDir,status); return {...status,authenticated:false,authMode:''};
}
export function startAiTask(dataDir,input,store,spawnProcess=spawn) {
  const auth=codexAuthStatus(spawnSync,true);
  if (!auth.authenticated) throw new AppError('먼저 연결 · 채널에서 Codex를 ChatGPT 계정으로 로그인하세요.',409);
  if (auth.authMode==='API_KEY') throw new AppError('현재 Codex가 API 키로 로그인되어 있어 별도 요금이 발생할 수 있습니다. ChatGPT 로그인으로 바꾼 뒤 다시 시도하세요.',409);
  if (aiActiveStatuses.has(readAiStatus(dataDir,()=>auth).status)) throw new AppError('다른 AI 작업이 이미 진행 중입니다.',409);
  const kind=String(input.kind || ''),targetId=String(input.id || '');
  if (!['campaign','trend'].includes(kind)) throw new AppError('지원하지 않는 AI 작업입니다.');
  if (kind==='campaign') {
    const campaign=store.require('campaign',targetId);
    if (!store.list('job').some(job=>job.campaignId===targetId&&job.campaignRevision===campaign.revision&&job.status==='PENDING')) throw new AppError('현재 버전의 대기 중인 캠페인 제작 요청이 없습니다.',409);
  } else if (store.require('trend',targetId).status!=='PENDING') throw new AppError('대기 중인 동향 조사 요청이 아닙니다.',409);
  const taskId=randomUUID(),worker=path.join(ROOT,'scripts','ai-worker.mjs'),runtime=path.join(dataDir,'runtime');
  fs.mkdirSync(runtime,{recursive:true});
  const output=fs.openSync(path.join(runtime,'ai-worker.log'),'a');
  const child=spawnProcess(process.execPath,[worker,kind,targetId,taskId],{cwd:ROOT,detached:true,windowsHide:true,stdio:['ignore',output,output],env:{...codexEnvironment(),D2C_DATA_DIR:dataDir}});
  fs.closeSync(output); child.unref?.();
  const status={taskId,pid:child.pid,action:'run',kind,targetId,status:'STARTING',message:kind==='trend'?'동향 조사용 Codex를 시작하고 있습니다.':'캠페인 콘텐츠 제작용 Codex를 시작하고 있습니다.'};
  writeAiStatus(dataDir,status); return {...status,...auth};
}
