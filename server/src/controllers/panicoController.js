const db = require('../database/db');

// Modo Panico (09-espc): estado global do sistema, nao por modulo — em memoria mesmo (nao
// precisa sobreviver a um restart do server; se o processo cair, o panico "reseta", o que e
// um comportamento aceitavel/seguro pra um estado de emergencia). Acionado pelo dashboard
// (POST daqui) OU pelo proprio Display (quando alguem toca a tela dele pra normalizar) —
// os dois convergem no mesmo estado e no mesmo push de volta pro Display.
const TIMEOUT_MS = 4000;
let panicoAtivo = false;

function buscarDisplay() {
    return db.prepare("SELECT * FROM modulos WHERE tipo = 'display' ORDER BY id LIMIT 1").get();
}

// Avisa o Display sobre o novo estado (POST /api/alerta nele) — fogo-e-esquece, nunca
// atrasa nem falha a resposta ao dashboard/Display que chamou definirPanico.
async function avisarDisplay(ativo) {
    const display = buscarDisplay();
    if (!display) return;

    try {
        await fetch(`http://${display.ip}/api/alerta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativo }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (erro) {
        console.warn(`[panico] Falha ao avisar o Display (${display.ip}) sobre o novo estado: ${erro.message}`);
    }
}

// GET /api/panico — o dashboard consulta isso periodicamente (ver Dashboard.jsx) pra
// detectar quando o Display normalizou remotemente (toque na tela dele).
function obterPanico(req, res) {
    res.json({ ativo: panicoAtivo });
}

// POST /api/panico { ativo } — chamado tanto pelo dashboard (botao Panico/Normalizar)
// quanto pelo proprio Display (toque na tela de alerta manda { ativo:false } de volta).
function definirPanico(req, res) {
    panicoAtivo = !!req.body.ativo;
    res.json({ ativo: panicoAtivo });
    avisarDisplay(panicoAtivo);
}

module.exports = { obterPanico, definirPanico };
