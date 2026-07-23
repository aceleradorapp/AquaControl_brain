const express = require('express');
const { listarQrcodes, obterQrcodeAtivo, criarQrcode, ativarQrcode, deletarQrcode } = require('../controllers/qrcodesController');

const router = express.Router();

// "/ativo" precisa vir ANTES de rotas tipo "/:id" equivalentes — aqui nao ha conflito
// direto (nao existe "/:id" de GET nesta rota), mas mantido explicito por clareza.
router.get('/ativo', obterQrcodeAtivo);
router.get('/', listarQrcodes);
router.post('/', criarQrcode);
router.put('/:id/ativar', ativarQrcode);
router.delete('/:id', deletarQrcode);

module.exports = router;
