param([Parameter(Mandatory=$true)][int]$MatrixProcessId)
# One normal mouse click on the visible Matrix publish navigation, based on the
# freshly inspected 1440x900 window image. No official page or submit is clicked.
$ErrorActionPreference='Stop'
$matrixProcess=Get-Process -Id $MatrixProcessId
if([IO.Path]::GetDirectoryName($matrixProcess.Path) -ne 'D:\Program Files\fullstack-nestjs-template'){throw 'Unexpected installed app'}
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class MatrixPublishNavClick {
 [StructLayout(LayoutKind.Sequential)] struct Rect {public int Left,Top,Right,Bottom;}
 [StructLayout(LayoutKind.Sequential)] struct Point {public int X,Y;public Point(int x,int y){X=x;Y=y;}}
 [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr context);
 [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr handle,out Rect rect);
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr handle);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point point);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr handle,uint flags);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern void mouse_event(uint flags,uint dx,uint dy,uint data,UIntPtr extra);
 public static void Click(IntPtr handle){
  SetProcessDpiAwarenessContext(new IntPtr(-4));
  Rect rect;if(!GetWindowRect(handle,out rect)||rect.Right-rect.Left!=1800||rect.Bottom-rect.Top!=1125)throw new Exception("Window size changed; inspect a new screenshot first");
  SetForegroundWindow(handle);System.Threading.Thread.Sleep(250);
  if(GetForegroundWindow()!=handle)throw new Exception("Matrix is not foreground; no click");
  var point=new Point(rect.Left+638,rect.Top+81);
  if(GetAncestor(WindowFromPoint(point),2)!=handle)throw new Exception("Navigation is covered; no click");
  if(!SetCursorPos(point.X,point.Y))throw new Exception("Pointer unavailable");
  mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);
 }
}
'@
[MatrixPublishNavClick]::Click($matrixProcess.MainWindowHandle)
'Clicked only the inspected Matrix publish navigation; no platform submission'
