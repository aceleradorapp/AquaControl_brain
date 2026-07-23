const db = require('../database/db');
const { aplicarRelesNoModulo } = require('../services/relesService');

const TOTAL_PORTAS = 16;

function buscarModulo(id) {
    return db.prepare('SELECT id FROM modulos WHERE id = ?').get(id);
}

function formatarTema(tema, relesLinhas) {
    return {
        id: tema.id,
        moduloId: tema.modulo_id,
        nome: tema.nome,
        criadoEm: tema.criado_em,
        reles: relesLinhas.map((r) => ({ posicaoIndice: r.posicao_indice, estado: r.estado })),
    };
}

// GET /api/modulos/:id/temas — lista os temas cadastrados pra este módulo (14-espc)
function listarTemas(req, res) {
    const { id } = req.params;
    if (!buscarModulo(id)) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    const temas = db.prepare('SELECT * FROM temas WHERE modulo_id = ? ORDER BY id').all(id);
    const resultado = temas.map((tema) => {
        const reles = db.prepare('SELECT * FROM temas_reles WHERE tema_id = ? ORDER BY posicao_indice').all(tema.id);
        return formatarTema(tema, reles);
    });
    res.json(resultado);
}

// POST /api/modulos/:id/temas — cria um tema novo. Body: { nome, reles: [{posicaoIndice, estado}] }
// "reles" só precisa ter as portas que fazem PARTE do tema — não as 16 (ver aplicarTema
// abaixo: aplicar um tema só sobrescreve os índices presentes nele, o resto fica como está).
function criarTema(req, res) {
    const { id } = req.params;
    if (!buscarModulo(id)) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    const { nome, reles } = req.body;
    if (!nome || !Array.isArray(reles) || reles.length === 0) {
        return res.status(400).json({ erro: 'Campos "nome" e "reles" (array nao vazio) sao obrigatorios.' });
    }

    const resultado = db.prepare('INSERT INTO temas (modulo_id, nome) VALUES (?, ?)').run(id, nome);
    const temaId = resultado.lastInsertRowid;

    const inserir = db.prepare('INSERT INTO temas_reles (tema_id, posicao_indice, estado) VALUES (?, ?, ?)');
    db.exec('BEGIN');
    try {
        for (const r of reles) {
            const indice = Number(r.posicaoIndice);
            if (!Number.isInteger(indice) || indice < 0 || indice >= TOTAL_PORTAS) continue;
            inserir.run(temaId, indice, r.estado ? 1 : 0);
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    const tema = db.prepare('SELECT * FROM temas WHERE id = ?').get(temaId);
    const relesSalvos = db.prepare('SELECT * FROM temas_reles WHERE tema_id = ? ORDER BY posicao_indice').all(temaId);
    res.status(201).json(formatarTema(tema, relesSalvos));
}

// DELETE /api/temas/:id — remove o tema (e seus reles associados, ON DELETE CASCADE)
function deletarTema(req, res) {
    const { id } = req.params;
    const resultado = db.prepare('DELETE FROM temas WHERE id = ?').run(id);
    if (resultado.changes === 0) {
        return res.status(404).json({ erro: 'Tema nao encontrado.' });
    }
    res.status(204).send();
}

// POST /api/temas/:id/aplicar — aplica o tema de verdade: lê o estado atual dos 16 relés,
// sobrescreve SÓ os índices que fazem parte deste tema com os estados salvos (os demais
// relés ficam como estavam — um tema é um grupo, não um "reset total"), e manda o array
// resultante pro módulo através de relesService.js (mesma proteção de portas bloqueadas +
// histórico dos outros acionamentos, aqui marcado com origem "tema" + o nome do tema).
async function aplicarTema(req, res) {
    const { id } = req.params;
    const tema = db.prepare('SELECT * FROM temas WHERE id = ?').get(id);
    if (!tema) {
        return res.status(404).json({ erro: 'Tema nao encontrado.' });
    }

    const modulo = db.prepare('SELECT * FROM modulos WHERE id = ?').get(tema.modulo_id);
    if (!modulo) {
        return res.status(404).json({ erro: 'Modulo do tema nao encontrado.' });
    }

    let estadoBase = Array(TOTAL_PORTAS).fill(0);
    try {
        const respostaAtual = await fetch(`http://${modulo.ip}/api/reles`, { signal: AbortSignal.timeout(4000) });
        if (respostaAtual.ok) {
            const dadosAtuais = await respostaAtual.json();
            if (Array.isArray(dadosAtuais.reles)) estadoBase = dadosAtuais.reles;
        }
    } catch {
        // sem leitura do estado atual, aplica o tema sobre uma base zerada (só os índices
        // do tema importam de qualquer forma; os outros ficariam "errados" só se o ESP já
        // estivesse inacessível, caso em que o POST abaixo também vai falhar)
    }

    const relesTema = db.prepare('SELECT * FROM temas_reles WHERE tema_id = ?').all(id);
    const novoArray = [...estadoBase];
    for (const r of relesTema) {
        novoArray[r.posicao_indice] = r.estado;
    }

    const resultado = await aplicarRelesNoModulo(tema.modulo_id, novoArray, 'tema', tema.nome);
    if (!resultado.ok) {
        return res.json({ disponivel: false, motivo: resultado.motivo });
    }
    res.json({ disponivel: true, reles: resultado.reles });
}

module.exports = { listarTemas, criarTema, deletarTema, aplicarTema };
