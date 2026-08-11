'use strict';

/**
 * Baseline del esquema existente antes de adoptar Sequelize CLI.
 *
 * Esta migracion no crea tablas, no altera columnas y no modifica datos. Su
 * unico objetivo es establecer el punto de partida para cambios futuros en
 * una base cuyo esquema actual ya fue revisado y aprobado por separado.
 *
 * No debe usarse para construir una base vacia. La adopcion de la baseline en
 * una base existente requiere el procedimiento documentado en MIGRATIONS.md.
 */
module.exports = {
  async up() {
    // Intencionalmente vacio: el esquema representado ya existe.
  },

  async down() {
    // Intencionalmente vacio: una baseline nunca revierte el esquema existente.
  }
};
