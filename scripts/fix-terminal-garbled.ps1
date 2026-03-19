$ErrorActionPreference = 'Stop'

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backupRoot = Join-Path $env:USERPROFILE ".terminal-fix-backup-$timestamp"
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null

$profilePaths = @(
  Join-Path $env:USERPROFILE 'Documents\PowerShell\profile.ps1'
  Join-Path $env:USERPROFILE 'Documents\PowerShell\Microsoft.PowerShell_profile.ps1'
  Join-Path $env:USERPROFILE 'Documents\WindowsPowerShell\profile.ps1'
  Join-Path $env:USERPROFILE 'Documents\WindowsPowerShell\Microsoft.PowerShell_profile.ps1'
)

foreach ($p in $profilePaths) {
  if (Test-Path -LiteralPath $p) {
    $safeName = ($p -replace '[:\\\/]', '_')
    Copy-Item -LiteralPath $p -Destination (Join-Path $backupRoot "$safeName.bak") -Force
    $disabledPath = "$p.disabled"
    if (Test-Path -LiteralPath $disabledPath) {
      $disabledSafeName = ($disabledPath -replace '[:\\\/]', '_')
      Copy-Item -LiteralPath $disabledPath -Destination (Join-Path $backupRoot "$disabledSafeName.bak") -Force
      Remove-Item -LiteralPath $disabledPath -Force
    }
    Rename-Item -LiteralPath $p -NewName ([System.IO.Path]::GetFileName($p) + '.disabled') -Force
  }
}

$cmdRegPaths = @(
  'HKCU:\Software\Microsoft\Command Processor',
  'HKLM:\Software\Microsoft\Command Processor'
)

foreach ($rp in $cmdRegPaths) {
  if (Test-Path $rp) {
    try {
      $v = (Get-ItemProperty -Path $rp -Name AutoRun -ErrorAction Stop).AutoRun
      if ($null -ne $v -and "$v".Trim() -ne '') {
        $safeName = ($rp -replace '[:\\\/]', '_')
        Set-Content -Path (Join-Path $backupRoot "$safeName-AutoRun.txt") -Value "$v" -Encoding utf8
        Remove-ItemProperty -Path $rp -Name AutoRun -ErrorAction Stop
      }
    } catch {
    }
  }
}

$userPrompt = [Environment]::GetEnvironmentVariable('PROMPT', 'User')
if ($null -ne $userPrompt -and $userPrompt.Trim() -ne '') {
  Set-Content -Path (Join-Path $backupRoot 'PROMPT-User.txt') -Value $userPrompt -Encoding utf8
  [Environment]::SetEnvironmentVariable('PROMPT', $null, 'User')
}

$machinePrompt = [Environment]::GetEnvironmentVariable('PROMPT', 'Machine')
if ($null -ne $machinePrompt -and $machinePrompt.Trim() -ne '') {
  Set-Content -Path (Join-Path $backupRoot 'PROMPT-Machine.txt') -Value $machinePrompt -Encoding utf8
}

$coreProfileDir = Join-Path $env:USERPROFILE 'Documents\PowerShell'
$desktopProfileDir = Join-Path $env:USERPROFILE 'Documents\WindowsPowerShell'
New-Item -ItemType Directory -Path $coreProfileDir -Force | Out-Null
New-Item -ItemType Directory -Path $desktopProfileDir -Force | Out-Null

$cleanProfile = @"
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new(`$false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(`$false)
`$OutputEncoding = [System.Text.UTF8Encoding]::new(`$false)
"@

Set-Content -Path (Join-Path $coreProfileDir 'Microsoft.PowerShell_profile.ps1') -Value $cleanProfile -Encoding utf8
Set-Content -Path (Join-Path $desktopProfileDir 'Microsoft.PowerShell_profile.ps1') -Value $cleanProfile -Encoding utf8

try {
  Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction Stop
  $policyResult = 'EXEC_POLICY_SET=CurrentUser:RemoteSigned'
} catch {
  $policyResult = 'EXEC_POLICY_SET_FAILED'
}

Write-Output "TERMINAL_FIX_DONE"
Write-Output "BACKUP_PATH=$backupRoot"
Write-Output $policyResult
