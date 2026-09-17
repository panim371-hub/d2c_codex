import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config.mjs';
import { readInstagramStatus, writeInstagramStatus } from '../src/instagram.mjs';
import { readSocialStatus, writeSocialStatus } from '../src/social.mjs';

test('Instagram worker status detects live and interrupted processes without exposing a profile', t => {
  const base = path.join(ROOT, '.test-output');
  fs.mkdirSync(base, { recursive: true });
  const dir = fs.mkdtempSync(path.join(base, 'instagram-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  assert.equal(readInstagramStatus(dir).status, 'NOT_CONFIGURED');
  writeInstagramStatus(dir, { taskId: 'live', pid: process.pid, action: 'login', status: 'WAITING_LOGIN', message: 'waiting' });
  assert.equal(readInstagramStatus(dir).status, 'WAITING_LOGIN');

  writeInstagramStatus(dir, { taskId: 'stale', pid: 2147483647, action: 'publish', status: 'PUBLISHING', message: 'publishing' });
  const interrupted = readInstagramStatus(dir);
  assert.equal(interrupted.status, 'INTERRUPTED');
  assert.match(interrupted.message, /실제 계정/);
  assert.equal(JSON.stringify(interrupted).includes('instagram-profile'), false);

  writeInstagramStatus(dir, { taskId: 'expired', pid: process.pid, action: 'login', status: 'OPENING_BROWSER', message: 'opening' });
  const statusFile = path.join(dir, 'instagram-status.json');
  const expired = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  expired.updatedAt = new Date(Date.now() - 61_000).toISOString();
  fs.writeFileSync(statusFile, JSON.stringify(expired));
  assert.equal(readInstagramStatus(dir).status, 'INTERRUPTED');
});
test('social channels keep independent worker status files',t=>{
  const base=path.join(ROOT,'.test-output');fs.mkdirSync(base,{recursive:true});const dir=fs.mkdtempSync(path.join(base,'social-'));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  writeSocialStatus(dir,'threads',{taskId:'threads',pid:process.pid,action:'login',status:'COMPLETED',message:'threads ready'});
  writeSocialStatus(dir,'band',{taskId:'band',pid:process.pid,action:'login',status:'COMPLETED',message:'band ready'});
  assert.equal(readSocialStatus(dir,'instagram').status,'NOT_CONFIGURED');
  assert.equal(readSocialStatus(dir,'threads').message,'threads ready');
  assert.equal(readSocialStatus(dir,'band').message,'band ready');
});
