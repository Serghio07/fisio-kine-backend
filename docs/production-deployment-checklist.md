# Checklist de despliegue futuro (no ejecutar aún)

## Antes de comprar VPS

- Estimar usuarios, concurrencia, almacenamiento y crecimiento; confirmar Ubuntu LTS, región cercana, IP pública, SSH/root inicial, firewall, backups externos, dominio/subdominio y presupuesto.

## Antes de desplegar

- Backup y restauración probados; rama estable, commit/push autorizados y pruebas/build aprobados.
- Variables y secretos listos fuera de Git; migraciones inventariadas; rollback ensayado.
- Plantilla Meta aprobada, número autorizado, CORS/dominios definidos; jobs inicialmente desactivados.

## Durante

- Crear usuario no root; endurecer SSH/firewall; instalar Node LTS, PostgreSQL, Nginx y HTTPS.
- Instalar dependencias con lock, configurar backend/frontend, ejecutar migraciones una a una, build, servicio PM2/systemd, logs y backup programado.

## Después

- Health, login y vistas de pacientes/citas/historias; webhook; derivaciones; notificaciones; monitoreo.
- Backup posterior y restauración de prueba; pruebas del doctor; activar WhatsApp progresivamente según el plan.
