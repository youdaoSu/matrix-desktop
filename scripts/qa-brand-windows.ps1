# ASCII, Windows PowerShell 5.1. Native ICO decoding; isolated assets only.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class YuanXiaoFrameQA {
 [DllImport("user32.dll")]public static extern IntPtr CreateIconFromResourceEx(byte[] data,uint size,bool icon,uint version,int width,int height,uint flags);
 [DllImport("user32.dll")]public static extern bool DestroyIcon(IntPtr icon);
}
'@
$matrixIconFile=Join-Path (Split-Path -Parent $PSScriptRoot) 'desktop\assets\icon.ico'
$matrixBytes=[IO.File]::ReadAllBytes($matrixIconFile)
$matrixFrames=@()
$matrixIndex=0
foreach($size in @(16,20,24,32,40,48,64,128,256)){
 $matrixEntry=6+$matrixIndex*16
 $matrixLength=[BitConverter]::ToUInt32($matrixBytes,$matrixEntry+8)
 $matrixOffset=[BitConverter]::ToUInt32($matrixBytes,$matrixEntry+12)
 $matrixFrame=New-Object byte[] $matrixLength
 [Array]::Copy($matrixBytes,$matrixOffset,$matrixFrame,0,$matrixLength)
 $matrixHandle=[YuanXiaoFrameQA]::CreateIconFromResourceEx($matrixFrame,$matrixLength,$true,0x30000,$size,$size,0)
 if($matrixHandle -eq [IntPtr]::Zero){throw 'Windows rejected an ICO frame'}
 $matrixIcon=[Drawing.Icon]::FromHandle($matrixHandle)
 $matrixBitmap=$matrixIcon.ToBitmap()
 try{
  if($matrixBitmap.Width -ne $size -or $matrixBitmap.Height -ne $size){throw 'Wrong native icon size'}
  $matrixPurple=0
  for($y=0;$y -lt $size;$y++){for($x=0;$x -lt $size;$x++){
   $pixel=$matrixBitmap.GetPixel($x,$y)
   if($pixel.A -gt 200 -and $pixel.B -gt 120 -and $pixel.B -gt $pixel.R*1.4 -and $pixel.R -gt $pixel.G*1.1){$matrixPurple++}
  }}
  if($matrixPurple -lt $size*$size*0.18){throw 'Native ICO lost the purple mark'}
  $matrixFrames+=@{size=$size;purplePixels=$matrixPurple}
 }finally{$matrixBitmap.Dispose();$matrixIcon.Dispose();[void][YuanXiaoFrameQA]::DestroyIcon($matrixHandle)}
 $matrixIndex++
}
@{passed=$true;nativeWindowsFrames=$matrixFrames;realProfileTouched=$false}|ConvertTo-Json -Compress -Depth 4
