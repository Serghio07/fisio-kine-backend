CREATE TABLE IF NOT EXISTS personal (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  apellido_paterno VARCHAR(100) NOT NULL,
  apellido_materno VARCHAR(100),
  nombres VARCHAR(150) NOT NULL,
  ci VARCHAR(30) NOT NULL UNIQUE,
  cargo VARCHAR(120) NOT NULL,
  dias_trabajo JSONB NOT NULL DEFAULT '[]'::jsonb,
  hora_entrada TIME,
  hora_salida TIME,
  sueldo_base DECIMAL(10,2),
  tipo_pago VARCHAR(20) NOT NULL DEFAULT 'mensual',
  telefono VARCHAR(30),
  direccion TEXT,
  fecha_ingreso DATE NOT NULL,
  estado VARCHAR(15) NOT NULL DEFAULT 'activo',
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT personal_tipo_pago_check CHECK (tipo_pago IN ('mensual', 'por_servicio')),
  CONSTRAINT personal_estado_check CHECK (estado IN ('activo', 'inactivo'))
);

CREATE UNIQUE INDEX IF NOT EXISTS personal_usuario_id_unique
  ON personal(usuario_id) WHERE usuario_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS planillas_personal (
  id SERIAL PRIMARY KEY,
  mes INTEGER NOT NULL CHECK (mes BETWEEN 1 AND 12),
  anio INTEGER NOT NULL CHECK (anio BETWEEN 2000 AND 2200),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  observaciones TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (mes, anio)
);

CREATE TABLE IF NOT EXISTS planillas_personal_detalle (
  id SERIAL PRIMARY KEY,
  planilla_id INTEGER NOT NULL REFERENCES planillas_personal(id) ON DELETE CASCADE,
  personal_id INTEGER REFERENCES personal(id) ON DELETE SET NULL,
  numero INTEGER NOT NULL,
  apellido_paterno VARCHAR(100) NOT NULL,
  apellido_materno VARCHAR(100),
  nombres VARCHAR(150) NOT NULL,
  ci VARCHAR(30),
  cargo VARCHAR(120),
  horario VARCHAR(255),
  sueldo_base DECIMAL(10,2),
  tipo_pago VARCHAR(20) NOT NULL DEFAULT 'mensual',
  CONSTRAINT planilla_detalle_tipo_pago_check CHECK (tipo_pago IN ('mensual', 'por_servicio'))
);

CREATE INDEX IF NOT EXISTS personal_estado_idx ON personal(estado);
CREATE INDEX IF NOT EXISTS personal_cargo_idx ON personal(cargo);
CREATE INDEX IF NOT EXISTS planillas_personal_periodo_idx ON planillas_personal(anio, mes);
CREATE INDEX IF NOT EXISTS planillas_personal_detalle_planilla_idx ON planillas_personal_detalle(planilla_id);
