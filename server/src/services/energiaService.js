// Consumo de Energia (36-espc, estimado — ver 01-espc-geral/36_consumo_energia_atuadores_modulos.md).
// NAO e medicao real (nao ha sensor de corrente nenhum no sistema): e potencia NOMINAL
// declarada pelo usuario (Mapeamento de Saidas / Editar Controlador) multiplicada pelo tempo
// real que cada rele ficou ligado (historico_reles, o mesmo dado que ja alimenta a aba
// "Automacao" da Central de Relatorios). O tempo ligado E real; a potencia e declarada, nao
// medida — por isso "estimado" em toda a UI, nunca "medido". Este arquivo cobre o calculo
// diario + persistencia (consumo_energia_diario, sobrevive a limpeza de historico_reles em
// manutencaoService.js) + agendamento + a leitura consolidada pro relatorio.
const db = require('../database/db');

const MODULO_SENTINELA = -1; // posicao_indice = -1 representa o consumo BASE do proprio modulo
const INTERVALO_AGENDAMENTO_MS = 3 * 60 * 60 * 1000; // 3h — converge o dia fechado sem precisar de scheduling exato de meia-noite

function arredondar(numero, casas = 2) {
    const fator = 10 ** casas;
    return Math.round(numero * fator) / fator;
}

// Mesmo par de helpers de data usado em relatoriosController.js/relatoriosService.js —
// SQLite grava "YYYY-MM-DD HH:MM:SS" (UTC, sem "T").
function paraEpochMs(dataSql) {
    return new Date(`${dataSql.replace(' ', 'T')}Z`).getTime();
}

function paraSqliteUTC(data) {
    return data.toISOString().slice(0, 19).replace('T', ' ');
}

function formatarDiaISO(epochMs) {
    return new Date(epochMs).toISOString().slice(0, 10);
}

function inicioDoDiaSql(diaISO) {
    return `${diaISO} 00:00:00`;
}

function proximoDia(diaISO) {
    return formatarDiaISO(paraEpochMs(inicioDoDiaSql(diaISO)) + 86400000);
}

// Horas que a porta ficou LIGADA dentro de [inicioMs, fimMs) — olha o ultimo evento ANTES do
// dia (pra saber se ja estava ligada ao entrar no dia) e depois caminha pelos eventos do
// proprio dia, igual ao pareamento ON/OFF de relatoriosService.js:obterRelatorioAutomacao, so
// que escopado a UM dia e ciente do estado inicial (a versao do relatorio de Automacao ignora
// o que aconteceu antes do inicio do periodo; aqui isso geraria erro dia apos dia).
function calcularHorasLigadoNoDia(moduloId, posicaoIndice, inicioMs, fimMs, inicioDiaSql, fimDiaSqlExclusivo) {
    const estadoAnterior = db
        .prepare(
            `SELECT novo_estado FROM historico_reles
             WHERE modulo_id = ? AND posicao_indice = ? AND criado_em < ?
             ORDER BY criado_em DESC LIMIT 1`
        )
        .get(moduloId, posicaoIndice, inicioDiaSql);

    const eventos = db
        .prepare(
            `SELECT novo_estado, criado_em FROM historico_reles
             WHERE modulo_id = ? AND posicao_indice = ? AND criado_em >= ? AND criado_em < ?
             ORDER BY criado_em ASC`
        )
        .all(moduloId, posicaoIndice, inicioDiaSql, fimDiaSqlExclusivo);

    let ligado = estadoAnterior ? estadoAnterior.novo_estado === 1 : false;
    let cursorMs = inicioMs;
    let totalMs = 0;

    for (const evento of eventos) {
        const tsMs = paraEpochMs(evento.criado_em);
        if (ligado) totalMs += tsMs - cursorMs;
        cursorMs = tsMs;
        ligado = evento.novo_estado === 1;
    }
    if (ligado) totalMs += fimMs - cursorMs;

    return totalMs / 3600000;
}

// Fecha UM dia: grava em consumo_energia_diario o kWh de cada porta com potencia configurada
// (modulos tipo "atuador") + o consumo base de cada modulo com potencia_base_watts
// configurada (qualquer tipo). "permitirDiaAtual" e a unica forma de recalcular o dia de HOJE
// (ainda em andamento) — usado pelo endpoint do relatorio (pra manter "hoje" fresco a cada
// consulta) e pelo proprio agendamento periodico (ver executarFechamentoDiario abaixo). Sem
// essa flag, um dia igual ou posterior a hoje e ignorado silenciosamente (nunca fecha um dia
// que ainda nao terminou por engano).
function fecharDia(diaISO, { permitirDiaAtual = false } = {}) {
    const hojeISO = formatarDiaISO(Date.now());
    if (diaISO > hojeISO) return { fechado: false, motivo: 'dia no futuro' };
    if (diaISO === hojeISO && !permitirDiaAtual) return { fechado: false, motivo: 'dia em andamento' };

    const inicioDiaSql = inicioDoDiaSql(diaISO);
    const inicioMs = paraEpochMs(inicioDiaSql);
    const ehHoje = diaISO === hojeISO;
    const fimMs = ehHoje ? Date.now() : inicioMs + 86400000;
    const fimDiaSql = paraSqliteUTC(new Date(ehHoje ? fimMs : inicioMs + 86400000));

    const upsert = db.prepare(`
        INSERT INTO consumo_energia_diario (modulo_id, posicao_indice, nome, dia, potencia_watts, horas_ligado, kwh)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT (modulo_id, posicao_indice, dia)
        DO UPDATE SET nome = excluded.nome, potencia_watts = excluded.potencia_watts,
                      horas_ligado = excluded.horas_ligado, kwh = excluded.kwh
    `);

    let linhas = 0;

    const modulosAtuadores = db.prepare("SELECT id FROM modulos WHERE tipo = 'atuador'").all();
    for (const modulo of modulosAtuadores) {
        const portas = db
            .prepare('SELECT posicao_indice, nome_personalizado, potencia_watts FROM portas_mapeamento WHERE modulo_id = ? AND potencia_watts IS NOT NULL')
            .all(modulo.id);

        for (const porta of portas) {
            const horas = calcularHorasLigadoNoDia(modulo.id, porta.posicao_indice, inicioMs, fimMs, inicioDiaSql, fimDiaSql);
            const nome = porta.nome_personalizado?.trim() || `Porta ${String(porta.posicao_indice + 1).padStart(2, '0')}`;
            const kwh = (horas * porta.potencia_watts) / 1000;
            upsert.run(modulo.id, porta.posicao_indice, nome, diaISO, porta.potencia_watts, arredondar(horas, 3), arredondar(kwh, 4));
            linhas++;
        }
    }

    const modulosComBase = db.prepare('SELECT id, nome, potencia_base_watts FROM modulos WHERE potencia_base_watts IS NOT NULL').all();
    for (const modulo of modulosComBase) {
        const horasNoDia = ehHoje ? (fimMs - inicioMs) / 3600000 : 24;
        const kwh = (horasNoDia * modulo.potencia_base_watts) / 1000;
        upsert.run(modulo.id, MODULO_SENTINELA, modulo.nome, diaISO, modulo.potencia_base_watts, arredondar(horasNoDia, 3), arredondar(kwh, 4));
        linhas++;
    }

    return { fechado: true, linhas };
}

// Dia mais antigo que faz sentido tentar fechar, quando a tabela de consumo ainda esta vazia
// (primeira ativacao do recurso) — o mais antigo entre "primeiro evento de rele conhecido" e
// "modulo mais antigo cadastrado" (cobre o consumo base mesmo sem nenhum evento de rele ainda).
function diaMaisAntigoDisponivel() {
    const primeiroEvento = db.prepare('SELECT MIN(criado_em) AS minimo FROM historico_reles').get();
    const primeiroModulo = db.prepare('SELECT MIN(criado_em) AS minimo FROM modulos').get();
    const candidatos = [primeiroEvento?.minimo, primeiroModulo?.minimo].filter(Boolean);
    if (candidatos.length === 0) return null;
    return candidatos.sort()[0].slice(0, 10);
}

// Backfill (primeira ativacao) + catch-up (servidor ficou desligado por dias) + continuacao
// normal, tudo na mesma logica: fecha todo dia faltante entre o ultimo ja fechado e ontem, e
// no fim sempre atualiza a linha de HOJE (pra ficar razoavelmente fresca mesmo sem ninguem
// abrir o relatorio — o endpoint do relatorio tambem faz esse refresh sob demanda, ver
// obterRelatorioEnergia).
function executarFechamentoDiario() {
    const hojeISO = formatarDiaISO(Date.now());
    const ultimoFechado = db.prepare('SELECT MAX(dia) AS maximo FROM consumo_energia_diario WHERE dia < ?').get(hojeISO);
    const inicioBackfill = ultimoFechado?.maximo ? proximoDia(ultimoFechado.maximo) : diaMaisAntigoDisponivel();

    let diasFechados = 0;
    if (inicioBackfill) {
        let diaAtual = inicioBackfill;
        while (diaAtual < hojeISO) {
            fecharDia(diaAtual);
            diasFechados++;
            diaAtual = proximoDia(diaAtual);
        }
    }

    fecharDia(hojeISO, { permitirDiaAtual: true });

    if (diasFechados > 0) {
        console.log(`[energia] ${diasFechados} dia(s) fechado(s) no calculo de consumo de energia.`);
    }
}

function iniciarAgendamentoConsumoEnergia() {
    executarFechamentoDiario();
    setInterval(executarFechamentoDiario, INTERVALO_AGENDAMENTO_MS);
}

// GET /api/relatorios/energia — le SOMENTE de consumo_energia_diario (fonte unica de
// verdade), nunca mistura com calculo ao vivo em memoria. Se o periodo pedido inclui hoje,
// atualiza a linha de hoje antes de consultar (fecharDia e barato — reagrega so um dia).
function obterRelatorioEnergia(inicioSql, fimSql) {
    const hojeISO = formatarDiaISO(Date.now());
    const diaInicio = formatarDiaISO(paraEpochMs(inicioSql));
    const diaFimBruto = formatarDiaISO(paraEpochMs(fimSql));
    const diaFim = diaFimBruto > hojeISO ? hojeISO : diaFimBruto;

    if (diaFim >= hojeISO) {
        fecharDia(hojeISO, { permitirDiaAtual: true });
    }

    const linhas = db
        .prepare('SELECT * FROM consumo_energia_diario WHERE dia >= ? AND dia <= ? ORDER BY dia ASC')
        .all(diaInicio, diaFim);

    const linhaTarifa = db.prepare("SELECT valor FROM configuracoes_gerais WHERE chave = 'tarifa_energia_kwh'").get();
    const tarifa = Number(linhaTarifa?.valor ?? '0');
    const tarifaConfigurada = Number.isFinite(tarifa) && tarifa > 0;

    if (linhas.length === 0) {
        return {
            disponivel: false,
            motivo: 'Nenhum equipamento ou modulo com potencia (W) configurada ainda — defina a potencia no Mapeamento de Saidas ou em Editar Controlador.',
            tarifaConfigurada,
            tarifaReais: tarifaConfigurada ? tarifa : null,
        };
    }

    const porDia = new Map();
    const porEquipamento = new Map();

    for (const linha of linhas) {
        porDia.set(linha.dia, (porDia.get(linha.dia) ?? 0) + linha.kwh);

        const chave = `${linha.modulo_id}:${linha.posicao_indice}`;
        if (!porEquipamento.has(chave)) {
            porEquipamento.set(chave, {
                chave,
                nome: linha.nome,
                tipo: linha.posicao_indice === MODULO_SENTINELA ? 'modulo' : 'atuador',
                kwhTotal: 0,
                serieDiaria: new Map(),
            });
        }
        const item = porEquipamento.get(chave);
        item.nome = linha.nome; // linhas em ordem crescente de dia — a ultima e a mais recente
        item.kwhTotal += linha.kwh;
        item.serieDiaria.set(linha.dia, (item.serieDiaria.get(linha.dia) ?? 0) + linha.kwh);
    }

    const kwhPorDia = [...porDia.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dia, kwh]) => ({ dia, kwh: arredondar(kwh, 3) }));

    const equipamentos = [...porEquipamento.values()]
        .map((item) => ({
            chave: item.chave,
            nome: item.nome,
            tipo: item.tipo,
            kwhTotal: arredondar(item.kwhTotal, 3),
            serieDiaria: kwhPorDia.map(({ dia }) => ({ dia, kwh: arredondar(item.serieDiaria.get(dia) ?? 0, 3) })),
        }))
        .sort((a, b) => b.kwhTotal - a.kwhTotal);

    const totalKwh = equipamentos.reduce((soma, e) => soma + e.kwhTotal, 0);
    const totalDias = kwhPorDia.length || 1;

    return {
        disponivel: true,
        kpis: {
            totalKwh: arredondar(totalKwh, 2),
            custoEstimadoReais: tarifaConfigurada ? arredondar(totalKwh * tarifa, 2) : null,
            equipamentoQueMaisConsome: equipamentos[0]?.nome ?? null,
            consumoMedioDiarioKwh: arredondar(totalKwh / totalDias, 3),
        },
        kwhPorDia,
        porEquipamento: equipamentos,
        distribuicao: equipamentos.filter((e) => e.kwhTotal > 0).map((e) => ({ nome: e.nome, kwh: e.kwhTotal })),
        tarifaConfigurada,
        tarifaReais: tarifaConfigurada ? tarifa : null,
        periodo: { inicio: diaInicio, fim: diaFim },
    };
}

module.exports = { iniciarAgendamentoConsumoEnergia, executarFechamentoDiario, obterRelatorioEnergia };
