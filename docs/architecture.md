# 구조와 데이터 흐름

## 경계

코드·문서·운영 데이터는 `codex_version` 안에서만 관리합니다. `local_version`과 기존 플랫폼의 DB·키·세션을 런타임에 읽지 않습니다. 다른 버전은 분석 대상에서도 제외합니다.

## 전체 구조

```text
로컬 UI ── 127.0.0.1 HTTP ───────────┬─ Store ── data/d2c.sqlite
                                      │          ├─ data/assets
Codex SDK worker ── ChatGPT 로그인 ──┤          ├─ data/work
       ├─ 실시간 웹 동향 조사         │          └─ data/exports
       └─ 카피 + 로컬 PNG 렌더링      │
네이버 연결 1..N ── NaverClient ─────┤
                                      │
SNS 채널 1..N ── Social task ── Playwright
                         ├─ Instagram profile/status
                         ├─ Threads profile/status
                         └─ Band profile/status + target URL
```

## 모듈

- `src/store.mjs`: 범용 레코드 저장, 동향 요청·결과, 네이버 연결, SNS 설정, 상품·주문·캠페인·게시 기록, 이벤트, 잠금, 백업
- `src/naver.mjs`: 네이버 인증, 상품 전체 페이지, 주문 증분 수집, 스토어별 정규화
- `src/social.mjs`: 채널 정의, 채널별 worker 상태, 재부팅 중단 감지, worker 실행
- `src/ai.mjs`: Codex 인증 판별, 비밀정보를 제외한 실행 환경, AI 상태와 worker 시작
- `src/ai-task.mjs`: 캠페인·동향 구조화 출력 스키마와 프롬프트
- `src/marketing-image.mjs`: 상품 사진과 AI 문구를 1080×1350 PNG로 로컬 렌더링
- `scripts/ai-worker.mjs`: 공식 Codex SDK 실행, 결과 검증·적용과 진행 상태 기록
- `src/instagram.mjs`: 0.2.x 호출과 테스트를 위한 Instagram 호환 facade
- `scripts/social-worker.mjs`: 공통 브라우저 실행과 Instagram·Threads·밴드 게시 어댑터
- `scripts/launch-social-browser.ps1`: 채널별 CDP 포트와 사용자 데이터 폴더로 브라우저 실행
- `scripts/logs.ps1`, `logs.bat`: 백그라운드 서버와 채널별 worker 로그를 출처 표시와 함께 실시간 조회
- `src/assets.mjs`: 이미지 검증·저장, Codex brief, 게시 파일 내보내기
- `src/server.mjs`: 로컬 UI/API, 여러 연결 조정, 비밀정보 제거
- `src/cli.mjs`: 동일한 Store와 네이버 수집 로직을 사용하는 명령 인터페이스
- `public/app.js`: 상태 조회, 화면 전환, 폼 제출과 공통 사용자 이벤트를 연결하는 진입점
- `public/js/ui.js`: 이스케이프, 날짜·금액·상태 표시와 채널 공통 함수
- `public/js/dashboard.js`: 오늘 할 일, 동향 레이더, 작업 우선순위
- `public/js/studio.js`: 캠페인 편집, 검토, 채널별 게시와 결과 기록
- `public/js/catalog.js`: 상품, 주문, 수집 이력과 스토어 필터
- `public/js/connections.js`: 네이버 멀티 스토어와 SNS 연결 설정
- `public/css/base.css`: 레이아웃, 공통 컴포넌트와 편집 화면 기반 스타일
- `public/css/operations.css`: 연결, 채널, 캠페인 게시 상태 스타일
- `public/css/dashboard.css`: 동향과 작업 대시보드 스타일
- `public/css/responsive.css`: 화면 크기별 레이아웃 규칙

`public/styles.css`는 위 CSS 모듈을 불러오고, `src/server.mjs`는 명시한 정적 파일만 제공합니다. 새 화면 모듈을 추가할 때는 서버 허용 목록과 `scripts/check.mjs`의 재귀 구문 검사를 함께 통과해야 합니다.

## 네이버 멀티 스토어

연결은 `naver-store` 레코드로 저장합니다. 각 레코드는 `storeId`, 이름, Client ID, Client Secret, 사용 여부를 가집니다. API 상태 응답은 별도의 summary를 만들어 Client ID와 Client Secret을 제거합니다.

기존 `.env` 연결은 DB에 `naver-store`가 하나도 없을 때만 이관합니다. 이관 뒤 추가 스토어는 DB에 저장합니다. `.env`의 `PORT`와 기존 값은 호환 입력으로 남습니다.

상품과 주문의 내부 ID, `meta` 체크포인트, 수집 lease, run 기록은 `storeId`를 포함합니다. 전체 수집은 사용 중인 연결을 순서대로 실행합니다. 여러 연결일 때 실패를 모아 207 응답으로 반환하므로 성공한 다른 연결 결과를 잃지 않습니다.

## 주문 수집 신뢰성

1. 스토어별 lease를 얻고 요청·커밋 전에 갱신합니다.
2. 첫 실행은 최근 24시간, 이후에는 마지막 성공 시각보다 1분 앞에서 재개합니다.
3. 기간을 24시간보다 짧은 구간으로 나눕니다.
4. `moreFrom`과 `moreSequence`로 변경 주문을 끝까지 조회합니다.
5. 상세 조회는 300개씩 나누고 모든 ID가 돌아왔는지 확인합니다.
6. 한 구간의 결과와 체크포인트를 같은 트랜잭션으로 저장합니다.
7. 주문 수령인·전화·주소·원본 응답은 저장하지 않습니다.

## 캠페인과 멀티 채널 게시

캠페인은 `targetChannels`와 `publications`를 가집니다.

```text
DRAFT ── 사실 검토 ── READY ── 채널별 URL 기록 ── PUBLISHED
                           └─ 일부 채널만 기록하면 READY 유지
```

각 publication은 `channel`, 정규화된 실제 URL, `publishedAt`, `verification`을 저장합니다. 선택한 모든 채널의 기록이 있어야 `PUBLISHED`가 됩니다. 첫 publication이 생긴 뒤에는 게시된 콘텐츠와 저장 확정본이 달라지지 않도록 편집을 막습니다.

기존 `postUrl` 기반 캠페인은 시작 시 Instagram publication으로 이관합니다. `postUrl`과 `publishedAt`은 이전 호출 호환을 위해 Instagram 기록에 한해 계속 채웁니다.

## Playwright 채널 어댑터

세 채널은 공통 상태 `STARTING → OPENING_BROWSER → WAITING_LOGIN | PREPARING → PUBLISHING → COMPLETED | FAILED`를 사용합니다. 활성 PID가 사라지면 `INTERRUPTED`로 읽습니다. 게시 요청에는 검토 완료 revision, 선택 채널, 명시적 즉시 게시 확인이 필요합니다. 같은 캠페인·revision·채널에서 웹 완료가 확인된 뒤에는 URL 기록 전 재게시를 막습니다.

| 채널 | 프로필 | CDP 포트 | 대상 |
|---|---|---:|---|
| Instagram | `data/instagram-profile` | 9333 | Instagram 홈 |
| Threads | `data/threads-profile` | 9334 | Threads 홈 |
| Band | `data/band-profile` | 9335 | 저장한 Band 홈 URL |

worker는 브라우저의 게시 완료 표시나 작성기 종료를 확인하지만 실제 URL을 추측하지 않습니다. 운영자가 실제 게시물을 확인해 주소를 기록합니다. 외부 UI 변경으로 결과가 불명확하면 자동 재시도하지 않습니다.

## AI 작업과 동향 조사 큐

로컬 UI는 `/api/ai/run`으로 분리된 worker를 시작합니다. worker는 공식 Codex SDK가 감싼 CLI의 ChatGPT 로그인을 사용하며 네이버 비밀키, API 키, SNS 쿠키를 환경에서 제외합니다. 한 번에 한 작업만 실행하고 `data/ai-status.json`에 `STARTING`, `RESEARCHING`/`GENERATING`, `RENDERING`, `APPLYING`, `COMPLETED` 또는 `FAILED`를 기록합니다. PC 재부팅 뒤 살아 있지 않은 PID는 `INTERRUPTED`로 판정합니다.

`trend` 레코드는 `PENDING → COMPLETED` 상태와 revision을 가지며, worker가 read-only 작업 디렉터리에서 실시간 웹 검색 결과를 생성해 Store에 적용합니다. 결과에는 출처 URL·발행일, 상품 연관 이유, 실제 상품 ID, 캠페인 방향, 채널, 활용 기간, 주의 사항이 저장됩니다.

동일한 기간과 키워드의 대기 요청은 중복 생성하지 않습니다. 적용 시 요청 revision, 출처 수, URL, 상품 ID를 검증해 오래된 조사나 존재하지 않는 상품 연결이 저장되는 것을 막습니다. 대시보드의 캠페인 버튼은 결과를 바로 게시하지 않고 새 캠페인 양식에 근거와 제작 방향을 채웁니다.

## 운영 대시보드 UI

기본 route의 첫 view는 **오늘 할 일**입니다. 저장 상태에서 다음 우선순위를 계산합니다.

1. 브라우저 게시 완료 뒤 URL 미기록
2. 대기 중 Codex 제작 요청
3. 대기 중 Codex 동향 조사
4. 검토 완료 캠페인의 채널 게시
5. 콘텐츠 사실 검토와 제작 중 캠페인
6. 연결·수집·새 캠페인

상단에는 연결 스토어, 판매 상품, Codex 대기 요청, 게시 대기 수를 표시합니다. 동향 레이더는 오늘·이번 주·키워드 요청과 최신 결과를 보여주며, 오늘의 작업은 실제 미처리 항목만 모읍니다. 상품·주문·run은 스토어 필터를 공유합니다. 캠페인은 생성 시 채널을 선택하고, 검토 후 채널별 독립 게시 카드를 보여줍니다.

화면 HTML 생성은 화면별 모듈이 담당하고 `app.js`는 상태와 이벤트만 조정합니다. 따라서 대시보드 수정은 `dashboard.js`와 `dashboard.css`, 캠페인 수정은 `studio.js`와 관련 CSS를 중심으로 확인할 수 있습니다.

## 로컬 보안 경계

서버는 `127.0.0.1`에만 바인딩하고 Host·Origin·Sec-Fetch-Site와 실행별 변경 토큰을 검사합니다. `.env`, SQLite, 작업 JSON, 브라우저 프로필은 HTTP로 제공하지 않습니다. 네이버 키는 상태 API에 포함하지 않습니다. 비밀번호·MFA는 SNS 화면에서만 입력합니다.

이 앱은 단일 Windows 사용자용입니다. OS 사용자나 디스크에 접근할 수 있는 사람을 분리하는 자체 로그인·DB 암호화·원격 다중 사용자 권한은 제공하지 않습니다.
