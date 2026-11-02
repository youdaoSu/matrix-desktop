param([Parameter(Mandatory=$true)][int]$MatrixProcessId,[Parameter(Mandatory=$true)][string]$OutputPath)
# PrintWindow captures only the owned Matrix window, never the desktop/other apps.
$ErrorActionPreference='Stop'
$matrixProcess=Get-Process -Id $MatrixProcessId
if([IO.Path]::GetDirectoryName($matrixProcess.Path) -ne 'D:\Program Files\fullstack-nestjs-template'){throw 'Unexpected app'}
$matrixOutput=[IO.Path]::GetFullPath($OutputPath)
if(-not $matrixOutput.StartsWith('D:\DoubaoWorkspace\'+[char]0x77e9+[char]0x6548+'\logs\',[StringComparison]::OrdinalIgnoreCase)){throw 'Output must be a local Matrix diagnostic PNG'}
if([IO.Path]::GetExtension($matrixOutput) -ne '.png'){throw 'PNG required'}
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class MatrixWindowCapture {
  [StructLayout(LayoutKind.Sequential)] public struct Rect {public int Left,Top,Right,Bottom;}
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr handle,out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle,IntPtr dc,uint flags);
}
'@
$matrixRect=New-Object MatrixWindowCapture+Rect
if(-not [MatrixWindowCapture]::GetWindowRect($matrixProcess.MainWindowHandle,[ref]$matrixRect)){throw 'Window unavailable'}
$matrixWidth=$matrixRect.Right-$matrixRect.Left;$matrixHeight=$matrixRect.Bottom-$matrixRect.Top
if($matrixWidth -lt 600 -or $matrixWidth -gt 3840 -or $matrixHeight -lt 400 -or $matrixHeight -gt 2160){throw 'Restore Matrix before capture'}
$matrixBitmap=New-Object Drawing.Bitmap $matrixWidth,$matrixHeight
try {
  $matrixGraphics=[Drawing.Graphics]::FromImage($matrixBitmap)
  try {$matrixDc=$matrixGraphics.GetHdc();try{if(-not [MatrixWindowCapture]::PrintWindow($matrixProcess.MainWindowHandle,$matrixDc,2)){throw 'Window capture failed'}}finally{$matrixGraphics.ReleaseHdc($matrixDc)}}finally{$matrixGraphics.Dispose()}
  $matrixBitmap.Save($matrixOutput,[Drawing.Imaging.ImageFormat]::Png)
}finally{$matrixBitmap.Dispose()}
[pscustomobject]@{path=$matrixOutput;width=$matrixWidth;height=$matrixHeight;desktopCaptured=$false}|ConvertTo-Json -Compress
