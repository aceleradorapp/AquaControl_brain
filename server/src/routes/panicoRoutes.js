const express = require('express');
const { obterPanico, definirPanico } = require('../controllers/panicoController');

const router = express.Router();

router.get('/', obterPanico);
router.post('/', definirPanico);

module.exports = router;
