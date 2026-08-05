// 09-espc: o Display deixou de falar direto com o Hardware — o Brain e o intermediario.
// 16-espc: a tela principal do Display virou 100% sensores reais (o grid de reles no
// FOOTER foi removido no firmware) — este servico nao manda mais reles nem sensores
// simulados.
// 29-espc: a filtragem por "config_display_sensores" (selecao manual de ate 6 sensores +
// posicao, feita no extinto widget "Sensores no Display") foi REMOVIDA — o AquaControl_OS
// nao gerencia mais uma selecao individual de exibicao (a tela principal so mostra 3 arcos
// fixos: media de agua, ar, umidade). Este servico agora monta o payload com TODOS os
// sensores conectados no momento, sem curadoria manual nenhuma; o firmware so usa os ids que
// reconhece (agua_media/temp_ar/umidade_ar) e ignora o resto silenciosamente.
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
// a decisao de "como formatar" fica aqui do lado do servidor: sensores booleanos (unidade
// "bool" no ESP) viram uma palavra sem unidade nenhuma (o firmware so desenha o circulo de
// grau quando unidade === "C"); os demais mantem a unidade do ESP (C/%/L/min/pH) e formatam
// o numero com 1 casa decimal (0 casas pra "%", que ja chega inteiro do ESP).
//
// 24-espc: o sensor fisico (SW-520D, id "inclinacao") e o dado bruto (bool) continuam os
// mesmos — so o ROTULO mudou, porque o usuario repurposou este sensor pra indicar nivel de
// agua do aquario (nao mais "esta tombado/inclinado").
//
// 27-espc: "vazamento" (novo sensor, tambem unidade "bool") PRECISA de um rotulo PROPRIO —
// nao pode cair no mesmo texto de "inclinacao" so por coincidencia de unidade, senao um
// vazamento de verdade apareceria como "NIVEL BAIXO" no Display (rotulo errado, sensor
// errado). O "switch" abaixo e por ID, nao mais so por unidade.
function formatarValorParaDisplay(sensor) {
    if (sensor.unidade === 'bool') {
        if (sensor.id === 'vazamento') {
            return { valor: sensor.valor ? 'VAZAMENTO!' : 'NORMAL', unidade: '' };
        }
        return { valor: sensor.valor ? 'NIVEL BAIXO' : 'NORMAL', unidade: '' };
    }
    if (typeof sensor.valor === 'number') {
        const casas = sensor.unidade === '%' ? 0 : 1;
        return { valor: sensor.valor.toFixed(casas), unidade: sensor.unidade || '' };
    }
    return { valor: String(sensor.valor), unidade: sensor.unidade || '' };
}

// Faixa plausivel de temperatura da agua — mesma ideia (e MESMOS limites) do
// client/src/utils/sensores.js:calcularMediaTemperaturaAgua (29-espc): so serve pra excluir
// leituras que sao claramente erro de sensor/barramento (ex.: -127°C, codigo de erro classico
// de um DS18B20 que perdeu contato no 1-Wire) do CALCULO DA MEDIA — nao existe import
// compartilhado entre client/server neste projeto (pacotes separados), entao os limites sao
// duplicados aqui de proposito; se mudar num lado, mude no outro tambem.
const TEMP_AGUA_MIN_PLAUSIVEL = -10;
const TEMP_AGUA_MAX_PLAUSIVEL = 60;

// Media de TODOS os temp_agua_* conectados AGORA, com leitura plausivel — MESMA logica do
// widget "Parametros Vitais"/"Sensores do Sistema" no dashboard (ver
// client/src/utils/sensores.js:calcularMediaTemperaturaAgua) — precisa ser idempotente com
// aquele calculo, senao o valor no Display diverge do valor no site. Retorna null se nenhum
// sensor de agua estiver conectado (ou nenhuma leitura for plausivel) — mesmo "sem dado" que
// qualquer outro sensor ausente.
function calcularMediaAgua(sensores) {
    const validos = sensores.filter(
        (s) =>
            s.id.startsWith('temp_agua') &&
            s.conectado &&
            typeof s.valor === 'number' &&
            s.valor >= TEMP_AGUA_MIN_PLAUSIVEL &&
            s.valor <= TEMP_AGUA_MAX_PLAUSIVEL
    );
    if (validos.length === 0) return null;
    const soma = validos.reduce((acc, s) => acc + s.valor, 0);
    return soma / validos.length;
}

// Monta a lista de "Dispositivo" (mesmo formato id/tipo/nome/valor + o campo "unidade", ver
// AquaControl_OS/include/Dispositivo.h) a partir da ultima leitura real do modulo de
// telemetria — TODOS os sensores conectados agora, sem selecao/curadoria manual (29-espc: a
// selecao de ate 6 sensores por "config_display_sensores" foi removida, ver comentario no
// topo do arquivo). Sensores desconectados simplesmente NAO aparecem (mesmo principio ja
// usado pros reles: "um relé desligado não é desenhado").
//
// "agua_media" e um dispositivo SINTETICO, sempre calculado e sempre incluido no inicio do
// array — os temp_agua_* individuais sao excluidos do resultado (o arco de agua da tela
// principal do Display so olha pra "agua_media", ver obterValorPorId em ui_ponte.cpp) pra
// nao ter dois jeitos diferentes de representar a mesma grandeza chegando ao Display.
function montarDispositivosDosSensores() {
    const leitura = obterUltimaLeitura();
    if (!leitura?.disponivel) return [];

    const dispositivos = leitura.sensores
        .filter((sensor) => sensor.conectado && !sensor.id.startsWith('temp_agua'))
        .map((sensor) => {
            const { valor, unidade } = formatarValorParaDisplay(sensor);
            // "nomeDisplay" (16-espc), nao "nome" — esse e o nome PENSADO PRA CABER na tela
            // fisica, pode ser diferente do nome geral mostrado no dashboard (ver
            // sensoresTelemetriaService.js:aplicarNomesPersonalizados). Continua existindo
            // (nao foi removido), so nao tem mais UI pra editar (ver ModalEditarModulo.jsx).
            return { id: sensor.id, tipo: sensor.tipo, nome: sensor.nomeDisplay, valor, unidade };
        });

    const mediaAgua = calcularMediaAgua(leitura.sensores);
    if (mediaAgua !== null) {
        dispositivos.unshift({
            id: 'agua_media',
            tipo: 'sensor_temp',
            nome: 'Agua (media)',
            valor: mediaAgua.toFixed(1),
            unidade: 'C',
        });
    }

    return dispositivos;
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
