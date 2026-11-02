param([Parameter(Mandatory=$true)][int]$MatrixProcessId,[ValidateSet('read','accounts','publish','records')][string]$Action='read')
# Normal accessibility inspection/navigation of the installed app only. No
# debugging interface, password values, cookies, platform APIs or final submit.
$ErrorActionPreference='Stop'
$matrixProcess=Get-Process -Id $MatrixProcessId
if ([IO.Path]::GetDirectoryName($matrixProcess.Path) -ne 'D:\Program Files\fullstack-nestjs-template' -or -not $matrixProcess.ProcessName.EndsWith(' Matrix',[StringComparison]::Ordinal)) { throw 'Not the installed Matrix application' }
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$matrixRoot=[Windows.Automation.AutomationElement]::FromHandle($matrixProcess.MainWindowHandle)
if (-not $matrixRoot) { throw 'Installed app window unavailable' }
if ($Action -ne 'read') {
  $matrixNames=@{accounts='\u8d26\u53f7\u7ba1\u7406';publish='\u4e00\u952e\u53d1\u5e03';records='\u4efb\u52a1\u8bb0\u5f55'}
  $matrixName=[regex]::Unescape($matrixNames[$Action])
  $matrixMatches=@($matrixRoot.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition) | Where-Object {
    $matrixCurrent=$_.Current
    -not $matrixCurrent.IsPassword -and -not $matrixCurrent.IsOffscreen -and $matrixCurrent.IsEnabled -and $matrixCurrent.Name -eq $matrixName -and $matrixCurrent.ControlType.ProgrammaticName -in @('ControlType.Button','ControlType.Hyperlink','ControlType.TabItem')
  })
  if ($matrixMatches.Count -ne 1) { throw 'No unique normal app navigation control' }
  $matrixInvoke=$null
  if (-not $matrixMatches[0].TryGetCurrentPattern([Windows.Automation.InvokePattern]::Pattern,[ref]$matrixInvoke)) { throw 'Navigation control has no supported normal invocation' }
  $matrixInvoke.Invoke()
  Start-Sleep -Milliseconds 400
}
$matrixLabels=@()
foreach ($matrixElement in $matrixRoot.FindAll([Windows.Automation.TreeScope]::Descendants,[Windows.Automation.Condition]::TrueCondition)) {
  try {
    $matrixCurrent=$matrixElement.Current
    if ($matrixCurrent.IsPassword -or $matrixCurrent.IsOffscreen -or -not $matrixCurrent.Name -or $matrixCurrent.Name.Length -gt 200) { continue }
    $matrixParent=[Windows.Automation.TreeWalker]::ControlViewWalker.GetParent($matrixElement)
    $matrixLabels+=[pscustomobject]@{name=$matrixCurrent.Name;kind=$matrixCurrent.ControlType.ProgrammaticName;className=$matrixCurrent.ClassName;automationId=$matrixCurrent.AutomationId;enabled=$matrixCurrent.IsEnabled;parentClass=if($matrixParent){$matrixParent.Current.ClassName}else{''}}
    if ($matrixLabels.Count -ge 180) { break }
  } catch [System.Windows.Automation.ElementNotAvailableException] {}
}
[pscustomobject]@{processId=$MatrixProcessId;navigation=$Action;credentialValuesRead=$false;controls=$matrixLabels} | ConvertTo-Json -Depth 4 -Compress
