require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sequelize = require('../config/database');

(async () => {
  try {
    await sequelize.authenticate();
    await sequelize.query(fs.readFileSync(path.join(__dirname, '../../docs/tareas-personal-migration.sql'), 'utf8'));
    await sequelize.query('ALTER TABLE tareas_personal ALTER COLUMN personal_id DROP NOT NULL');
    await sequelize.query('ALTER TABLE tareas_personal ADD COLUMN IF NOT EXISTS asignado_usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE');
    await sequelize.query('ALTER TABLE tareas_personal ALTER COLUMN asignado_usuario_id DROP NOT NULL');
    await sequelize.query('ALTER TABLE tareas_personal ADD COLUMN IF NOT EXISTS paciente_id INTEGER REFERENCES pacientes(id) ON DELETE CASCADE');
    await sequelize.query('CREATE INDEX IF NOT EXISTS tareas_personal_paciente_idx ON tareas_personal(paciente_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS tareas_personal_asignado_idx ON tareas_personal(asignado_usuario_id)');
    const columns = await sequelize.getQueryInterface().describeTable('tareas_personal');
    console.log({ tareas_personal: Boolean(columns.id) });
  } finally {
    await sequelize.close();
  }
})().catch((error) => { console.error(error.message); process.exit(1); });
