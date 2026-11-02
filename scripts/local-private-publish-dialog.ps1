param([Parameter(Mandatory = $true)][int]$MatrixProcessId, [switch]$Confirm, [switch]$NativePlanVerified, [string]$CapturePath)
# One-shot test helper, not shipped with the app. Confirm only after explicit
# user permission and a fresh read of the official editor's private setting.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Text;
using System.Runtime.InteropServices;
public static class MatrixPrivateDialog {
  public delegate bool EnumProc(IntPtr handle, IntPtr arg);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc proc, IntPtr arg);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc proc, IntPtr arg);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr handle, StringBuilder text, int max);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr handle);
  [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr handle);
  [StructLayout(LayoutKind.Sequential)] struct Rect { public int Left,Top,Right,Bottom; }
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr handle, out Rect rect);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr handle, IntPtr dc, uint flags);
  [DllImport("user32.dll")] static extern IntPtr SendMessage(IntPtr handle, uint msg, IntPtr w, IntPtr l);
  static string Text(IntPtr handle) { var value=new StringBuilder(16000); GetWindowText(handle,value,value.Capacity); return value.ToString(); }
  public static long[] CaptureBounds(uint pid) {
    var dialogs=new List<IntPtr>();
    EnumWindows((handle,arg)=>{uint owner;GetWindowThreadProcessId(handle,out owner);if(owner==pid&&IsWindowVisible(handle)&&Text(handle)=="确认批量发布")dialogs.Add(handle);return true;},IntPtr.Zero);
    if(dialogs.Count!=1)throw new Exception("No unique native dialog to capture");
    Rect rect;if(!GetWindowRect(dialogs[0],out rect))throw new Exception("Cannot read native dialog bounds");
    return new long[]{dialogs[0].ToInt64(),rect.Right-rect.Left,rect.Bottom-rect.Top};
  }
  public static string Inspect(uint pid, bool confirm, bool nativePlanVerified) {
    var dialogs=new List<IntPtr>();
    EnumWindows((handle,arg)=>{uint owner;GetWindowThreadProcessId(handle,out owner);if(owner==pid&&IsWindowVisible(handle)&&Text(handle)=="确认批量发布")dialogs.Add(handle);return true;},IntPtr.Zero);
    if(dialogs.Count!=1) return "No unique private-test confirmation dialog";
    var texts=new List<string>();var buttons=new List<IntPtr>();
    EnumChildWindows(dialogs[0],(handle,arg)=>{var text=Text(handle);if(IsWindowVisible(handle)&&text.Length>0)texts.Add(text);if(text.Replace("&","")=="确认发布到以上账号"&&IsWindowVisible(handle)&&IsWindowEnabled(handle))buttons.Add(handle);return true;},IntPtr.Zero);
    var detail=string.Join("\n",texts);
    // Windows TaskDialog sometimes exposes only its buttons to GetWindowText.
    // In that case the operator must freshly verify the app's native inspect
    // receipt (account/title/private) first; the app revalidates it after this
    // normal UI click. This never overrides a native confirmation response.
    var textVerified=detail.Contains("Siyu肆")&&detail.Contains("薄肌重启计划第十二天")&&detail.Contains("可见范围：仅自己可见");
    if((!textVerified&&!nativePlanVerified)||buttons.Count!=1) { if(!confirm)return "No click; confirmation text: "+detail;throw new Exception("Dialog scope or private visibility not verified; no click"); }
    if(confirm) { SendMessage(buttons[0],0x00F5,IntPtr.Zero,IntPtr.Zero);return "Confirmed one user-authorized private publish dialog"; }
    return "One matching private publish dialog; not clicked";
  }
}
'@
if ($CapturePath) {
  $matrixDialogBounds=[MatrixPrivateDialog]::CaptureBounds([uint32]$MatrixProcessId)
  $matrixDialogBitmap=[Drawing.Bitmap]::new([int]$matrixDialogBounds[1],[int]$matrixDialogBounds[2])
  try {
    $matrixDialogGraphics=[Drawing.Graphics]::FromImage($matrixDialogBitmap)
    try {
      $matrixDialogDc=$matrixDialogGraphics.GetHdc()
      try { if(-not [MatrixPrivateDialog]::PrintWindow([IntPtr]$matrixDialogBounds[0],$matrixDialogDc,2)){throw 'Cannot capture native dialog'} }
      finally { $matrixDialogGraphics.ReleaseHdc($matrixDialogDc) }
    } finally { $matrixDialogGraphics.Dispose() }
    $matrixDialogBitmap.Save([IO.Path]::GetFullPath($CapturePath),[Drawing.Imaging.ImageFormat]::Png)
  } finally { $matrixDialogBitmap.Dispose() }
  'Captured only the unique native publish-confirmation dialog'
}
[MatrixPrivateDialog]::Inspect([uint32]$MatrixProcessId, [bool]$Confirm, [bool]$NativePlanVerified)
