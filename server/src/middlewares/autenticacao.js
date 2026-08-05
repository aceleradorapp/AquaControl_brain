// Middleware de autenticacao (35-espc, pedido explicito da especificacao 34 pra proteger
// POST/PUT/DELETE /api/fauna) — PRIMEIRA rota deste projeto a exigir o JWT de verdade.
// Diferente do resto do sistema de auth (33-espc: so um portao de UI, "so a tela muda, a API
// continua aberta" — decisao explicita do usuario na epoca), esta especificacao pediu
// protecao de verdade so pra este conjunto de rotas — nao alterei nenhuma outra rota da API,
// que continua exatamente como estava.
const { verificarToken } = require('../services/authService');

function exigirAutenticacao(req, res, next) {
    const cabecalho = req.headers.authorization ?? '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;
    const dados = token ? verificarToken(token) : null;

    if (!dados) {
        return res.status(401).json({ erro: 'Autenticacao necessaria — faça login como administrador.' });
    }

    req.usuarioAutenticado = dados.usuario;
    next();
}

module.exports = { exigirAutenticacao };
