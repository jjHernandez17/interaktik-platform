# Genera frontend\downloads\installer.json: la lista que usa el instalador para actualizarse solo.
#   - version: la del instalador compilado (BuildInfo.generated.cs, lo escribe build.cmd)
#   - sha256 del instalador y de cada mod publicado en frontend\downloads
# Se ejecuta solo al final de build.cmd. Si cambias un mod SIN recompilar el instalador (por ejemplo
# InteraktikCubo.jar), vuelve a ejecutarlo para que los streamers reciban el mod nuevo:
#   powershell -ExecutionPolicy Bypass -File gta-installer\publish-manifest.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$downloads = Join-Path $root '..\frontend\downloads'
$info = Get-Content (Join-Path $root 'BuildInfo.generated.cs') -Raw
if ($info -notmatch 'Version\s*=\s*(\d+)L?') { throw 'No encuentro la version en BuildInfo.generated.cs' }
$version = [int64]$Matches[1]

function Hash($name) {
  $path = Join-Path $downloads $name
  if (-not (Test-Path $path)) { return $null }
  return (Get-FileHash $path -Algorithm SHA256).Hash.ToLower()
}

$files = [ordered]@{}
foreach ($name in 'InteraktikGTA.dll', 'InteraktikMod.jar', 'InteraktikCubo.jar') {
  $h = Hash $name
  if ($h) { $files[$name] = $h }
}

$exe = 'InteraktikInstaller.exe'
$manifest = [ordered]@{
  version = $version
  file    = $exe
  sha256  = (Hash $exe)
  files   = $files
}
$json = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText((Join-Path $downloads 'installer.json'), $json, (New-Object System.Text.UTF8Encoding($false)))
Write-Host "installer.json listo (version $version)"
