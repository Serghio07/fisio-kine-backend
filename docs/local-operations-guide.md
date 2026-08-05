# Guía de operación local

## Inicio

1. Iniciar PostgreSQL y confirmar `.env` local, `DB_SYNC=false`.
2. Backend: `cd backend`, `npm install`, `npm run verify:db`, `npm run dev`.
3. Frontend: `cd frontend`, `npm install`, `npm run dev`.
4. Salud: `GET http://localhost:3000/api/health`.

## Cambios de esquema y calidad

- Backup: `npm run backup:db`.
- Migraciones: seguir `database-migrations.md`, una por vez.
- Verificación: `npm run verify:db`, verificadores específicos y `npm test`/`node --test tests/whatsapp/*.test.js` según scripts disponibles.
- Frontend: `npm run test:notifications`, `npm run test:monitoring`, `npm run build`.
- Readiness: `npm run check:production-readiness`.

## Restauración

Crear manualmente una base temporal vacía y ejecutar: `npm run restore:db -- -BackupPath <ruta> -TargetDatabase <base_temporal> -ConfirmText RESTORE`. Cambiar temporalmente `DB_NAME` solo en el proceso de verificación; nunca apuntar al activo.

## Ngrok, logs y detención

Seguir `local-ngrok-testing.md`. Los logs actuales van a consola y no deben redirigirse a Git; en producción se definirá rotación/retención. Detener Vite/Node con Ctrl+C; comprobar procesos antes de cerrar PostgreSQL.

Problemas comunes: conexión DB → revisar servicio/host/puerto; CORS → origen exacto en lista CSV; build → definir `VITE_API_URL`; webhook → raw body/firma/secret sin imprimirlos; jobs → confirmar flags `false`.
