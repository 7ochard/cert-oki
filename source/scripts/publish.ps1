$ErrorActionPreference = 'Stop'
$sourceRoot = Split-Path -Parent $PSScriptRoot
$workspaceRoot = Split-Path -Parent $sourceRoot
$buildRoot = Join-Path $sourceRoot 'dist'
$appRoot = Join-Path $workspaceRoot 'Cert-oki-one-click\app'
if (!(Test-Path -LiteralPath (Join-Path $buildRoot 'index.html'))) { throw 'Run npm run build in source first.' }
if (!(Test-Path -LiteralPath (Join-Path $appRoot 'index.html'))) { throw 'Existing app was not found; publishing stopped.' }
$backupRoot = Join-Path $workspaceRoot ('output\backups\app-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $backupRoot | Out-Null
Get-ChildItem -LiteralPath $appRoot -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $backupRoot -Recurse }
# Keep old hashed assets so already-open pages still resolve lazy imports.
Get-ChildItem -LiteralPath $buildRoot -Force | Where-Object Name -NE 'index.html' | ForEach-Object {
  if ($_.PSIsContainer) {
    $destination = Join-Path $appRoot $_.Name
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    Get-ChildItem -LiteralPath $_.FullName -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force }
  } else { Copy-Item -LiteralPath $_.FullName -Destination $appRoot -Force }
}
# Publish the entrypoint last, after all its dependencies are in place.
Copy-Item -LiteralPath (Join-Path $buildRoot 'index.html') -Destination (Join-Path $appRoot 'index.html') -Force
Write-Output "Published: $appRoot"
Write-Output "Backup: $backupRoot"
