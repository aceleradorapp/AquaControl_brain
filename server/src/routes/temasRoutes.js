const express = require('express');
const { atualizarTema, deletarTema, aplicarTema } = require('../controllers/temasController');

const router = express.Router();

// Listar/criar temas ficam em /api/modulos/:id/temas (ver modulosRoutes.js) — aqui só as
// ações que operam num tema já existente e não precisam do módulo na URL.
router.put('/:id', atualizarTema);
router.delete('/:id', deletarTema);
router.post('/:id/aplicar', aplicarTema);

module.exports = router;
