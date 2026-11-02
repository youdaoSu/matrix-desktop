param([Parameter(Mandatory=$true)][int]$MatrixProcessId,[ValidateSet('inspect','open','cancel')][string]$Action='inspect')
# Normal Windows accessibility/mouse only: the visible vertical cover's Edit.
# Never publishes, fills fields, selects files or reads input/credential values.
$ErrorActionPreference='Stop'
$matrixProcess=Get-Process -Id $MatrixProcessId
if([IO.Path]::GetDirectoryName($matrixProcess.Path) -ne 'D:\Program Files\fullstack-nestjs-template'){throw 'Unexpected installed Matrix process'}
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;
public static class MatrixCoverPointer {
 [StructLayout(LayoutKind.Sequential)] struct Point {public int X,Y;public Point(int x,int y){X=x;Y=y;}}
 [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] static extern IntPtr WindowFromPoint(Point p);
 [DllImport("user32.dll")] static extern IntPtr GetAncestor(IntPtr h,uint f);
 [DllImport("user32.dll")] static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 public static void Click(IntPtr main,int x,int y){SetForegroundWindow(main);System.Threading.Thread.Sleep(200);if(GetForegroundWindow()!=main||GetAncestor(WindowFromPoint(new Point(x,y)),2)!=main)throw new Exception("Owned cover is not foreground/clear; no click");if(!SetCursorPos(x,y))throw new Exception("No pointer");mouse_event(2,0,0,0,UIntPtr.Zero);mouse_event(4,0,0,0,UIntPtr.Zero);}
}
'@
$matrixRoot=[Windows.Automation.AutomationElement]::FromHandle($matrixProcess.MainWindowHandle)
if($Action -eq 'cancel'){
  $matrixCancelMatches=@()
  foreach($matrixElement in $matrixRoot.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)){
    $matrixCurrent=$matrixElement.Current
    if($matrixCurrent.IsPassword -or $matrixCurrent.IsOffscreen -or -not $matrixCurrent.IsEnabled -or $matrixCurrent.Name -ne [regex]::Unescape('\u53d6\u6d88') -or $matrixCurrent.ControlType -ne [Windows.Automation.ControlType]::Button){continue}
    $matrixParent=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($matrixElement)
    for($matrixDepth=0;$matrixParent -and $matrixDepth -lt 3;$matrixDepth++){
      if($matrixParent.Current.ClassName -eq 'finder-common-dialog edit-cover-dialog'){$matrixCancelMatches+=,$matrixElement;break}
      $matrixParent=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($matrixParent)
    }
  }
  if($matrixCancelMatches.Count -ne 1){throw 'No unique cover-only cancel button'}
  $matrixCancelPattern=$null
  if(-not $matrixCancelMatches[0].TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$matrixCancelPattern)){throw 'Cover cancel has no normal invoke'}
  $matrixCancelPattern.Invoke()
  'Cancelled only the inspected cover dialog; no upload or publication'
  exit
}
$matrixCoverMatches=@()
foreach($matrixElement in $matrixRoot.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)){
  $matrixCurrent=$matrixElement.Current
  if($matrixCurrent.IsPassword -or $matrixCurrent.IsOffscreen -or -not $matrixCurrent.IsEnabled -or $matrixCurrent.Name -ne [regex]::Unescape('\u7f16\u8f91')){continue}
  $matrixParent=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($matrixElement)
  if($matrixParent -and $matrixParent.Current.ClassName -eq 'vertical-cover-wrap img-popover-wrap'){$matrixCoverMatches+=,$matrixElement}
}
if($matrixCoverMatches.Count -ne 1){throw 'No unique observed vertical-cover edit control'}
$matrixCoverElement=$matrixCoverMatches[0]
if($Action -eq 'open'){
  $matrixCoverRect=$matrixCoverElement.Current.BoundingRectangle
  if($matrixCoverRect.Width -lt 5 -or $matrixCoverRect.Height -lt 5){throw 'Observed cover label has no visible bounds'}
  [MatrixCoverPointer]::Click($matrixProcess.MainWindowHandle,[int]($matrixCoverRect.Left+$matrixCoverRect.Width/2),[int]($matrixCoverRect.Top+$matrixCoverRect.Height/2))
}
[pscustomobject]@{action=$Action;matched=1;exactParentClass='vertical-cover-wrap img-popover-wrap';valuesRead=$false;submitted=$false}|ConvertTo-Json -Compress
