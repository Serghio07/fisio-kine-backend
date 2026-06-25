require('dotenv').config();

const { Sesion, sequelize } = require('../models');
const { obtenerSemana, sincronizarSemana } = require('../services/sesionSemanalSync.service');

const ejecutar = async () => {
  try {
    await sequelize.authenticate();
    const sesiones = await Sesion.findAll({
      attributes: ['paciente_id', 'fecha'],
      order: [['fecha', 'ASC'], ['id', 'ASC']]
    });
    const procesadas = new Set();

    for (const sesion of sesiones) {
      const semana = obtenerSemana(sesion.fecha);
      const key = `${sesion.paciente_id}:${semana.inicio}`;
      if (procesadas.has(key)) continue;
      await sincronizarSemana(sesion.paciente_id, sesion.fecha);
      procesadas.add(key);
    }

    console.log(`Sincronizacion completada: ${procesadas.size} semanas procesadas`);
  } catch (error) {
    console.error('No se pudieron sincronizar las sesiones semanales:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

ejecutar();
