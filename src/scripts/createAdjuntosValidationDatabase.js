const { Client } = require('pg');
require('dotenv').config();

const database = process.argv[2];
if (!/^fisio_kine_adjuntos_validation_[0-9]+$/.test(database || '')) throw new Error('Nombre de base temporal inválido.');

const client = new Client({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'postgres'
});

(async () => {
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
  if (exists.rowCount) throw new Error(`La base temporal ya existe: ${database}`);
  await client.query(`CREATE DATABASE ${database}`);
  console.log(database);
})().finally(() => client.end());
