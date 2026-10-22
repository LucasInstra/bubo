$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $root "src-tauri\target\release\bubo.exe"
if (-not (Test-Path $exe)) {
  throw "Build the app first: npm run tauri build"
}

$out = Join-Path $root "src-tauri\target\release\bubo-portable-x64.zip"
Compress-Archive -Path $exe -DestinationPath $out -Force
Write-Output $out
