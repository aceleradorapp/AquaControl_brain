// 09-espc: o Display deixou de falar direto com o Hardware — o Brain e o intermediario.
// 16-espc: a tela principal do Display virou 100% sensores reais (o grid de reles no
// FOOTER foi removido no firmware) — este servico nao manda mais reles nem sensores
// simulados; monta o payload a partir da leitura real do modulo de telemetria
// (sensoresTelemetriaService.js), filtrada pela selecao de ate 6 sensores + posicao
// escolhida no widget "Sensores no Display" (config_display_sensores).
//
// "Envio inteligente": so faz o POST pro Display quando o payload MUDA de verdade desde o
// ultimo envio bem-sucedido (ultimoPayloadEnviadoJSON) — evita incomodar o Display a cada
// ciclo so porque nada mudou. Se o envio falhar (Display inacessivel), o cache NAO e
// atualizado, entao o proximo ciclo tenta de novo com o mesmo payload ate realmente
// conseguir (nunca "desiste" silenciosamente de um dado que ainda nao chegou).
const db = require('../database/db');
const { obterUltimaLeitura } = require('./sensoresTelemetriaService');

const INTERVALO_MS = 3000;
const TIMEOUT_MS = 4000;

let ultimoPayloadEnviadoJSON = null;

function buscarPrimeiroModulo(tipo) {
    return db.prepare('SELECT * FROM modulos WHERE tipo = ? ORDER BY id LIMIT 1').get(tipo);
}

// Traduz o formato bruto do ESP (GET /api/sensores, ver AquaControl_sensor) pro formato
// amigavel que o firmware do Display vai imprimir na tela — o Display so imprime texto, toda
// a decisao de "como formatar" fica aqui do lado do servidor: sensor_inclinacao (unidade
// "bool" no ESP) vira a palavra NORMAL/INCLINADO sem unidade nenhuma (o firmware so desenha
// o circulo de grau quando unidade === "C"); os demais mantem a unidade do ESP (C/%/L/min/pH)
// e formatam o numero com 1 casa decimal (0 casas pra "%", que ja chega inteiro do ESP).
function formatarValorParaDisplay(sensor) {
    if (sensor.unidade === 'bool') {
        return { valor: sensor.valor ? 'INCLINADO' : 'NORMAL', unidade: '' };
    }
    if (typeof sensor.valor === 'number') {
        const casas = sensor.unidade === '%' ? 0 : 1;
        return { valor: sensor.valor.toFixed(casas), unidade: sensor.unidade || '' };
    }
    return { valor: String(sensor.valor), unidade: sensor.unidade || '' };
}

// Monta a lista de "Dispositivo" (mesmo formato id/tipo/nome/valor + o novo campo "unidade",
// ver AquaControl_OS/include/Dispositivo.h) a partir da ultima leitura real do modulo de
// telemetria, filtrada pela selecao do usuario (config_display_sensores, no maximo 6,
// ORDENADA por posicao — a ordem do array manda a ordem dos slots no grid do Display).
// Sensores selecionados mas desconectados no momento simplesmente NAO aparecem (mesmo
// principio ja usado pros reles: "um relé desligado não é desenhado", aqui "um sensor
// desconectado não ocupa slot").
function montarDispositivosDosSensores() {
    const leitura = obterUltimaLeitura();
    if (!leitura?.disponivel) return [];

    const selecao = db.prepare('SELECT sensor_id FROM config_display_sensores ORDER BY posicao').all();
    if (selecao.length === 0) return [];

    const sensorPorId = new Map(leitura.sensores.map((s) => [s.id, s]));

    return selecao
        .map(({ sensor_id }) => sensorPorId.get(sensor_id))
        .filter((sensor) => sensor && sensor.conectado)
        .map((sensor) => {
            const { valor, unidade } = formatarValorParaDisplay(sensor);
            // "nomeDisplay" (16-espc), nao "nome" — esse e o nome PENSADO PRA CABER na tela
            // fisica, pode ser diferente do nome geral mostrado no dashboard (ver
            // sensoresTelemetriaService.js:aplicarNomesPersonalizados).
            return { id: sensor.id, tipo: sensor.tipo, nome: sensor.nomeDisplay, valor, unidade };
        });
}

// POST /api/dispositivos no Display — mesmo endpoint que o Hardware chamava direto antes
// do 09-espc; so muda quem chama agora. Retorna true/false (sucesso) pro chamador decidir
// se atualiza o cache de "ultimo enviado" (so em caso de sucesso — ver cicloTelemetria).
async function enviarParaDisplay(display, dispositivos) {
    try {
        await fetch(`http://${display.ip}/api/dispositivos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dispositivos }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return true;
    } catch (erro) {
        console.warn(`[telemetria->display] Falha ao enviar dispositivos pro Display (${display.ip}): ${erro.message}`);
        return false;
    }
}

async function cicloTelemetria() {
    const display = buscarPrimeiroModulo('display');
    if (!display) {
        ultimoPayloadEnviadoJSON = null; // sem Display cadastrado, reseta pra reenviar do zero se um for cadastrado depois
        return;
    }

    const dispositivos = montarDispositivosDosSensores();
    const payloadJSON = JSON.stringify(dispositivos);
    if (payloadJSON === ultimoPayloadEnviadoJSON) return; // nada mudou desde o ultimo envio confirmado

    const sucesso = await enviarParaDisplay(display, dispositivos);
    if (sucesso) ultimoPayloadEnviadoJSON = payloadJSON;
}

function iniciarEnvioParaDisplay() {
    cicloTelemetria();
    setInterval(cicloTelemetria, INTERVALO_MS);
}

// Snapshot sob demanda do mesmo payload que o ciclo periodico acima empurra pro Display —
// usado por GET /api/dispositivos-atuais (dispositivosController.js), que o Display chama
// uma vez no boot (com timeout curto) pra pintar o HUD com dados reais desde a primeira
// tela, em vez de esperar pelo proximo ciclo automatico.
async function obterDispositivosAtuais() {
    return montarDispositivosDosSensores();
}

module.exports = { iniciarEnvioParaDisplay, obterDispositivosAtuais };
