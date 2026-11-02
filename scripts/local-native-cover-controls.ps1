param([Parameter(Mandatory=$true)][int]$MatrixProcessId)
# Read-only Windows accessibility labels inside the installed Matrix window.
# No ValuePattern/passwords, cookies, network API or InvokePattern is used.
$ErrorActionPreference='Stop'
$matrixProcess=Get-Process -Id $MatrixProcessId
if ([IO.Path]::GetDirectoryName($matrixProcess.Path) -ne 'D:\Program Files\fullstack-nestjs-template') { throw 'Not installed Matrix' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$matrixRoot=[Windows.Automation.AutomationElement]::FromHandle($matrixProcess.MainWindowHandle)
if (-not $matrixRoot) { throw 'No installed UI root' }
$matrixElements=$matrixRoot.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)
$matrixLabels=@()
foreach ($matrixElement in $matrixElements) {
  try {
    $matrixCurrent=$matrixElement.Current
    if ($matrixCurrent.IsPassword -or -not $matrixCurrent.Name -or $matrixCurrent.Name.Length -gt 180) { continue }
    # Unicode escapes avoid Windows PowerShell 5's source-code ANSI decoding.
    if ($matrixCurrent.Name -notmatch '\u5c01\u9762|^\u7f16\u8f91$|\u6b63\u5728\u5904\u7406\u6587\u4ef6|^\u751f\u6210\u4e2d$|^\u53d1\u8868$|\u66f4\u6362|\u88c1\u526a|^\u786e\u5b9a$|^\u5b8c\u6210$|^\u53d6\u6d88$|\u4ec5\u81ea\u5df1') { continue }
    $matrixParents=@()
    $matrixParent=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($matrixElement)
    for($matrixDepth=0;$matrixParent -and $matrixDepth -lt 4;$matrixDepth++){
      $matrixParentInfo=$matrixParent.Current
      if($matrixParentInfo.IsPassword){break}
      $matrixParents+=[pscustomobject]@{kind=$matrixParentInfo.ControlType.ProgrammaticName;className=$matrixParentInfo.ClassName}
      $matrixParent=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($matrixParent)
    }
    $matrixLabels+=[pscustomobject]@{name=$matrixCurrent.Name;kind=$matrixCurrent.ControlType.ProgrammaticName;className=$matrixCurrent.ClassName;automationId=$matrixCurrent.AutomationId;enabled=$matrixCurrent.IsEnabled;offscreen=$matrixCurrent.IsOffscreen;parents=$matrixParents}
    if ($matrixLabels.Count -ge 60) { break }
  } catch [System.Windows.Automation.ElementNotAvailableException] {}
}
$matrixLabels | ConvertTo-Json -Compress -Depth 5
