const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/adjuntoHistoriaClinica.controller');
const { uploadAdjuntosHistoria } = require('../middlewares/adjuntoHistoriaUpload.middleware');

router.use(autenticar);
router.get('/adjuntos-historia/conteos', controller.counts);
router.get('/historias-clinicas/:historiaId/adjuntos', controller.list);
router.post('/historias-clinicas/:historiaId/adjuntos', autorizarRoles('admin', 'personal'), uploadAdjuntosHistoria, controller.create);
router.get('/adjuntos-historia/:id', controller.get);
router.get('/adjuntos-historia/:id/archivo', controller.file(false));
router.get('/adjuntos-historia/:id/descargar', controller.file(true));
router.delete('/adjuntos-historia/:id', autorizarRoles('admin', 'personal'), controller.remove);

module.exports = router;
