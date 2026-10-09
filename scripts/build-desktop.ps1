$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $projectRoot

$releasePath = Join-Path $projectRoot 'release'
New-Item -ItemType Directory -Force -Path $releasePath | Out-Null
$logPath = Join-Path $releasePath 'desktop-build.log'
Start-Transcript -Path $logPath -Force | Out-Null

Write-Host "Build log: $logPath"

function Invoke-VisibleProcess {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [int]$TimeoutMinutes = 30
  )
  $process = Start-Process -FilePath $FilePath -ArgumentList $Arguments -NoNewWindow -PassThru
  $deadline = (Get-Date).AddMinutes($TimeoutMinutes)
  while (-not $process.HasExited) {
    if ((Get-Date) -ge $deadline) {
      # npm.cmd starts cmd.exe and node.exe children. Stop the whole tree so a
      # timed-out download cannot continue running in the background.
      & taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
      throw "$FilePath timed out after $TimeoutMinutes minutes"
    }
    Start-Sleep -Seconds 1
    $process.Refresh()
  }
  # Ensure Windows has populated the native exit code before reading it.
  # HasExited can become true slightly before ExitCode is available through
  # the PowerShell 5 Process wrapper.
  $process.WaitForExit()
  $process.Refresh()
  return [int]$process.ExitCode
}

$nodeVersionText = (& node -p "process.versions.node").Trim()
$nodeVersion = [version]$nodeVersionText
if ($nodeVersion -lt [version]'22.22.0') {
  Write-Warning "Node.js 22.22.0 or newer is recommended. Current version: $nodeVersionText"
}

$coreRequiredFiles = @(
  'node_modules\.bin\cross-env.cmd',
  'node_modules\.bin\nest.cmd',
  'node_modules\.bin\vite.cmd',
  'node_modules\typescript\lib\lib.es2022.full.d.ts',
  'node_modules\@swc\core-win32-x64-msvc'
)
$missingCoreDependencies = @($coreRequiredFiles | Where-Object { -not (Test-Path -LiteralPath (Join-Path $projectRoot $_)) })

$env:npm_config_fetch_retries = '2'
$env:npm_config_fetch_retry_mintimeout = '1000'
$env:npm_config_fetch_retry_maxtimeout = '10000'
$env:npm_config_progress = 'true'
$env:npm_config_registry = 'https://registry.npmjs.org/'
# GitHub release assets are not reliably reachable on this network. These
# mirrors are used only for Electron/electron-builder binary archives.
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
$env:ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/'
$env:ELECTRON_BUILDER_CACHE = Join-Path $projectRoot '.desktop-cache'
New-Item -ItemType Directory -Force -Path $env:ELECTRON_BUILDER_CACHE | Out-Null

if ($missingCoreDependencies.Count -gt 0) {
  Write-Host '[0/3] Build dependencies are incomplete. Repairing them now...'
  Write-Host 'This is required only on the computer that creates the installer.'
  $dependenciesPath = Join-Path $projectRoot 'node_modules'
  if (Test-Path -LiteralPath $dependenciesPath) {
    $resolvedDependencies = (Resolve-Path -LiteralPath $dependenciesPath).Path
    if ((Split-Path -Parent $resolvedDependencies) -ne $projectRoot -or (Split-Path -Leaf $resolvedDependencies) -ne 'node_modules') {
      throw "Refusing to move unexpected dependency path: $resolvedDependencies"
    }
    $backupPath = Join-Path $projectRoot ("node_modules.incomplete-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    Write-Host "Moving incomplete dependencies to: $backupPath"
    Move-Item -LiteralPath $resolvedDependencies -Destination $backupPath
  }

  # The existing lock file contains registry.npmmirror.com tarball URLs. One
  # observed download stalled for more than three hours, so resolve packages
  # from the official registry without using those locked mirror URLs.
  $env:npm_config_registry = 'https://registry.npmjs.org/'
  $installExitCode = Invoke-VisibleProcess -FilePath 'npm.cmd' -Arguments @(
    'install', '--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps',
    '--package-lock=false', '--prefer-online',
    '--registry=https://registry.npmjs.org/', '--loglevel=info'
  ) -TimeoutMinutes 30
  if ($installExitCode -ne 0) {
    throw "Dependency installation failed. See: $logPath"
  }
}

$desktopDependenciesRoot = Join-Path $projectRoot '.desktop-deps'
$electronBuilderCommand = Join-Path $desktopDependenciesRoot 'node_modules\.bin\electron-builder.cmd'
$electronInstaller = Join-Path $desktopDependenciesRoot 'node_modules\electron\install.js'
$electronExe = Join-Path $desktopDependenciesRoot 'node_modules\electron\dist\electron.exe'
$desktopRequiredFiles = @($electronBuilderCommand, $electronInstaller)
$missingDesktopDependencies = @($desktopRequiredFiles | Where-Object { -not (Test-Path -LiteralPath $_) })
if ($missingDesktopDependencies.Count -gt 0) {
  Write-Host '[0/3] Installing desktop tools in an isolated directory...'
  New-Item -ItemType Directory -Force -Path $desktopDependenciesRoot | Out-Null
  $desktopInstallExitCode = Invoke-VisibleProcess -FilePath 'npm.cmd' -Arguments @(
    'install', '--prefix', $desktopDependenciesRoot,
    '--no-save', '--ignore-scripts', '--no-audit', '--no-fund', '--legacy-peer-deps',
    '--package-lock=false', '--prefer-online',
    '--registry=https://registry.npmjs.org/', '--loglevel=info',
    'electron@33.4.11', 'electron-builder@25.1.8'
  ) -TimeoutMinutes 15
  if ($desktopInstallExitCode -ne 0) {
    throw "Desktop dependency installation failed. See: $logPath"
  }
}

if (-not (Test-Path -LiteralPath $electronExe)) {
  if (-not (Test-Path -LiteralPath $electronInstaller)) {
    throw 'Electron package is missing after npm install.'
  }
  Write-Host '[0/3] Downloading the Electron Windows runtime...'
  node $electronInstaller
  if ($LASTEXITCODE -ne 0) { throw 'Electron runtime download failed' }
}

$distPath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'dist'))
if ($distPath -ne (Join-Path $projectRoot 'dist')) {
  throw "Unexpected dist path: $distPath"
}

Write-Host '[1/3] Building NestJS server...'
npm run build:server
if ($LASTEXITCODE -ne 0) { throw 'Server build failed' }

Write-Host '[2/3] Building React client...'
$clientDistPath = Join-Path $distPath 'client'
if (Test-Path -LiteralPath $clientDistPath) {
  $resolvedClientDist = (Resolve-Path -LiteralPath $clientDistPath).Path
  if ((Split-Path -Parent $resolvedClientDist) -ne $distPath -or (Split-Path -Leaf $resolvedClientDist) -ne 'client') {
    throw "Refusing to clean unexpected client build path: $resolvedClientDist"
  }
  Remove-Item -LiteralPath $resolvedClientDist -Recurse -Force
}
$env:MIAODA_BUILD_TARGET = 'standalone'
try {
  npm run build:client
  if ($LASTEXITCODE -ne 0) { throw 'Client build failed' }
} finally {
  Remove-Item Env:MIAODA_BUILD_TARGET -ErrorAction SilentlyContinue
}

# The standalone preset preserves the source folder name for its HTML entry.
# Normalize it to the location used by the embedded NestJS static server.
$standaloneIndex = Join-Path $clientDistPath 'client\index.html'
$desktopIndex = Join-Path $clientDistPath 'index.html'
if (-not (Test-Path -LiteralPath $standaloneIndex)) {
  throw 'Missing standalone client entry: dist\client\client\index.html'
}
Move-Item -LiteralPath $standaloneIndex -Destination $desktopIndex -Force

if (-not (Test-Path -LiteralPath (Join-Path $distPath 'server\main.js'))) {
  throw 'Missing dist\server\main.js'
}
if (-not (Test-Path -LiteralPath (Join-Path $distPath 'client\index.html'))) {
  throw 'Missing dist\client\index.html'
}

Write-Host '[2/3] Preparing embedded PostgreSQL runtime...'
$postgresCommand = Get-Command 'postgres.exe' -ErrorAction SilentlyContinue
if (-not $postgresCommand) {
  throw 'PostgreSQL command-line tools are required to create the standalone installer.'
}
$postgresSourceRoot = Split-Path -Parent (Split-Path -Parent $postgresCommand.Source)
$postgresRuntime = Join-Path $projectRoot '.desktop-runtime\postgres'
New-Item -ItemType Directory -Force -Path $postgresRuntime | Out-Null
foreach ($folder in @('bin', 'lib', 'share')) {
  $source = Join-Path $postgresSourceRoot $folder
  $destination = Join-Path $postgresRuntime $folder
  if (-not (Test-Path -LiteralPath $destination)) {
    Copy-Item -LiteralPath $source -Destination $destination -Recurse
  }
}
$licenseSource = Join-Path $postgresSourceRoot 'server_license.txt'
if (Test-Path -LiteralPath $licenseSource) {
  Copy-Item -LiteralPath $licenseSource -Destination (Join-Path $postgresRuntime 'server_license.txt') -Force
}

Write-Host '[3/3] Creating Windows installer...'
& $electronBuilderCommand --win nsis
if ($LASTEXITCODE -ne 0) { throw 'Desktop packaging failed' }

# Keep only the installer and block map for the version that just passed the
# build. Published historical installers live in GitHub Releases.
$package = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$releasePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot 'release'))
$currentInstaller = "Matrix-$($package.version)-Setup.exe"
$currentBlockMap = "$currentInstaller.blockmap"
Get-ChildItem -LiteralPath $releasePath -File -Filter 'Matrix-*-Setup.exe*' | ForEach-Object {
  if ($_.DirectoryName -ne $releasePath) {
    throw "Refusing to remove artifact outside release directory: $($_.FullName)"
  }
  if ($_.Name -ne $currentInstaller -and $_.Name -ne $currentBlockMap) {
    [System.IO.File]::Delete($_.FullName)
  }
}

Write-Host 'Done. Installer is in the release directory.'
Stop-Transcript | Out-Null
