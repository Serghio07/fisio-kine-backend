const { ConceptoCobro, HistoriaClinica, MovimientoPago, MovimientoPagoAuditoria } = require('../models');

const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const syncPaymentState = async (concepto, session, transaction) => {
  const movements = await MovimientoPago.findAll({ where: { concepto_cobro_id: concepto.id, estado: 'Activo' }, transaction });
  const total = money(movements.reduce((sum, item) => sum + Number(item.monto || 0), 0));
  const expected = money(concepto.monto_esperado);
  const estado = !concepto.activo ? 'Anulado' : concepto.exonerado ? 'Exonerado' : total <= 0 ? 'Pendiente' : total < expected ? 'Parcial' : total > expected ? 'Saldo a favor' : 'Pagado';
  await concepto.update({ estado }, { transaction });
  return { total, saldo: money(Math.max(expected - total, 0)), estado };
};

const sincronizarConceptoSesion = async (session, transaction, { importarPago = false } = {}) => {
  if (!session?.id) return null;
  const history = session.historia_clinica_id ? await HistoriaClinica.findByPk(session.historia_clinica_id, { transaction }) : null;
  const [concept, created] = await ConceptoCobro.findOrCreate({
    where: { sesion_id: session.id },
    defaults: {
      paciente_id: session.paciente_id,
      historia_clinica_id: session.historia_clinica_id,
      fecha_origen: session.fecha,
      tipo: 'Sesión de fisioterapia',
      detalle: `Sesión ${session.numero_sesion}${history?.diagnostico_medico ? ` — ${history.diagnostico_medico}` : ''}`,
      monto_esperado: money(session.monto_sesion),
      profesional_responsable: session.profesional_responsable,
      activo: !session.anulada
    },
    transaction
  });
  if (!created) await concept.update({
    paciente_id: session.paciente_id,
    historia_clinica_id: session.historia_clinica_id,
    fecha_origen: session.fecha,
    detalle: `Sesión ${session.numero_sesion}${history?.diagnostico_medico ? ` — ${history.diagnostico_medico}` : ''}`,
    monto_esperado: money(session.monto_sesion),
    profesional_responsable: session.profesional_responsable,
    activo: !session.anulada
  }, { transaction });

  if ((created || importarPago) && money(session.monto_pagado) > 0 && session.usuario_id) {
    const current = await MovimientoPago.count({ where: { concepto_cobro_id: concept.id }, transaction });
    if (!current) {
      const movement = await MovimientoPago.create({
      concepto_cobro_id: concept.id,
      usuario_receptor_id: session.usuario_id,
      fecha: session.fecha,
      hora: '12:00:00',
      monto: money(session.monto_pagado),
      metodo: ['Efectivo', 'QR', 'Transferencia', 'Otro'].includes(session.metodo_pago) ? session.metodo_pago : 'Otro',
      observacion: 'Pago registrado desde Sesiones',
      numero_recibo: `REC-SES-${String(session.id).padStart(6, '0')}`,
      estado: 'Activo'
      }, { transaction });
      await MovimientoPagoAuditoria.create({ movimiento_pago_id: movement.id, usuario_id: session.usuario_id, accion: 'Registro desde sesión', valor_nuevo: movement.toJSON() }, { transaction });
    }
  }
  return syncPaymentState(concept, session, transaction);
};

module.exports = { sincronizarConceptoSesion };
