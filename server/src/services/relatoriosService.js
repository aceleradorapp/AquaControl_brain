// Central de Relatorios e Analises (17-espc, ver 01-espc-geral/17_central_relatorios.md) —
// toda a logica de agregacao dos 4 relatorios vive aqui, a partir SOMENTE do que ja e
// persistido (historico_sensores, historico_reles, historico_autocontrol, portas_mapeamento).
// Nao inventa dado nenhum: categorias/KPIs sem lastro real (ex.: "Erro de API", "TPA" sem uma
// config de volume do aquario) sao deixados de fora — ver a nota na spec.
const db = require('../database/db');

// Faixas de seguranca (19-espc: editaveis na tela de Configuracoes -> Sensores & Telemetria
// -> "Temperatura Segura" etc., tabela "faixas_seguras") usadas pra marcar anomalias/alertas
// de "fora do limite". Consulta fresca a cada chamada (tabela pequena, poucas linhas) — sem
// isso, mudar a faixa na tela de Configuracoes so valeria depois de reiniciar o servidor.
function obterFaixasSeguras() {
    const linhas = db.prepare('SELECT sensor_tipo, minimo, maximo FROM faixas_seguras').all();
    return Object.fromEntries(linhas.map((l) => [l.sensor_tipo, { min: l.minimo, max: l.maximo }]));
}

// 24-espc: qual chave de "faixas_seguras" vale pra este sensor — "temp_agua"/"temp_ar" nao dao
// mais pra decidir so pelo "tipo" cru do ESP (os dois chegam como "sensor_temp"), entao aqui
// olha o ID especifico primeiro. Fluxo tem sua PROPRIA calibracao (ver obterCalibracaoFluxoAtual
// abaixo), nao usa faixa_segura.
function chaveFaixaDoSensor(sensorId, tipo) {
    if (sensorId.startsWith('temp_agua')) return 'temp_agua';
    if (sensorId === 'temp_ar') return 'temp_ar';
    if (tipo === 'sensor_ph') return 'ph_agua';
    if (tipo === 'sensor_umidade') return 'umidade_ar';
    // 38-espc: "alerta_nivel" usa o MESMO mecanismo generico de faixa segura das linhas abaixo
    // (min/max editavel em Configuracoes -> Limites e Calibracao) — sem bloco especial dedicado
    // como o antigo "inclinacao" tinha; o percentual clampado 0-100 ja cobre BAIXO+CRITICO como
    // "abaixo do minimo seguro" (ver faixas_seguras default: min=1).
    if (tipo === 'sensor_alerta_nivel') return 'alerta_nivel';
    return null;
}

// 24-espc: media dos sensores de agua CONECTADOS agora — pedido explicito do usuario ("soma
// dos sensores ativos da agua e pega a media deles"), ja que sao 3x DS18B20 fisicos pro MESMO
// aquario. Mantem o ultimo valor/estado conhecido de cada sensor_id conforme as linhas do
// historico chegam (assincronas — cada sensor so aparece numa linha quando MUDA), reconstrói
// a media "ao vivo" a cada atualização.
function criarRastreadorMediaGrupo() {
    const estadoPorSensor = new Map(); // sensor_id -> { valor: number|null, conectado: bool }
    return {
        atualizar(sensorId, valor, conectado) {
            estadoPorSensor.set(sensorId, { valor, conectado });
        },
        mediaAtual() {
            const conectados = [...estadoPorSensor.values()].filter((s) => s.conectado && s.valor !== null);
            if (conectados.length === 0) return null;
            return conectados.reduce((soma, s) => soma + s.valor, 0) / conectados.length;
        },
    };
}

// Calibracao de Vazao (24-espc, tabela "calibracao_fluxo") — valores em LITROS/HORA; o
// fluxometro reporta em L/min nativamente, entao quem compara precisa multiplicar por 60.
function obterCalibracaoFluxoAtual() {
    const linha = db.prepare('SELECT vazao_maxima_lh, vazao_minima_lh, vazao_troca_filtro_lh FROM calibracao_fluxo WHERE id = 1').get();
    if (!linha) return null;
    return { maxima: linha.vazao_maxima_lh, minima: linha.vazao_minima_lh, trocaFiltro: linha.vazao_troca_filtro_lh };
}

const ROTULO_FLUXO = {
    critica: 'Vazao Critica',
    filtro: 'Manutencao de Filtro Recomendada',
    alta: 'Vazao Acima do Esperado',
};

function descricaoFluxo(categoria, vazaoLh) {
    if (categoria === 'critica') return `Vazao muito baixa: ${Math.round(vazaoLh)} L/h (abaixo do minimo configurado)`;
    if (categoria === 'filtro') return `Vazao caindo: ${Math.round(vazaoLh)} L/h — considere verificar/trocar o filtro`;
    if (categoria === 'alta') return `Vazao acima do esperado: ${Math.round(vazaoLh)} L/h (possivel vazamento ou erro do sensor)`;
    return '';
}

function media(valores) {
    return valores.reduce((soma, v) => soma + v, 0) / valores.length;
}

function arredondar(numero, casas = 1) {
    const fator = 10 ** casas;
    return Math.round(numero * fator) / fator;
}

function resumoNumerico(valores) {
    if (valores.length === 0) return null;
    return { media: arredondar(media(valores), 1), min: arredondar(Math.min(...valores), 1), max: arredondar(Math.max(...valores), 1), amostras: valores.length };
}

// SQLite grava "criado_em"/"timestamp" como "YYYY-MM-DD HH:MM:SS" (UTC, sem "T") — converte
// pra epoch ms de forma consistente em todo o servico.
function paraEpochMs(dataSql) {
    return new Date(`${dataSql.replace(' ', 'T')}Z`).getTime();
}

function buscarPrimeiroModulo(tipo) {
    return db.prepare('SELECT * FROM modulos WHERE tipo = ? ORDER BY id LIMIT 1').get(tipo);
}

// --- Aba 1: Telemetria & Qualidade da Agua -----------------------------------------------

function obterRelatorioTelemetria(inicioSql, fimSql) {
    const moduloSensor = buscarPrimeiroModulo('telemetria');
    if (!moduloSensor) {
        return { disponivel: false, motivo: 'Nenhum modulo de telemetria cadastrado.' };
    }

    const linhas = db
        .prepare(
            `SELECT sensor_id, tipo, nome, valor, unidade, conectado, criado_em
             FROM historico_sensores
             WHERE modulo_id = ? AND criado_em BETWEEN ? AND ?
               AND tipo != 'sensor_fluxo' AND tipo != 'sensor_inclinacao' AND tipo != 'sensor_vazamento'
             ORDER BY criado_em ASC`
        )
        .all(moduloSensor.id, inicioSql, fimSql);

    const faixasSeguras = obterFaixasSeguras();
    const seriePorTimestamp = new Map();
    // 27-espc: "nivel" (id "alerta_nivel", renomeado de "nivel_agua" no 38-espc — % continuo,
    // clampado 0-100) entra aqui como mais um grupo numerico — ao contrario de "vazamento"
    // (booleano, excluido da query acima e tratado so em obterRelatorioAlertas).
    const valoresPorGrupo = { agua: [], ar: [], umidade: [], ph: [], nivel: [] };
    const anomalias = [];
    let totalNumericoComFaixa = 0;
    let totalForaDaFaixa = 0;

    // 24-espc: agua e avaliada em GRUPO (media dos sensores DE AGUA ativos), nao sensor a
    // sensor — sao 3x DS18B20 fisicos pro mesmo aquario, e o usuario pediu explicitamente a
    // media, nao 3 checagens independentes. `totalForaDaFaixa` conta toda leitura fora do
    // limite (mesmo quando nao vira uma entrada NOVA em `anomalias`, que so registra a
    // TRANSICAO), pra "estabilidade" continuar refletindo o tempo real fora da faixa.
    const rastreadorAgua = criarRastreadorMediaGrupo();
    let aguaEmViolacao = false;

    for (const linha of linhas) {
        if (!linha.conectado || linha.valor === null) continue;
        const valor = Number(linha.valor);
        if (Number.isNaN(valor)) continue;

        if (!seriePorTimestamp.has(linha.criado_em)) seriePorTimestamp.set(linha.criado_em, { timestamp: linha.criado_em });
        seriePorTimestamp.get(linha.criado_em)[linha.sensor_id] = valor;

        const ehAgua = linha.sensor_id.startsWith('temp_agua');
        if (ehAgua) valoresPorGrupo.agua.push(valor);
        else if (linha.sensor_id === 'temp_ar') valoresPorGrupo.ar.push(valor);
        else if (linha.sensor_id === 'umidade_ar') valoresPorGrupo.umidade.push(valor);
        else if (linha.sensor_id === 'ph_agua') valoresPorGrupo.ph.push(valor);
        else if (linha.sensor_id === 'alerta_nivel') valoresPorGrupo.nivel.push(valor);

        if (ehAgua) {
            rastreadorAgua.atualizar(linha.sensor_id, valor, true);
            const mediaAgua = rastreadorAgua.mediaAtual();
            // Grava a media "ao vivo" dos sensores de agua ativos em CADA ponto da serie
            // (nao so quando ha anomalia) — usado pelo widget "Historico Termico" do
            // Dashboard, que mostra essa media como a linha principal do grafico.
            if (mediaAgua !== null) seriePorTimestamp.get(linha.criado_em).agua_media = arredondar(mediaAgua, 2);
            const faixaAgua = faixasSeguras.temp_agua;
            if (mediaAgua !== null && faixaAgua) {
                totalNumericoComFaixa++;
                const fora = mediaAgua < faixaAgua.min || mediaAgua > faixaAgua.max;
                if (fora) totalForaDaFaixa++;
                if (fora && !aguaEmViolacao) {
                    anomalias.push({
                        timestamp: linha.criado_em,
                        sensorId: 'temp_agua_media',
                        nome: 'Media da Agua (sensores ativos)',
                        valor: arredondar(mediaAgua, 1),
                        unidade: '°C',
                        motivo: `Media dos sensores de agua ativos fora da faixa segura (${faixaAgua.min}-${faixaAgua.max}°C)`,
                    });
                }
                aguaEmViolacao = fora;
            }
            continue;
        }

        const chaveFaixa = chaveFaixaDoSensor(linha.sensor_id, linha.tipo);
        const faixa = chaveFaixa ? faixasSeguras[chaveFaixa] : null;
        if (faixa) {
            totalNumericoComFaixa++;
            if (valor < faixa.min || valor > faixa.max) {
                totalForaDaFaixa++;
                anomalias.push({
                    timestamp: linha.criado_em,
                    sensorId: linha.sensor_id,
                    nome: linha.nome,
                    valor,
                    unidade: linha.unidade,
                    motivo: `Fora da faixa segura (${faixa.min}-${faixa.max}${linha.unidade ?? ''})`,
                });
            }
        }
    }

    const estabilidade = totalNumericoComFaixa > 0 ? arredondar(100 * (1 - totalForaDaFaixa / totalNumericoComFaixa), 0) : null;

    return {
        disponivel: true,
        kpis: {
            temperaturaAgua: resumoNumerico(valoresPorGrupo.agua),
            temperaturaAr: resumoNumerico(valoresPorGrupo.ar),
            umidadeAr: resumoNumerico(valoresPorGrupo.umidade),
            ph: resumoNumerico(valoresPorGrupo.ph),
            alertaNivel: resumoNumerico(valoresPorGrupo.nivel),
            estabilidade,
        },
        faixasSeguras,
        serieTemporal: [...seriePorTimestamp.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
        anomalias: anomalias.slice(-500).reverse(),
    };
}

// --- Aba 2: Consumo & Vazao de Agua ------------------------------------------------------

// 27-espc: pode haver mais de um canal de fluxo fisico (fluxo_agua = principal, fluxo_agua_2
// = segundo canal) — cada "sensor_id" tem seu PROPRIO contador monotonico de volume
// (volume_total_l), entao acumula/agrega por canal separadamente antes de resumir.
function estadoCanalFluxoVazio() {
    return { consumoTotalLitros: 0, anteriorVolumeTotal: null, litrosPorDia: new Map(), serieVazao: [] };
}

function resumirCanalFluxo(sensorId, canal) {
    const vazoesAtivas = canal.serieVazao.filter((p) => p.vazao > 0).map((p) => p.vazao);
    const picos = [...canal.serieVazao]
        .filter((p) => p.vazao > 0)
        .sort((a, b) => b.vazao - a.vazao)
        .slice(0, 5);

    return {
        sensorId,
        kpis: {
            consumoTotalLitros: arredondar(canal.consumoTotalLitros, 2),
            vazaoMediaAtiva: vazoesAtivas.length > 0 ? arredondar(media(vazoesAtivas), 2) : null,
            vazaoMaxima: canal.serieVazao.length > 0 ? arredondar(Math.max(...canal.serieVazao.map((p) => p.vazao)), 2) : null,
        },
        volumePorDia: [...canal.litrosPorDia.entries()]
            .map(([dia, litros]) => ({ dia, litros: arredondar(litros, 2) }))
            .sort((a, b) => a.dia.localeCompare(b.dia)),
        serieVazao: canal.serieVazao,
        picos,
    };
}

function obterRelatorioConsumoAgua(inicioSql, fimSql) {
    const moduloSensor = buscarPrimeiroModulo('telemetria');
    if (!moduloSensor) {
        return { disponivel: false, motivo: 'Nenhum modulo de telemetria cadastrado.' };
    }

    const linhas = db
        .prepare(
            `SELECT sensor_id, valor, volume_total_l, criado_em
             FROM historico_sensores
             WHERE modulo_id = ? AND tipo = 'sensor_fluxo' AND conectado = 1 AND criado_em BETWEEN ? AND ?
             ORDER BY criado_em ASC`
        )
        .all(moduloSensor.id, inicioSql, fimSql);

    const canais = new Map(); // sensor_id -> estadoCanalFluxoVazio()

    for (const linha of linhas) {
        if (!canais.has(linha.sensor_id)) canais.set(linha.sensor_id, estadoCanalFluxoVazio());
        const canal = canais.get(linha.sensor_id);

        if (linha.valor !== null) canal.serieVazao.push({ timestamp: linha.criado_em, vazao: Number(linha.valor) });

        if (typeof linha.volume_total_l === 'number') {
            if (canal.anteriorVolumeTotal !== null) {
                // Clampa deltas negativos a 0 — protege contra o contador do ESP zerar num
                // reboot no meio do periodo, sem deixar o consumo total ficar negativo.
                const delta = Math.max(0, linha.volume_total_l - canal.anteriorVolumeTotal);
                canal.consumoTotalLitros += delta;
                const dia = linha.criado_em.slice(0, 10);
                canal.litrosPorDia.set(dia, (canal.litrosPorDia.get(dia) ?? 0) + delta);
            }
            canal.anteriorVolumeTotal = linha.volume_total_l;
        }
    }

    // "porCanal": um resumo por sensor_id de fluxo encontrado no periodo (fluxo_agua,
    // fluxo_agua_2, ou qualquer outro que apareca no futuro) — pensado pro front-end iterar
    // sem precisar saber quantos canais existem de antemao.
    const porCanal = [...canais.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([sensorId, canal]) => resumirCanalFluxo(sensorId, canal));

    // Compatibilidade: kpis/volumePorDia/serieVazao/picos continuam no NIVEL RAIZ, sempre
    // referentes ao canal PRINCIPAL ("fluxo_agua") — quem ja consumia esse formato (ex.:
    // RelatorioConsumoAgua.jsx antes do 27-espc) continua funcionando sem mudanca nenhuma;
    // "porCanal" e so um acrescimo pra quem precisar do segundo canal.
    const canalPrincipal = resumirCanalFluxo('fluxo_agua', canais.get('fluxo_agua') ?? estadoCanalFluxoVazio());

    return {
        disponivel: true,
        kpis: canalPrincipal.kpis,
        volumePorDia: canalPrincipal.volumePorDia,
        serieVazao: canalPrincipal.serieVazao,
        picos: canalPrincipal.picos,
        porCanal,
    };
}

// --- Aba 3: Atuacao de Equipamentos & Automacao (reles) ----------------------------------

function obterRelatorioAutomacao(inicioSql, fimSql) {
    const moduloAtuador = buscarPrimeiroModulo('atuador');
    if (!moduloAtuador) {
        return { disponivel: false, motivo: 'Nenhum modulo atuador cadastrado.' };
    }

    const portas = db.prepare('SELECT posicao_indice, nome_personalizado FROM portas_mapeamento WHERE modulo_id = ?').all(moduloAtuador.id);
    const nomePorta = new Map(portas.map((p) => [p.posicao_indice, p.nome_personalizado]));
    const nomeDaPorta = (indice) => nomePorta.get(indice)?.trim() || `Porta ${String(indice + 1).padStart(2, '0')}`;

    const eventos = db
        .prepare(
            `SELECT posicao_indice, novo_estado, origem, tema_nome, criado_em
             FROM historico_reles
             WHERE modulo_id = ? AND criado_em BETWEEN ? AND ?
             ORDER BY posicao_indice ASC, criado_em ASC`
        )
        .all(moduloAtuador.id, inicioSql, fimSql);

    const eventosPorPorta = new Map();
    for (const evento of eventos) {
        if (!eventosPorPorta.has(evento.posicao_indice)) eventosPorPorta.set(evento.posicao_indice, []);
        eventosPorPorta.get(evento.posicao_indice).push(evento);
    }

    const fimPeriodoMs = paraEpochMs(fimSql);
    const intervalos = [];
    const resumoPorPorta = [];

    for (const [posicaoIndice, lista] of eventosPorPorta) {
        let inicioLigadoMs = null;
        let tempoTotalMs = 0;
        let ciclos = 0;

        for (const evento of lista) {
            const tsMs = paraEpochMs(evento.criado_em);
            if (evento.novo_estado === 1) {
                inicioLigadoMs = tsMs;
                ciclos++;
            } else if (evento.novo_estado === 0 && inicioLigadoMs !== null) {
                intervalos.push({ posicaoIndice, nome: nomeDaPorta(posicaoIndice), inicio: new Date(inicioLigadoMs).toISOString(), fim: new Date(tsMs).toISOString() });
                tempoTotalMs += tsMs - inicioLigadoMs;
                inicioLigadoMs = null;
            }
        }
        // Ainda ligado ao fim do periodo — fecha o intervalo ali mesmo (estimativa: pode
        // continuar ligado depois do fim do periodo consultado, isso so conta ate onde o
        // relatorio olhou).
        if (inicioLigadoMs !== null) {
            intervalos.push({ posicaoIndice, nome: nomeDaPorta(posicaoIndice), inicio: new Date(inicioLigadoMs).toISOString(), fim: new Date(fimPeriodoMs).toISOString(), emAndamento: true });
            tempoTotalMs += fimPeriodoMs - inicioLigadoMs;
        }

        resumoPorPorta.push({ posicaoIndice, nome: nomeDaPorta(posicaoIndice), tempoLigadoHoras: arredondar(tempoTotalMs / 3600000, 2), ciclos });
    }

    resumoPorPorta.sort((a, b) => b.tempoLigadoHoras - a.tempoLigadoHoras);

    return {
        disponivel: true,
        kpis: {
            totalCiclos: resumoPorPorta.reduce((soma, p) => soma + p.ciclos, 0),
            tempoTotalLigadoHoras: arredondar(resumoPorPorta.reduce((soma, p) => soma + p.tempoLigadoHoras, 0), 2),
            equipamentoMaisUsado: resumoPorPorta[0]?.nome ?? null,
        },
        distribuicao: resumoPorPorta.filter((p) => p.tempoLigadoHoras > 0).map((p) => ({ nome: p.nome, horas: p.tempoLigadoHoras })),
        resumoPorPorta,
        intervalos: intervalos.sort((a, b) => a.inicio.localeCompare(b.inicio)),
        periodo: { inicio: new Date(paraEpochMs(inicioSql)).toISOString(), fim: new Date(fimPeriodoMs).toISOString() },
    };
}

// --- Aba 4: Alertas, Falhas e Saude do Sistema -------------------------------------------

// Uptime ATUAL (nao historico — nao existe um log persistido de uptime) dos modulos com
// firmware proprio (atuador + telemetria) — leitura ao vivo de GET /api/status, com timeout
// curto; falha silenciosamente (uptimeSegundos: null) se o modulo estiver inacessivel agora.
async function obterUptimesAtuais() {
    const modulos = db.prepare("SELECT * FROM modulos WHERE tipo IN ('atuador', 'telemetria')").all();
    return Promise.all(
        modulos.map(async (modulo) => {
            try {
                const resposta = await fetch(`http://${modulo.ip}/api/status`, { signal: AbortSignal.timeout(3000) });
                if (!resposta.ok) return { nome: modulo.nome, uptimeSegundos: null };
                const dados = await resposta.json();
                return { nome: modulo.nome, uptimeSegundos: typeof dados.uptime_s === 'number' ? dados.uptime_s : null };
            } catch {
                return { nome: modulo.nome, uptimeSegundos: null };
            }
        })
    );
}

async function obterRelatorioAlertas(inicioSql, fimSql) {
    const faixasSeguras = obterFaixasSeguras();
    const calibracaoFluxo = obterCalibracaoFluxoAtual();
    const moduloSensor = buscarPrimeiroModulo('telemetria');

    const linhasSensores = moduloSensor
        ? db
              .prepare(
                  `SELECT sensor_id, tipo, nome, valor, unidade, conectado, criado_em
                   FROM historico_sensores
                   WHERE modulo_id = ? AND criado_em BETWEEN ? AND ?
                   ORDER BY criado_em ASC`
              )
              .all(moduloSensor.id, inicioSql, fimSql)
        : [];

    const eventosAutocontrol = db
        .prepare(
            `SELECT evento, origem, detalhes, timestamp AS criado_em
             FROM historico_autocontrol
             WHERE timestamp BETWEEN ? AND ?
             ORDER BY timestamp ASC`
        )
        .all(inicioSql, fimSql);

    const log = [];
    const ultimoConectado = new Map();
    const emViolacao = new Map();
    const rastreadorAgua = criarRastreadorMediaGrupo();
    let aguaEmViolacao = false;
    let categoriaFluxoAtual = null; // null | 'critica' | 'filtro' | 'alta' — so cria log NOVO na transicao

    function marcarResolvido(sensorId, categoria, quando) {
        const pendente = [...log].reverse().find((item) => item.sensorId === sensorId && item.categoria === categoria && item.resolvido === null);
        if (pendente) pendente.resolvido = quando;
    }

    for (const linha of linhasSensores) {
        const conectadoAgora = !!linha.conectado;
        const conectadoAntes = ultimoConectado.has(linha.sensor_id) ? ultimoConectado.get(linha.sensor_id) : true;

        if (conectadoAntes && !conectadoAgora) {
            log.push({ timestamp: linha.criado_em, origem: 'ESP_Sensor', categoria: 'Desconexao de Sensor', descricao: `${linha.nome} parou de responder`, sensorId: linha.sensor_id, resolvido: null });
        } else if (!conectadoAntes && conectadoAgora) {
            marcarResolvido(linha.sensor_id, 'Desconexao de Sensor', linha.criado_em);
        }
        ultimoConectado.set(linha.sensor_id, conectadoAgora);

        // 38-espc: o antigo bloco especial de "inclinacao" (sensor removido do firmware) saiu
        // daqui — "alerta_nivel" (o sensor que substituiu esse papel) nao precisa de um bloco
        // dedicado, ele cai naturalmente no mecanismo generico de faixa segura mais abaixo
        // (chaveFaixaDoSensor + emViolacao), que ja gera "Valor Fora do Limite" na transicao.

        // 27-espc: sensor de vazamento — mesmo idioma de transicao do "Alerta de Nivel de
        // Agua" acima (loga so quando entra/sai do estado de agua detectada).
        if (linha.sensor_id === 'vazamento' && conectadoAgora) {
            if (linha.valor === 'true') {
                log.push({ timestamp: linha.criado_em, origem: 'ESP_Sensor', categoria: 'Alerta de Vazamento', descricao: `${linha.nome}: agua detectada`, sensorId: linha.sensor_id, resolvido: null });
            } else if (linha.valor === 'false') {
                marcarResolvido('vazamento', 'Alerta de Vazamento', linha.criado_em);
            }
            continue;
        }

        // 24-espc: vazao tem calibracao PROPRIA (tabela calibracao_fluxo, em L/h), nao usa
        // faixas_seguras — 3 faixas: abaixo do minimo (critico), entre o minimo e o limite de
        // troca de filtro (manutencao preventiva recomendada — a vazao cai aos poucos conforme
        // o filtro entope) e acima do maximo (inesperado, possivel vazamento/erro de sensor).
        if (linha.sensor_id === 'fluxo_agua') {
            if (conectadoAgora && linha.valor !== null && calibracaoFluxo) {
                const vazaoLh = Number(linha.valor) * 60;
                if (!Number.isNaN(vazaoLh)) {
                    let categoriaNova = null;
                    if (vazaoLh < calibracaoFluxo.minima) categoriaNova = 'critica';
                    else if (vazaoLh < calibracaoFluxo.trocaFiltro) categoriaNova = 'filtro';
                    else if (vazaoLh > calibracaoFluxo.maxima) categoriaNova = 'alta';

                    if (categoriaNova !== categoriaFluxoAtual) {
                        if (categoriaFluxoAtual) marcarResolvido('fluxo_agua', ROTULO_FLUXO[categoriaFluxoAtual], linha.criado_em);
                        if (categoriaNova) {
                            log.push({
                                timestamp: linha.criado_em,
                                origem: 'ESP_Sensor',
                                categoria: ROTULO_FLUXO[categoriaNova],
                                descricao: descricaoFluxo(categoriaNova, vazaoLh),
                                sensorId: 'fluxo_agua',
                                resolvido: null,
                            });
                        }
                        categoriaFluxoAtual = categoriaNova;
                    }
                }
            }
            continue;
        }

        // 24-espc: agua (3x DS18B20) e avaliada em GRUPO — media dos sensores ativos, so loga
        // na TRANSICAO pra dentro/fora da faixa (mesmo idioma de "so registrar mudanca de
        // estado" ja usado acima pra desconexao).
        if (linha.sensor_id.startsWith('temp_agua')) {
            rastreadorAgua.atualizar(linha.sensor_id, linha.valor !== null ? Number(linha.valor) : null, conectadoAgora);
            const mediaAgua = rastreadorAgua.mediaAtual();
            const faixaAgua = faixasSeguras.temp_agua;
            if (mediaAgua !== null && faixaAgua) {
                const fora = mediaAgua < faixaAgua.min || mediaAgua > faixaAgua.max;
                if (fora && !aguaEmViolacao) {
                    log.push({
                        timestamp: linha.criado_em,
                        origem: 'ESP_Sensor',
                        categoria: 'Valor Fora do Limite',
                        descricao: `Media da Agua (sensores ativos): ${arredondar(mediaAgua, 1)}°C (faixa segura ${faixaAgua.min}-${faixaAgua.max}°C)`,
                        sensorId: 'temp_agua_media',
                        resolvido: null,
                    });
                } else if (!fora && aguaEmViolacao) {
                    marcarResolvido('temp_agua_media', 'Valor Fora do Limite', linha.criado_em);
                }
                aguaEmViolacao = fora;
            }
            continue;
        }

        const chaveFaixa = chaveFaixaDoSensor(linha.sensor_id, linha.tipo);
        const faixa = chaveFaixa ? faixasSeguras[chaveFaixa] : null;
        if (faixa && conectadoAgora && linha.valor !== null) {
            const valor = Number(linha.valor);
            if (!Number.isNaN(valor)) {
                const foraDaFaixa = valor < faixa.min || valor > faixa.max;
                const estavaForaDaFaixa = emViolacao.get(linha.sensor_id) ?? false;

                if (foraDaFaixa && !estavaForaDaFaixa) {
                    log.push({
                        timestamp: linha.criado_em,
                        origem: 'ESP_Sensor',
                        categoria: 'Valor Fora do Limite',
                        descricao: `${linha.nome}: ${valor}${linha.unidade ?? ''} (faixa segura ${faixa.min}-${faixa.max}${linha.unidade ?? ''})`,
                        sensorId: linha.sensor_id,
                        resolvido: null,
                    });
                } else if (!foraDaFaixa && estavaForaDaFaixa) {
                    marcarResolvido(linha.sensor_id, 'Valor Fora do Limite', linha.criado_em);
                }
                emViolacao.set(linha.sensor_id, foraDaFaixa);
            }
        }
    }

    // 19-espc: eventos do motor de termostato (automacaoEquipamentosService.js, origem
    // "termostato") ganham categoria propria — sao acionamentos automaticos de verdade (nao
    // "problemas"), entao ficam no mesmo grupo de "Automacao" pra fins de totalAlertas, mas
    // com um rotulo mais especifico no log/grafico por categoria.
    for (const evento of eventosAutocontrol) {
        const eTermostato = evento.origem === 'termostato';
        log.push({
            timestamp: evento.criado_em,
            origem: 'ESP_Hardware',
            categoria: eTermostato ? 'Termostato / Equipamento' : 'Automacao',
            descricao: eTermostato ? evento.detalhes : `${evento.evento} (${evento.origem})${evento.detalhes ? ' — ' + evento.detalhes : ''}`,
            sensorId: null,
            resolvido: 'n/a',
        });
    }

    log.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

    const porCategoria = new Map();
    for (const item of log) porCategoria.set(item.categoria, (porCategoria.get(item.categoria) ?? 0) + 1);

    const resolvidos = log.filter((item) => item.resolvido && item.resolvido !== 'n/a');
    const temposResolucaoMinutos = resolvidos.map((item) => (paraEpochMs(item.resolvido) - paraEpochMs(item.timestamp)) / 60000);

    const CATEGORIAS_ORQUESTRACAO = new Set(['Automacao', 'Termostato / Equipamento']);
    return {
        disponivel: true,
        kpis: {
            totalAlertas: log.filter((item) => !CATEGORIAS_ORQUESTRACAO.has(item.categoria)).length,
            tempoMedioResolucaoMinutos: temposResolucaoMinutos.length > 0 ? arredondar(media(temposResolucaoMinutos), 1) : null,
            uptimeAtual: await obterUptimesAtuais(),
        },
        porCategoria: [...porCategoria.entries()].map(([categoria, total]) => ({ categoria, total })),
        log: log.slice(-500).reverse(),
    };
}

// --- Historico recente de UM sensor (23-espc, Central de Diagnostico) ------------------------

// Usado pelo modal de detalhe de sensor (clique num no do diagrama radial, ver
// DiagramaCentral.jsx) — so as ultimas N leituras (mais recente primeiro na consulta, devolvido
// em ordem cronologica pro sparkline desenhar da esquerda pra direita).
function obterHistoricoRecenteSensor(sensorId, limite = 30) {
    const moduloSensor = buscarPrimeiroModulo('telemetria');
    if (!moduloSensor) return [];

    const limiteSeguro = Math.min(Math.max(Number(limite) || 30, 1), 200);
    const linhas = db
        .prepare(
            `SELECT valor, unidade, conectado, criado_em
             FROM historico_sensores
             WHERE modulo_id = ? AND sensor_id = ?
             ORDER BY criado_em DESC
             LIMIT ?`
        )
        .all(moduloSensor.id, sensorId, limiteSeguro);

    return linhas
        .reverse()
        .map((l) => ({
            timestamp: l.criado_em,
            valor: l.conectado && l.valor !== null && !Number.isNaN(Number(l.valor)) ? Number(l.valor) : null,
            unidade: l.unidade,
            conectado: !!l.conectado,
        }));
}

module.exports = {
    obterRelatorioTelemetria,
    obterRelatorioConsumoAgua,
    obterRelatorioAutomacao,
    obterRelatorioAlertas,
    obterHistoricoRecenteSensor,
};
