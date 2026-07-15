const { sequelize } = require('../models');

let schemaReadyPromise = null;

const ensureRegistroSemanalSchema = async () => {
  if (!schemaReadyPromise) {
    schemaReadyPromise = (async () => {
      await sequelize.query(`
        ALTER TABLE registro_semanal
        ADD COLUMN IF NOT EXISTS historia_clinica_id INTEGER,
        ADD COLUMN IF NOT EXISTS sesiones_resumen JSONB NOT NULL DEFAULT '{}'::jsonb,
        ADD COLUMN IF NOT EXISTS total_sesiones INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS sincronizado_sesiones BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS generado_automaticamente BOOLEAN NOT NULL DEFAULT FALSE
      `);

      await sequelize.query(`
        CREATE INDEX IF NOT EXISTS idx_registro_semanal_historia
        ON registro_semanal (historia_clinica_id)
      `);
    })().catch((error) => {
      schemaReadyPromise = null;
      throw error;
    });
  }

  return schemaReadyPromise;
};

module.exports = {
  ensureRegistroSemanalSchema
};
