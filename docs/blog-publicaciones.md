# Blog y publicaciones

El panel administrativo y el sitio público utilizan las tablas `blog_posts`, `blog_categories`, `blog_tags` y `blog_post_tags` del backend existente.

## Preparación

```bash
cd backend
npm install
npm run migrate:blog
npm run seed:blog
```

La migración y el seeder son idempotentes. El seeder requiere un usuario `admin` activo.

Variables:

- `CORS_ORIGINS=http://localhost:5173,http://localhost:3001`
- `VITE_API_URL=http://localhost:3000/api` en ambos frontends (opcional; ese es el valor predeterminado).

Las portadas se guardan en `backend/uploads/blog/` y se publican como `/uploads/blog/<archivo>`.

## API administrativa

- `GET/POST /api/blogs`
- `GET/PUT/PATCH/DELETE /api/blogs/:id`
- `POST /api/blogs/upload/imagen`
- `POST /api/blogs/:id/publicar`
- `POST /api/blogs/:id/ocultar`
- `POST /api/blogs/:id/archivar`
- `POST /api/blogs/:id/restaurar`
- `GET/POST /api/blog-categories`
- `PUT /api/blog-categories/:id`
- `PATCH /api/blog-categories/:id/estado`
- `DELETE /api/blog-categories/:id`

## API pública

- `GET /api/public/blog`
- `GET /api/public/blog/categories`
- `GET /api/public/blog/destacados`
- `GET /api/public/blog/:slug`
- `GET /api/public/blog/:slug/relacionados`

Solo se exponen publicaciones `PUBLICADO`, no eliminadas, con categoría activa y fecha de publicación no futura.
