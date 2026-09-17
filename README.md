# D2C Codex Workspace

Codex 데스크톱에서 여러 네이버 스마트스토어의 상품·주문을 수집하고, 마케팅 콘텐츠를 제작·검토한 뒤 Instagram·Threads·네이버 밴드에 게시하는 독립 로컬 운영 앱입니다. `local_version`과 기존 플랫폼의 소스·데이터·세션을 사용하지 않습니다.

## 실행

GitHub에서 소스를 내려받아 새 PC에 처음 설치하려면 [GitHub 등록과 다른 PC 설치 가이드](docs/new-pc-installation.md)를 따릅니다.

Node.js 24 이상과 최초 1회의 `npm install`이 필요합니다. 이후에는 `start.bat`을 실행합니다.

기본 주소: [http://127.0.0.1:4317](http://127.0.0.1:4317)

서버는 백그라운드로 실행됩니다. 실행 기록을 확인하려면 `logs.bat`을 더블클릭합니다. 서버·오류·AI·SNS worker 로그가 한 창에 표시되며 `Ctrl+C`로 로그 창만 닫을 수 있습니다.

PC 재부팅 뒤에도 같은 순서입니다. 앱이 열리면 첫 화면인 **오늘 할 일**이 저장 상태를 읽어 지금 누를 버튼을 하나씩 안내합니다.

## 반복 운영 순서

1. **오늘 할 일**의 가장 위 버튼을 확인합니다.
2. 필요하면 연결된 네이버 스토어를 전체 또는 개별 수집합니다.
3. 필요하면 **오늘의 화제**, **이번 주 화제** 또는 관심 키워드로 동향 조사를 요청합니다.
4. 동향 조사 결과에서 상품과 광고 아이디어를 선택하거나 상품 보관함에서 새 캠페인을 만듭니다.
5. 최초 한 번 **연결 · 채널 → ChatGPT로 Codex 로그인**을 완료합니다.
6. **AI 광고 제작 시작**을 누르고 화면에서 카피와 로컬 렌더링 이미지를 확인한 뒤 검토합니다.
7. 선택한 SNS별로 **로그인 → 즉시 게시 확인 → 게시 → 실제 URL 기록**을 완료합니다.

## 주요 기능

- **단계형 시작 화면**: 연결 → 수집 → 제작 → 검토 → 게시 흐름과 다음 행동 표시
- **동향 조사 대시보드**: 오늘·이번 주·키워드 조사 요청, 출처와 발행일, 상품 연결, 캠페인 전환
- **멀티 스마트스토어**: 연결별 키, 상품·주문 ID, 수집 위치, 이력 분리
- **스토어 필터**: 상품·주문·수집 이력을 전체 또는 특정 스토어로 조회
- **구독 Codex 자동 제작**: 공식 Codex SDK와 ChatGPT 로그인으로 화면에서 카피·이미지 제작
- **멀티 SNS 캠페인**: 캠페인마다 Instagram, Threads, 네이버 밴드 선택
- **Playwright 게시**: 채널별 독립 로그인 프로필과 게시 상태, 중복 실행 차단
- **검토와 증빙**: 실제 상품 확인, 수정 버전, 채널별 게시 URL과 시각 기록
- **로컬 저장**: SQLite, 이미지, 작업 파일, 내보내기, 백업

기존 `.env`에 있던 단일 네이버 연결은 0.3.0 최초 시작 시 첫 스토어로 한 번만 이관됩니다. 이후 추가한 연결의 키는 `data/d2c.sqlite`에 로컬 저장되며 화면/API 응답에 노출하지 않습니다. 기존 Instagram 로그인은 `data/instagram-profile` 경로를 유지하므로 다시 복사하거나 이관하지 않습니다.

## 문서

- [문서 안내](docs/README.md)
- [GitHub 등록과 다른 PC 설치](docs/new-pc-installation.md)
- [매일 운영 순서](docs/daily-operation.md)
- [상세 사용 설명서](docs/user-guide.md)
- [여러 네이버 스토어 연결](docs/multi-store.md)
- [SNS 채널 로그인과 게시](docs/social-channels.md)
- [Instagram 상세 설정](docs/instagram-setup.md)
- [문제 해결](docs/troubleshooting.md)
- [설정과 실행](docs/setup.md)
- [로그 확인](docs/logs.md)
- [구독 Codex AI 연결과 화면 실행](docs/ai-automation.md)
- [Codex와 CLI](docs/codex-workflow.md)
- [구조와 데이터 흐름](docs/architecture.md)
- [구현 및 검증 상태](docs/status.md)

검증 명령은 `npm run check`, `npm test`입니다. 테스트는 별도 임시 DB와 대체 네트워크 함수를 사용하며 실제 네이버 데이터나 SNS 계정을 변경하지 않습니다.
