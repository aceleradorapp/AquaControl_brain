const express = require('express');
const { atualizar, status, versaoStatus } = require('../controllers/sistemaController');
const { exigirAutenticacao } = require('../middlewares/autenticacao');

const router = express.Router();

// Self-Update do sistema (painel Configuracoes -> Sistema & Plataforma) — dispara git pull +
// npm install + build + "pm2 restart" no servidor. As 3 rotas exigem admin autenticado (mesma
// guarda de /fauna, ver middlewares/autenticacao.js) — diferente do resto de /api/configuracoes,
// que continua sem middleware por decisao ja tomada no 33-espc.
router.post('/atualizar', exigirAutenticacao, atualizar);
router.get('/atualizar/status', exigirAutenticacao, status);
router.get('/versao-status', exigirAutenticacao, versaoStatus);

module.exports = router;
