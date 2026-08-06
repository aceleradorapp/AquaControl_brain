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
let ultimosSensoresConhecidos = []; // ultima lista de sensores (com tipo/nome/unidade) recebida com sucesso

function buscarModuloTelemetria() {
    return db.prepare("SELECT * FROM modulos WHERE tipo = 'telemetria' ORDER BY id LIMIT 1").get();
}

// Nomes personalizados (16-espc, ver sensores_personalizados em migrate.js) — mesclados por
// cima do que o firmware do sensor manda por padrao, ANTES de guardar em "ultimaLeitura" ou
// gravar historico, pra todo mundo que consome esse cache (dashboard, historico, Display) ja
// ver o nome certo sem precisar saber que essa personalizacao existe.
// 28-espc: ajuste fino de temperatura da agua (Configuracoes Globais -> Sensores &
// Telemetria) — um offset aditivo UNICO (°C) aplicado a TODOS os sensores "temp_agua_*",
// direto na leitura crua do ESP, ANTES de qualquer outra coisa consumir o valor (media em
// Parametros Vitais, historico_sensores, push pro Display, relatorios). Pensado pra calibrar
// contra um termometro de referencia real — NAO tenta corrigir um sensor especifico com
// defeito, o offset e o mesmo pra todos os canais.
function obterOffsetCalibracaoTempAgua() {
    const linha = db.prepare("SELECT valor FROM configuracoes_gerais WHERE chave = 'calibracao_temp_agua_offset'").get();
    const offset = Number(linha?.valor);
    return Number.isFinite(offset) ? offset : 0;
}

function aplicarCalibracaoTempAgua(sensores) {
    const offset = obterOffsetCalibracaoTempAgua();
    if (offset === 0) return sensores;

    return sensores.map((sensor) => {
        if (!sensor.id.startsWith('temp_agua') || !sensor.conectado || typeof sensor.valor !== 'number') return sensor;
        return { ...sensor, valor: sensor.valor + offset };
    });
}

// 39-espc: sensor ultrassonico manda a DISTANCIA CRUA em cm ("nivel_agua", unidade "cm") — o
// ESP nao sabe as dimensoes do aquario, entao a conversao pra volume/porcentagem acontece aqui,
// usando as 4 medidas configuraveis em Configuracoes -> Sensores & Telemetria -> Calibracao do
// Nivel por Ultrassom. Formula pedida pelo usuario:
//   Volume Maximo (L) = (largura_cm * comprimento_cm * altura_max_cm) / 1000
//   Litros por cm = (largura_cm * comprimento_cm) / 1000
//   Variacao_cm = distancia_lida - distancia_offset  (offset = distancia com a agua no nivel
//     maximo/desejado, capturada pelo botao "Calibrar Nivel Maximo (Zerar)")
//   Altura da agua agora = altura_max_cm - Variacao_cm
//   Volume atual (L) = Altura da agua agora * Litros por cm
//   Porcentagem = Volume atual / Volume Maximo * 100
function obterConfigAquario() {
    const linhas = db
        .prepare(
            "SELECT chave, valor FROM configuracoes_gerais WHERE chave IN ('aquario_largura_cm', 'aquario_comprimento_cm', 'aquario_altura_max_cm', 'aquario_distancia_offset_cm')"
        )
        .all();
    const mapa = Object.fromEntries(linhas.map((l) => [l.chave, Number(l.valor)]));
    return {
        larguraCm: Number.isFinite(mapa.aquario_largura_cm) ? mapa.aquario_largura_cm : 200,
        comprimentoCm: Number.isFinite(mapa.aquario_comprimento_cm) ? mapa.aquario_comprimento_cm : 80,
        alturaMaxCm: Number.isFinite(mapa.aquario_altura_max_cm) ? mapa.aquario_altura_max_cm : 130,
        offsetCm: Number.isFinite(mapa.aquario_distancia_offset_cm) ? mapa.aquario_distancia_offset_cm : 0,
    };
}

function aplicarCalculoNivelUltrassom(sensores) {
    return sensores.map((sensor) => {
        if (sensor.id !== 'nivel_agua' || !sensor.conectado || typeof sensor.valor !== 'number') return sensor;

        const distanciaCm = sensor.valor;
        const { larguraCm, comprimentoCm, alturaMaxCm, offsetCm } = obterConfigAquario();

        const volumeMaximoLitros = (larguraCm * comprimentoCm * alturaMaxCm) / 1000;
        const litrosPorCm = (larguraCm * comprimentoCm) / 1000;
        const variacaoCm = distanciaCm - offsetCm;
        const alturaAguaCm = alturaMaxCm - variacaoCm;
        // Clampado 0-alturaMax: uma leitura ruidosa/fora da faixa nao pode virar volume
        // negativo nem porcentagem acima de 100 — mesma cautela ja usada no Alerta de Nivel.
        const alturaAguaClampadaCm = Math.min(Math.max(alturaAguaCm, 0), alturaMaxCm);
        const volumeAtualLitros = alturaAguaClampadaCm * litrosPorCm;
        const percentual = volumeMaximoLitros > 0 ? (volumeAtualLitros / volumeMaximoLitros) * 100 : 0;

        return {
            ...sensor,
            valor: Math.round(percentual * 10) / 10,
            unidade: '%',
            distancia_cm: Math.round(distanciaCm * 10) / 10,
            volume_litros_atual: Math.round(volumeAtualLitros * 10) / 10,
            volume_maximo_litros: Math.round(volumeMaximoLitros * 10) / 10,
        };
    });
}

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

// Marca TODOS os sensores conhecidos como desconectados quando o MODULO inteiro para de
// responder (ip errado, ESP desligado, rede fora) — antes disso, um modulo offline nao
// gravava NADA em historico_sensores (cicloSensores so zerava o cache em RAM e saia), entao
// o "Historico Termico" simplesmente parava de crescer no ultimo valor bom, sem nenhum
// registro explicito de "ficou offline aqui". So grava na TRANSICAO online->offline (chamada
// so quando "ultimaLeitura" ainda nao era null) — reaproveita o mesmo dedupe por sensor de
// registrarMudancas (ultimosValoresGravados), entao ciclos de poll subsequentes com o modulo
// ainda offline nao re-gravam a cada 5s.
function registrarDesconexaoTotal(moduloId) {
    for (const sensor of ultimosSensoresConhecidos) {
        const valorAnterior = ultimosValoresGravados.has(sensor.id) ? ultimosValoresGravados.get(sensor.id) : undefined;
        if (valorAnterior === null) continue; // ja registrado como desconectado antes
        inserirHistorico.run(moduloId, sensor.id, sensor.tipo, sensor.nome, null, sensor.unidade ?? null, 0, null);
        ultimosValoresGravados.set(sensor.id, null);
    }
}

function marcarOffline(moduloId) {
    if (ultimaLeitura) registrarDesconexaoTotal(moduloId);
    ultimaLeitura = null;
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
            marcarOffline(modulo.id);
            return;
        }
        const dados = await resposta.json();
        if (!dados.disponivel || !Array.isArray(dados.sensores)) {
            marcarOffline(modulo.id);
            return;
        }

        ultimaLeitura = {
            ...dados,
            sensores: aplicarNomesPersonalizados(aplicarCalculoNivelUltrassom(aplicarCalibracaoTempAgua(dados.sensores))),
        };
        ultimosSensoresConhecidos = ultimaLeitura.sensores;
        registrarMudancas(modulo.id, ultimaLeitura.sensores);
    } catch {
        marcarOffline(modulo.id);
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
