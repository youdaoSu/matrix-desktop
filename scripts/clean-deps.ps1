param([string]$Target = 'node_modules')
$root = Join-Path (Get-Location) $Target
if (-not (Test-Path $root)) { Write-Output '  无 node_modules，跳过清理。'; exit 0 }

$dirs = @(Get-ChildItem -LiteralPath $root -Directory -Force)
$total = $dirs.Count
Write-Output ("  待清理顶层目录: " + $total + " 个")
$i = 0
foreach ($d in $dirs) {
  $i++
  $pct = [math]::Floor($i * 100 / $total)
  if ($pct -gt 100) { $pct = 100 }
  $filled = [math]::Floor($pct / 5)
  $bar = ('#' * $filled) + ('.' * (20 - $filled))
  $name = $d.Name
  if ($name.Length -gt 38) { $name = $name.Substring(0, 38) }
  Write-Host ("`r  [" + $bar + "] " + $i + "/" + $total + " (" + $pct + "%)  删除: " + $name + "        ") -NoNewline
  & cmd /c "attrib -r -s -h `"$($d.FullName)`" /s /d >nul 2>nul & rd /s /q `"$($d.FullName)`""
}
$rest = @(Get-ChildItem -LiteralPath $root -Force -ErrorAction SilentlyContinue)
if ($rest.Count -gt 0) {
  & cmd /c "attrib -r -s -h `"$root`" /s /d >nul 2>nul & rd /s /q `"$root`""
}
Write-Host ""
Write-Output "  [OK] node_modules 已清理完成。"