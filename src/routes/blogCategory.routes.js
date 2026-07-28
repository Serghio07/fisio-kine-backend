const router = require('express').Router();
const autenticar = require('../middlewares/auth.middleware');
const autorizarRoles = require('../middlewares/role.middleware');
const controller = require('../controllers/blog.controller');

router.use(autenticar);
router.get('/', controller.listCategories);
router.use(autorizarRoles('admin'));
router.post('/', controller.createCategory);
router.put('/:id', controller.updateCategory);
router.patch('/:id/estado', controller.toggleCategory);
router.delete('/:id', controller.removeCategory);

module.exports = router;
