Param(
  [string]$SupabaseAccessToken,
  [string]$ProjectRef,
  [string]$SupabaseUrl,
  [string]$ServiceRoleKey,
  [string]$GithubRepo = "TY-Hongmeng/gongzhuang-mis"
)

function Ensure-SupabaseCLI {
  if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
    Write-Host "Installing Supabase CLI..."
    iwr -useb https://raw.githubusercontent.com/supabase/cli/main/install.ps1 | iex
  }
}

function Ensure-LoggedIn($Token) {
  if ($Token) {
    supabase login --token $Token | Out-Null
  } else {
    supabase login | Out-Null
  }
}

function Link-Project($Ref) {
  supabase link --project-ref $Ref | Out-Null
}

function Set-FunctionSecrets($Url, $Key) {
  supabase secrets set SUPABASE_URL="$Url" SUPABASE_SERVICE_ROLE_KEY="$Key" | Out-Null
}

function Deploy-ApiFunction {
  supabase functions deploy api --no-verify-jwt | Out-Null
}

function Print-NextSteps($Ref, $Repo, $Url) {
  $fnBase = "https://$Ref.functions.supabase.co"
  Write-Host ""; Write-Host "=== Deployment Summary ==="
  Write-Host ("Edge Function base: {0}" -f $fnBase)
  Write-Host ("Set the following GitHub Actions repository secrets for {0}:" -f $Repo)
  Write-Host ("  VITE_API_URL            = {0}" -f $fnBase)
  Write-Host ("  VITE_SUPABASE_URL      = {0}" -f $Url)
  Write-Host "  VITE_SUPABASE_ANON_KEY = <your ANON key from Supabase>"
  Write-Host "Then re-run the 'Deploy Frontend to GitHub Pages' workflow and set Pages source to gh-pages."
}

Ensure-SupabaseCLI
Ensure-LoggedIn $SupabaseAccessToken
Link-Project $ProjectRef
Set-FunctionSecrets $SupabaseUrl $ServiceRoleKey
Deploy-ApiFunction
Print-NextSteps $ProjectRef $GithubRepo $SupabaseUrl
