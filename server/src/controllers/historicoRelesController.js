const { listarHistorico } = require('../services/historicoRelesService');

// GET /api/historico-reles?modulo_id=10&limite=50 — consulta o histórico de acionamento
// pra futuros relatórios (13-espc). Sem UI própria no dashboard ainda — só a rota, pra dar
// pra consultar via curl/Postman ou uma tela de relatórios mais pra frente.
function obterHistoricoReles(req, res) {
    const moduloId = req.query.modulo_id ? Number(req.query.modulo_id) : undefined;
    const limite = req.query.limite ? Number(req.query.limite) : undefined;
    res.json(listarHistorico({ moduloId, limite }));
}

module.exports = { obterHistoricoReles };
