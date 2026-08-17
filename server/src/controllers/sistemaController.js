const { dispararAtualizacao, obterStatusAtualizacao, verificarVersaoRemota } = require('../services/sistemaService');

// POST /api/sistema/atualizar — protegido por exigirAutenticacao (ver routes/sistemaRoutes.js).
// So dispara o script e responde; nao espera o resultado (ver sistemaService.js).
function atualizar(req, res) {
    const resultado = dispararAtualizacao(req.usuarioAutenticado ?? 'desconhecido');
    if (resultado.emAndamento) {
        return res.status(409).json(resultado);
    }
    res.status(202).json(resultado);
}

// GET /api/sistema/atualizar/status — o front faz polling nisso enquanto mostra o loading.
function status(req, res) {
    res.json(obterStatusAtualizacao());
}

// GET /api/sistema/versao-status — checagem leve (sem aplicar nada) pro botao "Verificar
// Atualizacoes".
async function versaoStatus(req, res) {
    const resultado = await verificarVersaoRemota();
    if (resultado.erro) return res.status(502).json(resultado);
    res.json(resultado);
}

module.exports = { atualizar, status, versaoStatus };
