import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.mjs';

export function chromiumExecutable() {
  const candidates = [], local = process.env.LOCALAPPDATA;
  let expectedRevision = '';
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT,'node_modules','playwright-core','browsers.json'),'utf8'));
    expectedRevision = manifest.browsers.find(item => item.name === 'chromium')?.revision || '';
  } catch {}
  if (local) candidates.push(
    path.join(local,'Microsoft','Edge','Application','msedge.exe'),
    path.join(local,'Google','Chrome','Application','chrome.exe'),
  );
  if (process.env.PROGRAMFILES) candidates.push(
    path.join(process.env.PROGRAMFILES,'Google','Chrome','Application','chrome.exe'),
    path.join(process.env.PROGRAMFILES,'Microsoft','Edge','Application','msedge.exe'),
  );
  if (process.env['PROGRAMFILES(X86)']) candidates.push(path.join(process.env['PROGRAMFILES(X86)'],'Microsoft','Edge','Application','msedge.exe'));
  if (local) {
    const base = path.join(local,'ms-playwright');
    if (expectedRevision) candidates.push(path.join(base,`chromium-${expectedRevision}`,'chrome-win64','chrome.exe'));
    if (fs.existsSync(base)) for (const dir of fs.readdirSync(base).filter(name => /^chromium-\d+$/.test(name)).sort().reverse()) candidates.push(path.join(base,dir,'chrome-win64','chrome.exe'));
  }
  return candidates.find(candidate => fs.existsSync(candidate));
}
