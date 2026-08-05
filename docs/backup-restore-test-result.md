# Resultado de backup y restauración local

Fecha: 2026-08-04. Origen: base local configurada. Herramientas: PostgreSQL 18 `pg_dump`/`pg_restore`, formato custom comprimido.

- Backup: `backups/physio_active_20260804_211431_845.backup` (ignorado por Git), creado sin sobrescritura.
- Destino: `physio_active_restore_test_20260804_2114`, base temporal distinta de la activa.
- Restauración: correcta con `--no-owner --no-privileges --exit-on-error`.
- Comparación origen/restaurada: pacientes 6, citas 13, sesiones 25, historias 8, solicitudes 2, derivaciones 0, respuestas 0, notificaciones 0, incidentes 0, jobs 0, usuarios 3, personal 3.
- Estructura en ambas: 47 tablas requeridas sin faltantes, 561 constraints, 161 índices y 46 secuencias.

La base original no fue modificada. La base temporal se conserva; no eliminarla sin autorización explícita. El backup contiene datos sensibles y no debe copiarse a Git ni canales inseguros.
