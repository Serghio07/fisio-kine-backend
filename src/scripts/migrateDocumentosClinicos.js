require('dotenv').config();
const { sequelize, DocumentoClinico, PagoClinico } = require('../models');

const migrate = async () => {
  try {
    await sequelize.authenticate();
    await DocumentoClinico.sync({ alter: true });
    await PagoClinico.sync({ alter: true });
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_documentos_clinicos_tipo ON documentos_clinicos(tipo)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_documentos_clinicos_paciente ON documentos_clinicos(paciente_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_documentos_clinicos_fecha ON documentos_clinicos(fecha)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_pagos_clinicos_paciente ON pagos_clinicos(paciente_id)');
    await sequelize.query('CREATE INDEX IF NOT EXISTS idx_pagos_clinicos_documento ON pagos_clinicos(documento_id)');
    console.log('Documentos clinicos y pagos clinicos listos.');
  } finally {
    await sequelize.close();
  }
};

migrate().catch((error) => {
  console.error('No se pudo migrar documentos clinicos:', error.message);
  process.exit(1);
});
