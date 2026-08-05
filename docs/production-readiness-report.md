# Informe de preparación local para producción

Fecha: 2026-08-04. Alcance: Etapa 18.5 local; sin VPS, despliegue, DNS, HTTPS definitivo ni Etapa 19.

## Configuración y seguridad

- `.env` locales ignorados/no rastreados; ejemplos seguros creados.
- CORS pasó de host ngrok fijo a `CORS_ALLOWED_ORIGINS`; localhost solo se agrega fuera de producción.
- Vite exige `VITE_API_URL` en build productivo y hosts temporales configurables.
- `sequelize.sync()` fue retirado; arranque exige `DB_SYNC=false`.
- Health consulta DB y muestra solo estado/configuración booleana.
- Morgan detallado queda desactivado en producción. Mantener logs en stdout, rotación diaria futura, acceso restringido y retención propuesta de 30 días operativos/90 días incidentes, sujeta a política clínica.

## Errores

Los handlers devuelven mensajes sanitizados en producción; jobs usan guardia contra solapamiento y capturan fallos; webhook valida firma/raw body y no persiste payload completo; reintentos tienen límites. Riesgo pendiente: revisión manual periódica de nuevos `console.*` para evitar PII.

## Pendientes externos

No hay remoto Git ni ngrok instalado/configurado. La clasificación real/de prueba de datos requiere decisión clínica. VPS, dominio, certificados, gestor de secretos, backup externo y logging administrado quedan para una etapa futura autorizada.

## Backup y restauración

Backup custom creado y restaurado correctamente en `physio_active_restore_test_20260804_2114`. Los 12 conteos, 47 tablas, 561 constraints, 161 índices y 46 secuencias coinciden. Ver `backup-restore-test-result.md`. Readiness local: `NOT_READY` porque falta migrar la configuración local a `CORS_ALLOWED_ORIGINS`; además `NODE_ENV=development` genera advertencia esperada.

Los resultados finales de pruebas, build y audits se registran en la entrega de la etapa.

## Validación ejecutada

- Backend: 153/153 pruebas aprobadas; arranque temporal `NODE_ENV=production` correcto, DB disponible, `DB_SYNC=false`, WhatsApp y jobs apagados.
- Frontend: notificaciones 3/3, monitoreo 2/2; build de 2146 módulos correcto y sin URLs locales/ngrok configuradas. Advertencias: chunk principal 2.24 MB, ExcelJS 940 KB e importación mixta de jsPDF.
- `npm audit`: backend 3 hallazgos (1 bajo, 2 moderados; 0 altos/críticos); frontend 7 (3 moderados, 4 altos; 0 críticos). No se aplicó `audit fix`; revisar Axios/PostCSS/React Router y transitivas, y compatibilidad de Sequelize/ExcelJS, antes de producción.
- Git: rama `master`, sin remoto, árbol previamente sucio por Etapas 6–18. No se hizo commit, tag, push ni limpieza.
