// Motor de Agendamento Inteligente (18-espc, 01-espc-geral/15_engine_agendamento_timers_e_overrides.md):
// roda um ciclo a cada 10s (setInterval, sem node-cron — mesmo padrao ja usado em
// statusModulosService.js, sem adicionar dependencia nova) que confere os `agendamentos`
// ativos + `timers_ativos` em andamento e forca os reles do(s) modulo(s) atuador pro estado
// correto. `modoManualOverride` e uma flag GLOBAL em memoria (nao persistida — um restart do
// processo sempre entra com override=false, e o boot ja dispara uma re-sincronizacao
// completa por conta propria, exatamente como pede a especificacao: "Disparo: No boot do
// server OU no momento em que o usuario DESATIVA um Tema Manual").
const db = require('../database/db');
const { aplicarRelesNoModulo } = require('./relesService');

const TOTAL_PORTAS = 16;
const INTERVALO_CICLO_MS = 10_000;

// Date.getDay(): 0=domingo..6=sabado — mapeado pras siglas usadas em `dias_semana`.
const DIAS_SEMANA_POR_INDICE = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];

let modoManualOverride = false;
let intervaloId = null;

function horaAtualStr(data) {
    const h = String(data.getHours()).padStart(2, '0');
    const m = String(data.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
}

// Testa se "atual" (HH:MM) esta dentro da janela [inicio, fim) — suporta janelas que
// atravessam a meia-noite (ex.: 22:00 -> 06:00), tratando isso como "fora do intervalo
// direto" (inicio > fim) e invertendo a logica.
function dentroDaJanela(inicio, fim, atual) {
    if (inicio === fim) return false;
    if (inicio < fim) return atual >= inicio && atual < fim;
    return atual >= inicio || atual < fim;
}

function registrarHistorico(moduloId, evento, origem, detalhes = null) {
    db.prepare('INSERT INTO historico_autocontrol (modulo_id, evento, origem, detalhes) VALUES (?, ?, ?, ?)').run(
        moduloId ?? null,
        evento,
        origem,
        detalhes
    );
}

function relesDoTema(temaId) {
    return db.prepare('SELECT posicao_indice, estado FROM temas_reles WHERE tema_id = ?').all(temaId);
}

function parseDias(json) {
    try {
        const dias = JSON.parse(json);
        return Array.isArray(dias) ? dias : [];
    } catch {
        return [];
    }
}

// 19-espc: um agendamento agora pode ter VARIOS intervalos hora_inicio/hora_fim (ex.: "08h-12h
// E 18h-22h") — vivem na tabela filha agendamentos_horarios, mesmo padrao de temas/temas_reles.
function buscarHorarios(agendamentoId) {
    return db.prepare('SELECT hora_inicio, hora_fim FROM agendamentos_horarios WHERE agendamento_id = ? ORDER BY hora_inicio').all(agendamentoId);
}

// Calcula, PRA AGORA, o que os agendamentos ativos deste modulo "querem" pra cada indice
// de rele — so entram no mapa os indices com uma opiniao explicita (uma janela ativa nao
// e a mesma coisa que "sem agendamento nenhum": este ultimo caso fica de fora do mapa de
// proposito, ver processarModulo). De quebra, autodesativa agendamentos "uma vez so"
// (repetir=false) cujos intervalos de hoje ja terminaram TODOS, pra nunca mais dispararem
// sozinhos.
function calcularDesejoAtual(moduloId, agora) {
    const diaToken = DIAS_SEMANA_POR_INDICE[agora.getDay()];
    const horaAtual = horaAtualStr(agora);
    const desejo = new Map();

    const agendamentos = db.prepare('SELECT * FROM agendamentos WHERE modulo_id = ? AND ativo = 1').all(moduloId);

    for (const ag of agendamentos) {
        const dias = parseDias(ag.dias_semana);
        if (!dias.includes(diaToken)) continue;

        const horarios = buscarHorarios(ag.id);
        if (horarios.length === 0) continue;

        const algumAtivo = horarios.some((h) => dentroDaJanela(h.hora_inicio, h.hora_fim, horaAtual));

        if (algumAtivo) {
            if (ag.tipo === 'rele') {
                desejo.set(ag.alvo_id, 1);
            } else {
                for (const r of relesDoTema(ag.alvo_id)) desejo.set(r.posicao_indice, r.estado);
            }
        } else if (!ag.repetir) {
            // "Uma vez so": so autodesativa quando TODOS os intervalos de hoje ja terminaram.
            // So decide isso pra intervalos sem virada de meia-noite (caso raro/ambiguo o
            // suficiente pra nao valer a complexidade extra aqui) — se algum intervalo
            // atravessa a meia-noite, pula o autodesativamento neste ciclo.
            const semVirada = horarios.every((h) => h.hora_inicio < h.hora_fim);
            const todosTerminaram = semVirada && horarios.every((h) => horaAtual >= h.hora_fim);
            if (todosTerminaram) {
                db.prepare('UPDATE agendamentos SET ativo = 0 WHERE id = ?').run(ag.id);
            }
        }
    }

    return desejo;
}

// Timers rodando sobrepoem o agendamento normal pro alvo deles (spec 2.3: "Enquanto o timer
// estiver rodando, ele se sobrepoe ao agendamento"). Os que ja expiraram AINDA NAO sao
// removidos aqui de proposito — só entram no mapa "desejo" (forcando OFF, a menos que um
// agendamento ja tenha uma opiniao pro mesmo indice) e sao devolvidos pra quem chamou. A
// remocao de verdade (+ o log TIMER_EXPIRADO) só acontece em finalizarTimersExpirados,
// depois que o array corrigido for aplicado com SUCESSO no ESP (ver processarModulo) — sem
// essa separacao, um ESP momentaneamente inacessivel nesse ciclo faria o timer sumir da
// tabela sem a carga ser desligada de verdade (bug encontrado testando com hardware real).
function calcularTimers(moduloId, desejo, agoraIso) {
    const expirados = db.prepare('SELECT * FROM timers_ativos WHERE modulo_id = ? AND expira_em <= ?').all(moduloId, agoraIso);
    for (const t of expirados) {
        const indices = t.alvo_tipo === 'rele' ? [t.alvo_id] : relesDoTema(t.alvo_id).map((r) => r.posicao_indice);
        for (const indice of indices) {
            if (!desejo.has(indice)) desejo.set(indice, 0);
        }
    }

    const ativos = db.prepare('SELECT * FROM timers_ativos WHERE modulo_id = ? AND expira_em > ?').all(moduloId, agoraIso);
    for (const t of ativos) {
        if (t.alvo_tipo === 'rele') {
            desejo.set(t.alvo_id, 1);
        } else {
            for (const r of relesDoTema(t.alvo_id)) desejo.set(r.posicao_indice, r.estado);
        }
    }

    return expirados;
}

function finalizarTimersExpirados(moduloId, expirados) {
    for (const t of expirados) {
        db.prepare('DELETE FROM timers_ativos WHERE id = ?').run(t.id);
        registrarHistorico(moduloId, 'TIMER_EXPIRADO', 'TIMER', `${t.nome || 'Timer'} expirou — carga desligada, agenda restaurada`);
    }
}

// Executa um ciclo pra UM modulo. `forcarTodos` (self-healing completo, spec 2.2) forca os
// 16 indices — quem nao tem agendamento/timer cobrindo agora volta pra 0 — e sempre grava
// no historico_autocontrol, mesmo se nada mudou de fato (a especificacao pede o log de
// "executada com sucesso" toda vez que a rotina roda, nao so quando ha diferenca real).
// Sem `forcarTodos` (ciclo normal de 10s), so mexe nos indices com opiniao explicita —
// nunca stompa um rele que o usuario ligou/desligou manualmente fora de qualquer agenda.
async function processarModulo(modulo, { forcarTodos = false, evento = null, origem = 'AGENDAMENTO', detalhes = null } = {}) {
    const agora = new Date();
    const desejo = calcularDesejoAtual(modulo.id, agora);
    const expirados = calcularTimers(modulo.id, desejo, agora.toISOString());

    let estadoAtual = Array(TOTAL_PORTAS).fill(0);
    let leituraOk = false;
    try {
        const resposta = await fetch(`http://${modulo.ip}/api/reles`, { signal: AbortSignal.timeout(4000) });
        if (resposta.ok) {
            const dados = await resposta.json();
            if (Array.isArray(dados.reles)) {
                estadoAtual = dados.reles;
                leituraOk = true;
            }
        }
    } catch {
        // ESP inacessivel neste ciclo — segue com leituraOk=false
    }

    // Ciclo normal: nao arrisca zerar nada as cegas — e os timers expirados detectados
    // acima continuam pendentes (nao finalizados), a proxima tentativa (10s depois) tenta
    // de novo com uma leitura fresca.
    if (!leituraOk && !forcarTodos) return;

    const novoArray = [...estadoAtual];
    if (forcarTodos) {
        for (let i = 0; i < TOTAL_PORTAS; i++) novoArray[i] = desejo.has(i) ? desejo.get(i) : 0;
    } else {
        for (const [indice, valor] of desejo) novoArray[indice] = valor;
    }

    const mudou = novoArray.some((valor, i) => valor !== estadoAtual[i]);
    if (!mudou && !forcarTodos) {
        // Nada pra aplicar nos reles, mas se havia timer expirado (ex.: o ESP ja estava no
        // estado certo por outro motivo), finaliza mesmo assim — nao ha nada pendente.
        if (expirados.length > 0) finalizarTimersExpirados(modulo.id, expirados);
        return;
    }

    const resultado = await aplicarRelesNoModulo(modulo.id, novoArray, 'agendamento');
    // So comita a expiracao (remove a linha + loga TIMER_EXPIRADO) depois de confirmar que
    // o array corrigido foi aplicado com sucesso — ver calcularTimers acima pro motivo.
    if (resultado.ok && expirados.length > 0) finalizarTimersExpirados(modulo.id, expirados);

    if (forcarTodos) {
        registrarHistorico(
            modulo.id,
            evento || 'RECUPERACAO_POS_QUEDA',
            origem,
            resultado.ok
                ? detalhes || 'Re-sincronizacao de agendamento executada com sucesso'
                : `Falha na re-sincronizacao: ${resultado.motivo}`
        );
    }
}

function modulosAtuadores() {
    return db.prepare("SELECT * FROM modulos WHERE tipo = 'atuador' AND ativo = 1").all();
}

// Ciclo normal (a cada 10s) — pausado inteiro enquanto o override manual estiver ativo
// (spec 2.1: "Se sim, suspende acionamentos automaticos").
async function executarCiclo() {
    if (modoManualOverride) return;
    for (const modulo of modulosAtuadores()) {
        await processarModulo(modulo, { forcarTodos: false });
    }
}

// Self-healing (spec 2.2) — roda no boot do server e sempre que o override manual e
// desligado. Forca TODOS os 16 reles de cada modulo atuador pro estado que a agenda manda
// agora mesmo.
async function executarResincronizacaoCompleta({ evento, origem, detalhes } = {}) {
    for (const modulo of modulosAtuadores()) {
        await processarModulo(modulo, { forcarTodos: true, evento, origem, detalhes });
    }
}

// No boot, um modulo que já tinha um Tema Manual ativo ANTES do restart (persistido em
// `temas_estado`, sobrevive a reinicios mesmo o override em si sendo só em memória) NÃO
// pode ser resincronizado às cegas — a resincronização completa só conhece `agendamentos`,
// então forçaria os relés do Tema pro estado "sem agendamento" (tipicamente todos OFF),
// destruindo um estado manual que o usuário deixou de propósito. Achado testando com
// hardware real: um Tema com 2 relés ligados foi zerado no boot antes deste fix. Em vez
// disso, esse(s) modulo(s) só reativam o override (sem mexer nos relés) — só os módulos
// SEM Tema ativo passam pela resincronização forçada de verdade.
function iniciarSchedulerEngine() {
    if (intervaloId) return; // evita duplicar o laço se chamado mais de uma vez

    let algumTemaAtivoNoBoot = false;

    for (const modulo of modulosAtuadores()) {
        const estadoTema = db.prepare('SELECT tema_ativo_id FROM temas_estado WHERE modulo_id = ?').get(modulo.id);
        if (estadoTema?.tema_ativo_id) {
            algumTemaAtivoNoBoot = true;
            const tema = db.prepare('SELECT nome FROM temas WHERE id = ?').get(estadoTema.tema_ativo_id);
            registrarHistorico(modulo.id, 'TEMA_OVERRIDE_ATIVADO', 'SISTEMA', `${tema?.nome ?? 'Tema'} (restaurado apos reinicio do servidor)`);
        } else {
            processarModulo(modulo, {
                forcarTodos: true,
                evento: 'RECUPERACAO_POS_QUEDA',
                origem: 'SISTEMA',
                detalhes: 'Boot do servidor — re-sincronizacao de agendamento executada com sucesso',
            });
        }
    }

    if (algumTemaAtivoNoBoot) modoManualOverride = true; // flag GLOBAL, ver comentario do topo do arquivo

    intervaloId = setInterval(executarCiclo, INTERVALO_CICLO_MS);
}

function estaEmOverride() {
    return modoManualOverride;
}

// Chamado por temasController.js quando um Tema (Manual) e ATIVADO na Web/Display — pausa
// o motor de agendamento ate o usuario desativar o tema ou clicar em "Retomar Agendamento"
// no widget (ver agendamentosController.js:retomarAgendamento).
function ativarOverride(moduloId, nomeTema) {
    if (modoManualOverride) return;
    modoManualOverride = true;
    registrarHistorico(moduloId, 'TEMA_OVERRIDE_ATIVADO', 'MANUAL_WEB', nomeTema);
}

// Chamado quando o Tema Manual e desativado (clicando nele de novo) OU via "Retomar
// Agendamento" — desliga o override e ja dispara a re-sincronizacao na hora, sem esperar o
// proximo ciclo de 10s.
async function desativarOverrideEResincronizar(moduloId, nomeTema) {
    modoManualOverride = false;
    registrarHistorico(moduloId, 'TEMA_OVERRIDE_DESATIVADO', 'MANUAL_WEB', nomeTema);
    await executarResincronizacaoCompleta({
        evento: 'RESYNC_POS_OVERRIDE',
        origem: 'AGENDAMENTO',
        detalhes: 'Re-sincronizacao de agendamento executada com sucesso',
    });
}

// Calcula quantos minutos faltam pro PROXIMO disparo de um horario especifico (hora_inicio),
// olhando ate 7 dias pra frente — usado só pro widget mostrar "Em 2h 15min: ...". Recebe
// "diasSemanaJson" + "horaInicio" separados (nao o agendamento inteiro) porque agora um
// agendamento pode ter varios horarios — cada um e checado individualmente.
function minutosAteProximoDisparo(diasSemanaJson, horaInicio, agora) {
    const dias = parseDias(diasSemanaJson);
    if (dias.length === 0) return null;

    const [horaIni, minIni] = horaInicio.split(':').map(Number);

    for (let offset = 0; offset <= 7; offset++) {
        const dataCandidata = new Date(agora);
        dataCandidata.setDate(agora.getDate() + offset);
        const tokenDia = DIAS_SEMANA_POR_INDICE[dataCandidata.getDay()];
        if (!dias.includes(tokenDia)) continue;

        dataCandidata.setHours(horaIni, minIni, 0, 0);
        const diffMs = dataCandidata.getTime() - agora.getTime();
        if (diffMs > 0) return Math.round(diffMs / 60000);
    }
    return null;
}

// Estado agregado pro Widget de Agendamentos (Dashboard): o que esta ligado AGORA pela
// agenda, o PROXIMO a disparar, e se o override esta pausando tudo. Calculado sob demanda
// (GET /api/agendamentos/estado), reaproveitando a MESMA logica de janela/dia usada pelo
// motor de verdade acima — garante que o widget nunca mostre algo diferente do que o motor
// realmente vai aplicar. Cada HORARIO de cada agendamento vira um candidato independente
// (um agendamento com 2 intervalos pode ter um ativo agora e outro ainda por vir).
function calcularEstadoParaWidget(moduloId) {
    const agora = new Date();
    const diaToken = DIAS_SEMANA_POR_INDICE[agora.getDay()];
    const horaAtual = horaAtualStr(agora);

    const agendamentos = db.prepare('SELECT * FROM agendamentos WHERE modulo_id = ? AND ativo = 1 ORDER BY id').all(moduloId);

    const ativosAgora = [];
    const candidatosProximo = [];

    for (const ag of agendamentos) {
        const dias = parseDias(ag.dias_semana);
        if (dias.length === 0) continue;

        const nomeAlvo = ag.nome || `${ag.tipo === 'tema' ? 'Tema' : 'Rele'} #${ag.alvo_id}`;
        const horarios = buscarHorarios(ag.id);

        for (const h of horarios) {
            const base = { id: ag.id, nome: nomeAlvo, tipo: ag.tipo, horaInicio: h.hora_inicio, horaFim: h.hora_fim };

            if (dias.includes(diaToken) && dentroDaJanela(h.hora_inicio, h.hora_fim, horaAtual)) {
                ativosAgora.push(base);
            } else {
                const minutosRestantes = minutosAteProximoDisparo(ag.dias_semana, h.hora_inicio, agora);
                if (minutosRestantes != null) candidatosProximo.push({ ...base, minutosRestantes });
            }
        }
    }

    candidatosProximo.sort((a, b) => a.minutosRestantes - b.minutosRestantes);

    return {
        overrideAtivo: modoManualOverride,
        ativosAgora,
        proximo: candidatosProximo[0] || null,
    };
}

module.exports = {
    iniciarSchedulerEngine,
    estaEmOverride,
    ativarOverride,
    desativarOverrideEResincronizar,
    executarResincronizacaoCompleta,
    calcularEstadoParaWidget,
};
