const money = (value) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const calculatePaymentState = (concept, paidValue = 0) => {
  const paid = money(paidValue);
  const expected = money(concept.monto_esperado);
  if (!concept.activo || concept.estado === 'Anulado') return { estado: 'Anulado', pagado: paid, saldo: 0, esperado_cobrable: 0 };
  if (concept.exonerado) return { estado: 'Exonerado', pagado: paid, saldo: 0, esperado_cobrable: 0 };
  const saldo = money(Math.max(expected - paid, 0));
  const estado = paid <= 0 ? 'Pendiente' : paid < expected ? 'Parcial' : paid > expected ? 'Saldo a favor' : 'Pagado';
  return { estado, pagado: paid, saldo, esperado_cobrable: expected };
};

const validMoneyAmount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 && /^\d+(\.\d{1,2})?$/.test(String(value).trim());
};

module.exports = { calculatePaymentState, money, validMoneyAmount };
