param([Parameter(Mandatory=$true)][int]$MatrixProcessId,[switch]$RestoreWindow,[switch]$RaiseNativeChild)
# Physical HWND diagnostics. Optional restore is confined to the installed app;
# it does not click a webpage, upload media, or alter any login/session data.
$ErrorActionPreference='Stop'
if ($RestoreWindow -or $RaiseNativeChild) {
  $matrixExecutable=(Get-Process -Id $MatrixProcessId).Path
  if ([IO.Path]::GetDirectoryName($matrixExecutable) -ne 'D:\Program Files\fullstack-nestjs-template' -or -not [IO.Path]::GetFileName($matrixExecutable).EndsWith(' Matrix.exe',[StringComparison]::Ordinal)) { throw 'Not the installed Matrix process' }
}
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class MatrixWindowLayout {
  public delegate bool EnumProc(IntPtr handle,IntPtr arg);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc p,IntPtr arg);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,EnumProc p,IntPtr arg);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h,out uint pid);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h,out RECT r);
  [DllImport("user32.dll")] static extern bool GetClientRect(IntPtr h,out RECT r);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h,int command);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int width,int height,uint flags);
  [DllImport("user32.dll")] static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
  [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(POINT p);
  [DllImport("user32.dll")] static extern bool ScreenToClient(IntPtr h,ref POINT p);
  [DllImport("user32.dll")] static extern IntPtr ChildWindowFromPointEx(IntPtr h,POINT p,uint flags);
  [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int count);
  [StructLayout(LayoutKind.Sequential)] struct RECT {public int Left,Top,Right,Bottom;}
  [StructLayout(LayoutKind.Sequential)] struct POINT {public int X,Y;}
  static string Class(IntPtr h){var s=new StringBuilder(256);GetClassName(h,s,256);return s.ToString();}
  static object Info(IntPtr h){uint pid;GetWindowThreadProcessId(h,out pid);RECT r;GetWindowRect(h,out r);RECT c;GetClientRect(h,out c);var point=new POINT{X=(r.Left+r.Right)/2,Y=(r.Top+r.Bottom)/2};var hit=WindowFromPoint(point);var parent=GetParent(h);var parentHit=IntPtr.Zero;if(parent!=IntPtr.Zero){ScreenToClient(parent,ref point);parentHit=ChildWindowFromPointEx(parent,point,7);}return new{handle=h.ToInt64(),parent=parent.ToInt64(),pid,kind=Class(h),visible=IsWindowVisible(h),enabled=IsWindowEnabled(h),x=r.Left,y=r.Top,width=r.Right-r.Left,height=r.Bottom-r.Top,clientWidth=c.Right,clientHeight=c.Bottom,parentHitHandle=parentHit.ToInt64(),centerHitHandle=hit.ToInt64(),centerHitClass=Class(hit)};}
  public static object[] Inspect(uint owner){var prior=SetThreadDpiAwarenessContext(new IntPtr(-4));try{var rows=new List<object>();EnumWindows((h,a)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid!=owner)return true;rows.Add(Info(h));EnumChildWindows(h,(child,b)=>{rows.Add(Info(child));return true;},IntPtr.Zero);return true;},IntPtr.Zero);return rows.ToArray();}finally{if(prior!=IntPtr.Zero)SetThreadDpiAwarenessContext(prior);}}
  public static void Restore(uint owner){var roots=new List<IntPtr>();EnumWindows((h,a)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==owner&&GetParent(h)==IntPtr.Zero&&Class(h)=="Chrome_WidgetWin_1"&&IsWindowVisible(h))roots.Add(h);return true;},IntPtr.Zero);if(roots.Count!=1)throw new Exception("No unique installed main window");ShowWindow(roots[0],9);SetForegroundWindow(roots[0]);}
  public static void RaiseChild(uint owner){var roots=new List<IntPtr>();EnumWindows((h,a)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==owner&&GetParent(h)==IntPtr.Zero&&Class(h)=="Chrome_WidgetWin_1"&&IsWindowVisible(h))roots.Add(h);return true;},IntPtr.Zero);if(roots.Count!=1)throw new Exception("No unique Matrix window");var children=new List<IntPtr>();EnumChildWindows(roots[0],(h,a)=>{if(GetParent(h)==roots[0]&&Class(h).StartsWith("WindowsForms10.Window.")&&IsWindowVisible(h))children.Add(h);return true;},IntPtr.Zero);if(children.Count!=1)throw new Exception("No unique visible native child");SetWindowPos(children[0],IntPtr.Zero,0,0,0,0,0x0013);}
}
'@
if ($RestoreWindow) { [MatrixWindowLayout]::Restore([uint32]$MatrixProcessId); Start-Sleep -Milliseconds 1500 }
if ($RaiseNativeChild) { [MatrixWindowLayout]::RaiseChild([uint32]$MatrixProcessId); Start-Sleep -Milliseconds 200 }
[MatrixWindowLayout]::Inspect([uint32]$MatrixProcessId) | ConvertTo-Json -Depth 5 -Compress
