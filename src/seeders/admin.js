require('dotenv').config();

const { sequelize, Usuario } = require('../models');

const crearAdmin = async () => {
  try {
    await sequelize.authenticate();

    if (process.env.DB_SYNC === 'true') {
      await sequelize.sync({ alter: true });
    }

    const usuario = process.env.ADMIN_USER || 'admin';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const debeResetear = process.argv.includes('--reset') || process.env.ADMIN_RESET_PASSWORD === 'true';
    const existente = await Usuario.findOne({ where: { usuario } });

    if (existente) {
      if (debeResetear) {
        await existente.update({
          nombre: process.env.ADMIN_NAME || existente.nombre || 'Administrador',
          email: process.env.ADMIN_EMAIL || existente.email || 'admin@physioactive.com',
          password,
          rol: 'admin',
          estado: 'activo'
        });

        console.log(`Password del usuario ${usuario} actualizado`);
        return;
      }

      console.log(`El usuario ${usuario} ya existe`);
      return;
    }

    const admin = await Usuario.create({
      nombre: process.env.ADMIN_NAME || 'Administrador',
      usuario,
      email: process.env.ADMIN_EMAIL || 'admin@physioactive.com',
      password,
      rol: 'admin',
      estado: 'activo'
    });

    console.log(`Administrador creado: ${admin.usuario}`);
  } catch (error) {
    console.error('No se pudo crear el administrador:', error.message);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
};

crearAdmin();
