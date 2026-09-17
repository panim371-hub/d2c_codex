import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError } from './validation.mjs';

export function addAsset(store, bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12 || bytes.length > 12*1024*1024) throw new AppError('이미지는 12MB 이하의 PNG, JPEG, WebP 파일이어야 합니다.');
  let ext;
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) ext = 'png';
  else if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ext = 'jpg';
  else if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') ext = 'webp';
  else throw new AppError('PNG, JPEG, WebP 이미지 파일만 저장할 수 있습니다.');
  const id = `${randomUUID()}.${ext}`;
  const dir = path.join(store.dataDir, 'assets'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, id), bytes, { flag: 'wx' });
  return store.put('asset', { id, mime: { png:'image/png', jpg:'image/jpeg', webp:'image/webp' }[ext], bytes: bytes.length, updatedAt: new Date().toISOString() });
}
export function assetPath(store, id) {
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp)$/.test(id)) throw new AppError('이미지를 찾을 수 없습니다.', 404);
  store.require('asset', id);
  return path.join(store.dataDir, 'assets', id);
}
export function campaignBrief(store, id) {
  const c = store.require('campaign', id);
  return {
    campaignId: c.id, revision: c.revision, title: c.title, brief: c.brief,
    product: c.productSnapshot, currentProduct: store.require('product', c.productId),
    currentCaption: c.caption, variants: c.variants, sources: c.sources, targetChannels: c.targetChannels,
    instructions: '실제 상품 정보에 근거해 작성. 할인·배송일·원산지·한정 수량을 추정하지 말 것. Threads가 대상이면 본문과 시안을 각각 500자 이하로 작성. 결과 적용 시 이 revision 필수.',
  };
}
export function exportCampaign(store, id) {
  const c = store.require('campaign', id);
  if (c.status !== 'READY' && c.status !== 'PUBLISHED') throw new AppError('검토를 완료한 후 게시 파일을 준비하세요.', 409);
  const dir = path.join(store.dataDir, 'exports', `${id}-r${c.revision}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'caption.txt'), c.caption, 'utf8');
  const ext = path.extname(c.assetId);
  fs.copyFileSync(assetPath(store, c.assetId), path.join(dir, `image${ext}`));
  fs.writeFileSync(path.join(dir, 'campaign.json'), JSON.stringify({ ...c, exportNote: '게시 파일 준비만 완료. Instagram 발행은 별도 작업입니다.' }, null, 2), 'utf8');
  return { directory: dir, captionPath: path.join(dir, 'caption.txt'), imagePath: path.join(dir, `image${ext}`), revision: c.revision, status: 'EXPORTED' };
}
