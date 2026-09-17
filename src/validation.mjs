export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function text(value, label, max = 1000, required = false) {
  if (value === undefined || value === null) value = '';
  if (typeof value !== 'string' || value.length > max) throw new AppError(`${label}: ${max}자 이내의 문자열을 입력하세요.`);
  value = value.trim();
  if (required && !value) throw new AppError(`${label}을(를) 입력하세요.`);
  return value;
}
export function integer(value, label, fallback = 0) {
  if (value === undefined || value === '') return fallback;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 0) throw new AppError(`${label}: 0 이상의 정수를 입력하세요.`);
  return n;
}
export function webUrl(value, label = 'URL') {
  const s = text(value, label, 2000);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error();
    return u.href;
  } catch { throw new AppError(`${label}: 올바른 http 또는 https 주소를 입력하세요.`); }
}
export function instagramUrl(value) {
  return socialUrl('instagram', value);
}
export const SOCIAL_CHANNELS = Object.freeze(['instagram', 'threads', 'band']);
export function socialChannel(value) {
  const channel = text(value, 'SNS 채널', 20, true).toLowerCase();
  if (!SOCIAL_CHANNELS.includes(channel)) throw new AppError('SNS 채널은 Instagram, Threads, 네이버 밴드 중 하나여야 합니다.');
  return channel;
}
export function socialChannels(value, fallback = ['instagram']) {
  const items = value === undefined ? fallback : value;
  if (!Array.isArray(items) || items.length < 1 || items.length > SOCIAL_CHANNELS.length) throw new AppError('게시할 SNS 채널을 하나 이상 선택하세요.');
  return [...new Set(items.map(socialChannel))];
}
export function socialUrl(channelValue, value) {
  const channel = socialChannel(channelValue);
  const labels = { instagram: 'Instagram', threads: 'Threads', band: '네이버 밴드' };
  const s = webUrl(value, `${labels[channel]} 게시물 주소`);
  const u = new URL(s || 'https://invalid.example');
  const valid = channel === 'instagram'
    ? ['instagram.com', 'www.instagram.com'].includes(u.hostname) && /^\/(p|reel)\/[A-Za-z0-9_-]+\/?$/.test(u.pathname)
    : channel === 'threads'
      ? ['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'].includes(u.hostname) && /^(?:\/@[^/]+\/post\/[A-Za-z0-9_-]+|\/share\/[A-Za-z0-9_-]+)\/?$/.test(u.pathname)
      : ['band.us', 'www.band.us'].includes(u.hostname) && /^\/band\/\d+\/post\/\d+\/?$/.test(u.pathname);
  if (u.protocol !== 'https:' || !valid) {
    const examples = {
      instagram: 'https://www.instagram.com/p/…/ 또는 /reel/…/',
      threads: 'https://www.threads.com/@계정/post/…/ 또는 /share/…/',
      band: 'https://band.us/band/숫자/post/숫자',
    };
    throw new AppError(`실제 ${labels[channel]} 게시물 주소(${examples[channel]})를 입력하세요.`);
  }
  u.search = ''; u.hash = '';
  return u.href;
}
export function revision(value) {
  const n = integer(value, '수정 버전');
  if (n < 1) throw new AppError('수정 버전이 필요합니다. 화면을 새로고침하세요.');
  return n;
}
