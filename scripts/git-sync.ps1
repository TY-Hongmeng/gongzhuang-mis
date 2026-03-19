[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string[]]$Message,
  [string[]]$Files,
  [int]$Retry = 3
)

$ErrorActionPreference = 'Stop'

$commitMessage = ($Message -join ' ').Trim()
if (-not $commitMessage) {
  throw "Commit message is required."
}

try {
  $gitCommand = Get-Command git.exe -ErrorAction Stop
  $git = $gitCommand.Source
} catch {
  throw "git.exe not found in PATH."
}

function Invoke-Git {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)
  & $git @Args
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git $($Args -join ' ')"
  }
}

if ($Files -and $Files.Count -gt 0) {
  Invoke-Git add -- $Files
} else {
  Invoke-Git add -A -- .
}

$staged = (& $git diff --cached --name-only)
if (-not $staged) {
  Write-Output "No staged changes. Exit."
  exit 0
}

Invoke-Git commit -m $commitMessage

$remoteRef = 'refs/heads/main'
$attempt = 0
while ($attempt -lt [Math]::Max(1, $Retry)) {
  $attempt += 1
  $remoteLine = (& $git ls-remote origin $remoteRef)
  if ($LASTEXITCODE -ne 0) {
    throw "Git command failed: git ls-remote origin $remoteRef"
  }
  $remoteHead = ''
  if ($remoteLine) {
    $remoteHead = ($remoteLine -split '\s+')[0]
  }
  if ($remoteHead) {
    & $git push "--force-with-lease=$remoteRef`:$remoteHead" origin "HEAD:$remoteRef"
  } else {
    & $git push origin "HEAD:$remoteRef"
  }
  if ($LASTEXITCODE -eq 0) {
    break
  }
  if ($attempt -ge [Math]::Max(1, $Retry)) {
    throw "Git push failed after $attempt attempts."
  }
}

$localHead = (& $git rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) {
  throw "Git command failed: git rev-parse HEAD"
}
$remoteVerifyLine = (& $git ls-remote origin $remoteRef)
if ($LASTEXITCODE -ne 0) {
  throw "Git command failed: git ls-remote origin $remoteRef"
}
$remoteVerify = ($remoteVerifyLine -split '\s+')[0]
if (-not $localHead -or -not $remoteVerify -or $localHead -ne $remoteVerify) {
  throw "Git sync verify failed: local=$localHead remote=$remoteVerify"
}
Write-Output "Git sync verified: $localHead"
