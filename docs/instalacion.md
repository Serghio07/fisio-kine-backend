# Instalacion y ejecucion

```bash
npm install
copy .env.example .env
npm run dev
```

Crea la base de datos antes de iniciar:

```sql
CREATE DATABASE fisio_kine_db;
```

Configura `.env` con tu usuario y password de PostgreSQL.

Para que Sequelize cree o actualice las tablas al iniciar:

```env
DB_SYNC=true
```

Cuando ya tengas la base estable, vuelve a dejarlo en:

```env
DB_SYNC=false
```

## Crear el primer administrador

Con PostgreSQL configurado y las tablas creadas, ejecuta:

```bash
npm run seed:admin
```

Por defecto crea:

```json
{
  "usuario": "admin",
  "password": "123456"
}
```

Puedes cambiar esos valores con variables de entorno:

```env
ADMIN_NAME=Administrador
ADMIN_USER=admin
ADMIN_EMAIL=admin@physioactive.com
ADMIN_PASSWORD=123456
```
