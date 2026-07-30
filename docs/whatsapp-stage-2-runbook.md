# WhatsApp Business: respaldo y entorno de prueba

Esta guía no debe ejecutarse contra la base activa sin autorización explícita.

## Datos identificados

- Motor: PostgreSQL 18.4
- Host: `localhost`
- Puerto: `5432`
- Base activa: `fisio_kine_db`
- Usuario: `serghio`
- Binarios: `C:\Program Files\PostgreSQL\18\bin`

La contraseña se solicita mediante `PGPASSWORD` en una terminal privada o el archivo seguro de PostgreSQL. No debe escribirse en este documento ni en Git.

## Respaldo completo

Reemplazar la marca de fecha antes de ejecutar:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' -U serghio -h localhost -p 5432 -F c -d fisio_kine_db -f 'backups\physio_backup_antes_whatsapp_YYYYMMDD_HHMM.backup'
```

Verificar el respaldo:

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' --list 'backups\physio_backup_antes_whatsapp_YYYYMMDD_HHMM.backup'
```

## Restauración aislada

```powershell
& 'C:\Program Files\PostgreSQL\18\bin\createdb.exe' -U serghio -h localhost -p 5432 physio_whatsapp_test
& 'C:\Program Files\PostgreSQL\18\bin\pg_restore.exe' -U serghio -h localhost -p 5432 -d physio_whatsapp_test 'backups\physio_backup_antes_whatsapp_YYYYMMDD_HHMM.backup'
```

Si la base de prueba ya existe, se debe inspeccionar y solicitar autorización antes de reemplazarla. Nunca se usa `--clean` sobre `fisio_kine_db`.

## Migración de prueba

1. Copiar `.env.whatsapp-test.example` como `.env.whatsapp-test`.
2. Completar contraseña y `JWT_SECRET` de prueba.
3. Confirmar `DB_NAME=physio_whatsapp_test` y `WHATSAPP_TEST_DATABASE=true`.
4. Ejecutar:

```powershell
npm.cmd run migrate:whatsapp-appointments
```

El script se niega a continuar si el nombre no contiene `test` o si falta la marca explícita de base de prueba.

## Reversión

La reversión segura consiste en descartar únicamente la base aislada de prueba y restaurarla nuevamente desde el respaldo. En la base activa se mantiene la integración deshabilitada; no se utiliza una migración destructiva.
