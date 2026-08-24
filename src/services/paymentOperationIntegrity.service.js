const { money } = require('./paymentFinancialState.service');

const validatePaymentOperation = (operation) => {
  const item = operation?.toJSON ? operation.toJSON() : operation;
  const children = item.aplicaciones || [];
  const errors = [];
  const activeChildren = children.filter((child) => child.estado === 'Activo');
  if (item.estado === 'ACTIVA') {
    if (activeChildren.length !== children.length) errors.push('Una operación activa tiene aplicaciones anuladas.');
    if (money(activeChildren.reduce((sum, child) => sum + Number(child.monto), 0)) !== money(item.monto_total)) errors.push('La suma de aplicaciones activas no coincide con el monto total.');
  }
  if (item.estado === 'ANULADA' && activeChildren.length) errors.push('Una operación anulada conserva aplicaciones activas.');
  for (const child of children) {
    if (child.metodo !== item.metodo) errors.push(`La aplicación ${child.id} tiene un método diferente.`);
    if (child.fecha !== item.fecha) errors.push(`La aplicación ${child.id} tiene una fecha diferente.`);
    if (String(child.usuario_receptor_id) !== String(item.usuario_receptor_id)) errors.push(`La aplicación ${child.id} tiene un receptor diferente.`);
    if (child.numero_recibo) errors.push(`La aplicación ${child.id} tiene un recibo propio no esperado.`);
  }
  return { operacion_id: item.id, valida: errors.length === 0, errores: errors };
};

module.exports = { validatePaymentOperation };
