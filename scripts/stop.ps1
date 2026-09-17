$ErrorActionPreference = 'Stop'
$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$statePath = Join-Path $workspacePath 'data/runtime/server.json'
if (-not (Test-Path -LiteralPath $statePath)) { Write-Host '이 실행기로 시작한 서버가 없습니다. 터미널에서 실행했다면 Ctrl+C로 종료하세요.'; exit 0 }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$expectedServer = Join-Path $workspacePath 'src/server.mjs'
if ($state.serverPath -ne $expectedServer) { throw '저장된 서버 경로가 일치하지 않아 종료하지 않았습니다.' }
$serviceUrl = "http://127.0.0.1:$([int]$state.port)"
try { $health = Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 3 } catch { Write-Host '서버가 응답하지 않습니다. 다른 프로세스는 종료하지 않았습니다.'; exit 1 }
if ($health.app -ne 'd2c-codex-workspace' -or $health.pid -ne $state.pid -or [System.IO.Path]::GetFullPath($health.workspace).TrimEnd('\','/') -ne $workspacePath.TrimEnd('\','/')) {
    throw '응답한 서버가 실행 기록과 일치하지 않아 종료하지 않았습니다.'
}
$session = Invoke-RestMethod -Uri "$serviceUrl/api/state" -TimeoutSec 3
Invoke-RestMethod -Uri "$serviceUrl/api/shutdown" -Method Post -ContentType 'application/json' -Headers @{ 'X-D2C-Token' = $session.token } -Body '{}' -TimeoutSec 5 | Out-Null
Remove-Item -LiteralPath $statePath
Write-Host 'Codex D2C 서버에 정상 종료를 요청했습니다. 진행 중인 수집은 저장을 마친 뒤 종료됩니다.'
