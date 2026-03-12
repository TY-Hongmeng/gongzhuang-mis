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

if ($Files -and $Files.Count -gt 0) {
  git add -- $Files
} else {
  git add -A
}

$staged = (git diff --cached --name-only)
if (-not $staged) {
  Write-Output "No staged changes. Exit."
  exit 0
}

git commit -m $commitMessage
git pull --rebase --autostash origin main
git push origin main
