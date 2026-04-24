#Requires -Version 5.1
<#
.SYNOPSIS
  Sign dist/FortDefendAgent.exe with Windows signtool (Authenticode).
.DESCRIPTION
  Modes (first match wins):
  1) PFX: set CODE_SIGN_PFX (Base64) and CODE_SIGN_PFX_PASSWORD — typical for GitHub Actions secrets.
  2) Store: set CODE_SIGN_THUMBPRINT — certificate must already be in a store (e.g. EV on a self-hosted
     runner with smart card / HSM / imported cert).
  If neither is set, exits 0 with -SkipIfNoCert; otherwise exits 1.
  True EV with hardware token is usually done on a self-hosted Windows runner; use -SkipIfNoCert on dev machines without cert.
#>
param(
  [string] $ExePath = "",
  [string] $TimestampUrl = "http://timestamp.digicert.com",
  [string] $Description = "FortDefend Windows Agent",
  [switch] $SkipIfNoCert
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ExePath) {
  $ExePath = Join-Path $Root "dist\FortDefendAgent.exe"
} elseif (-not [System.IO.Path]::IsPathRooted($ExePath)) {
  $ExePath = Join-Path $Root $ExePath
}

if (-not (Test-Path -LiteralPath $ExePath)) {
  Write-Error "Executable not found: $ExePath (run npm run build first)"
}

function Find-SignTool {
  $candidates = @(
    Get-ChildItem -Path "${env:ProgramFiles(x86)}\Windows Kits\10\bin" -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue
    Get-ChildItem -Path "${env:ProgramFiles}\Windows Kits\10\bin" -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue
  ) | Where-Object { $_.FullName -match "\\x64\\signtool\.exe$" } | Sort-Object FullName -Descending
  if ($candidates) {
    return $candidates[0].FullName
  }
  $cmd = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Path }
  return $null
}

$hasPfx = -not [string]::IsNullOrWhiteSpace($env:CODE_SIGN_PFX)
$hasThumb = -not [string]::IsNullOrWhiteSpace($env:CODE_SIGN_THUMBPRINT)

if (-not $hasPfx -and -not $hasThumb) {
  if ($SkipIfNoCert) {
    Write-Warning "Signing skipped: set CODE_SIGN_PFX + CODE_SIGN_PFX_PASSWORD, or CODE_SIGN_THUMBPRINT."
    exit 0
  }
  Write-Error "No signing material: set CODE_SIGN_PFX and CODE_SIGN_PFX_PASSWORD, or CODE_SIGN_THUMBPRINT."
}

$signtool = Find-SignTool
if (-not $signtool) {
  Write-Error "signtool.exe not found. Install the Windows 10/11 SDK (includes signtool) or add its directory to PATH."
}
Write-Host "Using signtool: $signtool"
Write-Host "Signing: $ExePath"

if ($hasPfx) {
  $tmp = [System.IO.Path]::GetTempFileName() + ".pfx"
  try {
    $bytes = [Convert]::FromBase64String($env:CODE_SIGN_PFX.Trim())
    [System.IO.File]::WriteAllBytes($tmp, $bytes)
    $pass = if ($null -ne $env:CODE_SIGN_PFX_PASSWORD) { $env:CODE_SIGN_PFX_PASSWORD } else { "" }
    & $signtool sign /f $tmp /p $pass /tr $TimestampUrl /td sha256 /fd sha256 /d $Description $ExePath
    if ($LASTEXITCODE -ne 0) { throw "signtool failed with exit $LASTEXITCODE" }
  }
  finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
  }
}
else {
  $thumb = $env:CODE_SIGN_THUMBPRINT.Trim() -replace " ", ""
  $store = if ($env:CODE_SIGN_STORE) { $env:CODE_SIGN_STORE } else { "My" }
  & $signtool sign /sha1 $thumb /s $store /tr $TimestampUrl /td sha256 /fd sha256 /d $Description $ExePath
  if ($LASTEXITCODE -ne 0) { throw "signtool failed with exit $LASTEXITCODE" }
}

Write-Host "Signed successfully."
& $signtool "verify" "/pa" "/v" $ExePath
if ($LASTEXITCODE -ne 0) { throw "signtool verify failed with exit $LASTEXITCODE" }
