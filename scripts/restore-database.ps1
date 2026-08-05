param([Parameter(Mandatory=$true)][string]$BackupPath,[Parameter(Mandatory=$true)][string]$TargetDatabase,[string]$ConfirmText)
$ErrorActionPreference = 'Stop'
if (Test-Path (Join-Path $PSScriptRoot '..\.env')) {
  foreach ($line in Get-Content (Join-Path $PSScriptRoot '..\.env')) {
    if ($line -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$' -and !(Test-Path "Env:$($Matches[1])")) {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim('"', "'"), 'Process')
    }
  }
}
if (!(Test-Path -LiteralPath $BackupPath -PathType Leaf)) { throw 'El archivo de respaldo no existe.' }
$activeDatabase = $env:DB_NAME
if (!$activeDatabase -and (Test-Path (Join-Path $PSScriptRoot '..\.env'))) { $line=Get-Content (Join-Path $PSScriptRoot '..\.env') | Where-Object {$_ -match '^DB_NAME='} | Select-Object -First 1; if($line){$activeDatabase=($line -split '=',2)[1].Trim()} }
if ([string]::IsNullOrWhiteSpace($TargetDatabase) -or $TargetDatabase -eq $activeDatabase) { throw 'La base destino debe ser temporal y distinta de la base activa.' }
Write-Output "Base destino: $TargetDatabase"
if ($ConfirmText -cne 'RESTORE') { throw 'Restauración cancelada: indique -ConfirmText RESTORE.' }
$pgRestore=(Get-Command pg_restore -ErrorAction SilentlyContinue).Source
if(!$pgRestore){$pgRestore=(Get-ChildItem 'C:\Program Files\PostgreSQL' -Filter pg_restore.exe -Recurse -ErrorAction SilentlyContinue | Where-Object {$_.FullName -match '\\bin\\'} | Select-Object -First 1).FullName}
if(!$pgRestore){throw 'pg_restore no está disponible.'}
$hostValue=if($env:DB_HOST){$env:DB_HOST}else{'localhost'};$portValue=if($env:DB_PORT){$env:DB_PORT}else{'5432'};$userValue=if($env:DB_USER){$env:DB_USER}else{'postgres'}
$previousPassword=$env:PGPASSWORD;try{$env:PGPASSWORD=$env:DB_PASSWORD;& $pgRestore --host $hostValue --port $portValue --username $userValue --dbname $TargetDatabase --no-owner --no-privileges --exit-on-error --no-password (Resolve-Path -LiteralPath $BackupPath);if($LASTEXITCODE-ne 0){throw "pg_restore terminó con código $LASTEXITCODE."}}finally{$env:PGPASSWORD=$previousPassword}
Write-Output "RESTORE_OK=$TargetDatabase"
