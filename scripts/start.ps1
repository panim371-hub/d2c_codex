param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $workspacePath 'node_modules/bcryptjs/package.json'))) {
    Write-Host '먼저 codex_version 폴더에서 npm install을 실행하세요.'
    exit 1
}
# Run from the project directory regardless of how the launcher was opened.
Push-Location -LiteralPath $workspacePath
try {
    $portText = & $nodePath --input-type=module -e "import {configuration} from './src/config.mjs'; console.log(configuration().port)"
    $servicePort = [int]$portText
    $serviceUrl = "http://127.0.0.1:$servicePort"
    $existing = $null
    try { $existing = Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 2 } catch {}
    if ($existing -and $existing.app -eq 'd2c-codex-workspace' -and [System.IO.Path]::GetFullPath($existing.workspace).TrimEnd('\','/') -eq $workspacePath.TrimEnd('\','/')) {
        if (-not $NoBrowser) { Start-Process $serviceUrl }
        Write-Host "이미 실행 중입니다: $serviceUrl"
        exit 0
    }
    $runtimePath = Join-Path $workspacePath 'data/runtime'
    New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
    $serverPath = Join-Path $workspacePath 'src/server.mjs'
    $child = Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $workspacePath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimePath 'server.log') -RedirectStandardError (Join-Path $runtimePath 'server-error.log')
    @{ pid = $child.Id; serverPath = $serverPath; port = $servicePort } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimePath 'server.json') -Encoding utf8
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Milliseconds 300
        if ($child.HasExited) { throw '서버 시작 실패. data/runtime/server-error.log를 확인하세요.' }
        try {
            $health = Invoke-RestMethod -Uri "$serviceUrl/api/health" -TimeoutSec 1
            if ($health.app -eq 'd2c-codex-workspace') { if (-not $NoBrowser) { Start-Process $serviceUrl }; Write-Host "실행 완료: $serviceUrl"; exit 0 }
        } catch {}
    }
    throw '서버 응답을 기다리는 시간이 초과되었습니다. data/runtime 로그를 확인하세요.'
} finally { Pop-Location }
