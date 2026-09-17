# 로그 확인

[문서 목록](README.md) · [설정과 실행](setup.md) · [상황별 문제 해결](troubleshooting.md)

`start.bat`은 서버를 백그라운드로 실행하고 표준 출력과 오류를 `data/runtime`에 저장합니다. 평상시에는 검은 서버 창을 계속 열어 둘 필요가 없습니다.

## 가장 쉬운 방법

1. Windows 탐색기에서 `C:\dev\dev\d2c\codex_version`을 엽니다.
2. `logs.bat`을 더블클릭합니다.
3. 최근 80줄과 새로 추가되는 로그를 확인합니다.
4. 확인을 마치면 로그 창에서 `Ctrl+C`를 누릅니다. 서버와 운영 화면은 계속 실행됩니다.

각 줄 앞에는 출처가 표시됩니다.

| 표시 | 파일 | 내용 |
|---|---|---|
| `SERVER` | `data/runtime/server.log` | 서버 일반 출력 |
| `SERVER ERROR` | `data/runtime/server-error.log` | 서버 시작·실행 오류 |
| `AI` | `data/runtime/ai-worker.log` | Codex 동향 조사·광고 제작 worker |
| `INSTAGRAM` | `data/runtime/instagram-worker.log` | Instagram 로그인·게시 자동화 |
| `THREADS` | `data/runtime/threads-worker.log` | Threads 로그인·게시 자동화 |
| `BAND` | `data/runtime/band-worker.log` | 네이버 밴드 로그인·게시 자동화 |

오류 가능성이 있는 줄은 빨간색으로 표시됩니다. 로그에 키·비밀번호·쿠키를 직접 붙여넣지 않습니다.

## PowerShell과 npm에서 보기

전체 로그를 계속 확인합니다.

```powershell
cd C:\dev\dev\d2c\codex_version
npm run logs
```

특정 채널만 확인합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\logs.ps1 -Channel instagram
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\logs.ps1 -Channel server
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\logs.ps1 -Channel ai
```

최근 기록만 출력하고 바로 종료합니다.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\logs.ps1 -Channel all -Tail 150 -NoFollow
```

## 로그가 비어 있는 경우

- `server.log`가 비어 있어도 서버가 정상일 수 있습니다. 현재 서버는 정상 요청마다 메시지를 남기지 않습니다.
- `server-error.log`는 오류가 없으면 빈 파일이 정상입니다.
- AI·SNS worker 로그는 해당 작업을 실행한 뒤 생성됩니다.
- 운영 화면의 상태 메시지는 `data/*-status.json`에서 읽으므로 worker 로그가 비어 있어도 화면에는 진행 상태가 표시될 수 있습니다.

앱 실행 여부는 브라우저에서 [http://127.0.0.1:4317/api/health](http://127.0.0.1:4317/api/health)를 열어 확인할 수 있습니다. 응답이 없으면 탐색기에서 `start.bat`을 다시 실행합니다.
