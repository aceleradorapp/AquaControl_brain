const express = require('express');
const { listarTimers, criarTimer, cancelarTimer } = require('../controllers/timersController');

const router = express.Router();

router.get('/', listarTimers);
router.post('/', criarTimer);
router.delete('/:id', cancelarTimer);

module.exports = router;
