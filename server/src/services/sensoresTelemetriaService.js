// 16-espc: monitoramento em background do modulo de telemetria (AquaControl_sensor) —
// mesmo padrao de statusModulosService.js (setInterval, cache-free a cada ciclo). Roda
// INDEPENDENTE de qualquer requisicao do dashboard/Display: (1) mantem em RAM a ultima
// leitura de GET /api/sensores (consumida por telemetriaDisplayService.js sem precisar de
// um fetch proprio a cada ciclo do Display), (2) grava uma linha em historico_sensores toda
// vez que o valor de um sensor MUDA (nao a cada ciclo — evita encher a tabela com leituras
// repetidas de um sensor parado).
const db = require('../database/db');

const INTERVALO_PADRAO_MS = 5000;
const TIMEOUT_MS = 4000;

// 19-espc: intervalo configuravel em Configuracoes -> Modulos Hardware & Conectividade —
// consultado a cada ciclo (nao só uma vez no boot), pra uma mudança na tela de Configuracoes
// valer a partir do proximo ciclo, sem precisar reiniciar o servidor.
function obterIntervaloConfiguradoMs() {
    const linha = db.prepare("SELECT valor FROM configuracoes_gerais WHERE chave = 'intervalo_polling_sensores_ms'").get();
    const intervalo = Number(linha?.valor);
    return Number.isFinite(intervalo) && intervalo >= 1000 ? intervalo : INTERVALO_PADRAO_MS;
}

let ultimaLeitura = null; // { disponivel, timestamp_ms, sensores: [...] } — ver GET /api/sensores do ESP
const ultimosValoresGravados = new Map(); // sensor_id -> valor (String ou null) ja gravado no historico

function buscarModuloTelemetria() {
    return db.prepare("SELECT * FROM modulos WHERE tipo = 'telemetria' ORDER BY id LIMIT 1").get();
}

// Nomes personalizados (16-espc, ver sensores_personalizados em migrate.js) — mesclados por
// cima do que o firmware do sensor manda por padrao, ANTES de guardar em "ultimaLeitura" ou
// gravar historico, pra todo mundo que consome esse cache (dashboard, historico, Display) ja
// ver o nome certo sem precisar saber que essa personalizacao existe.
function aplicarNomesPersonalizados(sensores) {
    const linhas = db.prepare('SELECT sensor_id, nome_personalizado, nome_display FROM sensores_personalizados').all();
    const personalizacoes = new Map(linhas.map((l) => [l.sensor_id, l]));

    return sensores.map((sensor) => {
        const p = personalizacoes.get(sensor.id);
        const nome = p?.nome_personalizado || sensor.nome;
        // "nomeDisplay" (16-espc) e o nome que vai pro Display de verdade (ver
        // telemetriaDisplayService.js) — cai pro nome geral (ja personalizado) se nao tiver
        // um nome especifico-pro-Display configurado.
        const nomeDisplay = p?.nome_display || nome;
        return { ...sensor, nome, nomeDisplay };
    });
}

const inserirHistorico = db.prepare(`
    INSERT INTO historico_sensores (modulo_id, sensor_id, tipo, nome, valor, unidade, conectado, volume_total_l)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

// So grava quando o valor (ou o estado conectado/desconectado) realmente mudou desde a
// ultima linha gravada deste sensor — "valor" vira String (ou null se desconectado) pra
// comparar de forma simples e uniforme entre numero/bool.
//
// EXCECAO (17-espc, Central de Relatorios — consumo de agua): "fluxo_agua" grava TODO ciclo,
// nao so quando muda. E um contador monotonico (volume_total_l) que continua subindo mesmo
// com a vazao instantanea (L/min) parada em um valor constante — se so gravasse na mudanca de
// "valor" (a vazao), o relatorio de consumo perderia a maior parte da acumulacao real durante
// um periodo de vazao estavel e nao-zero. Como o ciclo ja e de 5s, gravar sempre so pra este
// UM sensor nao pesa no banco (no maximo ~17k linhas/dia).
function registrarMudancas(moduloId, sensores) {
    for (const sensor of sensores) {
        const ehFluxo = sensor.tipo === 'sensor_fluxo';
        const valorAtual = sensor.conectado ? String(sensor.valor) : null;
        const valorAnterior = ultimosValoresGravados.has(sensor.id) ? ultimosValoresGravados.get(sensor.id) : undefined;
        const mudou = valorAnterior === undefined || valorAnterior !== valorAtual;

        if (mudou || ehFluxo) {
            const volumeTotal = ehFluxo && sensor.conectado && typeof sensor.volume_total_l === 'number' ? sensor.volume_total_l : null;
            inserirHistorico.run(moduloId, sensor.id, sensor.tipo, sensor.nome, valorAtual, sensor.unidade ?? null, sensor.conectado ? 1 : 0, volumeTotal);
            ultimosValoresGravados.set(sensor.id, valorAtual);
        }
    }
}

async function cicloSensores() {
    const modulo = buscarModuloTelemetria();
    if (!modulo) {
        ultimaLeitura = null;
        return;
    }

    try {
        const resposta = await fetch(`http://${modulo.ip}/api/sensores`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!resposta.ok) {
            ultimaLeitura = null;
            return;
        }
        const dados = await resposta.json();
        if (!dados.disponivel || !Array.isArray(dados.sensores)) {
            ultimaLeitura = null;
            return;
        }

        ultimaLeitura = { ...dados, sensores: aplicarNomesPersonalizados(dados.sensores) };
        registrarMudancas(modulo.id, ultimaLeitura.sensores);
    } catch {
        ultimaLeitura = null;
    }
}

// Snapshot em RAM da ultima leitura bem sucedida — null se o modulo nao existe/nao respondeu
// no ultimo ciclo. Consumido por telemetriaDisplayService.js (nao faz seu proprio fetch) e
// pode ser reaproveitado por qualquer rota futura que precise do mesmo dado sem esperar um
// round-trip novo ao ESP.
function obterUltimaLeitura() {
    return ultimaLeitura;
}

// setTimeout recursivo (nao setInterval) — cada ciclo agenda o proximo lendo o intervalo
// configurado NA HORA, entao mudar o valor em Configuracoes se reflete a partir do proximo
// ciclo, sem precisar reiniciar o servidor.
function iniciarMonitoramentoSensores() {
    async function passo() {
        await cicloSensores();
        setTimeout(passo, obterIntervaloConfiguradoMs());
    }
    passo();
}

module.exports = { iniciarMonitoramentoSensores, obterUltimaLeitura };
