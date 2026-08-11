# Migraciones de base de datos

## Alcance de la baseline

`00000000000000-baseline-current-schema.js` representa el esquema PostgreSQL
existente antes de adoptar Sequelize CLI. Su `up` y su `down` son inertes: no
crean, alteran ni eliminan objetos y no modifican datos.

La baseline no construye una base vacia. Tampoco debe ejecutarse sobre la base
real hasta aprobar un procedimiento de adopcion que incluya backup verificado,
comparacion del esquema, ensayo en staging y autorizacion explicita. La primera
ejecucion de Sequelize CLI crearia `SequelizeMeta`, incluso si la migracion es
inerte.

## Regla nueva

- Todo cambio futuro de esquema requiere una migracion Sequelize versionada.
- `DB_SYNC` debe permanecer en `false`.
- Nunca se permite `sync({ alter: true })` ni `sync({ force: true })` en produccion.
- Controllers, services, routes y middlewares no deben ejecutar DDL.
- Todo cambio debe probarse primero en staging sobre una copia representativa.
- Sequelize CLI registrara las migraciones aplicadas en `SequelizeMeta`.
- Una migracion aplicada no se edita: cualquier correccion se implementa en una migracion posterior.
- Migraciones, backfills, reparaciones, seeders y verificadores son procesos distintos.

## Configuracion y comandos

Sequelize CLI carga `config/config.js` mediante `.sequelizerc` y reutiliza
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` y `NODE_ENV`. No se
almacenan credenciales en archivos versionados.

- `pnpm db:migrate:status`: consulta el ledger. No debe apuntarse a produccion
  sin autorizacion, porque el CLI puede crear `SequelizeMeta` si no existe.
- `pnpm db:migrate`: aplica migraciones pendientes. No ejecutar sobre la base
  real durante la fase 4.1.
- `pnpm db:migrate:undo`: revierte la ultima migracion. En produccion esta
  prohibido salvo que el `down` haya sido revisado, probado y sea no destructivo.

## Proceso futuro

1. Crear una migracion con un unico objetivo y orden inequivoco.
2. Revisar DDL, locks, compatibilidad, transaccion y rollback.
3. Crear y verificar un backup.
4. Ejecutar en staging.
5. Verificar esquema, datos relevantes, logs y pruebas.
6. Ejecutar en produccion mediante un procedimiento autorizado.
7. Confirmar el registro correspondiente en `SequelizeMeta`.

## Adopcion de la baseline en una base existente

1. Confirmar que la base corresponde al inventario aprobado de 48 tablas.
2. Verificar que no exista un ledger anterior o una adopcion parcial.
3. Crear y probar un backup restaurable en otro entorno.
4. Ensayar la adopcion completa en staging.
5. Confirmar que la baseline no contiene DDL ni DML.
6. Ejecutar solamente despues de autorizacion explicita.
7. Confirmar `SequelizeMeta` y comprobar que el esquema no cambio.

## Scripts historicos

Los archivos existentes en `docs/`, `src/scripts/` y `src/seeders/` permanecen
intactos y no forman parte automaticamente del nuevo ledger.

- **Historicos / pendientes de consolidacion:** `*-migration.sql`, `*-up.sql`,
  `*-down.sql` y `migrate*.js`.
- **Backfills:** `backfillAppointmentSessionLinks.js`,
  `syncSesionesSemanales.js` y migraciones historicas que actualizan datos.
- **Reparaciones:** `recalcularCadenaDolor.js` y `configurarZonaHorariaBolivia.js`.
- **Seeders:** `src/seeders/admin.js`, `blog.js` y `demo.js`.
- **Verificadores:** `verifyDatabase.js`, `verifyInternalNotifications.js`,
  `verifyWhatsappMonitoring.js`, `auditPatientPhones.js`,
  `generateDatabaseInventory.js` y `checkProductionReadiness.js`.
- **Destructivo:** `clearDemoData.js`, `down.sql` que eliminan objetos y cualquier
  uso de `sync({ alter: true })`.

## Scripts peligrosos

`clearDemoData.js`, los `down.sql` destructivos, las reparaciones masivas y todo
uso de `sync({ alter: true })` no deben ejecutarse automaticamente en produccion.
Los scripts historicos tampoco deben ejecutarse para poblar `SequelizeMeta`.

Los servicios runtime que actualmente verifican o modifican estructura siguen
pendientes de la fase 4.2. Esta fase no modifica su comportamiento.
