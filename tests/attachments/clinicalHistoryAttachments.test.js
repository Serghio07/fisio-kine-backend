const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('la migración crea tabla separada con identidad, FKs, índices y rollback protegido', () => {
  const source = read('migrations/20260824000100-create-clinical-history-attachments.js');
  assert.match(source, /createTable\('adjuntos_historia_clinica'/);
  assert.match(source, /paciente_id: \{[^\n]+allowNull: false/);
  assert.match(source, /historia_clinica_id: \{[^\n]+allowNull: false/);
  assert.match(source, /sesion_id: \{[^\n]+allowNull: true/);
  assert.match(source, /ON DELETE RESTRICT|onDelete: 'RESTRICT'/);
  assert.match(source, /Rollback bloqueado/);
  assert.doesNotMatch(source, /alterTable\('documentos_clinicos'|addColumn\('documentos_clinicos'/);
});

test('backend filtra por historia y valida paciente, historia y sesión conjuntamente', () => {
  const source = read('src/controllers/adjuntoHistoriaClinica.controller.js');
  assert.match(source, /historia_clinica_id: historia\.id, activo: true, eliminado: false/);
  assert.match(source, /id: historiaId, paciente_id: pacienteId/);
  assert.match(source, /id: sesionId, paciente_id: pacienteId, historia_clinica_id: historiaId/);
  assert.match(source, /sesion_id: meta\.sesion_id \|\| null/);
  assert.match(source, /creado_por_id: req\.usuario\.id/);
});

test('archivos admiten PDF JPEG PNG, firmas reales, 10 MB y máximo cinco', () => {
  const upload = read('src/middlewares/adjuntoHistoriaUpload.middleware.js');
  const controller = read('src/controllers/adjuntoHistoriaClinica.controller.js');
  assert.match(upload, /\['application\/pdf', '\.pdf'\]/);
  assert.match(upload, /10 \* 1024 \* 1024/);
  assert.match(upload, /files: 5/);
  assert.match(controller, /toString\(\) === '%PDF'/);
  assert.match(controller, /buffer\[0\] === 0xff/);
  assert.match(controller, /0x89, 0x50, 0x4e, 0x47/);
});

test('eliminación es lógica y el archivo físico se conserva', () => {
  const source = read('src/controllers/adjuntoHistoriaClinica.controller.js');
  assert.match(source, /activo: false, eliminado: true, fecha_eliminacion: new Date\(\), eliminado_por_id: req\.usuario\.id/);
  assert.doesNotMatch(source.slice(source.indexOf('exports.remove')), /unlink/);
});
