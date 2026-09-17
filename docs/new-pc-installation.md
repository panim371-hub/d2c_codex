# GitHub 등록과 다른 PC의 처음 설치

[문서 목록](README.md) · [설정과 실행](setup.md) · [매일 운영 순서](daily-operation.md)

대상: Windows의 새 PC에 소스를 내려받고, 상품·캠페인·계정 연결을 처음부터 설정하려는 운영자.

이 문서의 배포 저장소는 전용 독립 저장소인 `https://github.com/panim371-hub/d2c_codex.git`입니다. 앱 루트 디렉터리 자체가 프로젝트 최상위로 관리됩니다. 아래 A단계의 GitHub 등록이 완료된 뒤 B단계의 새 PC 설치를 진행합니다.

## 전체 순서

| 단계 | 실행할 PC | 완료 기준 |
|---|---|---|
| A. 소스와 설치 문서 GitHub 반영 | 현재 개발 PC | main에서 `codex_version/package-lock.json`, `docs`와 실행 파일 확인 |
| B. 기본 프로그램과 소스 설치 | 새 PC | Node.js 24 이상, Git, Chrome/Edge, `npm ci` 완료 |
| C. 로컬 앱 시작 | 새 PC | localhost 화면 열림, 운영 데이터는 빈 상태 |
| D. AI·스토어·SNS 최초 연결 | 새 PC | ChatGPT 로그인, 네이버 수집, 채널 로그인 완료 |
| E. 첫 캠페인 검증 | 새 PC | 조사 → 제작 → 검토 → 게시 → 실제 주소 기록 |

## A. 현재 PC에서 GitHub 반영하기

### 1. 업로드 범위

포함할 항목: `src`, `scripts`, `public`, `docs`, `test`, `skills`, `package.json`, `package-lock.json`, `README.md`, `AGENTS.md`, `.gitignore`, `.env.example`, `start.bat`, `stop.bat`, `logs.bat`.

포함하지 않을 항목:

- `data/` 전체: 실제 연결 키가 들어 있는 SQLite DB, 상품·캠페인, 이미지, 백업, SNS 브라우저 세션과 로그
- `.env`: 실제 네이버 키나 PC별 설정
- `node_modules/`, `.npm-cache/`, `.test-output/`, `*.log`
- ChatGPT/Codex 사용자 인증 파일과 브라우저 쿠키

위 제외 항목은 앱의 `.gitignore`에 등록돼 있습니다. GitHub에는 설치 가능한 소스와 문서만 올립니다. 새 PC의 운영 계정은 화면에서 다시 로그인하고 네이버 키는 직접 등록합니다.

### 2. 별도 배포 작업 폴더 준비

현재 루트 저장소에는 다른 프로젝트의 변경도 있으므로, 별도 clone에서 `codex_version`만 반영하면 관련 없는 변경이나 미게시 커밋이 섞이지 않습니다. 아래 경로는 아직 존재하지 않는 새 작업 폴더를 사용합니다.

```powershell
New-Item -ItemType Directory -Path 'C:\dev' -Force | Out-Null
git clone https://github.com/k-googler/d2c.git C:\dev\d2c-publish
Set-Location -LiteralPath 'C:\dev\d2c-publish'
git switch -c codex/pc-installation
```

저장소에 접근 권한이 필요하면 GitHub 인증을 완료합니다. 계정 토큰을 clone 주소나 문서에 넣지 않습니다.

### 3. 소스만 복사

기존 운영 폴더 전체를 복사하는 대신 위의 포함 항목만 복사합니다. 이 명령은 현재 개발 경로가 `C:\dev\dev\d2c\codex_version`인 경우의 예입니다.

```powershell
$sourcePath = 'C:\dev\dev\d2c\codex_version'
$publishPath = 'C:\dev\d2c-publish\codex_version'
New-Item -ItemType Directory -Path $publishPath -Force | Out-Null
$sourceItems = @(
  'src', 'scripts', 'public', 'docs', 'test', 'skills',
  'package.json', 'package-lock.json', 'README.md', 'AGENTS.md',
  '.gitignore', '.env.example', 'start.bat', 'stop.bat', 'logs.bat'
)
foreach ($item in $sourceItems) {
  Copy-Item -LiteralPath (Join-Path $sourcePath $item) -Destination $publishPath -Recurse -Force
}
```

### 4. 설치와 검사

```powershell
Set-Location -LiteralPath 'C:\dev\d2c-publish\codex_version'
npm ci
npm run check
npm test
```

Chrome 또는 Edge가 설치된 환경에서 검사합니다. 테스트는 임시 저장소를 사용하고 실제 네이버 수집이나 SNS 발행을 실행하지 않습니다.

### 5. 포함 파일 검토와 커밋

```powershell
Set-Location -LiteralPath 'C:\dev\d2c-publish'
git add -- codex_version
git diff --cached --name-only
git diff --cached --check
```

목록의 모든 경로가 `codex_version/` 아래인지 확인합니다. `data`, `.env`, `node_modules`, `.test-output`이 있으면 커밋하기 전에 제외 원인을 해결합니다. `.env.example`과 `package-lock.json`은 포함돼야 합니다. 코드·문서에 실제 키가 직접 작성돼 있지 않은지도 검토합니다.

이름·이메일 설정을 요구하면 이 저장소에서만 본인의 값으로 `git config user.name`, `git config user.email`을 설정합니다.

```powershell
git commit -m "Add Codex D2C workspace and Windows installation guide"
git push -u origin codex/pc-installation
```

### 6. GitHub에서 병합과 설치 기준 확인

1. GitHub에서 `codex/pc-installation` → `main` Pull Request를 만듭니다.
2. 변경 파일이 `codex_version` 범위인지 확인하고 main에 병합합니다.
3. GitHub의 main에서 `codex_version/README.md`, 이 설치 문서, `package-lock.json`, `start.bat`이 보이는지 확인합니다.
4. 설치 기준 커밋을 기록합니다. main에 병합되기 전에는 새 PC의 main clone에 앱이 나타나지 않습니다.

전용 저장소를 새로 만들 계획이라면 업로드 내용은 동일하지만 clone URL과 앱 루트 경로를 변경해야 합니다. 이 문서의 명령은 기존 `k-googler/d2c` 저장소를 기준으로 합니다.

## B. 새 PC 기본 설치와 GitHub 다운로드

### 1. 준비할 프로그램과 계정

| 항목 | 필수 여부와 용도 |
|---|---|
| Windows 10/11, 일반 사용자 데스크톱 세션 | 배치 실행, SNS 로그인 브라우저 |
| [Node.js 공식 다운로드](https://nodejs.org/en/download) | 필수. Node.js 24 이상과 함께 설치되는 npm 사용 |
| [Git for Windows](https://git-scm.com/install/windows) | 필수. GitHub 다운로드와 이후 업데이트 |
| Chrome 또는 Edge | 필수. Playwright SNS 게시와 광고 PNG 렌더링 |
| GitHub 저장소 접근 계정 | 비공개 저장소를 clone할 때 필요 |
| ChatGPT의 Codex 사용 가능 계정 | 화면에서 AI 조사·제작을 실행할 때 필요 |
| 네이버 커머스 API 키 | 각 스마트스토어 수집에 필요 |
| SNS 계정, 밴드 게시 권한 | 사용할 채널마다 필요 |

이 앱의 설치에는 Firebase 배포, Cloud NAT, Python, 전역 Codex CLI 설치가 필요하지 않습니다. 프로젝트 의존성이 Codex SDK와 실행 CLI를 설치합니다. Codex 데스크톱은 소스 수정이나 대화로 유지보수할 때 선택적으로 사용합니다.

프로그램 설치 뒤 PowerShell을 새로 열어 PATH를 반영하고 확인합니다.

```powershell
git --version
node --version
npm --version
```

`node --version`이 `v24` 이상인지 확인합니다.

### 2. 소스 내려받기

아래 예는 새 PC에 `C:\dev\d2c_codex`로 clone하는 방식입니다. 현재 PC와 똑같은 폴더 경로일 필요는 없습니다. 런처와 서버는 자신의 설치 위치를 기준으로 경로를 계산합니다.

```powershell
New-Item -ItemType Directory -Path 'C:\dev' -Force | Out-Null
git clone https://github.com/panim371-hub/d2c_codex.git C:\dev\d2c_codex
Set-Location -LiteralPath 'C:\dev\d2c_codex'
Get-Item README.md, package.json, package-lock.json, start.bat
```

`C:\dev\d2c_codex`는 기존 파일이 없는 새 경로를 사용합니다. 저장소를 clone하면 프로젝트 루트에서 바로 `npm ci` 및 `start.bat`을 실행할 수 있습니다. GitHub의 [공식 clone 절차](https://docs.github.com/en/repositories/creating-and-managing-repositories/cloning-a-repository)에서도 저장소의 Code 메뉴로 HTTPS 주소를 복사할 수 있습니다.

### 3. 의존성 설치와 검사

```powershell
Set-Location -LiteralPath 'C:\dev\d2c\codex_version'
npm ci
npm run check
npm test
```

`npm ci`는 GitHub에 포함한 lock 파일을 기준으로 의존성을 설치합니다. 현재 0.5.0 기준 자동 테스트는 38개이며 향후 버전에 따라 수는 달라질 수 있습니다. 검사 오류가 있으면 앱 설정 전에 해결합니다.

PowerShell이 `npm.ps1` 실행 정책 오류를 내면 `npm.cmd ci`, `npm.cmd run check`, `npm.cmd test`를 사용합니다. 시스템 전체 실행 정책을 바꿀 필요는 없습니다.

## C. 새 PC에서 앱 처음 시작

1. Windows 탐색기에서 `C:\dev\d2c\codex_version`을 엽니다.
2. 그 폴더의 `start.bat`을 더블클릭합니다.
3. [http://127.0.0.1:4317](http://127.0.0.1:4317)이 열리는지 확인합니다.
4. 자동으로 열리지 않으면 주소를 브라우저에 직접 입력합니다.
5. 연결 스토어·판매 상품·캠페인이 빈 상태인지 확인합니다.

`data`와 DB는 앱이 자동 생성합니다. 처음부터 설정하므로 기존 PC의 `data`, `.env`, SNS 프로필을 복사하지 않습니다. 기본값을 사용한다면 `.env`도 만들 필요가 없습니다. 다른 포트가 필요할 때만 `.env.example`을 `.env`로 복사하고 `PORT`를 바꾼 뒤 다시 실행합니다.

실제 운영은 탐색기에서 실행한 `start.bat`을 사용합니다. 제한된 에이전트 터미널에서 실행된 서버는 AI/SNS worker의 외부 네트워크 접속이 차단될 수 있습니다. 화면은 PC 내부 `127.0.0.1`에서만 사용합니다.

## D. AI·네이버·SNS 처음 연결

### 1. 구독 Codex AI

**연결 · 채널 → 구독 Codex AI → ChatGPT로 Codex 로그인**을 누르고 브라우저 인증을 완료합니다. 기존 인증이 감지돼 **구독 AI 연결**이 보이면 다시 로그인하지 않아도 됩니다. **상태 다시 확인**으로 결과를 확인합니다.

API 키 로그인은 이 앱이 자동 작업에서 차단합니다. 자세한 절차와 복구 명령은 [AI 자동화 문서](ai-automation.md)를 따릅니다. GitHub 로그인, ChatGPT 로그인, SNS 로그인은 각각 별도의 연결입니다.

### 2. 네이버 스마트스토어

1. **연결 · 채널 → 네이버 스토어 추가**를 누릅니다.
2. 스토어 이름·식별자·해당 스토어의 Client ID와 Client Secret을 저장합니다.
3. [네이버 커머스 API 센터](https://apicenter.commerce.naver.com/)에서 새 PC가 사용하는 인터넷 출구의 공인 IP를 확인해 호출 허용 IP에 등록합니다.
4. **지금 수집**을 누르고 실제 판매 상품과 마지막 수집 성공 시각을 확인합니다.
5. 스토어가 여러 개면 연결별로 반복합니다.

PC를 바꿔도 같은 인터넷 공유기를 사용하면 외부 IP가 같을 수 있습니다. 반대로 핫스팟·VPN·다른 장소를 사용하면 달라질 수 있으므로 실제 출구 IP를 대조합니다. 네이버 키를 저장한 것만으로 연결이 성공한 것은 아닙니다.

새 DB에는 과거 주문 체크포인트가 없습니다. 최초 주문 수집은 최근 24시간의 변경 내역부터 시작하므로 기존 PC의 누적 주문 이력이 자동 복원되지 않습니다. 과거 조회가 필요하면 [설정 문서](setup.md)의 날짜 지정 명령을 확인합니다.

### 3. SNS 채널

사용할 Instagram·Threads·네이버 밴드마다 **전용 브라우저 로그인**을 누르고 열린 브라우저에서 로그인·추가 인증을 완료합니다. 평소 Chrome에서 로그인돼 있어도 앱의 채널별 전용 프로필은 별도로 로그인해야 합니다.

밴드를 사용하면 게시 권한이 있는 대상 홈 주소 `https://band.us/band/숫자`도 저장합니다. 로그인 완료 전에는 새 캠페인의 해당 채널 체크박스가 비활성화됩니다.

구체적인 채널별 절차는 [SNS 채널 로그인과 게시](social-channels.md)를 따릅니다. 기존 PC의 쿠키나 전용 프로필을 복사해 인증을 대체하지 않습니다.

## E. 한 번의 전체 동작 검증

1. **오늘 할 일**에서 오늘·이번 주·키워드 조사 중 한 건을 실행합니다.
2. 조사 결과의 출처·발행일·상품 연결이 표시되는지 확인합니다.
3. 판매 상품 또는 동향 아이디어로 새 캠페인을 만듭니다.
4. 로그인 완료 채널만 선택되는지 확인합니다.
5. **AI 광고 제작 시작**으로 본문·시안·PNG가 저장되는지 확인합니다.
6. 실제 가격·구성·사진을 대조하고 **검토 완료로 표시**합니다.
7. 실제로 게시할 콘텐츠라면 계정과 내용을 확인하고 즉시 게시 확인란을 체크한 뒤 채널별로 한 번씩 게시합니다.
8. 실제 게시물을 열어 URL을 기록합니다. Threads는 `/@계정/post/코드/`와 `/share/코드/`를 모두 지원합니다.
9. `stop.bat` 후 `start.bat`으로 다시 실행해 연결·상품·캠페인이 유지되는지 확인합니다.

자동 테스트와 본문·이미지 생성 검증만으로도 초기 설치를 확인할 수 있습니다. 실제 SNS 게시 단계는 공개 발행이므로 게시할 계정과 콘텐츠를 확인한 경우에 실행합니다. 두 PC의 DB와 중복 게시 방지는 공유되지 않으므로 같은 캠페인을 두 PC에서 각각 발행하지 않습니다.

## 설치 완료 체크리스트

- [ ] GitHub main에 앱 소스와 이 문서가 올라옴
- [ ] 새 PC에서 GitHub clone과 `npm ci` 완료
- [ ] 검사와 테스트 통과, localhost 화면 열림
- [ ] ChatGPT 구독 AI 연결 확인
- [ ] 각 네이버 앱의 공인 IP 확인과 실제 수집 성공
- [ ] 사용할 SNS 채널의 전용 브라우저 로그인 완료
- [ ] 밴드를 사용할 경우 대상 홈 주소와 게시 권한 확인
- [ ] 조사·제작 결과 저장과 검토 흐름 확인
- [ ] 재부팅 뒤 `start.bat`만 실행해 작업을 재개할 수 있음

## 이후 업데이트와 일상 운영

설치 뒤에는 [매일 운영 순서](daily-operation.md)를 따릅니다. PC 재부팅 후 `npm ci`나 계정 연결을 반복할 필요는 없습니다.

소스 업데이트가 GitHub main에 반영되면 진행 중인 AI/SNS 작업이 없는 때 `stop.bat`을 실행하고, 필요하면 로컬 데이터를 백업한 뒤 다음 명령을 사용합니다.

```powershell
Set-Location -LiteralPath 'C:\dev\d2c_codex'
git status --short
git pull --ff-only
npm ci
npm run check
npm test
```

소스를 직접 수정했다면 먼저 변경을 보관하거나 커밋합니다. `git pull`이 충돌하거나 거부되면 강제 reset으로 덮어쓰지 말고 상태를 점검합니다. 설치 폴더의 `start.bat`을 다시 실행하면 업데이트가 적용됩니다. GitHub에는 로컬 운영 데이터가 없으므로 DB·이미지 백업은 별도로 관리합니다.

## 설치 중 자주 만나는 문제

| 증상 | 조치 |
|---|---|
| GitHub에 `codex_version`이 없음 | 배포 PR이 main에 병합됐는지와 clone한 브랜치 확인 |
| Repository not found / 인증 실패 | 저장소 주소와 GitHub 계정 접근 권한 확인 |
| `node` 또는 `npm`을 찾지 못함 | Node.js 설치 후 PowerShell을 다시 열고 PATH 확인 |
| lock 파일 없음 / `npm ci` 불일치 | GitHub에 올바른 `package-lock.json`이 포함됐는지 확인. 개발 PC에서 의존성 정리 후 다시 게시 |
| 광고 PNG 테스트에 브라우저 없음 | Chrome/Edge 설치 확인 |
| 화면이 열리지 않음 | 해당 앱의 `logs.bat`에서 서버 오류 확인. 포트 4317을 다른 프로세스가 쓰는지 점검 |
| 네이버 키 저장했지만 상품 0개 | 해당 스토어 수집 실행, 공인 IP·조회 권한·네트워크 오류 확인 |
| SNS 창이 열리지 않거나 네트워크 차단 | `stop.bat` 후 탐색기에서 앱의 `start.bat` 재실행 |
| Threads가 선택되지 않음 | 전용 Threads 브라우저 로그인 완료 후 새 캠페인 창 다시 열기 |

추가 오류는 [상황별 문제 해결](troubleshooting.md), 상세 로그는 [로그 확인](logs.md)을 참고합니다.
