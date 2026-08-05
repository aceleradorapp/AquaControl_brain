const { listarLogs } = require('../services/logService');

// GET /api/logs (31-espc, filtros/paginacao 32-espc) — historico persistido do System Log,
// mais recentes primeiro. Usado tanto pelo widget compacto do dashboard (polling simples, so
// "limite") quanto pela pagina completa "/logs" (todos os filtros + paginacao, ver
// ModalLogsCompleto.jsx). Query params (nomes conforme a especificacao 32, aceita tanto os
// valores em ingles documentados la quanto os em portugues ja usados no resto da API — ver
// logService.js:normalizarCategoria/normalizarNivel/normalizarOrigem):
//   search      -> busca textual livre (LIKE em "mensagem")
//   category    -> 'actuator'|'connectivity'|'diagnostic'|'sensor'|'system' (ou 'atuador' etc.)
//   severity    -> 'info'|'success'|'warning'|'error' (ou varios, separados por virgula)
//   origin      -> 'auto'|'manual'
//   startDate/endDate -> intervalo de "criado_em" (aceita qualquer formato que o SQLite
//                        compare como texto ISO, ex. "2026-08-04 00:00:00")
//   page/limit  -> paginacao (limit padrao 50, capado em 200)
function obterLogs(req, res) {
    const resultado = listarLogs({
        busca: req.query.search,
        categoria: req.query.category,
        nivel: req.query.severity,
        origem: req.query.origin,
        desde: req.query.startDate,
        ate: req.query.endDate,
        pagina: req.query.page,
        limite: req.query.limit ?? req.query.limite,
    });
    res.json(resultado);
}

module.exports = { obterLogs };
