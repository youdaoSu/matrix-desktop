$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$sdkVersion = '1.0.3912.50'
$sdkRoot = Join-Path $projectRoot ".desktop-deps\webview2-$sdkVersion"
$outputRoot = Join-Path $projectRoot '.desktop-runtime\edge-host'
New-Item -ItemType Directory -Force -Path $sdkRoot,$outputRoot | Out-Null
$coreAssembly = Join-Path $sdkRoot 'lib\net462\Microsoft.Web.WebView2.Core.dll'
if (-not (Test-Path -LiteralPath $coreAssembly)) {
  $archivePath = Join-Path $sdkRoot 'sdk.zip'
  Invoke-WebRequest -UseBasicParsing -Uri "https://api.nuget.org/v3-flatcontainer/microsoft.web.webview2/$sdkVersion/microsoft.web.webview2.$sdkVersion.nupkg" -OutFile $archivePath -TimeoutSec 60
  Expand-Archive -LiteralPath $archivePath -DestinationPath $sdkRoot -Force
}
$formsAssembly = Join-Path $sdkRoot 'lib\net462\Microsoft.Web.WebView2.WinForms.dll'
$loader = Join-Path $sdkRoot 'runtimes\win-x64\native\WebView2Loader.dll'
foreach ($dependency in @($coreAssembly,$formsAssembly,$loader)) {
  if (-not (Test-Path -LiteralPath $dependency)) { throw "Missing WebView2 SDK dependency: $dependency" }
  if ((Get-AuthenticodeSignature -LiteralPath $dependency).Status -ne 'Valid') { throw "Invalid Microsoft SDK signature: $dependency" }
  Copy-Item -LiteralPath $dependency -Destination $outputRoot -Force
}
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { throw '.NET Framework C# compiler is unavailable' }
$source = Join-Path $projectRoot 'desktop\edge-host\MatrixEdgeHost.cs'
$manifest = Join-Path $projectRoot 'desktop\edge-host\app.manifest'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ "/out:$outputRoot\MatrixEdgeHost.exe" "/win32manifest:$manifest" /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll "/r:$coreAssembly" "/r:$formsAssembly" $source
if ($LASTEXITCODE -ne 0) { throw 'Native embedded Edge host compilation failed' }
foreach ($license in @('LICENSE.txt','ThirdPartyNotices.txt')) {
  $licensePath = Join-Path $sdkRoot $license
  if (Test-Path -LiteralPath $licensePath) { Copy-Item -LiteralPath $licensePath -Destination $outputRoot -Force }
}
Write-Output "Embedded Edge host built; WebView2 SDK $sdkVersion; signed Microsoft dependencies validated."
