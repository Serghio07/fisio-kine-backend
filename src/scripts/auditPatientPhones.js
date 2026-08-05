const sequelize = require('../config/database');
const { Paciente } = require('../models');
const { normalizePhoneNumber, maskPhoneNumber } = require('../utils/phone');

const auditPatientPhones = async (patientModel = Paciente) => {
  const rows = await patientModel.findAll({
    attributes: ['id', 'telefono', 'estado'],
    order: [['id', 'ASC']],
    raw: true
  });
  const groups = new Map();

  for (const row of rows) {
    const normalized = normalizePhoneNumber(row.telefono);
    if (!normalized) continue;
    const patients = groups.get(normalized) || [];
    patients.push({ id: row.id, estado: row.estado });
    groups.set(normalized, patients);
  }

  return [...groups.entries()]
    .filter(([, patients]) => patients.length > 1)
    .map(([phone, patients]) => ({
      phone: maskPhoneNumber(phone),
      count: patients.length,
      patients
    }));
};

if (require.main === module) {
  auditPatientPhones()
    .then((duplicates) => {
      console.table(duplicates.map((duplicate) => ({
        phone: duplicate.phone,
        count: duplicate.count,
        patient_ids: duplicate.patients.map((patient) => patient.id).join(','),
        states: duplicate.patients.map((patient) => patient.estado ? 'activo' : 'inactivo').join(',')
      })));
      if (duplicates.length > 0) process.exitCode = 2;
    })
    .catch((error) => {
      console.error(`[Telefonos] Auditoria fallida: ${error?.name || 'Error'}`);
      process.exitCode = 1;
    })
    .finally(() => sequelize.close());
}

module.exports = { auditPatientPhones };
