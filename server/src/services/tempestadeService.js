// Motor do Tema Tempestade (35-espc, ver 01-espc-geral/35_especificacao_tema_tempestade_e_efeitos_reles.md)
// — roda em PARALELO ao Motor de Agendamento normal (schedulerService.js), sem interferir
// nele (nunca mexe em `desejo`/`aplicarRelesNoModulo`): so decide QUANDO disparar o proximo
// evento de raio (intervalos aleatorios de 15-60s, secao 3 da spec) enquanto um tema
// tipo_efeito='tempestade' estiver "ativo" por qualquer um dos 3 jeitos que um tema normal
// ja pode estar ativo hoje (manual/timer/agendamento) — ver temaTempestadeAtivoNoModulo.
const db = require('../database/db');
const { buscarModulo, aplicarRelesNoModulo } = require('./relesService');
const { calcularEstadoParaWidget } = require('./schedulerService');
const { registrarLog } = require('./logService');
const { gerarEventoRaio, gerarSequenciaAbertura, CORES_POR_POSICAO } = require('./geradorTempestade');

const INTERVALO_CICLO_MS = 5_000;
// Defaults do sistema — usados quando o tema nao tem um intervalo customizado salvo
// (tempestade_intervalo_min_s/max_s = NULL, ver temasController.js). Pedido do usuario apos
// testar ao vivo: o intervalo fixo de 15-60s demorava demais pro primeiro raio aparecer —
// agora e configuravel por tema (sliders em ModalCriarTema.jsx), isto aqui so continua sendo
// o piso/teto padrao pra quem nunca mexeu nisso.
const INTERVALO_MIN_ENTRE_EVENTOS_MS = 15_000;
const INTERVALO_MAX_ENTRE_EVENTOS_MS = 60_000;
const TIMEOUT_MS = 4_000;

const ROTULOS_TIPO_RAIO = {
    flash_pontual: 'Raio Localizado',
    varredura: 'Raio de Varredura',
    clarao_global: 'Clarao Global',
    flash_azul_fundo: 'Brilho Azul de Fundo',
    vermelho_alerta: 'Alerta Vermelho',
    combinado_azul_vermelho: 'Raio Azul+Vermelho',
    raio_ceu_azul: 'Raio Cruzando o Ceu',
};

let intervaloId = null;

// Sessao EM MEMORIA por modulo_id (nao persistida — ver nota sobre reboot mais abaixo, em
// iniciarSessao): { temaId, proximoEventoEm, snapshotAnterior }. Ausente = tema nao esta
// "com sessao aberta" agora (nem ativo). "snapshotAnterior" e o estado das lampadas MAPEADAS
// de ANTES da ativacao (pedido do usuario: desativar o tema devolve os reles pro estado
// anterior, nao so desliga tudo) — capturado uma vez em iniciarSessao, consumido em
// encerrarSessao.
const sessaoPorModulo = new Map();

// "tema" (linha crua de `temas`, ja tem tempestade_intervalo_min_s/max_s se o usuario
// configurou um intervalo customizado pra ele) — cai pros defaults do sistema quando NULL.
function proximoIntervaloAleatorio(tema) {
    const minMs = tema?.tempestade_intervalo_min_s != null ? tema.tempestade_intervalo_min_s * 1000 : INTERVALO_MIN_ENTRE_EVENTOS_MS;
    const maxMs = tema?.tempestade_intervalo_max_s != null ? tema.tempestade_intervalo_max_s * 1000 : INTERVALO_MAX_ENTRE_EVENTOS_MS;
    return minMs + Math.random() * (maxMs - minMs);
}

function registrarEventoHistorico(moduloId, mensagem) {
    db.prepare('INSERT INTO historico_autocontrol (modulo_id, evento, origem, detalhes) VALUES (?, ?, ?, ?)').run(
        moduloId,
        'TEMPESTADE_EVENTO',
        'TEMA',
        mensagem
    );
}

function buscarTema(temaId) {
    return db.prepare('SELECT * FROM temas WHERE id = ?').get(temaId);
}

function ehTemaTempestade(temaId) {
    const tema = buscarTema(temaId);
    return tema?.tipo_efeito === 'tempestade' ? tema : null;
}

// As mesmas 3 fontes que ja decidem se um TEMA qualquer esta "ativo agora" — reaproveitadas
// tal e qual, sem duplicar nenhuma logica de dia/hora/expiracao:
//   1. Ativacao manual (temas_estado.tema_ativo_id).
//   2. Timer de duracao ainda nao expirado (timers_ativos, alvo_tipo='tema').
//   3. Agendamento por horario dentro da janela agora — via
//      schedulerService.js:calcularEstadoParaWidget, a MESMA funcao que ja alimenta o
//      widget de Agendamentos, garantindo que este motor nunca discorde do que o motor de
//      agendamento normal considera "ativo agora".
function temaTempestadeAtivoNoModulo(moduloId) {
    const estadoManual = db.prepare('SELECT tema_ativo_id FROM temas_estado WHERE modulo_id = ?').get(moduloId);
    if (estadoManual?.tema_ativo_id) {
        const tema = ehTemaTempestade(estadoManual.tema_ativo_id);
        if (tema) return tema;
    }

    const agoraIso = new Date().toISOString();
    const timersAtivos = db
        .prepare("SELECT alvo_id FROM timers_ativos WHERE modulo_id = ? AND alvo_tipo = 'tema' AND expira_em > ?")
        .all(moduloId, agoraIso);
    for (const t of timersAtivos) {
        const tema = ehTemaTempestade(t.alvo_id);
        if (tema) return tema;
    }

    const { ativosAgora } = calcularEstadoParaWidget(moduloId);
    for (const ativo of ativosAgora) {
        if (ativo.tipo !== 'tema') continue;
        const tema = ehTemaTempestade(ativo.id);
        if (tema) return tema;
    }

    return null;
}

// Lampadas prontas pra uso: precisam ter posicao_indice_rele mapeada E a porta correspondente
// precisa estar HABILITADA no Mapeamento de Saidas — mesma defesa em profundidade que
// relesService.js:aplicarRelesNoModulo ja aplica no caminho normal, que este motor NAO passa
// (fala direto com o ESP, ver enviarSequencia). "cor" vem da POSICAO fisica (CORES_POR_POSICAO,
// ver geradorTempestade.js) — nao mais do nome do rele escolhido, a pedido do usuario (mais
// confiavel: nao depende de como o rele foi nomeado, so de qual posicao da calha ele ocupa).
function lampadasUtilizaveis(temaId, moduloId) {
    const lampadas = db
        .prepare(
            `SELECT posicao_lampada AS posicaoLampada, posicao_indice_rele AS posicaoIndiceRele
             FROM tema_tempestade_lampadas
             WHERE tema_id = ? AND posicao_indice_rele IS NOT NULL`
        )
        .all(temaId);
    if (lampadas.length === 0) return [];

    const portas = db.prepare('SELECT posicao_indice, nome_personalizado, habilitado FROM portas_mapeamento WHERE modulo_id = ?').all(moduloId);
    const portaPorIndice = new Map(portas.map((p) => [p.posicao_indice, p]));

    return lampadas
        .filter((l) => portaPorIndice.get(l.posicaoIndiceRele)?.habilitado)
        .map((l) => ({
            ...l,
            nomeRele: portaPorIndice.get(l.posicaoIndiceRele)?.nome_personalizado || null,
            cor: CORES_POR_POSICAO[l.posicaoLampada - 1] ?? 'branca',
        }));
}

// Manda a rajada INTEIRA pro ESP num unico POST — direto, sem passar por
// aplicarRelesNoModulo/registrarMudancas (isso geraria uma linha de historico_reles E de
// System Log por PISCADA, indefinidamente enquanto o tema estiver ativo). Uma linha de
// historico_autocontrol por EVENTO (nao por passo) ja da rastreabilidade suficiente.
async function enviarSequencia(modulo, passos) {
    try {
        const resposta = await fetch(`http://${modulo.ip}/api/reles/sequencia`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passos }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        return resposta.ok;
    } catch {
        return false;
    }
}

// Cancela uma rajada em andamento no ESP (botao "PARAR"/desativar o tema) — melhor esforco:
// se o POST falhar, a rajada (se houver) e sempre curta (no maximo poucos segundos) e termina
// sozinha de qualquer jeito.
async function pararSequenciaNoModulo(modulo) {
    if (!modulo) return;
    try {
        await fetch(`http://${modulo.ip}/api/reles/sequencia/parar`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch {
        // melhor esforco, ver comentario acima
    }
}

function rotuloEvento(evento) {
    return evento ? ROTULOS_TIPO_RAIO[evento.tipo] ?? evento.tipo : null;
}

async function dispararEvento(modulo, tema) {
    const lampadas = lampadasUtilizaveis(tema.id, modulo.id);
    const evento = gerarEventoRaio(lampadas);
    if (!evento) return; // nenhuma lampada mapeada/habilitada ainda — nada pra disparar

    const enviado = await enviarSequencia(modulo, evento.passos);
    if (enviado) {
        // Pedido do usuario: identificar no log QUAL tipo de raio disparou — "evento.descricao"
        // (gerado em geradorTempestade.js) ja nomeia o tipo por extenso, so prefixado com o
        // nome do tema pra contexto. Uma linha em historico_autocontrol (alimenta a aba
        // Alertas & Saude da Central de Relatorios) E uma no System Log (visivel no widget do
        // dashboard e na pagina /logs) — o mesmo texto nos dois, sem duplicar por passo/piscada.
        const mensagem = `⚡ ${rotuloEvento(evento)} — ${tema.nome}: ${evento.descricao}`;
        registrarEventoHistorico(modulo.id, mensagem);
        registrarLog(mensagem, 'info', 'atuador', null, 'automatico');
    }
}

// Le o estado ATUAL das lampadas mapeadas direto do ESP — usado tanto pra guardar o "antes"
// (capturarEstadoAnterior, na ativacao) quanto na restauracao (que precisa de uma leitura
// FRESCA do resto dos reles, pra nao atropelar algo que mudou nesse meio tempo).
async function lerEstadoAtual(modulo) {
    try {
        const resposta = await fetch(`http://${modulo.ip}/api/reles`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (resposta.ok) {
            const dados = await resposta.json();
            if (Array.isArray(dados.reles)) return dados.reles;
        }
    } catch {
        // sem leitura — segue com zeros (melhor esforco, mesmo padrao do resto do projeto)
    }
    return Array(16).fill(0);
}

// Snapshot do estado das lampadas MAPEADAS de ANTES do tema ativar — pedido do usuario:
// desativar o tema devolve os reles pro estado de antes, nao so desliga tudo.
async function capturarEstadoAnterior(modulo, lampadas) {
    const estadoAtual = await lerEstadoAtual(modulo);
    return lampadas.map((l) => ({ posicaoIndiceRele: l.posicaoIndiceRele, estado: estadoAtual[l.posicaoIndiceRele] ?? 0 }));
}

// Aplica o snapshot capturado de volta — le o estado ATUAL de novo (pode ter mudado durante a
// tempestade por outro motivo) e so sobrescreve os indices do snapshot, via
// aplicarRelesNoModulo (mesmo caminho de qualquer acionamento "de verdade" — proteção de
// portas desabilitadas + historico_reles/System Log normais, ja que isso acontece só 1 vez
// por desativação, não é ruído de piscada).
async function restaurarEstadoAnterior(modulo, tema, snapshotAnterior) {
    if (!snapshotAnterior || snapshotAnterior.length === 0) return;

    const estadoAtual = await lerEstadoAtual(modulo);
    const novoArray = [...estadoAtual];
    for (const { posicaoIndiceRele, estado } of snapshotAnterior) {
        novoArray[posicaoIndiceRele] = estado;
    }

    await aplicarRelesNoModulo(modulo.id, novoArray, 'tema', `${tema?.nome ?? 'Tema Tempestade'} (lampadas restauradas ao estado anterior)`);
}

// Abre uma sessao nova: captura o snapshot "antes" e manda a Sequencia de Abertura
// (escurecimento fixo de 4 etapas de 3s cada, ver geradorTempestade.js) sozinha — o primeiro
// raio aleatorio NAO vai embutido nela (mudanca pedida pelo usuario: a abertura termina com
// as azuis apagando, e SO DEPOIS disso a sequencia de raios aleatorios começa, no seu proprio
// ritmo normal). O cooldown do proximo raio e liberado exatamente quando a abertura termina
// (sem outro intervalo aleatorio somado por cima) — o motor de fundo (executarCiclo) dispara o
// primeiro raio assim que detectar isso no proximo ciclo de 5s.
async function iniciarSessao(modulo, tema) {
    const lampadas = lampadasUtilizaveis(tema.id, modulo.id);
    const snapshotAnterior = await capturarEstadoAnterior(modulo, lampadas);

    const abertura = gerarSequenciaAbertura(lampadas);

    let duracaoMs = 0;
    if (abertura) {
        duracaoMs = abertura.passos.reduce((soma, p) => soma + p.delayMs, 0);
        const enviado = await enviarSequencia(modulo, abertura.passos);
        if (enviado) {
            const mensagem = `⚡ Abertura da Tempestade — ${tema.nome}`;
            registrarEventoHistorico(modulo.id, mensagem);
            registrarLog(mensagem, 'info', 'atuador', null, 'automatico');
        }
    }

    // Nota sobre reboot do processo: a sessao (e o snapshot "antes") vive so em memoria — se o
    // Brain reiniciar com o tema ainda ativo, a proxima deteccao (executarCiclo) abre uma
    // sessao NOVA e toca a abertura de novo, capturando um snapshot fresco a partir do estado
    // que o ESP estiver naquele momento (aceitavel: reboot do servidor e raro e o pior caso e
    // só repetir a intro, não perder nenhum estado real).
    sessaoPorModulo.set(modulo.id, {
        temaId: tema.id,
        snapshotAnterior,
        proximoEventoEm: Date.now() + duracaoMs,
    });
}

// Fecha a sessao: cancela qualquer rajada em andamento no ESP e restaura o snapshot "antes" —
// chamada tanto pelo desligamento MANUAL (temasController.js) quanto pela deteccao de borda
// de descida no ciclo de 5s (timer expirou / janela de agendamento fechou), unificando os 3
// jeitos de um tema tempestade parar de estar ativo num so lugar.
async function encerrarSessao(moduloId) {
    const sessao = sessaoPorModulo.get(moduloId);
    sessaoPorModulo.delete(moduloId);
    if (!sessao) return;

    const modulo = buscarModulo(moduloId);
    if (!modulo) return;
    const tema = buscarTema(sessao.temaId);

    await pararSequenciaNoModulo(modulo);
    await restaurarEstadoAnterior(modulo, tema, sessao.snapshotAnterior);
}

// Chamado por temasController.js na ativacao manual — abre a sessao (snapshot + abertura) na
// hora, sem esperar o proximo ciclo de 5s (feedback instantaneo de que o tema "funcionou").
async function iniciarSessaoTempestade(moduloId, temaId) {
    const modulo = buscarModulo(moduloId);
    const tema = ehTemaTempestade(temaId);
    if (!modulo || !tema) return;
    await iniciarSessao(modulo, tema);
}

// Chamado por temasController.js no desligamento manual — fecha a sessao (restaura o
// snapshot) na hora, sem esperar o proximo ciclo de 5s.
async function encerrarSessaoTempestade(moduloId) {
    await encerrarSessao(moduloId);
}

async function executarCiclo() {
    const modulosAtuadores = db.prepare("SELECT * FROM modulos WHERE tipo = 'atuador' AND ativo = 1").all();

    for (const modulo of modulosAtuadores) {
        const tema = temaTempestadeAtivoNoModulo(modulo.id);
        const sessao = sessaoPorModulo.get(modulo.id);

        if (!tema) {
            if (sessao) await encerrarSessao(modulo.id); // borda de descida — estava ativo, agora nao esta mais
            continue;
        }

        if (!sessao) {
            await iniciarSessao(modulo, tema); // borda de subida — timer/agendamento acabou de ativar
            continue;
        }

        if (Date.now() >= sessao.proximoEventoEm) {
            await dispararEvento(modulo, tema);
            sessao.proximoEventoEm = Date.now() + proximoIntervaloAleatorio(tema);
        }
    }
}

function iniciarMotorTempestade() {
    if (intervaloId) return; // evita duplicar o laço se chamado mais de uma vez
    intervaloId = setInterval(executarCiclo, INTERVALO_CICLO_MS);
}

module.exports = { iniciarMotorTempestade, iniciarSessaoTempestade, encerrarSessaoTempestade };
