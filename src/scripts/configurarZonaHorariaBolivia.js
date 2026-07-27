const sequelize = require('../config/database');
const { BOLIVIA_TIME_ZONE, BOLIVIA_UTC_OFFSET, boliviaDateTime } = require('../utils/boliviaDateTime');

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;

const configurar = async () => {
  try {
    await sequelize.authenticate();
    const [[databaseRow], [roleRow]] = await Promise.all([
      sequelize.query('SELECT current_database() AS nombre'),
      sequelize.query('SELECT current_user AS nombre')
    ]);
    const databaseName = databaseRow[0].nombre;
    const roleName = roleRow[0].nombre;

    await sequelize.query(`ALTER DATABASE ${quoteIdentifier(databaseName)} SET timezone TO '${BOLIVIA_TIME_ZONE}'`);
    await sequelize.query(`ALTER ROLE ${quoteIdentifier(roleName)} IN DATABASE ${quoteIdentifier(databaseName)} SET timezone TO '${BOLIVIA_TIME_ZONE}'`);
    await sequelize.query(`SET TIME ZONE '${BOLIVIA_TIME_ZONE}'`);

    const [verification] = await sequelize.query(
      `SELECT current_setting('TIMEZONE') AS zona_horaria,
              NOW() AS fecha_hora_base,
              TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS OF') AS fecha_hora_bolivia`
    );
    console.log({
      zona_aplicada: BOLIVIA_TIME_ZONE,
      desfase: BOLIVIA_UTC_OFFSET,
      aplicacion: boliviaDateTime(),
      base_de_datos: verification[0]
    });
  } finally {
    await sequelize.close();
  }
};

configurar().catch((error) => {
  console.error('No se pudo configurar la zona horaria de Bolivia:', error.message);
  process.exit(1);
});
