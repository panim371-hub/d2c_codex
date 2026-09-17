export const campaignOutputSchema = {
  type:'object', additionalProperties:false,
  properties:{
    caption:{type:'string',minLength:1,maxLength:2200},
    variants:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,properties:{title:{type:'string',minLength:1,maxLength:100},caption:{type:'string',minLength:1,maxLength:2200}},required:['title','caption']}},
    sources:{type:'array',maxItems:10,items:{type:'object',additionalProperties:false,properties:{title:{type:'string',minLength:1,maxLength:300},url:{type:'string'},publishedAt:{type:'string'}},required:['title','url','publishedAt']}},
    media:{type:'object',additionalProperties:false,properties:{headline:{type:'string',minLength:1,maxLength:60},subheadline:{type:'string',minLength:1,maxLength:100},badge:{type:'string',minLength:1,maxLength:30},footer:{type:'string',minLength:1,maxLength:80},theme:{type:'string',enum:['ocean','sunset','forest','clean']}},required:['headline','subheadline','badge','footer','theme']},
  }, required:['caption','variants','sources','media'],
};

export const trendOutputSchema = {
  type:'object', additionalProperties:false,
  properties:{
    summary:{type:'string',minLength:1,maxLength:6000},
    items:{type:'array',minItems:1,maxItems:12,items:{type:'object',additionalProperties:false,properties:{
      title:{type:'string',minLength:1,maxLength:300},summary:{type:'string',minLength:1,maxLength:2000},score:{type:'integer',minimum:0,maximum:100},
      sources:{type:'array',minItems:1,maxItems:5,items:{type:'object',additionalProperties:false,properties:{title:{type:'string',minLength:1,maxLength:300},url:{type:'string'},publishedAt:{type:'string',minLength:1,maxLength:100}},required:['title','url','publishedAt']}},
      whyRelevant:{type:'string',minLength:1,maxLength:2000},productIds:{type:'array',maxItems:5,items:{type:'string'}},campaignAngle:{type:'string',minLength:1,maxLength:2000},
      channels:{type:'array',items:{type:'string',enum:['instagram','threads','band']}},validUntil:{type:'string',maxLength:100},cautions:{type:'string',maxLength:1000},
    },required:['title','summary','score','sources','whyRelevant','productIds','campaignAngle','channels','validUntil','cautions']}},
  },required:['summary','items'],
};

export function buildCampaignPrompt(brief) {
  const product = brief.product;
  const safeBrief = {
    campaignId:brief.campaignId,revision:brief.revision,title:brief.title,direction:brief.brief,currentCaption:brief.currentCaption,targetChannels:brief.targetChannels,
    product:{id:product.id,name:product.name,price:product.price,stock:product.stock,facts:product.facts,productUrl:product.productUrl,imageUrl:product.imageUrl,storeName:product.storeName,source:product.source},
  };
  return `당신은 한국 D2C 마케팅 편집자입니다. 아래 검증된 입력만 사용해 SNS 광고 카피와 로컬 이미지 템플릿용 문구를 만드세요. 입력에 없는 할인, 배송일, 원산지, 효능, 한정 수량은 만들지 마세요. caption은 해시태그를 포함한 완성 본문이어야 합니다. targetChannels에 threads가 있으면 caption과 모든 variant caption을 각각 500자 이하로 작성하세요. variants는 서로 다른 관점의 대안입니다. sources는 실제 참고 URL이 입력에 명시된 경우에만 포함하고 그 외에는 빈 배열로 두세요. media 문구는 이미지 안에서 읽기 쉽게 짧게 쓰세요. 결과는 지정된 JSON 스키마로만 반환하세요.\n\n${JSON.stringify(safeBrief,null,2)}`;
}

export function buildTrendPrompt(brief) {
  const safeBrief = { request:brief.request, products:brief.products };
  return `오늘 날짜는 ${new Date().toISOString().slice(0,10)}입니다. 한국 소비자와 식품·생활 쇼핑 동향을 웹에서 조사하고 아래 판매 상품에 연결할 수 있는 광고 기회를 찾으세요. 각 항목은 실제로 확인한 출처 URL과 발행일을 포함해야 합니다. 뉴스 사실과 상품 사실을 구분하고, 사건·재난·정치 갈등·검증되지 않은 건강 주장은 광고 소재로 연결하지 마세요. productIds에는 입력에 있는 실제 판매 상품 ID만 쓰세요. 오늘의 화제는 최근 48시간, 이번 주 화제는 최근 7일 자료를 우선하고 키워드 조사는 요청 키워드와 직접 관련된 최신 자료를 우선하세요. 결과는 지정된 JSON 스키마로만 반환하세요.\n\n${JSON.stringify(safeBrief,null,2)}`;
}
