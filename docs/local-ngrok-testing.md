# Pruebas locales con ngrok

1. Iniciar PostgreSQL y ejecutar `npm run verify:db` en `backend`.
2. Confirmar `DB_SYNC=false` y mantener recordatorios, respuestas y alertas en `false`.
3. Iniciar backend con `npm run dev`; comprobar `GET http://localhost:3000/api/health`.
4. Iniciar frontend con `npm run dev`.
5. Abrir un túnel HTTPS hacia 3000. No guardar el authtoken en Git.
6. Si se expone Vite, abrir otro túnel a 5173 y definir temporalmente `VITE_ALLOWED_HOSTS=host-sin-protocolo`.
7. Definir `CORS_ALLOWED_ORIGINS=https://frontend-temporal.ngrok...` y `VITE_API_URL=https://backend-temporal.ngrok.../api`; reiniciar procesos.
8. En Meta configurar temporalmente `https://backend-temporal.ngrok.../api/whatsapp/webhook` y el verify token local.
9. Probar GET de verificación y POST firmado únicamente con fixture/mocks o número expresamente autorizado.
10. La página intermedia de ngrok Free puede requerir `ngrok-skip-browser-warning`; el backend ya admite ese header.
11. Revisar panel, incidentes y logs sanitizados. Al finalizar retirar URLs temporales.

Las URLs ngrok cambian y nunca son configuración de producción. Este documento no activa WhatsApp ni autoriza envíos.
