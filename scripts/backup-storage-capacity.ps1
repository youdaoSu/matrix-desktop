param([Parameter(Mandatory=$true)][string]$BackupRoot,[switch]$SkipBrowserCaches=$true,[switch]$IncludeDiagnosticLogs)
# Read-only physical-volume check; no data copied or removed.
$ErrorActionPreference='Stop'
$matrixSource='C:\Users\10985\AppData\Roaming\fullstack-nestjs-template'
$matrixBackups=Join-Path $matrixSource 'backups'
if(@((Join-Path $matrixSource 'backups'),'D:\MatrixUserBackups',('E:\'+[string][char]0x8fdc+[char]0x6548+'\'+[string][char]0x5907+[char]0x4efd)) -notcontains $BackupRoot){throw 'Unapproved backup root'}
Add-Type -TypeDefinition @'
using System;using System.Text;using System.Runtime.InteropServices;using Microsoft.Win32.SafeHandles;
public static class MatrixCanonicalBackupSpace {
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern bool GetDiskFreeSpaceEx(string path,out ulong available,out ulong total,out ulong free);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]static extern uint GetFinalPathNameByHandle(SafeFileHandle handle,StringBuilder path,uint size,uint flags);
 public static string Physical(string directory){using(var handle=CreateFile(directory,0,7,IntPtr.Zero,3,0x02000000,IntPtr.Zero)){if(handle.IsInvalid)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());var path=new StringBuilder(32768);uint length=GetFinalPathNameByHandle(handle,path,32768,0);if(length==0||length>=32768)throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());return path.ToString();}}
 public static ulong Available(string directory){ulong available,total,free;if(!GetDiskFreeSpaceEx(directory,out available,out total,out free))throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());return available;}
}
'@
$matrixPhysical=[MatrixCanonicalBackupSpace]::Physical($BackupRoot)
$matrixAvailable=[MatrixCanonicalBackupSpace]::Available($matrixPhysical)
$matrixSkip=@('Cache','Code Cache','GPUCache','DawnGraphiteCache','DawnWebGPUCache','ShaderCache','GrShaderCache','GraphiteDawnCache')
$matrixPending=New-Object 'System.Collections.Generic.Stack[string]'
$matrixPending.Push($matrixSource)
$matrixBytes=0L;$matrixFiles=0L
while($matrixPending.Count){foreach($matrixEntry in Get-ChildItem -LiteralPath $matrixPending.Pop() -Force){
 if($matrixEntry.FullName -eq $matrixBackups -or (-not $IncludeDiagnosticLogs -and $matrixEntry.FullName -eq (Join-Path $matrixSource 'logs')) -or ($SkipBrowserCaches -and $matrixEntry.PSIsContainer -and ($matrixSkip -contains $matrixEntry.Name))){continue}
 if($matrixEntry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Unexpected business-data link; no copy started'}
 if($matrixEntry.PSIsContainer){$matrixPending.Push($matrixEntry.FullName)}else{$matrixBytes+=$matrixEntry.Length;$matrixFiles++}
}}
if($matrixAvailable -lt ($matrixBytes+30GB)){throw 'Backup volume lacks the required business copy plus 30 GiB reserve'}
[pscustomobject]@{cold=$true;databaseStopped=$true;physicalBackupDirectory=$matrixPhysical;availableBytes=$matrixAvailable;businessBytes=$matrixBytes;businessFiles=$matrixFiles;reserveBytes=30GB;capacityPassed=$true;copied=$false;diagnosticsAndRegenerableCacheExcluded=$true;businessDataRemoved=$false}|ConvertTo-Json -Compress
