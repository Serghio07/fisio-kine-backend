BEGIN;

DO $$ BEGIN
  CREATE TYPE enum_blog_posts_estado AS ENUM ('BORRADOR', 'PUBLICADO', 'OCULTO', 'ARCHIVADO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS blog_categories (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(120) NOT NULL UNIQUE,
  descripcion TEXT,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS blog_posts (
  id SERIAL PRIMARY KEY,
  titulo VARCHAR(180) NOT NULL,
  slug VARCHAR(200) NOT NULL UNIQUE,
  resumen TEXT,
  contenido TEXT,
  imagen_portada VARCHAR(500),
  imagen_alt VARCHAR(220),
  categoria_id INTEGER REFERENCES blog_categories(id) ON DELETE RESTRICT,
  autor_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  modificado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  estado enum_blog_posts_estado NOT NULL DEFAULT 'BORRADOR',
  destacado BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_publicacion TIMESTAMPTZ,
  publicado_por_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  fecha_ocultamiento TIMESTAMPTZ,
  seo_titulo VARCHAR(180),
  seo_descripcion VARCHAR(320),
  palabras_clave VARCHAR(500),
  tiempo_lectura INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_publicos ON blog_posts (estado, fecha_publicacion) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_blog_posts_categoria ON blog_posts (categoria_id);

CREATE TABLE IF NOT EXISTS blog_tags (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(80) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blog_post_tags (
  blog_post_id INTEGER NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  blog_tag_id INTEGER NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (blog_post_id, blog_tag_id)
);

INSERT INTO blog_categories (nombre, slug, descripcion, activo, created_at, updated_at)
VALUES
  ('Prevención', 'prevencion', 'Consejos para evitar lesiones y cuidar el movimiento.', TRUE, NOW(), NOW()),
  ('Bienestar', 'bienestar', 'Hábitos para mejorar la salud y calidad de vida.', TRUE, NOW(), NOW()),
  ('Rehabilitación', 'rehabilitacion', 'Información sobre recuperación y tratamientos.', TRUE, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

COMMIT;
