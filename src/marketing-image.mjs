import { chromium } from 'playwright-core';
import { chromiumExecutable } from './chromium.mjs';

const themes = {
  ocean:{ background:'#102f39', accent:'#73e0c2', panel:'#f6f1e6', ink:'#173038' },
  sunset:{ background:'#6b2d24', accent:'#ffd27a', panel:'#fff4e6', ink:'#4b251f' },
  forest:{ background:'#173c31', accent:'#bce285', panel:'#f3f4df', ink:'#19382f' },
  clean:{ background:'#e9f1f2', accent:'#087b70', panel:'#ffffff', ink:'#173038' },
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);

export function marketingHtml(product, media) {
  const theme = themes[media.theme] || themes.ocean;
  const photo = product.imageUrl ? `<img id="product-photo" src="${esc(product.imageUrl)}" alt="">` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}html,body{margin:0;width:1080px;height:1350px;overflow:hidden;font-family:"Malgun Gothic","Segoe UI",sans-serif;background:${theme.background};color:${theme.ink}}
  main{width:100%;height:100%;padding:64px;display:grid;grid-template-rows:auto 1fr auto;gap:36px;background:radial-gradient(circle at 90% 4%,${theme.accent}55,transparent 32%),${theme.background}}
  header{color:white;overflow:hidden}.badge{display:inline-block;padding:12px 22px;border:2px solid ${theme.accent};border-radius:99px;color:${theme.accent};font-size:26px;font-weight:700;letter-spacing:.04em}.headline{font-size:78px;line-height:1.13;letter-spacing:-.07em;margin:28px 0 16px;max-width:920px;max-height:180px;overflow:hidden;word-break:keep-all}.sub{font-size:31px;line-height:1.5;color:#e7f3f1;margin:0;max-height:96px;overflow:hidden;word-break:keep-all}
  .visual{min-height:0;position:relative;border-radius:34px;overflow:hidden;background:linear-gradient(145deg,#dce8e5,#fff);box-shadow:0 30px 70px #07191f66}.visual img{width:100%;height:100%;object-fit:cover}.visual:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,transparent 52%,#102f39cc)}
  .product{position:absolute;z-index:2;left:42px;right:42px;bottom:35px;color:white}.product strong{display:block;font-size:36px;line-height:1.35;word-break:keep-all}.price{font-size:48px;font-weight:800;color:${theme.accent};margin-top:8px}
  footer{background:${theme.panel};border-radius:25px;padding:28px 34px;display:flex;align-items:center;justify-content:space-between;gap:24px}.foot-copy{font-size:24px;line-height:1.45}.brand{font-size:29px;font-weight:900;white-space:nowrap;color:${theme.ink}}
  </style></head><body><main><header><span class="badge">${esc(media.badge)}</span><h1 class="headline">${esc(media.headline)}</h1><p class="sub">${esc(media.subheadline)}</p></header><section class="visual">${photo}<div class="product"><strong>${esc(product.name)}</strong><div class="price">${new Intl.NumberFormat('ko-KR').format(product.price || 0)}원</div></div></section><footer><span class="foot-copy">${esc(media.footer)}</span><span class="brand">D2C MARKET</span></footer></main></body></html>`;
}

export async function renderMarketingImage(product, media) {
  const executablePath = chromiumExecutable();
  if (!executablePath) throw new Error('광고 이미지를 만들 Chromium, Edge 또는 Chrome을 찾지 못했습니다.');
  const browser = await chromium.launch({ executablePath, headless:true });
  try {
    const page = await browser.newPage({ viewport:{width:1080,height:1350}, deviceScaleFactor:1 });
    await page.setContent(marketingHtml(product,media),{waitUntil:'domcontentloaded'});
    const photo = page.locator('#product-photo');
    if (await photo.count()) {
      await page.waitForFunction(()=>document.querySelector('#product-photo')?.complete,{timeout:15000}).catch(()=>{});
      const loaded = await photo.evaluate(image => image.naturalWidth > 0).catch(()=>false);
      if (!loaded) await photo.evaluate(image => image.remove()).catch(()=>{});
    }
    return await page.screenshot({type:'png'});
  } finally { await browser.close(); }
}
