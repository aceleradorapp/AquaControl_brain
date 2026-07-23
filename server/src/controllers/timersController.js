// Timers Rapidos (18-espc): dispara o alvo (rele ou tema) na hora e agenda o desligamento
// automatico — enquanto a linha existe em `timers_ativos`, o motor (schedulerService.js)
// mantem o alvo ligado por cima do agendamento normal; ao expirar (ou ser cancelado aqui),
// desliga e "restaura a agenda".
const db = require('../database/db');
const { aplicarRelesNoModulo } = require('../services/relesService');

const TOTAL_PORTAS = 16;

function nomeAlvoAtual(tipo, alvoId, moduloId) {
    if (tipo === 'tema') {
        return db.prepare('SELECT nome FROM temas WHERE id = ?').get(alvoId)?.nome ?? null;
    }
    return db.prepare('SELECT nome_personalizado FROM portas_mapeamento WHERE modulo_id = ? AND posicao_indice = ?').get(moduloId, alvoId)
        ?.nome_personalizado ?? null;
}

function formatar(row) {
    return {
        id: row.id,
        moduloId: row.modulo_id,
        alvoTipo: row.alvo_tipo,
        alvoId: row.alvo_id,
        nome: row.nome,
        duracaoSegundos: row.duracao_segundos,
        disparadoEm: row.disparado_em,
        expiraEm: row.expira_em,
    };
}

// GET /api/timers?moduloId=1 — so os que ainda nao expiraram (o motor remove os expirados
// sozinho a cada ciclo de 10s, ver schedulerService.js:aplicarTimers).
function listarTimers(req, res) {
    const { moduloId } = req.query;
    const agoraIso = new Date().toISOString();
    const linhas = moduloId
        ? db.prepare('SELECT * FROM timers_ativos WHERE modulo_id = ? AND expira_em > ? ORDER BY expira_em').all(moduloId, agoraIso)
        : db.prepare('SELECT * FROM timers_ativos WHERE expira_em > ? ORDER BY expira_em').all(agoraIso);
    res.json(linhas.map(formatar));
}

// POST /api/timers — body: { moduloId, alvoTipo, alvoId, duracaoSegundos } — liga o alvo de
// verdade JA (nao espera o proximo ciclo do motor) e agenda o desligamento automatico.
async function criarTimer(req, res) {
    const { moduloId, alvoTipo, alvoId, duracaoSegundos } = req.body;

    if (!moduloId || !['rele', 'tema'].includes(alvoTipo) || alvoId === undefined || alvoId === null) {
        return res.status(400).json({ erro: 'Campos "moduloId", "alvoTipo" ("rele"|"tema") e "alvoId" sao obrigatorios.' });
    }
    const duracao = Number(duracaoSegundos);
    if (!Number.isFinite(duracao) || duracao <= 0) {
        return res.status(400).json({ erro: 'Campo "duracaoSegundos" deve ser um numero positivo.' });
    }

    const modulo = db.prepare('SELECT * FROM modulos WHERE id = ?').get(moduloId);
    if (!modulo) return res.status(404).json({ erro: 'Modulo nao encontrado.' });

    let estadoAtual = Array(TOTAL_PORTAS).fill(0);
    try {
        const resposta = await fetch(`http://${modulo.ip}/api/reles`, { signal: AbortSignal.timeout(4000) });
        if (resposta.ok) {
            const dados = await resposta.json();
            if (Array.isArray(dados.reles)) estadoAtual = dados.reles;
        }
    } catch {
        // sem leitura do estado atual, segue com base zerada
    }

    const novoArray = [...estadoAtual];
    if (alvoTipo === 'rele') {
        novoArray[alvoId] = 1;
    } else {
        const relesTema = db.prepare('SELECT posicao_indice, estado FROM temas_reles WHERE tema_id = ?').all(alvoId);
        for (const r of relesTema) novoArray[r.posicao_indice] = r.estado;
    }

    const resultado = await aplicarRelesNoModulo(moduloId, novoArray, 'agendamento');
    if (!resultado.ok) {
        return res.json({ disponivel: false, motivo: resultado.motivo });
    }

    const nome = nomeAlvoAtual(alvoTipo, alvoId, moduloId);
    const disparadoEm = new Date();
    const expiraEm = new Date(disparadoEm.getTime() + duracao * 1000);

    const inserido = db
        .prepare(
            `INSERT INTO timers_ativos (modulo_id, alvo_tipo, alvo_id, nome, duracao_segundos, disparado_em, expira_em)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(moduloId, alvoTipo, alvoId, nome, duracao, disparadoEm.toISOString(), expiraEm.toISOString());

    db.prepare('INSERT INTO historico_autocontrol (modulo_id, evento, origem, detalhes) VALUES (?, ?, ?, ?)').run(
        moduloId,
        'TIMER_INICIADO',
        'TIMER',
        `${nome || 'Alvo'} por ${Math.round(duracao / 60)}min`
    );

    const linha = db.prepare('SELECT * FROM timers_ativos WHERE id = ?').get(inserido.lastInsertRowid);
    res.status(201).json({ disponivel: true, timer: formatar(linha) });
}

// DELETE /api/timers/:id — cancela antes do prazo: desliga o alvo na hora e restaura a
// agenda (mesmo efeito de deixar expirar sozinho, so que imediato).
async function cancelarTimer(req, res) {
    const { id } = req.params;
    const timer = db.prepare('SELECT * FROM timers_ativos WHERE id = ?').get(id);
    if (!timer) return res.status(404).json({ erro: 'Timer nao encontrado.' });

    db.prepare('DELETE FROM timers_ativos WHERE id = ?').run(id);
    db.prepare('INSERT INTO historico_autocontrol (modulo_id, evento, origem, detalhes) VALUES (?, ?, ?, ?)').run(
        timer.modulo_id,
        'TIMER_CANCELADO',
        'MANUAL_WEB',
        timer.nome
    );

    const modulo = db.prepare('SELECT * FROM modulos WHERE id = ?').get(timer.modulo_id);
    if (modulo) {
        try {
            const resposta = await fetch(`http://${modulo.ip}/api/reles`, { signal: AbortSignal.timeout(4000) });
            if (resposta.ok) {
                const dados = await resposta.json();
                if (Array.isArray(dados.reles)) {
                    const novoArray = [...dados.reles];
                    const indices =
                        timer.alvo_tipo === 'rele'
                            ? [timer.alvo_id]
                            : db.prepare('SELECT posicao_indice FROM temas_reles WHERE tema_id = ?').all(timer.alvo_id).map((r) => r.posicao_indice);
                    for (const indice of indices) novoArray[indice] = 0;
                    await aplicarRelesNoModulo(timer.modulo_id, novoArray, 'agendamento');
                }
            }
        } catch {
            // proximo ciclo do motor reconcilia mesmo se isso falhar aqui
        }
    }

    res.status(204).send();
}

module.exports = { listarTimers, criarTimer, cancelarTimer };
