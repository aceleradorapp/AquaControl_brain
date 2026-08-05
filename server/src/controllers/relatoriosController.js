const {
    obterRelatorioTelemetria,
    obterRelatorioConsumoAgua,
    obterRelatorioAutomacao,
    obterRelatorioAlertas,
    obterHistoricoRecenteSensor,
} = require('../services/relatoriosService');
const { obterRelatorioEnergia } = require('../services/energiaService');

// Central de Relatorios e Analises (17-espc) — cada rota so faz o parsing do periodo
// (query params "inicio"/"fim", ISO 8601) e repassa pro service correspondente, que faz
// todo o trabalho de verdade em cima do que ja esta persistido. Sem "inicio"/"fim" na query,
// cai no padrao de ultimos 7 dias (mesmo default do filtro de periodo no client).
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;

function paraSqliteUTC(data) {
    return data.toISOString().slice(0, 19).replace('T', ' ');
}

// Le "inicio"/"fim" da query (ISO 8601) e devolve o par ja formatado pro SQLite (UTC,
// "YYYY-MM-DD HH:MM:SS") — datas invalidas caem no padrao em vez de gerar um erro 500.
function periodoDaQuery(req) {
    const agora = new Date();
    const inicioPadrao = new Date(agora.getTime() - SETE_DIAS_MS);

    const inicioBruto = req.query.inicio ? new Date(req.query.inicio) : inicioPadrao;
    const fimBruto = req.query.fim ? new Date(req.query.fim) : agora;

    const inicio = Number.isNaN(inicioBruto.getTime()) ? inicioPadrao : inicioBruto;
    const fim = Number.isNaN(fimBruto.getTime()) ? agora : fimBruto;

    return { inicioSql: paraSqliteUTC(inicio), fimSql: paraSqliteUTC(fim) };
}

function telemetria(req, res) {
    const { inicioSql, fimSql } = periodoDaQuery(req);
    res.json(obterRelatorioTelemetria(inicioSql, fimSql));
}

function consumoAgua(req, res) {
    const { inicioSql, fimSql } = periodoDaQuery(req);
    res.json(obterRelatorioConsumoAgua(inicioSql, fimSql));
}

function automacao(req, res) {
    const { inicioSql, fimSql } = periodoDaQuery(req);
    res.json(obterRelatorioAutomacao(inicioSql, fimSql));
}

async function alertas(req, res) {
    const { inicioSql, fimSql } = periodoDaQuery(req);
    res.json(await obterRelatorioAlertas(inicioSql, fimSql));
}

// 36-espc: consumo de energia estimado (potencia declarada x tempo ligado) — ver
// energiaService.js. Le sempre de consumo_energia_diario, ja persistido/agregado por dia.
function energia(req, res) {
    const { inicioSql, fimSql } = periodoDaQuery(req);
    res.json(obterRelatorioEnergia(inicioSql, fimSql));
}

// GET /api/relatorios/sensor-historico?sensorId=temp_agua_1&limite=30 (23-espc, Central de
// Diagnostico) — usado pelo modal de detalhe de sensor, nao tem filtro de periodo (sempre as
// ultimas N leituras, nao um intervalo de datas).
function sensorHistorico(req, res) {
    const { sensorId, limite } = req.query;
    if (!sensorId) return res.status(400).json({ erro: 'Parametro "sensorId" e obrigatorio.' });
    res.json(obterHistoricoRecenteSensor(sensorId, limite));
}

module.exports = { telemetria, consumoAgua, automacao, alertas, energia, sensorHistorico };
