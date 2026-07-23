require('dotenv').config();
const { HistoriaClinica, IntervencionClinica, Sesion, sequelize } = require('../models');

async function run() {
  const transaction = await sequelize.transaction();
  try {
    const historias = await HistoriaClinica.findAll({
      include: [{ model: IntervencionClinica, as: 'intervencion_clinica' }],
      transaction
    });
    let actualizadas = 0;

    for (const historia of historias) {
      const sesiones = await Sesion.findAll({
        where: { historia_clinica_id: historia.id, asistencia: 'asistio', anulada: false },
        order: [['numero_sesion', 'ASC'], ['fecha', 'ASC'], ['id', 'ASC']],
        transaction
      });
      let dolorAnterior = historia.intervencion_clinica?.escala_dolor;
      dolorAnterior = dolorAnterior === '' || dolorAnterior == null ? null : Number(dolorAnterior);
      const painBySession = new Map();

      for (const sesion of sesiones) {
        if (sesion.dolor_antes !== dolorAnterior) {
          await sesion.update({ dolor_antes: dolorAnterior }, { transaction });
          actualizadas += 1;
        }
        painBySession.set(String(sesion.id), { inicial: dolorAnterior, final: sesion.dolor_despues });
        if (sesion.dolor_despues !== '' && sesion.dolor_despues != null) dolorAnterior = Number(sesion.dolor_despues);
      }

      const evolutivos = Array.isArray(historia.evolutivo) ? historia.evolutivo : [];
      let cambioEvolutivo = false;
      const siguientes = evolutivos.map((item) => {
        const dolor = painBySession.get(String(item.sesion_id || ''));
        if (!dolor) return item;
        if (item.dolor_inicial === dolor.inicial && item.dolor_final === dolor.final) return item;
        cambioEvolutivo = true;
        return { ...item, dolor_inicial: dolor.inicial, dolor_final: dolor.final, fecha_actualizacion: new Date().toISOString() };
      });
      if (cambioEvolutivo) await historia.update({ evolutivo: siguientes }, { transaction });
    }

    await transaction.commit();
    console.log(`Cadena de dolor recalculada. Sesiones actualizadas: ${actualizadas}.`);
  } catch (error) {
    if (!transaction.finished) await transaction.rollback();
    throw error;
  } finally {
    await sequelize.close();
  }
}

run().catch((error) => {
  console.error('No se pudo recalcular la cadena de dolor:', error.message);
  process.exit(1);
});
