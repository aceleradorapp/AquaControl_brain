// CRUD de Agendamentos + consultas do motor (18-espc, ver schedulerService.js pro loop que
// de fato aciona os reles a partir do que fica cadastrado aqui).
const db = require('../database/db');
const { aplicarRelesNoModulo } = require('../services/relesService');
const { desativarOverrideEResincronizar, estaEmOverride, calcularEstadoParaWidget } = require('../services/schedulerService');

const DIAS_VALIDOS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

function validarHora(valor) {
    return typeof valor === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(valor);
}

function validarDias(valor) {
    return Array.isArray(valor) && valor.length > 0 && valor.every((d) => DIAS_VALIDOS.includes(d));
}

// 19-espc: um agendamento agora aceita VARIOS intervalos { horaInicio, horaFim } (ex.:
// "08h-12h E 18h-22h") — validar cada um com o mesmo formato HH:MM de sempre.
function validarHorarios(valor) {
    return Array.isArray(valor) && valor.length > 0 && valor.every((h) => validarHora(h?.horaInicio) && validarHora(h?.horaFim));
}

function buscarHorarios(agendamentoId) {
    return db.prepare('SELECT hora_inicio, hora_fim FROM agendamentos_horarios WHERE agendamento_id = ? ORDER BY hora_inicio').all(agendamentoId);
}

function salvarHorarios(agendamentoId, horarios) {
    db.prepare('DELETE FROM agendamentos_horarios WHERE agendamento_id = ?').run(agendamentoId);
    const inserir = db.prepare('INSERT INTO agendamentos_horarios (agendamento_id, hora_inicio, hora_fim) VALUES (?, ?, ?)');
    for (const h of horarios) inserir.run(agendamentoId, h.horaInicio, h.horaFim);
}

// Nome "atual" do alvo (porta mapeada ou tema) — vira uma copia congelada em `nome` na hora
// de salvar (mesma logica de historico_reles.nome_porta), pra o agendamento continuar
// legivel mesmo se a porta for renomeada ou o tema apagado depois.
function nomeAlvoAtual(tipo, alvoId, moduloId) {
    if (tipo === 'tema') {
        return db.prepare('SELECT nome FROM temas WHERE id = ?').get(alvoId)?.nome ?? null;
    }
    return db.prepare('SELECT nome_personalizado FROM portas_mapeamento WHERE modulo_id = ? AND posicao_indice = ?').get(moduloId, alvoId)
        ?.nome_personalizado ?? null;
}

function formatar(row, horarios) {
    let dias = [];
    try {
        dias = JSON.parse(row.dias_semana);
    } catch {
        dias = [];
    }
    return {
        id: row.id,
        moduloId: row.modulo_id,
        tipo: row.tipo,
        alvoId: row.alvo_id,
        nome: row.nome,
        horarios: horarios.map((h) => ({ horaInicio: h.hora_inicio, horaFim: h.hora_fim })),
        diasSemana: dias,
        repetir: !!row.repetir,
        ativo: !!row.ativo,
        criadoEm: row.criado_em,
    };
}

// GET /api/agendamentos?moduloId=1
function listarAgendamentos(req, res) {
    const { moduloId } = req.query;
    const linhas = moduloId
        ? db.prepare('SELECT * FROM agendamentos WHERE modulo_id = ? ORDER BY id').all(moduloId)
        : db.prepare('SELECT * FROM agendamentos ORDER BY id').all();
    res.json(linhas.map((row) => formatar(row, buscarHorarios(row.id))));
}

// POST /api/agendamentos — body: { moduloId, tipo, alvoId, horarios: [{horaInicio,horaFim}, ...], diasSemana, repetir }
function criarAgendamento(req, res) {
    const { moduloId, tipo, alvoId, horarios, diasSemana, repetir } = req.body;

    if (!moduloId || !['rele', 'tema'].includes(tipo) || alvoId === undefined || alvoId === null) {
        return res.status(400).json({ erro: 'Campos "moduloId", "tipo" ("rele"|"tema") e "alvoId" sao obrigatorios.' });
    }
    if (!validarHorarios(horarios)) {
        return res.status(400).json({ erro: 'Campo "horarios" deve ser um array nao vazio de { horaInicio, horaFim } no formato HH:MM.' });
    }
    if (!validarDias(diasSemana)) {
        return res.status(400).json({ erro: 'Campo "diasSemana" deve ser um array nao vazio com siglas validas (SEG..DOM).' });
    }

    const nome = nomeAlvoAtual(tipo, alvoId, moduloId);
    const resultado = db
        .prepare(
            `INSERT INTO agendamentos (modulo_id, tipo, alvo_id, nome, dias_semana, repetir, ativo)
             VALUES (?, ?, ?, ?, ?, ?, 1)`
        )
        .run(moduloId, tipo, alvoId, nome, JSON.stringify(diasSemana), repetir === false ? 0 : 1);

    const agendamentoId = resultado.lastInsertRowid;
    salvarHorarios(agendamentoId, horarios);

    const linha = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(agendamentoId);
    res.status(201).json(formatar(linha, buscarHorarios(agendamentoId)));
}

// PUT /api/agendamentos/:id — atualizacao parcial (so troca o que vier no body); "horarios"
// so e substituido se vier um array valido (senao mantem os intervalos ja cadastrados —
// permite, por ex., o toggle rapido de "ativo" no widget mandar só esse campo).
function atualizarAgendamento(req, res) {
    const { id } = req.params;
    const existente = db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(id);
    if (!existente) return res.status(404).json({ erro: 'Agendamento nao encontrado.' });

    const { tipo, alvoId, horarios, diasSemana, repetir, ativo } = req.body;

    const tipoFinal = ['rele', 'tema'].includes(tipo) ? tipo : existente.tipo;
    const alvoIdFinal = alvoId ?? existente.alvo_id;
    const diasFinal = validarDias(diasSemana) ? diasSemana : JSON.parse(existente.dias_semana);
    const repetirFinal = repetir === undefined ? existente.repetir : repetir ? 1 : 0;
    const ativoFinal = ativo === undefined ? existente.ativo : ativo ? 1 : 0;
    const nome = nomeAlvoAtual(tipoFinal, alvoIdFinal, existente.modulo_id) ?? existente.nome;

    db.prepare(`UPDATE agendamentos SET tipo = ?, alvo_id = ?, nome = ?, dias_semana = ?, repetir = ?, ativo = ? WHERE id = ?`).run(
        tipoFinal,
        alvoIdFinal,
        nome,
        JSON.stringify(diasFinal),
        repetirFinal,
        ativoFinal,
        id
    );

    if (validarHorarios(horarios)) salvarHorarios(id, horarios);

    res.json(formatar(db.prepare('SELECT * FROM agendamentos WHERE id = ?').get(id), buscarHorarios(id)));
}

// DELETE /api/agendamentos/:id
function deletarAgendamento(req, res) {
    const resultado = db.prepare('DELETE FROM agendamentos WHERE id = ?').run(req.params.id);
    if (resultado.changes === 0) return res.status(404).json({ erro: 'Agendamento nao encontrado.' });
    res.status(204).send();
}

// GET /api/agendamentos/historico?moduloId=1&limite=100 — log do motor (override, timers,
// re-sincronizacao) — ver historico_autocontrol em migrate.js. Diferente de
// /api/historico-reles, que registra cada rele individualmente.
function obterHistoricoAutocontrol(req, res) {
    const { moduloId, limite } = req.query;
    const limiteSeguro = Math.min(Math.max(Number(limite) || 100, 1), 1000);
    const linhas = moduloId
        ? db.prepare('SELECT * FROM historico_autocontrol WHERE modulo_id = ? ORDER BY id DESC LIMIT ?').all(moduloId, limiteSeguro)
        : db.prepare('SELECT * FROM historico_autocontrol ORDER BY id DESC LIMIT ?').all(limiteSeguro);
    res.json(linhas);
}

// GET /api/agendamentos/estado?moduloId=1 — o que o Widget de Agendamentos precisa mostrar:
// o que esta ligado agora pela agenda, o proximo a disparar, e se o override esta pausando.
function obterEstadoAgendamentos(req, res) {
    const { moduloId } = req.query;
    if (!moduloId) return res.status(400).json({ erro: 'Query "moduloId" e obrigatoria.' });
    res.json(calcularEstadoParaWidget(Number(moduloId)));
}

// POST /api/agendamentos/retomar { moduloId } — "Retomar Agendamento" no widget: desativa o
// Tema Manual ativo neste modulo (se houver, desligando so os reles dele) e desliga o
// override, disparando a re-sincronizacao completa na hora.
async function retomarAgendamento(req, res) {
    const { moduloId } = req.body;
    if (!moduloId) return res.status(400).json({ erro: 'Campo "moduloId" e obrigatorio.' });

    const estadoTema = db.prepare('SELECT tema_ativo_id FROM temas_estado WHERE modulo_id = ?').get(moduloId);
    let nomeTemaDesativado = null;

    if (estadoTema?.tema_ativo_id) {
        const tema = db.prepare('SELECT * FROM temas WHERE id = ?').get(estadoTema.tema_ativo_id);
        const modulo = db.prepare('SELECT * FROM modulos WHERE id = ?').get(moduloId);

        if (tema && modulo) {
            nomeTemaDesativado = tema.nome;
            try {
                const respostaAtual = await fetch(`http://${modulo.ip}/api/reles`, { signal: AbortSignal.timeout(4000) });
                if (respostaAtual.ok) {
                    const dadosAtuais = await respostaAtual.json();
                    if (Array.isArray(dadosAtuais.reles)) {
                        const novoArray = [...dadosAtuais.reles];
                        const relesTema = db.prepare('SELECT posicao_indice FROM temas_reles WHERE tema_id = ?').all(tema.id);
                        for (const r of relesTema) novoArray[r.posicao_indice] = 0;
                        await aplicarRelesNoModulo(moduloId, novoArray, 'agendamento', `${tema.nome} (desativado por Retomar Agendamento)`);
                    }
                }
            } catch {
                // segue mesmo sem conseguir desligar aqui — a re-sincronizacao completa abaixo cobre
            }
        }
        db.prepare('UPDATE temas_estado SET tema_ativo_id = NULL WHERE modulo_id = ?').run(moduloId);
    }

    await desativarOverrideEResincronizar(Number(moduloId), nomeTemaDesativado);
    res.json({ ok: true, overrideAtivo: estaEmOverride() });
}

module.exports = {
    listarAgendamentos,
    criarAgendamento,
    atualizarAgendamento,
    deletarAgendamento,
    obterHistoricoAutocontrol,
    obterEstadoAgendamentos,
    retomarAgendamento,
};
