# Codex D2C 사용 문서

`C:\dev\dev\d2c\codex_version` 0.5.0의 실행과 운영 문서입니다.

| 하고 싶은 일 | 문서 |
|---|---|
| GitHub 반영 후 다른 PC에서 처음 설치 | [GitHub 등록과 다른 PC 설치](new-pc-installation.md) |
| PC를 켠 뒤 오늘 작업 시작 | [매일 운영 순서](daily-operation.md) |
| 모든 화면과 버튼 이해 | [상세 사용 설명서](user-guide.md) |
| 스마트스토어 여러 개 추가·수집 | [여러 네이버 스토어 연결](multi-store.md) |
| Instagram·Threads·밴드 로그인·게시 | [SNS 채널 로그인과 게시](social-channels.md) |
| 백그라운드 서버·SNS 로그 확인 | [로그 확인](logs.md) |
| ChatGPT 구독으로 화면에서 AI 실행 | [구독 Codex AI 연결과 화면 실행](ai-automation.md) |
| Instagram의 검증된 게시 흐름만 상세 확인 | [Instagram 상세 설정](instagram-setup.md) |
| 앱 설치·재실행·백업 | [설정과 실행](setup.md) |
| 오류 해결 | [상황별 문제 해결](troubleshooting.md) |
| Codex 요청과 CLI 사용 | [Codex 운영 절차](codex-workflow.md) |
| 내부 구조 이해 | [구조와 데이터 흐름](architecture.md) |
| 구현·실계정 검증 범위 확인 | [구현 및 검증 상태](status.md) |

## 재부팅 후 시작

1. `C:\dev\dev\d2c\codex_version\start.bat` 실행
2. [운영 화면](http://127.0.0.1:4317) 열기
3. **오늘 할 일** 상단의 안내와 버튼 실행

화면의 **새로고침**은 이미 실행 중인 서버에서 저장 상태를 다시 읽습니다. 앱 서버를 켜거나 네이버를 수집하거나 AI 제작을 시작하지 않습니다.

## 화면 상태가 뜻하는 다음 행동

| 표시 | 다음 행동 |
|---|---|
| 판매 채널 연결 | 네이버 스토어 추가 또는 상품 직접 등록 |
| 판매 상품 가져오기 | 전체 또는 특정 스토어 수집 |
| Codex 요청 처리 | ChatGPT 로그인 후 화면의 AI 실행 버튼 선택 |
| 콘텐츠 검토 | 상품 사실 대조 후 검토 완료 |
| 채널 게시 | 각 채널 로그인·게시·주소 기록 |
| 게시 완료 · 주소 기록 필요 | 같은 채널에 재게시하지 말고 실제 URL 기록 |

Codex에 앱 실행부터 맡기려면 다음처럼 요청합니다.

> C:\dev\dev\d2c\codex_version의 AGENTS.md를 읽고 앱을 실행한 뒤 현재 상태와 오늘 할 일을 확인해줘.
