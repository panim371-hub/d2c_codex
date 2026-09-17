param(
    [ValidateSet('all', 'server', 'ai', 'instagram', 'threads', 'band')]
    [string]$Channel = 'all',
    [ValidateRange(1, 1000)]
    [int]$Tail = 80,
    [switch]$NoFollow
)

$ErrorActionPreference = 'Stop'
$workspacePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimePath = Join-Path $workspacePath 'data/runtime'
New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null

$allLogs = [ordered]@{
    'SERVER' = Join-Path $runtimePath 'server.log'
    'SERVER ERROR' = Join-Path $runtimePath 'server-error.log'
    'AI' = Join-Path $runtimePath 'ai-worker.log'
    'INSTAGRAM' = Join-Path $runtimePath 'instagram-worker.log'
    'THREADS' = Join-Path $runtimePath 'threads-worker.log'
    'BAND' = Join-Path $runtimePath 'band-worker.log'
}

$selected = [ordered]@{}
foreach ($entry in $allLogs.GetEnumerator()) {
    $include = $Channel -eq 'all' -or
        ($Channel -eq 'server' -and $entry.Key -like 'SERVER*') -or
        $entry.Key -eq $Channel.ToUpperInvariant()
    if ($include) { $selected[$entry.Key] = $entry.Value }
}

foreach ($file in $selected.Values) {
    if (-not (Test-Path -LiteralPath $file)) {
        New-Item -ItemType File -Path $file -Force | Out-Null
    }
}

Write-Host ''
Write-Host 'D2C Codex 실시간 로그' -ForegroundColor Cyan
Write-Host "폴더: $runtimePath"
Write-Host "대상: $($selected.Keys -join ', ')"
if (-not $NoFollow) { Write-Host '종료: Ctrl+C (서버는 계속 실행됩니다.)' -ForegroundColor DarkGray }
Write-Host ''

$positions = @{}
foreach ($entry in $selected.GetEnumerator()) {
    $lines = @(Get-Content -LiteralPath $entry.Value -Encoding utf8 -ErrorAction SilentlyContinue)
    $start = [Math]::Max(0, $lines.Count - $Tail)
    for ($index = $start; $index -lt $lines.Count; $index++) {
        $color = if ($entry.Key -like '*ERROR*' -or $lines[$index] -match '(?i)error|failed|exception|assertion') { 'Red' } else { 'Gray' }
        Write-Host "[$($entry.Key)] $($lines[$index])" -ForegroundColor $color
    }
    $positions[$entry.Key] = $lines.Count
}

if ($NoFollow) { exit 0 }

while ($true) {
    Start-Sleep -Seconds 1
    foreach ($entry in $selected.GetEnumerator()) {
        $lines = @(Get-Content -LiteralPath $entry.Value -Encoding utf8 -ErrorAction SilentlyContinue)
        $seen = [int]$positions[$entry.Key]
        if ($lines.Count -lt $seen) { $seen = 0 }
        for ($index = $seen; $index -lt $lines.Count; $index++) {
            $color = if ($entry.Key -like '*ERROR*' -or $lines[$index] -match '(?i)error|failed|exception|assertion') { 'Red' } else { 'White' }
            Write-Host "[$($entry.Key)] $($lines[$index])" -ForegroundColor $color
        }
        $positions[$entry.Key] = $lines.Count
    }
}
