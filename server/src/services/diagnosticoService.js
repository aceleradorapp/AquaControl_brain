// Diagnostico Completo do sistema (31-espc) — roda de hora em hora sozinho (cron/interval,
// ver iniciarDiagnosticoAgendado) e tambem sob demanda quando o usuario clica em "Rodar
// Diagnostico" na Central de Diagnostico (ver diagnosticosController.js). As DUAS chamadas
// passam pela MESMA funcao (executarDiagnostico) — o unico jeito de garantir que o
// diagnostico agendado e o manual meçam exatamente a mesma coisa da mesma forma.
//
// Cada execucao grava uma linha em system_diagnostics (o "relatorio" completo, como JSON) e
// UMA linha em system_logs referenciando esse relatorio pelo id (diagnostico_id) — é essa
// referencia que torna a linha do log clicavel no front (GET /api/diagnostics/:id abre o
// relatorio salvo).
const db = require('../database/db');
const { estaOnline } = require('./statusModulosService');
const { obterUltimaLeitura } = require('./sensoresTelemetriaService');
const { registrarLog } = require('./logService');

const INTERVALO_DIAGNOSTICO_MS = 60 * 60 * 1000; // 1 hora

// Mesma faixa plausivel de temperatura da agua usada em outros lugares do sistema (ver
// AquaControl_OS's client/src/utils/sensores.js:calcularMediaTemperaturaAgua) — reaproveitada
// aqui só como um checque generico de "sensor de temperatura com leitura implausivel" pro
// checklist do diagnostico, nao so pra agua especificamente.
const TEMP_MIN_PLAUSIVEL = -10;
const TEMP_MAX_PLAUSIVEL = 60;

function checarBancoDeDados() {
    try {
        db.prepare('SELECT 1').get();
        return true;
    } catch {
        return false;
    }
}

function checarModulos() {
    const modulos = db.prepare('SELECT id, nome, ip, tipo FROM modulos').all();
    return modulos.map((modulo) => ({
        id: modulo.id,
        nome: modulo.nome,
        tipo: modulo.tipo,
        ip: modulo.ip,
        online: estaOnline(modulo.id),
    }));
}

function checarSensores() {
    const leitura = obterUltimaLeitura();
    if (!leitura?.disponivel) {
        return { disponivel: false, total: 0, conectados: 0, foraDaFaixa: [] };
    }

    const foraDaFaixa = leitura.sensores
        .filter(
            (s) =>
                s.conectado &&
                s.tipo === 'sensor_temp' &&
                typeof s.valor === 'number' &&
                (s.valor < TEMP_MIN_PLAUSIVEL || s.valor > TEMP_MAX_PLAUSIVEL)
        )
        .map((s) => ({ id: s.id, nome: s.nome, valor: s.valor }));

    return {
        disponivel: true,
        total: leitura.sensores.length,
        conectados: leitura.sensores.filter((s) => s.conectado).length,
        foraDaFaixa,
    };
}

// Deriva o status geral (pass/warning/fail) do checklist bruto — mesmo criterio pros dois
// tipos de execucao (agendada/manual), ver comentario no topo do arquivo.
function calcularStatusGeral({ banco, modulos, sensores }) {
    if (!banco) return 'fail';
    if (modulos.length > 0 && modulos.every((m) => !m.online)) return 'fail'; // nada responde

    const algumModuloOffline = modulos.some((m) => !m.online);
    const sensoresComProblema = sensores.disponivel && sensores.foraDaFaixa.length > 0;
    if (algumModuloOffline || sensoresComProblema) return 'warning';

    return 'pass';
}

const ROTULOS_STATUS = { pass: 'Sucesso', warning: 'Alerta', fail: 'Falha' };
const NIVEIS_STATUS = { pass: 'sucesso', warning: 'alerta', fail: 'erro' };

// "tipo": 'automatico' (cron horario) ou 'manual' (botao na Central de Diagnostico).
function executarDiagnostico(tipo) {
    const banco = checarBancoDeDados();
    const modulos = checarModulos();
    const sensores = checarSensores();
    const detalhes = { banco, modulos, sensores };
    const status = calcularStatusGeral(detalhes);

    const resultado = db
        .prepare('INSERT INTO system_diagnostics (tipo, status, detalhes) VALUES (?, ?, ?)')
        .run(tipo, status, JSON.stringify(detalhes));
    const diagnosticoId = Number(resultado.lastInsertRowid);

    const rotuloTipo = tipo === 'manual' ? 'Diagnostico Manual' : 'Diagnostico Completo';
    registrarLog(
        `${rotuloTipo} executado (${ROTULOS_STATUS[status]})`,
        NIVEIS_STATUS[status],
        'diagnostico',
        diagnosticoId,
        tipo === 'manual' ? 'manual' : 'automatico'
    );

    return obterDiagnostico(diagnosticoId);
}

function obterDiagnostico(id) {
    const linha = db.prepare('SELECT * FROM system_diagnostics WHERE id = ?').get(id);
    if (!linha) return null;
    return { ...linha, detalhes: JSON.parse(linha.detalhes) };
}

let intervaloAtivo = null;

// Primeira execucao ATRASADA (nao imediata) de proposito — statusModulosService/
// sensoresTelemetriaService tambem comecam do zero no boot (cache vazio ate o primeiro ciclo
// deles terminar), entao um diagnostico rodando no instante 0 veria todo mundo "offline" só
// por uma corrida de inicializacao, nao por um problema de verdade. 15s é folga suficiente
// pro primeiro ciclo de ping (10s) e de sensores (5s) já terem rodado pelo menos uma vez.
const ATRASO_PRIMEIRA_EXECUCAO_MS = 15000;

// Depois da primeira execucao (atrasada), roda a cada INTERVALO_DIAGNOSTICO_MS (1h) — mesmo
// espirito de "roda uma vez + setInterval" ja usado por manutencaoService.js.
function iniciarDiagnosticoAgendado() {
    if (intervaloAtivo) return;
    intervaloAtivo = true;

    setTimeout(() => {
        executarDiagnostico('automatico');
        setInterval(() => executarDiagnostico('automatico'), INTERVALO_DIAGNOSTICO_MS);
    }, ATRASO_PRIMEIRA_EXECUCAO_MS);
}

module.exports = { executarDiagnostico, obterDiagnostico, iniciarDiagnosticoAgendado };
