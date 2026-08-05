const express = require('express');
const { listarQrcodes, obterQrcodeAtivo, criarQrcode, ativarQrcode, deletarQrcode, obterQrcodePorPapel, atribuirPapelQrcode } = require('../controllers/qrcodesController');

const router = express.Router();

// "/ativo" e "/papel/:papel" precisam vir ANTES de rotas tipo "/:id" equivalentes — aqui nao
// ha conflito direto (nao existe "/:id" de GET nesta rota), mas mantido explicito por clareza.
router.get('/ativo', obterQrcodeAtivo);
// 04-espc: botões fixos "Internet"/"App" da tela principal do Display buscam por papel, não
// por "ativo" — ver comentário em obterQrcodePorPapel.
router.get('/papel/:papel', obterQrcodePorPapel);
router.get('/', listarQrcodes);
router.post('/', criarQrcode);
router.put('/:id/ativar', ativarQrcode);
router.put('/:id/papel', atribuirPapelQrcode);
router.delete('/:id', deletarQrcode);

module.exports = router;
