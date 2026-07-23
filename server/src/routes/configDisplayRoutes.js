const express = require('express');
const { obterConfigDisplay, atualizarConfigDisplay } = require('../controllers/configDisplayController');

const router = express.Router();

router.get('/', obterConfigDisplay);
router.put('/', atualizarConfigDisplay);

module.exports = router;
