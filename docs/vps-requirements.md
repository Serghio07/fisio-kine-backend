# Requisitos aproximados del VPS

No se selecciona proveedor ni se compra infraestructura.

| Perfil | CPU | RAM | SSD | Uso |
|---|---:|---:|---:|---|
| Pruebas | 2 vCPU | 2 GB | 40 GB | validación con pocos usuarios, sin carga sostenida |
| Producción recomendada inicial | 2–4 vCPU | 4–8 GB | 80+ GB ampliable | Node, Nginx y PostgreSQL con margen para backups |

Requerir Ubuntu LTS, región sudamericana o de baja latencia hacia Bolivia, IP pública estable, SSH, firewall/puertos 22 restringido y 80/443 públicos, snapshots y backup externo cifrado. Se necesitarán dominio/subdominios, Node.js LTS, PostgreSQL soportado, Nginx y certificados SSL automáticos. Confirmar tráfico esperado, retención de documentos/backups, monitoreo, SLA y capacidad de restauración antes de contratar.
