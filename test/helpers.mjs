import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
export function temporaryStore(t) {
  const base=path.join(ROOT,'.test-output');fs.mkdirSync(base,{recursive:true});
  const dir=fs.mkdtempSync(path.join(base,'case-'));
  const store=new Store(dir);
  t.after(()=>{store.close();fs.rmSync(dir,{recursive:true,force:true});});
  return store;
}
export const imageBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVxkAAAAASUVORK5CYII=','base64');
export const product = {name:'검증용 상품',price:12900,stock:5,facts:'테스트 전용. 실제 판매 상품 아님.'};
export const naverConfig = {clientId:'unit-test',clientSecret:'not-used',storeId:'test-store',storeName:'테스트'};
export const orderResponse = id => ({order:{orderId:'o-'+id,paymentDate:'2026-09-04T08:00:00+09:00',ordererName:'Do not persist'},productOrder:{productOrderId:id,originalProductId:'42',productId:'99',productName:'검증용',quantity:1,totalPaymentAmount:10000,productOrderStatus:'PAYED',shippingAddress:{name:'Do not persist',tel1:'010-secret',baseAddress:'private'}}});
