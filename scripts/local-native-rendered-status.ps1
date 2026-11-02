param([Parameter(Mandatory=$true)][int]$MatrixProcessId,[switch]$IncludeOffscreen)
# Normal Windows accessibility for the one visible native child owned by Matrix.
# Only short, non-editable text labels and public classes; no values or actions.
$ErrorActionPreference='Stop'
$matrixProcess=Get-Process -Id $MatrixProcessId
if([IO.Path]::GetDirectoryName($matrixProcess.Path) -ne 'D:\Program Files\fullstack-nestjs-template'){throw 'Unexpected installed process'}
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
Add-Type -TypeDefinition @'
using System;using System.Collections.Generic;using System.Runtime.InteropServices;using System.Text;
public static class MatrixNativeReadRoot {
 delegate bool EnumProc(IntPtr h,IntPtr arg);
 [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr h,EnumProc p,IntPtr arg);
 [DllImport("user32.dll")] static extern IntPtr GetParent(IntPtr h);
 [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder s,int n);
 public static IntPtr Find(IntPtr main){var rows=new List<IntPtr>();EnumChildWindows(main,(h,a)=>{var c=new StringBuilder(150);GetClassName(h,c,150);if(GetParent(h)==main&&IsWindowVisible(h)&&c.ToString().StartsWith("WindowsForms10.Window."))rows.Add(h);return true;},IntPtr.Zero);if(rows.Count!=1)throw new Exception("No unique visible owned native child");return rows[0];}
}
'@
$matrixRoot=[Windows.Automation.AutomationElement]::FromHandle([MatrixNativeReadRoot]::Find($matrixProcess.MainWindowHandle))
$matrixRows=@()
foreach($matrixElement in $matrixRoot.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)){
 try{
  $matrixCurrent=$matrixElement.Current
  if($matrixCurrent.IsPassword -or ($matrixCurrent.IsOffscreen -and -not $IncludeOffscreen) -or -not $matrixCurrent.Name -or $matrixCurrent.Name.Length -gt 180){continue}
  if($matrixCurrent.ControlType -ne [Windows.Automation.ControlType]::Text -and $matrixCurrent.ControlType -ne [Windows.Automation.ControlType]::Button){continue}
  $matrixParents=@();$matrixParent=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($matrixElement)
  for($matrixDepth=0;$matrixParent -and $matrixDepth -lt 3;$matrixDepth++){
   $matrixInfo=$matrixParent.Current
   if($matrixInfo.IsPassword){break}
   $matrixParents+=[pscustomobject]@{className=$matrixInfo.ClassName;kind=$matrixInfo.ControlType.ProgrammaticName}
   $matrixParent=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($matrixParent)
  }
  $matrixRows+=[pscustomobject]@{name=$matrixCurrent.Name;className=$matrixCurrent.ClassName;kind=$matrixCurrent.ControlType.ProgrammaticName;enabled=$matrixCurrent.IsEnabled;offscreen=$matrixCurrent.IsOffscreen;parents=$matrixParents}
  if($matrixRows.Count -ge 120){break}
 }catch [Windows.Automation.ElementNotAvailableException]{}
}
[pscustomobject]@{readOnly=$true;credentialValuesRead=$false;labels=$matrixRows}|ConvertTo-Json -Compress -Depth 5
