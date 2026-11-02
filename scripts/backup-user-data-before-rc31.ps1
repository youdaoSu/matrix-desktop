param([ValidatePattern('^rc\.\d+$')][string]$TargetRelease='rc.31',[switch]$SkipBrowserCaches=$true,[switch]$IncludeDiagnosticLogs,[ValidateSet('Default','DDrive','EDrive')][string]$BackupLocation='Default')
$ErrorActionPreference='Stop'
$matrixData=(Resolve-Path -LiteralPath 'C:\Users\10985\AppData\Roaming\fullstack-nestjs-template').Path
$matrixOriginalBackupRoot=Join-Path $matrixData 'backups'
$matrixBackupRoot=$matrixOriginalBackupRoot
if($BackupLocation -eq 'DDrive'){$matrixBackupRoot='D:\MatrixUserBackups'}
if($BackupLocation -eq 'EDrive'){$matrixBackupRoot='E:\'+[string][char]0x8fdc+[char]0x6548+'\'+[string][char]0x5907+[char]0x4efd}
$matrixDiagnosticLogs=Join-Path $matrixData 'logs'
$matrixBackup=Join-Path $matrixBackupRoot ('before-update-'+$TargetRelease+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
if ([IO.Path]::GetFullPath($matrixBackup).StartsWith($matrixBackupRoot+'\',[StringComparison]::OrdinalIgnoreCase) -ne $true) { throw 'Invalid backup target' }
if (Test-Path -LiteralPath (Join-Path $matrixData 'database\postmaster.pid')) { throw 'Close the application and database before backup' }
# Inspect only Matrix processes. A full WMI/CIM enumeration can stall when the
# system WMI service is busy; backup must not depend on that service responding.
$matrixProcesses=@(Get-Process -Name '* Matrix' -ErrorAction SilentlyContinue)
if ($matrixProcesses.Count -gt 0) { throw 'Matrix is still running; close it before a cold user-data backup' }
if(Test-Path -LiteralPath $matrixBackupRoot){
  if((Get-Item -LiteralPath $matrixBackupRoot -Force).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Backup root must not be a link'}
} elseif($BackupLocation -in @('DDrive','EDrive')) {
  $matrixAcl=New-Object Security.AccessControl.DirectorySecurity
  $matrixAcl.SetAccessRuleProtection($true,$false)
  $matrixOwner=[Security.Principal.WindowsIdentity]::GetCurrent().User
  $matrixAcl.SetOwner($matrixOwner)
  foreach($matrixPrincipal in @($matrixOwner.Value,'S-1-5-18','S-1-5-32-544')){
    $matrixSid=New-Object Security.Principal.SecurityIdentifier($matrixPrincipal)
    $matrixRule=New-Object Security.AccessControl.FileSystemAccessRule($matrixSid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $matrixAcl.AddAccessRule($matrixRule)
  }
  [void][IO.Directory]::CreateDirectory($matrixBackupRoot,$matrixAcl)
} else {[void](New-Item -ItemType Directory -Path $matrixBackupRoot)}
$matrixCapacity=& (Join-Path $PSScriptRoot 'backup-storage-capacity.ps1') -BackupRoot $matrixBackupRoot -SkipBrowserCaches:$SkipBrowserCaches -IncludeDiagnosticLogs:$IncludeDiagnosticLogs | ConvertFrom-Json
if(-not $matrixCapacity.capacityPassed){throw 'Backup capacity not verified'}
$null=New-Item -ItemType Directory -Path $matrixBackup
# Always include sessions, cookies, databases, saved drafts and receipts. The
# default exclusion is only Chromium's regenerable HTTP/shader/compiler cache;
# original caches stay in place, and the prior full backup is never removed.
# Pass -SkipBrowserCaches:$false when an explicit full-cache backup is needed.
# Top-level server diagnostics are excluded by default. Business operation
# records, database files and account data remain included. Use
# -IncludeDiagnosticLogs for a backup that also includes server diagnostics.
$matrixCacheNames=@('Cache','Code Cache','GPUCache','DawnGraphiteCache','DawnWebGPUCache','ShaderCache','GrShaderCache','GraphiteDawnCache')
$matrixExcluded=@($matrixOriginalBackupRoot,$matrixBackupRoot)
if (-not $IncludeDiagnosticLogs) { $matrixExcluded+=$matrixDiagnosticLogs }
if ($SkipBrowserCaches) { $matrixExcluded+=$matrixCacheNames }
& robocopy.exe $matrixData $matrixBackup /E /COPY:DAT /DCOPY:DAT /R:1 /W:1 /XJ /XD $matrixExcluded /NFL /NDL /NP /NJH /NJS
if ($LASTEXITCODE -ge 8) { throw "Backup copy failed: $LASTEXITCODE" }
$matrixSourceFiles=@(Get-ChildItem -LiteralPath $matrixData -Recurse -File -Force | Where-Object {
  if ($_.FullName.StartsWith($matrixOriginalBackupRoot+'\',[StringComparison]::OrdinalIgnoreCase)) { return $false }
  if (-not $IncludeDiagnosticLogs -and $_.FullName.StartsWith($matrixDiagnosticLogs+'\',[StringComparison]::OrdinalIgnoreCase)) { return $false }
  if ($SkipBrowserCaches) { foreach ($matrixSegment in $_.FullName.Substring($matrixData.Length+1).Split('\')) { if ($matrixCacheNames -contains $matrixSegment) { return $false } } }
  return $true
})
$matrixCopiedFiles=@(Get-ChildItem -LiteralPath $matrixBackup -Recurse -File -Force)
if ($matrixSourceFiles.Count -ne $matrixCopiedFiles.Count) { throw 'Backup file count differs' }
[long]$matrixTotalBytes=($matrixSourceFiles | Measure-Object -Property Length -Sum).Sum
# One bounded Node process hashes every file with the same SHA256 checks. This
# avoids thousands of PowerShell provider/hash invocations on each local update.
$matrixVerification=& node (Join-Path $PSScriptRoot 'local-verify-cold-backup.cjs') $matrixBackup
if ($LASTEXITCODE -ne 0) { throw 'Backup content verification failed' }
$matrixVerified=$matrixVerification | ConvertFrom-Json
if ($matrixVerified.files -ne $matrixSourceFiles.Count -or $matrixVerified.bytes -ne $matrixTotalBytes -or -not $matrixVerified.allBackedUpUserDataUnchangedAfterInstall) { throw 'Backup verification totals differ' }
[pscustomobject]@{backup=$matrixBackup;files=$matrixSourceFiles.Count;bytes=$matrixTotalBytes;allFileHashesVerified=$true;existingBackupsPreserved=$true;browserCachesExcluded=[bool]$SkipBrowserCaches;diagnosticLogsExcluded=(-not [bool]$IncludeDiagnosticLogs);capacity=$matrixCapacity} | ConvertTo-Json -Depth 5 -Compress
exit 0
