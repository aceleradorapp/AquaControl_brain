const { executarDiagnostico, obterDiagnostico } = require('../services/diagnosticoService');

// GET /api/diagnostics/:id — relatorio completo de UMA execucao do Diagnostico (agendada ou
// manual), aberto pela modal de detalhe quando o usuario clica numa linha de diagnostico no
// System Log (31-espc, ver ModalDetalheDiagnostico.jsx). 404 se o id nao existir.
function obterDiagnosticoPorId(req, res) {
    const diagnostico = obterDiagnostico(Number(req.params.id));
    if (!diagnostico) {
        return res.status(404).json({ erro: 'Diagnostico nao encontrado.' });
    }
    res.json(diagnostico);
}

// POST /api/diagnostics/executar — dispara o MESMO checklist que roda sozinho de hora em
// hora (ver diagnosticoService.js:executarDiagnostico), sob demanda, quando o usuario clica
// em "Rodar Diagnostico" na Central de Diagnostico. Salva no banco e registra no System Log
// igual ao agendado, so muda o "tipo" gravado ('manual').
function executarDiagnosticoManual(req, res) {
    const diagnostico = executarDiagnostico('manual');
    res.status(201).json(diagnostico);
}

module.exports = { obterDiagnosticoPorId, executarDiagnosticoManual };
