param([string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups'))
$ErrorActionPreference = 'Stop'
function Import-DotEnv([string]$Path) {
  if (!(Test-Path -LiteralPath $Path)) { return }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$' -and !(Test-Path "Env:$($Matches[1])")) {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"', "'"), 'Process')
    }
  }
}
function Find-PgTool([string]$Name) {
  $found = Get-Command $Name -ErrorAction SilentlyContinue
  if ($found) { return $found.Source }
  $candidate = Get-ChildItem 'C:\Program Files\PostgreSQL' -Filter "$Name.exe" -Recurse -ErrorAction SilentlyContinue | Where-Object { $_.FullName -match '\\bin\\' } | Select-Object -First 1
  if (!$candidate) { throw "$Name no está disponible." }
  return $candidate.FullName
}
Import-DotEnv (Join-Path $PSScriptRoot '..\.env')
foreach ($name in 'DB_HOST','DB_PORT','DB_NAME','DB_USER') { if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($name))) { throw "Falta $name." } }
$pgDump = Find-PgTool 'pg_dump'
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd_HHmmss_fff'
$backupPath = Join-Path $resolvedOutput "physio_active_$stamp.backup"
if (Test-Path -LiteralPath $backupPath) { throw 'El respaldo ya existe; no se sobrescribirá.' }
$previousPassword = $env:PGPASSWORD
try {
  $env:PGPASSWORD = $env:DB_PASSWORD
  & $pgDump --host $env:DB_HOST --port $env:DB_PORT --username $env:DB_USER --dbname $env:DB_NAME --format custom --compress 9 --file $backupPath --no-password
  if ($LASTEXITCODE -ne 0) { throw "pg_dump terminó con código $LASTEXITCODE." }
} finally { $env:PGPASSWORD = $previousPassword }
if (!(Test-Path -LiteralPath $backupPath) -or (Get-Item -LiteralPath $backupPath).Length -le 0) { throw 'No se generó un respaldo válido.' }
Write-Output "BACKUP_OK=$backupPath"
