param(
    [Parameter(Mandatory = $true)][string]$ExecPath,
    [Parameter(Mandatory = $true)][string]$SessionDir,
    [Parameter(Mandatory = $true)][int]$Port,
    [Parameter(Mandatory = $true)][string]$Url
)
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $SessionDir -Force | Out-Null
$arguments = @(
    "--remote-debugging-port=$Port",
    "--user-data-dir=$SessionDir",
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-search-engine-choice-screen',
    '--start-maximized',
    '--new-window',
    $Url
)
Start-Process -FilePath $ExecPath -ArgumentList $arguments -WorkingDirectory (Split-Path -Parent $SessionDir) -WindowStyle Normal
