const router = require('express').Router();
const auth = require('../middlewares/auth.middleware');
const roles = require('../middlewares/role.middleware');
const controller = require('../controllers/rolePermission.controller');

router.use(auth);
router.get('/me', controller.mine);
router.get('/', roles('admin'), controller.getAll);
router.put('/:role', roles('admin'), controller.update);

module.exports = router;
