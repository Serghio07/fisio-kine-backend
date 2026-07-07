require('dotenv').config();
const sequelize = require('../config/database');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS actividades_sistema (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        paciente_id INTEGER REFERENCES pacientes(id) ON DELETE SET NULL,
        fecha DATE NOT NULL,
        hora TIME NOT NULL,
        modulo VARCHAR(80) NOT NULL,
        accion VARCHAR(30) NOT NULL,
        detalle VARCHAR(500),
        metodo VARCHAR(10) NOT NULL,
        ruta VARCHAR(255) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `);
    await sequelize.query('CREATE INDEX IF NOT EXISTS actividades_sistema_fecha_idx ON actividades_sistema(fecha)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS actividades_sistema_usuario_idx ON actividades_sistema(usuario_id)');
    await sequelize.query('ALTER TABLE actividades_sistema ADD COLUMN IF NOT EXISTS entidad_id INTEGER');
    await sequelize.query(`ALTER TABLE actividades_sistema ADD COLUMN IF NOT EXISTS datos JSONB NOT NULL DEFAULT '{}'::jsonb`);
    await sequelize.query(`
      UPDATE actividades_sistema
      SET detalle = accion || ' ' || LOWER(modulo)
      WHERE detalle ~ ': (true|false)$'
    `);
    await sequelize.query(`
      UPDATE actividades_sistema AS actividad
      SET
        entidad_id = paciente.id,
        paciente_id = paciente.id,
        detalle = actividad.accion || ' al paciente ' || TRIM(CONCAT(paciente.nombres, ' ', COALESCE(paciente.apellidos, ''))),
        datos = jsonb_strip_nulls(jsonb_build_object(
          'nombres', paciente.nombres,
          'apellidos', paciente.apellidos,
          'ci', paciente.ci,
          'fecha_nacimiento', paciente.fecha_nacimiento,
          'lugar_nacimiento', paciente.lugar_nacimiento,
          'edad', paciente.edad,
          'sexo', paciente.sexo,
          'telefono', paciente.telefono,
          'peso', paciente.peso,
          'talla', paciente.talla,
          'imc', paciente.imc,
          'domicilio', paciente.domicilio,
          'estado_civil', paciente.estado_civil,
          'ocupacion', paciente.ocupacion,
          'referencia', paciente.referencia
        ))
      FROM pacientes AS paciente
      WHERE actividad.modulo = 'Paciente'
        AND actividad.entidad_id IS NULL
        AND paciente.id = (
          SELECT candidato.id
          FROM pacientes AS candidato
          ORDER BY ABS(EXTRACT(EPOCH FROM (candidato.created_at - actividad.created_at)))
          LIMIT 1
        )
        AND ABS(EXTRACT(EPOCH FROM (paciente.created_at - actividad.created_at))) <= 600
    `);
    await sequelize.query(`
      UPDATE actividades_sistema AS actividad
      SET
        entidad_id = paciente.id,
        paciente_id = paciente.id,
        detalle = actividad.accion || ' al paciente ' || TRIM(CONCAT(paciente.nombres, ' ', COALESCE(paciente.apellidos, ''))),
        datos = jsonb_strip_nulls(to_jsonb(paciente) - 'foto' - 'created_at' - 'updated_at')
      FROM pacientes AS paciente
      WHERE actividad.modulo = 'Paciente'
        AND actividad.entidad_id IS NULL
        AND paciente.id = (
          SELECT candidato.id
          FROM pacientes AS candidato
          WHERE DATE(candidato.created_at AT TIME ZONE 'America/La_Paz') = actividad.fecha
          ORDER BY ABS(EXTRACT(EPOCH FROM (candidato.created_at - actividad.created_at)))
          LIMIT 1
        )
    `);
    await sequelize.query(`
      UPDATE actividades_sistema AS actividad
      SET
        entidad_id = paciente.id,
        paciente_id = paciente.id,
        detalle = actividad.accion || ' al paciente ' || TRIM(CONCAT(paciente.nombres, ' ', COALESCE(paciente.apellidos, ''))),
        datos = jsonb_strip_nulls(to_jsonb(paciente) - 'foto' - 'created_at' - 'updated_at')
      FROM pacientes AS paciente
      WHERE actividad.modulo = 'Paciente'
        AND actividad.entidad_id IS NULL
        AND (SELECT COUNT(*) FROM actividades_sistema WHERE modulo = 'Paciente' AND entidad_id IS NULL) = 1
        AND paciente.id = (SELECT id FROM pacientes ORDER BY created_at DESC LIMIT 1)
    `);
    console.log('Bitacora de actividades habilitada.');
  } catch (error) {
    console.error('No se pudo crear la bitacora:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

migrate();
