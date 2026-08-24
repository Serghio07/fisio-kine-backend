const contactoService = require('../services/contacto.service');
const service = require('../services/pacienteContacto.service');

exports.listar = async (req, res, next) => { try { return res.json(await service.listByPatient(req.params.pacienteId, String(req.query.incluir_historial).toLowerCase() === 'true')); } catch (error) { return next(error); } };
exports.crear = async (req, res, next) => {
  try {
    if (req.body.contacto) {
      const result = await service.createContactAndRelation({ patientId: Number(req.params.pacienteId), contactBody: req.body.contacto, relationBody: req.body.relacion || req.body, userId: req.usuario.id });
      return res.status(201).json({ contacto: contactoService.contactDto(result.contact), relacion: service.relationDto(result.relation) });
    }
    const item = await service.create({ patientId: Number(req.params.pacienteId), contactId: Number(req.body.contacto_id), body: req.body, userId: req.usuario.id });
    return res.status(201).json(service.relationDto(item));
  } catch (error) { return next(error); }
};
exports.actualizar = async (req, res, next) => { try { const item = await service.update({ patientId: Number(req.params.pacienteId), relationId: Number(req.params.relacionId), body: req.body, userId: req.usuario.id }); return res.json(service.relationDto(item)); } catch (error) { return next(error); } };
exports.cerrar = async (req, res, next) => { try { const item = await service.close({ patientId: Number(req.params.pacienteId), relationId: Number(req.params.relacionId), userId: req.usuario.id }); return res.json(service.relationDto(item)); } catch (error) { return next(error); } };
