param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
function Find-NodePath {
    $candidates = @()
    $command = Get-Command node -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    $candidates += @(
        (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'nodejs\node.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\nodejs\node.exe'),
        (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
    )
    $runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes'
    if (Test-Path -LiteralPath $runtimeRoot) {
        $candidates += Get-ChildItem -LiteralPath $runtimeRoot -Directory -ErrorAction SilentlyContinue |
            ForEach-Object { Join-Path $_.FullName 'dependencies\node\bin\node.exe' }
    }
    foreach ($candidate in ($candidates | Where-Object { $_ } | Select-Object -Unique)) {
        if (-not (Test-Path -LiteralPath $candidate)) { continue }
        try {
            $version = & $candidate --version
            $major = [int]([regex]::Match($version, '^v(\d+)').Groups[1].Value)
            if ($major -ge 24) { return [System.IO.Path]::GetFullPath($candidate) }
        } catch {}
    }
    throw 'Node.js 24 이상을 찾지 못했습니다. Codex 데스크톱 앱을 실행하거나 https://nodejs.org/ 에서 Node.js 24 LTS를 설치하세요.'
}

function Find-PackageManager {
    $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
    if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
    if ($npm) { return @{ Kind = 'npm'; Path = $npm.Source } }
    $pnpmCandidates = @(
        (Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd')
    )
    $runtimeRoot = Join-Path $env:USERPROFILE '.cache\codex-runtimes'
    if (Test-Path -LiteralPath $runtimeRoot) {
        $pnpmCandidates += Get-ChildItem -LiteralPath $runtimeRoot -Directory -ErrorAction SilentlyContinue |
            ForEach-Object { Join-Path $_.FullName 'dependencies\bin\fallback\pnpm.cmd' }
    }
    foreach ($candidate in ($pnpmCandidates | Select-Object -Unique)) {
        if (Test-Path -LiteralPath $candidate) { return @{ Kind = 'pnpm'; Path = $candidate } }
    }
    return $null
}

$nodePath = Find-NodePath
$requiredPackages = @(
    'node_modules\bcryptjs\package.json',
    'node_modules\playwright-core\package.json',
    'node_modules\@openai\codex-sdk\package.json',
    'node_modules\@openai\codex\bin\codex.js'
)
$missingPackages = @($requiredPackages | Where-Object { -not (Test-Path -LiteralPath (Join-Path $workspacePath $_)) })
if ($missingPackages.Count -gt 0) {
    $packageManager = Find-PackageManager
    if (-not $packageManager) {
        throw '프로젝트 의존성이 없고 npm/pnpm을 찾지 못했습니다. Node.js 24 LTS를 설치한 뒤 start.bat을 다시 실행하세요.'
    }
    Write-Host '처음 실행을 위한 프로젝트 의존성을 자동으로 설치합니다...'
    Push-Location -LiteralPath $workspacePath
    try {
        if ($packageManager.Kind -eq 'npm') {
            & $packageManager.Path install
        } else {
            & $packageManager.Path install --lockfile=false --node-linker=hoisted
        }
        if ($LASTEXITCODE -ne 0) { throw '프로젝트 의존성 설치에 실패했습니다. 인터넷 연결을 확인하고 다시 실행하세요.' }
    } finally { Pop-Location }
    $missingPackages = @($requiredPackages | Where-Object { -not (Test-Path -LiteralPath (Join-Path $workspacePath $_)) })
    if ($missingPackages.Count -gt 0) { throw '설치 후에도 필요한 프로젝트 패키지를 찾지 못했습니다.' }
}
Write-Host "Node.js 실행 경로: $nodePath"
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
