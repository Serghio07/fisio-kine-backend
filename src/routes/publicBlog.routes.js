const router = require('express').Router();
const controller = require('../controllers/blog.controller');

router.get('/', controller.publicList);
router.get('/categories', controller.publicCategories);
router.get('/destacados', controller.publicFeatured);
router.get('/:slug/relacionados', controller.publicRelated);
router.get('/:slug', controller.publicDetail);

module.exports = router;
