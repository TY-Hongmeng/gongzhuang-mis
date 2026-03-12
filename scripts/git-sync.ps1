[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string[]]$Message,
  [string[]]$Files
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
Invoke-Git pull --rebase --autostash origin main
Invoke-Git push origin main
