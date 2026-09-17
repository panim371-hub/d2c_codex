import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
export const DATA = path.join(ROOT, 'data');
export function configuration() {
  return {
    port: Number(process.env.PORT || 4317),
    clientId: process.env.NAVER_CLIENT_ID || '',
    clientSecret: process.env.NAVER_CLIENT_SECRET || '',
    storeId: process.env.NAVER_STORE_ID || 'my-store',
    storeName: process.env.NAVER_STORE_NAME || '내 스마트스토어',
  };
}
