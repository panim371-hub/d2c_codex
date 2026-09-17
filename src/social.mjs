import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { ROOT } from './config.mjs';
import { AppError, socialChannel } from './validation.mjs';

export const socialActiveStatuses = new Set(['STARTING', 'OPENING_BROWSER', 'WAITING_LOGIN', 'PREPARING', 'PUBLISHING']);
export const socialDefinitions = Object.freeze({
  instagram:{ label:'Instagram', home:'https://www.instagram.com/' },
  threads:{ label:'Threads', home:'https://www.threads.com/' },
  band:{ label:'네이버 밴드', home:'https://band.us/' },
});

function statusPath(dataDir, channel) {
  // Keep the proven Instagram profile/status locations so an existing login survives the upgrade.
  return path.join(dataDir, channel === 'instagram' ? 'instagram-status.json' : `${channel}-status.json`);
}
function defaultStatus(channel) {
  return { channel, connected:false, status:'NOT_CONFIGURED', action:'', campaignId:'', message:`전용 브라우저에서 ${socialDefinitions[channel].label} 로그인이 필요합니다.`, updatedAt:null };
}
function processExists(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
function activeStatusExpired(status) {
  const updated = Date.parse(status.updatedAt);
  if (!Number.isFinite(updated)) return false;
  const maxAge = status.status === 'WAITING_LOGIN' ? 11 * 60_000 : status.status === 'PUBLISHING' ? 3 * 60_000 : 60_000;
  return Date.now() - updated > maxAge;
}

export function writeSocialStatus(dataDir, channelValue, status) {
  const channel = socialChannel(channelValue);
  fs.mkdirSync(dataDir, { recursive:true });
  const target = statusPath(dataDir, channel), temp = `${target}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ ...status, channel, updatedAt:new Date().toISOString() }, null, 2), { mode:0o600 });
  fs.renameSync(temp, target);
}
export function readSocialStatus(dataDir, channelValue) {
  const channel = socialChannel(channelValue);
  try {
    const status = JSON.parse(fs.readFileSync(statusPath(dataDir, channel), 'utf8'));
    const connected = status.connected ?? status.status === 'COMPLETED';
    if (socialActiveStatuses.has(status.status) && (!processExists(status.pid) || activeStatusExpired(status))) return { ...status, channel, connected, status:'INTERRUPTED', message:'PC 재부팅 또는 브라우저 작업 종료로 작업이 중단되었습니다. 실제 계정을 확인한 뒤 다시 시도하세요.' };
    return { ...status, channel, connected };
  } catch { return defaultStatus(channel); }
}
export function readSocialStatuses(dataDir) {
  return Object.fromEntries(Object.keys(socialDefinitions).map(channel => [channel, readSocialStatus(dataDir, channel)]));
}
export function startSocialTask(dataDir, input) {
  const channel = socialChannel(input.channel);
  const current = readSocialStatus(dataDir, channel), label = socialDefinitions[channel].label;
  if (socialActiveStatuses.has(current.status)) throw new AppError(`${label} 브라우저 작업이 이미 실행 중입니다. 열린 브라우저를 확인하세요.`, 409);
  if (!['login','publish'].includes(input.action)) throw new AppError(`지원하지 않는 ${label} 작업입니다.`);
  if (channel === 'band' && input.action === 'publish' && !input.targetUrl) throw new AppError('게시할 밴드 홈 주소를 연결 설정에 먼저 입력하세요.', 409);

  const taskId = randomUUID(), worker = path.join(ROOT, 'scripts', 'social-worker.mjs');
  const args = [worker, channel, input.action, taskId, input.campaignId || '', String(input.revision || ''), input.targetUrl || ''];
  const runtime = path.join(dataDir, 'runtime'); fs.mkdirSync(runtime, { recursive:true });
  const output = fs.openSync(path.join(runtime, `${channel}-worker.log`), 'a');
  const child = spawn(process.execPath, args, { cwd:ROOT, detached:true, windowsHide:true, stdio:['ignore',output,output], env:{ ...process.env, D2C_DATA_DIR:dataDir } });
  fs.closeSync(output); child.unref();
  const status = { taskId, pid:child.pid, action:input.action, campaignId:input.campaignId || '', revision:input.revision || null, connected:current.connected === true, status:'STARTING', message:input.action === 'login' ? `${label} 로그인용 전용 브라우저를 여는 중입니다.` : `${label}에 게시할 검토본을 준비하고 있습니다.` };
  writeSocialStatus(dataDir, channel, status); return status;
}
