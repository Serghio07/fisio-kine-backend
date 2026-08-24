const assert = require('node:assert/strict');
const { Contacto, Paciente, PacienteContacto, sequelize } = require('../models');
const { resolveAdministrativePhone } = require('../services/patientAdministrativeContact.service');

const ROLLBACK = 'PHASE3_VERIFICATION_ROLLBACK';

const run = async () => {
  const before = await Paciente.count();
  try {
    await sequelize.transaction(async (transaction) => {
      const suffix = `${Date.now()}`;
      const tutor = await Paciente.create({ nombres: 'TUTOR', apellidos: 'PRUEBA', tipo_documento: 'PASAPORTE', numero_documento: `T-${suffix}`, numero_documento_normalizado: `T-${suffix}`, ci: null, fecha_nacimiento: '1980-01-01', sexo: 'MASCULINO', telefono: '78945612', telefono_normalizado: '59178945612', estado: true }, { transaction });
      const contact = await Contacto.create({ nombres: 'TUTOR', apellidos: 'PRUEBA', telefono: '78945612', telefono_normalizado: '59178945612', paciente_id: tutor.id, estado: true }, { transaction });
      const children = [];
      for (const [index, name] of ['HIJO UNO', 'HIJO DOS'].entries()) {
        const child = await Paciente.create({ nombres: name, apellidos: 'PRUEBA', tipo_documento: 'PASAPORTE', numero_documento: `M-${index}-${suffix}`, numero_documento_normalizado: `M-${index}-${suffix}`, ci: null, fecha_nacimiento: '2016-01-01', sexo: index ? 'FEMENINO' : 'MASCULINO', telefono: null, telefono_normalizado: null, estado: true }, { transaction });
        await PacienteContacto.create({ paciente_id: child.id, contacto_id: contact.id, parentesco: 'PADRE', es_contacto_principal: true, es_responsable_legal: true, recibe_recordatorios: true, puede_gestionar_citas: true, autoriza_whatsapp: true, prioridad: 1, estado: true, fecha_inicio: '2026-08-19', fecha_fin: null }, { transaction });
        children.push(child);
      }
      for (const child of children) {
        const resolved = await resolveAdministrativePhone(child, { transaction });
        assert.equal(resolved.fuente, 'CONTACTO');
        assert.equal(resolved.telefono_normalizado, '59178945612');
        assert.equal(resolved.responsable_principal.paciente_id, tutor.id);
      }
      assert.equal(await Paciente.count({ where: { telefono_normalizado: null }, transaction }), 2);
      throw new Error(ROLLBACK);
    });
  } catch (error) {
    if (error.message !== ROLLBACK) throw error;
  }
  assert.equal(await Paciente.count(), before);
  console.log('PHASE3_DB_VERIFICATION_OK: hermanos, NULL múltiples, tutor compartido y tutor-paciente; transacción revertida.');
};

run().finally(() => sequelize.close());
