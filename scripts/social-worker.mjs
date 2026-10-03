import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright-core';
import { ROOT, DATA } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { assetPath } from '../src/assets.mjs';
import { readSocialStatus, writeSocialStatus, socialDefinitions } from '../src/social.mjs';
import { instagramCaptionName } from '../src/social-selectors.mjs';
import { socialChannel } from '../src/validation.mjs';
import { chromiumExecutable } from '../src/chromium.mjs';

const [channelText, action, taskId, campaignId = '', revisionText = '', targetUrl = ''] = process.argv.slice(2);
const channel = socialChannel(channelText);
const definition = socialDefinitions[channel], label = definition.label;
const dataDir = process.env.D2C_DATA_DIR ? path.resolve(process.env.D2C_DATA_DIR) : DATA;
const profileDir = path.join(dataDir, channel === 'instagram' ? 'instagram-profile' : `${channel}-profile`);
const cdpPort = { instagram:9333, threads:9334, band:9335 }[channel];
let browser;
let connected = readSocialStatus(dataDir,channel).connected === true;

function update(status, message, extra = {}) {
  if (extra.connected !== undefined) connected = extra.connected;
  writeSocialStatus(dataDir, channel, { taskId, pid:process.pid, action, campaignId, revision:Number(revisionText) || null, connected, status, message, ...extra });
}
async function connectBrowserIfReady() {
  const endpoint = `http://127.0.0.1:${cdpPort}`;
  try {
    const response = await fetch(`${endpoint}/json/list`, { signal:AbortSignal.timeout(1000) });
    if (!response.ok) return null;
    const targets = await response.json();
    if (!targets.some(target => target.type === 'page')) {
      const created = await fetch(`${endpoint}/json/new?${encodeURIComponent(definition.home)}`, { method:'PUT', signal:AbortSignal.timeout(3000) });
      if (!created.ok) return null;
    }
    browser = await chromium.connectOverCDP(endpoint);
    return browser.contexts()[0] || null;
  } catch { return null; }
}
async function launchBrowser() {
  fs.mkdirSync(profileDir, { recursive:true });
  const existing = await connectBrowserIfReady();
  if (existing) return existing;
  const executable = chromiumExecutable();
  if (!executable) throw new Error('Playwright에서 사용할 Chromium, Edge 또는 Chrome을 찾지 못했습니다.');
  execFileSync('powershell.exe', ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(ROOT,'scripts','launch-social-browser.ps1'),'-ExecPath',executable,'-SessionDir',profileDir,'-Port',String(cdpPort),'-Url',definition.home], { windowsHide:true, stdio:'ignore' });
  for (let attempt = 0; attempt < 40; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const context = await connectBrowserIfReady();
    if (context) return context;
  }
  throw new Error(`${label} 전용 브라우저가 시작 직후 종료됐거나 Playwright 연결 포트가 열리지 않았습니다. 열려 있는 전용 브라우저를 닫고 다시 시도하세요.`);
}
async function channelPage(context, url = definition.home) {
  const hostname = new URL(url).hostname.replace(/^www\./,'');
  const pages = context.pages();
  let page = pages.find(item => item.url().includes(hostname)) || pages[0];
  if (page) {
    try { await page.bringToFront(); }
    catch {
      // 비정상 종료 뒤 복원된 탭은 Target crashed 상태일 수 있다.
      // 로그인 쿠키가 든 프로필은 유지하고 손상된 탭만 새 탭으로 대체한다.
      await page.close().catch(() => {});
      page = null;
    }
  }
  if (!page) page = await context.newPage();
  if (!page.url().includes(hostname)) {
    try { await page.goto(url, { waitUntil:'domcontentloaded', timeout:60000 }); }
    catch (error) {
      if (String(error?.message).includes('ERR_NETWORK_ACCESS_DENIED')) throw new Error('현재 서버가 Codex의 제한된 네트워크 환경에서 실행 중입니다. stop.bat으로 종료한 뒤 탐색기에서 start.bat을 실행하고 다시 시도하세요.');
      throw error;
    }
  }
  return page;
}
async function anyVisible(locators) {
  for (const locator of locators) if (await locator.isVisible().catch(() => false)) return locator;
  return null;
}
async function clickVisible(locators, errorMessage) {
  const locator = await anyVisible(locators);
  if (!locator) throw new Error(errorMessage);
  await locator.click(); return locator;
}
async function waitVisible(locators, errorMessage, timeout = 20000) {
  const deadline=Date.now()+timeout;
  while (Date.now()<deadline) {
    const locator=await anyVisible(locators);
    if (locator) return locator;
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  throw new Error(errorMessage);
}
async function loggedIn(context, page) {
  const cookies = await context.cookies(definition.home);
  if (channel === 'instagram') {
    if (cookies.some(cookie => cookie.name === 'sessionid' && cookie.value)) return true;
    return Boolean(await anyVisible([page.locator('a[href*="/direct/inbox"]'), page.locator('svg[aria-label="홈"], svg[aria-label="Home"], svg[aria-label="만들기"], svg[aria-label="Create"]')]));
  }
  if (channel === 'threads') {
    if (cookies.some(cookie => cookie.name === 'sessionid' && cookie.value)) return true;
    const login = await anyVisible([page.getByRole('button',{name:/^(로그인|Log in)$/}), page.getByRole('link',{name:/^(로그인|Log in)$/})]);
    const app = await anyVisible([page.locator('a[href*="/activity"]'), page.locator('[aria-label*="Create"], [aria-label*="만들기"], [aria-label*="New thread"], [aria-label*="새 스레드"]')]);
    return !login && Boolean(app);
  }
  if (page.url().includes('/login')) return false;
  const login = await anyVisible([page.getByText(/^(로그인|Log in)$/).first()]);
  const app = await anyVisible([page.getByText(/^(글쓰기|Write)$/).first(),page.locator('.btn_write, [class*="writePost"], [data-viewname*="write"]'),page.locator('a[href^="/band/"], a[href*="band.us/band/"]').first()]);
  return !login && Boolean(app);
}
async function waitForLogin(context, page) {
  if (await loggedIn(context, page)) return;
  update('WAITING_LOGIN', `열린 전용 브라우저에서 ${label}에 로그인해 주세요. 로그인되면 자동으로 계속합니다.`);
  for (let attempt = 0; attempt < 300; attempt++) { await page.waitForTimeout(2000); if (await loggedIn(context, page)) return; }
  throw new Error(`${label} 로그인 대기 시간이 10분을 초과했습니다. 다시 로그인 버튼을 눌러 주세요.`);
}
async function dismissPopups(page) {
  for (const name of ['나중에 하기','Not Now','취소','Cancel','닫기','Close']) {
    const button = page.getByRole('button',{name,exact:true}).first();
    if (await button.isVisible().catch(() => false)) { await button.click().catch(() => {}); break; }
  }
}
async function fillEditable(locator, value) {
  await locator.waitFor({ state:'visible', timeout:20000 }); await locator.click();
  await locator.fill(value).catch(async () => { await locator.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A').catch(() => {}); await locator.pressSequentially(value); });
}

async function postInstagram(page, image, caption) {
  await dismissPopups(page);
  await clickVisible([page.locator('svg[aria-label="만들기"], svg[aria-label="Create"], svg[aria-label="새로운 게시물"], svg[aria-label="New post"]').first(),page.getByText(/^(만들기|Create)$/).first()], 'Instagram의 만들기 버튼을 찾지 못했습니다. 화면 구성이 바뀌었을 수 있습니다.');
  await page.waitForTimeout(1000);
  const postOption = page.getByText(/^(게시물|Post)$/).first(); if (await postOption.isVisible().catch(() => false)) await postOption.click();
  const input = page.locator('input[type="file"]').first(); await input.waitFor({state:'attached',timeout:30000}); await input.setInputFiles(image); await page.waitForTimeout(2500);
  for (const stage of ['자르기','필터']) { await clickVisible([page.getByRole('button',{name:/^(다음|Next)$/}).first(),page.locator('div[role="dialog"] div[role="button"]').filter({hasText:/^(다음|Next)$/}).first()], `${stage} 단계의 다음 버튼을 찾지 못했습니다.`); await page.waitForTimeout(2000); }
  const captionEditor = await waitVisible([
    page.getByRole('textbox',{name:instagramCaptionName}).first(),
    page.locator('div[role="dialog"] [contenteditable="true"][role="textbox"]').first(),
    page.locator('[contenteditable="true"][role="textbox"]').first(),
  ], 'Instagram 작성 화면에서 캡션 입력란을 찾지 못했습니다. Instagram 화면 구성이 바뀌었을 수 있습니다.');
  await fillEditable(captionEditor, caption);
  update('PUBLISHING', '확인한 캠페인을 Instagram에 공유하고 있습니다. 이 단계에서는 다시 누르지 마세요.');
  await clickVisible([page.getByRole('button',{name:/^(공유하기|Share)$/}).first(),page.locator('div[role="dialog"] div[role="button"]').filter({hasText:/^(공유하기|Share)$/}).first()], '공유하기 버튼을 찾지 못했습니다.');
  await page.waitForFunction(() => { const value=document.body?.innerText||''; return value.includes('게시물이 공유되었습니다')||value.includes('Your post has been shared'); }, {timeout:60000});
}
async function postThreads(page, image, caption) {
  const length=[...caption].length;
  if (length > 500) throw new Error(`Threads 본문은 500자 이하여야 합니다. 현재 ${length}자이므로 앱에서 줄여 다시 검토하세요.`);
  const editorCandidates=[
    page.getByRole('textbox',{name:/텍스트 필드|새 게시물|Start a thread|What.?s new/i}).last(),
    page.locator('[contenteditable="true"][role="textbox"]:visible').last(),
    page.locator('textarea:visible').last(),
  ];
  let editor=await anyVisible(editorCandidates);
  if (!editor) {
    await dismissPopups(page);
    await clickVisible([
      page.getByRole('button',{name:/^(만들기|Create|새 스레드|New thread)$/}).first(),
      page.locator('[aria-label="만들기"], [aria-label="Create"], [aria-label="새 스레드"], [aria-label="New thread"]').first(),
      page.locator('button').filter({has:page.locator('svg[aria-label*="Create"],svg[aria-label*="만들기"]')}).first(),
    ], 'Threads의 새 글 버튼을 찾지 못했습니다. 열린 Threads 화면에서 새 스레드 버튼이 보이는지 확인하세요.');
    editor=await waitVisible(editorCandidates,'Threads 작성 화면에서 본문 입력란을 찾지 못했습니다. 열린 전용 브라우저 화면을 확인하세요.');
  }
  await fillEditable(editor, caption);
  const mediaScope=editor.locator('xpath=ancestor::*[.//input[@type="file"]][1]');
  const input=(await mediaScope.count())?mediaScope.locator('input[type="file"]').first():page.locator('input[type="file"]').last();
  await input.waitFor({state:'attached',timeout:20000}).catch(()=>{ throw new Error('Threads 작성 화면에서 이미지 첨부 입력을 찾지 못했습니다.'); });
  await input.setInputFiles(image); await page.waitForTimeout(1500);
  let composer=editor.locator('xpath=ancestor::*[.//*[self::button or @role="button"][normalize-space(.)="게시" or normalize-space(.)="Post"]][1]');
  if (!(await composer.count())) composer=page.locator('body');
  update('PUBLISHING', '확인한 캠페인을 Threads에 게시하고 있습니다. 이 단계에서는 다시 누르지 마세요.');
  await clickVisible([composer.getByRole('button',{name:/^(게시|Post)$/}).last(),composer.locator('[role="button"]').filter({hasText:/^(게시|Post)$/}).last()], 'Threads의 게시 버튼을 찾지 못했습니다.');
  await Promise.race([
    editor.waitFor({state:'hidden',timeout:60000}),
    page.getByText(/(게시되었습니다|스레드가 게시|Your thread was posted|Posted)/).first().waitFor({state:'visible',timeout:60000}),
  ]);
}
async function postBand(page, image, caption) {
  await clickVisible([page.getByRole('button',{name:/글쓰기|Write/}).first(),page.getByText(/^(글쓰기|Write)$/).first(),page.locator('.btn_write, [class*="writePost"], [data-viewname*="write"]').first()], '밴드의 글쓰기 버튼을 찾지 못했습니다. 게시할 밴드 홈 주소와 권한을 확인하세요.');
  await page.waitForTimeout(1000);
  const composer = page.locator('[role="dialog"], .ly_write, [class*="postWrite"]').last();
  const editor = composer.locator('[contenteditable="true"], textarea').first(); await fillEditable(editor, caption);
  const input = composer.locator('input[type="file"]').first(); await input.waitFor({state:'attached',timeout:20000}); await input.setInputFiles(image); await page.waitForTimeout(1500);
  update('PUBLISHING', '확인한 캠페인을 네이버 밴드에 게시하고 있습니다. 이 단계에서는 다시 누르지 마세요.');
  await clickVisible([composer.getByRole('button',{name:/^(게시|등록|Post)$/}).last(),composer.locator('button, [role="button"]').filter({hasText:/^(게시|등록|Post)$/}).last()], '밴드의 게시 버튼을 찾지 못했습니다.');
  await Promise.race([
    composer.waitFor({state:'hidden',timeout:60000}),
    page.getByText(/(게시되었습니다|글이 등록|Post published)/).first().waitFor({state:'visible',timeout:60000}),
  ]);
}

async function login() {
  update('OPENING_BROWSER', `${label} 로그인용 전용 브라우저를 여는 중입니다.`);
  const context = await launchBrowser(), page = await channelPage(context);
  await waitForLogin(context,page);
  update('COMPLETED', `${label} 로그인 세션을 저장했습니다. 이제 검토 완료 캠페인을 게시할 수 있습니다.`, {connected:true});
}
async function publish() {
  const store = new Store(dataDir); let campaign, image;
  try {
    campaign = store.require('campaign',campaignId);
    if (campaign.revision !== Number(revisionText)) throw new Error('캠페인이 게시 요청 후 변경되었습니다. 최신 내용을 다시 확인하세요.');
    if (campaign.status !== 'READY') throw new Error('검토 완료된 캠페인만 게시할 수 있습니다.');
    if (!campaign.targetChannels.includes(channel)) throw new Error('이 캠페인에서 선택한 게시 채널이 아닙니다.');
    if (campaign.publications.some(item => item.channel === channel)) throw new Error(`${label} 게시 기록이 이미 있습니다.`);
    if (!campaign.caption || !campaign.assetId) throw new Error('게시할 이미지와 본문이 없습니다.');
    image = assetPath(store,campaign.assetId);
  } finally { store.close(); }
  const destination = channel === 'band' ? targetUrl : definition.home;
  update('OPENING_BROWSER', `저장된 ${label} 세션을 확인하고 있습니다.`);
  const context = await launchBrowser(), page = await channelPage(context,destination);
  await page.goto(destination,{waitUntil:'domcontentloaded',timeout:60000}); await waitForLogin(context,page); await page.waitForTimeout(1500);
  update('PREPARING', `${label} 게시 화면에 이미지와 본문을 입력하고 있습니다.`);
  if (channel === 'instagram') await postInstagram(page,image,campaign.caption);
  else if (channel === 'threads') await postThreads(page,image,campaign.caption);
  else await postBand(page,image,campaign.caption);
  update('COMPLETED', `${label} 웹의 게시 완료 상태를 확인했습니다. 실제 게시물을 열어 주소를 복사한 뒤 앱에 기록하세요.`, {publishedInBrowser:true,connected:true});
}

try {
  if (!taskId || !['login','publish'].includes(action)) throw new Error('잘못된 SNS 작업 요청입니다.');
  if (action === 'login') await login(); else await publish();
} catch (error) {
  console.error(error);
  const message=String(error?.message || `${label} 브라우저 작업에 실패했습니다.`).replace(/\u001b\[[0-9;]*m/g,'').split(/\r?\nCall log:/)[0].trim();
  update('FAILED',message); process.exitCode=1;
}
finally { if (browser) await browser.close().catch(() => {}); }
