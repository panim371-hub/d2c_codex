# Codex 운영 절차

운영자가 화면을 따라 사용할 때는 [상세 사용 설명서](user-guide.md)를 먼저 읽습니다. 아래 명령·JSON은 Codex 또는 터미널 작업자를 위한 참고입니다.

## UI 자동 실행과 수동 처리

- **AI 광고 제작 시작**은 현재 편집을 저장하고 제작 요청을 등록한 뒤 공식 Codex SDK worker를 실행합니다.
- **동향 조사 요청**은 기간이나 키워드를 저장하고 ChatGPT 로그인이 준비돼 있으면 실시간 웹 조사를 연속 실행합니다.
- **수동 처리 문장 복사**는 구독 사용량 제한이나 SDK 장애 때 Codex 채팅에서 처리하기 위한 예비 기능입니다.
- 자동 실행은 Codex CLI의 ChatGPT 로그인을 사용합니다. API 키 로그인은 별도 요금 가능성 때문에 서버에서 차단합니다.
- 대기 요청이 없으면 결과가 이미 있는지와 요청 자체가 없는지를 구분합니다. `DRAFT`는 검토 전 상태이며 생성 작업이 실행 중이라는 뜻이 아닙니다.
- 요청 후 편집한 경우 이전 버전의 요청은 무효화될 수 있습니다. 최신 brief와 revision을 확인합니다.

## 시작 문장

> codex_version/AGENTS.md를 읽고 오늘 상품·주문 수집 현황, 대기 중인 동향 조사와 마케팅 요청을 확인해줘.

이 프로젝트를 Codex에서 열거나 위 경로를 지정하면, 소스와 저장된 데이터에서 업무를 이어갈 수 있습니다. 이 문서와 스킬을 전역 설치할 필요는 없습니다.

## 조회

`codex_version`을 작업 디렉터리로 사용합니다.

```powershell
node src/cli.mjs status
node src/cli.mjs naver-stores
node src/cli.mjs products
node src/cli.mjs orders
node src/cli.mjs jobs
node src/cli.mjs trend list
node src/cli.mjs campaign list
node src/cli.mjs campaign brief <캠페인ID>
```

상품과 주문을 다시 수집하라는 요청이 있을 때 `sync`를 실행합니다. 마케팅 질문마다 외부 API 전체 수집을 반복할 필요는 없습니다. orders는 개인정보 없는 상품 주문 요약이며 변경 주문 건수를 신규 매출로 해석하지 않습니다.

여러 스토어 전체 또는 특정 연결을 수집할 수 있습니다.

```powershell
node src/cli.mjs sync all
node src/cli.mjs sync products --store <스토어식별자>
node src/cli.mjs sync orders --store <스토어식별자>
```

## 동향 조사 적용

UI에서 오늘·이번 주·키워드 조사를 요청할 수 있습니다. CLI에서는 다음 순서로 대기 요청과 현재 판매 상품을 읽습니다.

```powershell
node src/cli.mjs trend list
node src/cli.mjs trend brief <동향요청ID>
```

Codex는 요청 시각을 기준으로 웹을 검색하고 각 근거의 URL과 발행일을 확인합니다. 정치·사건·재난처럼 상품 광고에 부적절하거나 오해를 만들 수 있는 이슈는 광고 기회로 억지 연결하지 않고 주의 사항에 기록합니다.

결과 파일 예시 구조:

```json
{
  "revision": 1,
  "summary": "확인된 최근 동향과 상품 활용 가능성을 요약합니다.",
  "items": [
    {
      "title": "확인된 동향 제목",
      "summary": "여러 출처에서 확인한 핵심 내용",
      "score": 82,
      "sources": [
        {
          "title": "실제 출처 제목",
          "url": "https://example.com/actual-article",
          "publishedAt": "2026-09-13"
        }
      ],
      "whyRelevant": "현재 판매 상품과 연결되는 구체적인 이유",
      "productIds": ["brief에 포함된 실제 상품 ID"],
      "campaignAngle": "과장 없이 활용할 광고 방향",
      "channels": ["instagram", "threads"],
      "validUntil": "2026-09-20",
      "cautions": "뉴스의 수치나 주장을 상품 효능으로 표현하지 않음"
    }
  ]
}
```

`items`는 1~12개, 각 항목의 출처는 1~5개입니다. 출처 URL과 발행일이 반드시 필요하고 상품 ID는 brief에 있는 실제 상품만 사용할 수 있습니다.

```powershell
node src/cli.mjs trend apply <동향요청ID> --file data/work/<동향요청ID>/result.json
```

적용이 끝나면 앱을 새로고침합니다. **이 아이디어로 캠페인 만들기**는 동향, 출처, 광고 방향, 주의 사항을 캠페인 제작 방향에 채웁니다. 최종 카피는 별도의 제작 요청과 상품 사실 검토를 거칩니다.

## 카피·이미지 적용

1. `campaign brief`가 반환한 상품과 현재 버전, 제작 방향을 읽습니다.
2. 자동 worker 또는 Codex 대화에서 실제 카피를 작성합니다. 자동 worker는 상품 사실만 사용하고 게시 이미지는 로컬 템플릿으로 렌더링합니다.
3. 이미지와 결과 JSON을 `data/work/<캠페인ID>/`에 저장합니다. 아래 예시는 **형식 설명**이며 실제 캠페인에는 실제 제작 결과를 입력합니다.

```json
{
  "revision": 1,
  "caption": "실제 상품 사실에 근거해 작성한 최종 후보 본문",
  "variants": [
    { "title": "후보 1", "caption": "실제로 작성한 첫 번째 문구" },
    { "title": "후보 2", "caption": "실제로 작성한 두 번째 문구" }
  ],
  "sources": [],
  "imagePath": "C:/dev/dev/d2c/codex_version/data/work/캠페인ID/banner.png"
}
```

이미지 없이 카피만 적용할 때는 `imagePath`를 생략합니다. 출처를 사용했다면 `sources`에 `title`, `url`, `publishedAt`을 넣습니다. 현재 계정·지역에서 이미지 도구가 없거나 한도에 걸리면 미완료 항목을 설명합니다.

```powershell
node src/cli.mjs campaign apply <캠페인ID> --file data/work/<캠페인ID>/result.json
```

실제 결과 적용 후에만 일치하는 제작 요청이 완료됩니다. 앱을 새로고침하면 시안과 이미지가 나타납니다. 사용자는 시안 버튼으로 본문을 선택하거나 직접 수정하고 저장할 수 있습니다. 화면은 편집 중인 내용을 자동으로 덮어쓰지 않도록 자동 새로고침하지 않습니다.

일반 `src/cli.mjs` 명령은 AI를 호출하지 않고 결과를 검증·저장합니다. 화면 자동 실행은 별도 `scripts/ai-worker.mjs`가 `@openai/codex-sdk`를 호출합니다. 구독 로그인, 상태, 로그와 복구 절차는 [AI 자동화 문서](ai-automation.md)를 참고합니다.

## 새 상품·캠페인

UI에서 만드는 것이 가장 간단합니다. 사용자가 대화로 요청하면 CLI도 같은 동작을 지원합니다.

상품 JSON: `name`, `price`, 선택적으로 `stock`, `facts`, `imageUrl`, `productUrl`. 필수 사실을 모르면 추정하지 않습니다.

```powershell
node src/cli.mjs product save --file data/work/product.json
```

캠페인 JSON: `productId`, `title`, `brief`, `targetChannels`. 채널 값은 `instagram`, `threads`, `band`입니다.

```powershell
node src/cli.mjs campaign create --file data/work/campaign.json
```

기존 `local_version`의 데이터와 키는 자동 가져오기 대상이 아닙니다. 별도 이관 요청이 있을 때만 필요한 상품 정보를 선별합니다.

## 검토와 게시 지원

검토할 본문·이미지가 저장된 상태에서 실제 상품과 일치하는지 확인합니다. 사용자 요청에 따른 확인을 마쳤다면 검토 payload를 적용할 수 있습니다.

```json
{ "revision": 2, "confirmed": true }
```

```powershell
node src/cli.mjs campaign review <캠페인ID> --file data/work/review.json
node src/cli.mjs campaign export <캠페인ID>
```

내보내기는 파일 준비이며 SNS 게시를 수행하지 않습니다. 앱의 Playwright 작업은 채널별 전용 세션을 사용합니다. 로그인·MFA는 사용자가 열린 전용 브라우저에서 직접 수행합니다.

검토 완료된 최신 revision에서 사용자가 채널별 즉시 게시 확인란을 체크해야 worker가 시작합니다. 작업 완료는 해당 웹 화면의 완료 상태를 확인했다는 뜻이며, 실제 게시물과 주소를 확인한 다음 아래 기록 명령을 사용합니다. 실패하거나 결과가 불명확하면 계정을 먼저 확인하고 재발행하지 않습니다.

실제 결과를 확인한 뒤 기록할 JSON:

```json
{
  "revision": 3,
  "confirmed": true,
  "channel": "instagram",
  "postUrl": "https://www.instagram.com/p/실제로확인한shortcode/"
}
```

```powershell
node src/cli.mjs campaign record-published <캠페인ID> --file data/work/published.json
```

예시 URL은 실제 게시 주소로 교체해야 합니다. 공급자가 반환한 숫자 ID로 게시 URL을 조합하지 않습니다. 기록은 사람이거나 Codex가 확인했다는 진술이며 백엔드의 자동 Meta 검증이 아닙니다.

채널마다 위 JSON의 `channel`과 실제 URL을 바꿔 반복합니다. 일부 채널만 기록하면 캠페인은 `READY`로 유지되고 선택한 모든 채널을 기록하면 `PUBLISHED`가 됩니다.

브라우저 업로드가 불가능하면 내보낸 파일과 복사 본문을 제공하고 수동 게시 후 실제 URL을 기록합니다. 현재 이 버전에는 Meta·BAND 공식 API 토큰 방식이 포함되지 않습니다.
