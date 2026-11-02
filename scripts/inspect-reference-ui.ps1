param([Parameter(Mandatory=$true)][int]$ReferenceProcessId,[switch]$NavigateAccounts,[switch]$OpenAddAccount)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$referenceProcess = Get-Process -Id $ReferenceProcessId
$expectedName = ([char]0x5c0f).ToString() + 'V' + ([char]0x732b).ToString()
if ($referenceProcess.ProcessName -ne $expectedName) { throw 'This inspection is scoped only to the designated reference application.' }
$root = [System.Windows.Automation.AutomationElement]::FromHandle($referenceProcess.MainWindowHandle)
if ($NavigateAccounts) {
  $name = 'user-add ' + ([char]0x8d26).ToString() + ([char]0x53f7).ToString() + ([char]0x7ba1).ToString() + ([char]0x7406).ToString()
  $condition = New-Object System.Windows.Automation.AndCondition @(
    (New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty),$name),
    (New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::ControlTypeProperty),([System.Windows.Automation.ControlType]::TabItem))
  )
  $navigation = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
  if (-not $navigation) { throw 'The reference account-management tab is unavailable.' }
  $pattern = $null
  if ($navigation.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$pattern)) { $pattern.Invoke() }
  else {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ReferenceNavigation {
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hwnd,int command);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
  public struct Point { public int X,Y; }
}
'@
    [ReferenceNavigation]::ShowWindow($referenceProcess.MainWindowHandle,9) | Out-Null
    [ReferenceNavigation]::SetForegroundWindow($referenceProcess.MainWindowHandle) | Out-Null
    Start-Sleep -Milliseconds 300
    $root = [System.Windows.Automation.AutomationElement]::FromHandle($referenceProcess.MainWindowHandle)
    $navigation = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
    if (-not $navigation) { throw 'The reference tab is temporarily unavailable after restoring its window.' }
    $point = $navigation.GetClickablePoint()
    $cursor = New-Object ReferenceNavigation+Point
    [ReferenceNavigation]::GetCursorPos([ref]$cursor) | Out-Null
    [ReferenceNavigation]::SetCursorPos([int]$point.X,[int]$point.Y) | Out-Null
    [ReferenceNavigation]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
    [ReferenceNavigation]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
    [ReferenceNavigation]::SetCursorPos($cursor.X,$cursor.Y) | Out-Null
  }
}
if ($OpenAddAccount) {
  $name = 'plus ' + ([char]0x6dfb).ToString() + ([char]0x52a0).ToString() + ([char]0x8d26).ToString() + ([char]0x53f7).ToString()
  $condition = New-Object System.Windows.Automation.PropertyCondition ([System.Windows.Automation.AutomationElement]::NameProperty),$name
  $add = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants,$condition)
  if (-not $add) { throw 'The reference Add Account button is unavailable.' }
  $pattern = $add.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)
  $pattern.Invoke()
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ReferenceAddNavigation {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hwnd);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out Point point);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags,uint x,uint y,uint data,UIntPtr extra);
  public struct Point { public int X,Y; }
}
'@
  [ReferenceAddNavigation]::SetForegroundWindow($referenceProcess.MainWindowHandle) | Out-Null
  $point = $add.GetClickablePoint()
  $cursor = New-Object ReferenceAddNavigation+Point
  [ReferenceAddNavigation]::GetCursorPos([ref]$cursor) | Out-Null
  [ReferenceAddNavigation]::SetCursorPos([int]$point.X,[int]$point.Y) | Out-Null
  [ReferenceAddNavigation]::mouse_event(2,0,0,0,[UIntPtr]::Zero)
  [ReferenceAddNavigation]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
  [ReferenceAddNavigation]::SetCursorPos($cursor.X,$cursor.Y) | Out-Null
}
$elements = New-Object 'System.Collections.Generic.List[System.Windows.Automation.AutomationElement]'
$elements.Add($root)
$walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
$rows = for ($index=0;$index -lt $elements.Count -and $index -lt 2000;$index++) {
  $element = $elements[$index]
  try { $current = $element.Current } catch { continue }
  if ($current.IsPassword) { continue }
  if ($current.Name) { [PSCustomObject]@{Name=$current.Name;Control=$current.ControlType.ProgrammaticName;Class=$current.ClassName;Enabled=$current.IsEnabled} }
  # Inspect the app UI, not any official page's private account content.
  if ($current.ControlType -eq [System.Windows.Automation.ControlType]::Document -and $current.Name -and $current.Name -ne $expectedName) { continue }
  $child = $walker.GetFirstChild($element)
  while ($child -and $elements.Count -lt 2000) { $elements.Add($child); $child=$walker.GetNextSibling($child) }
}
$rows | ConvertTo-Json -Depth 3
