const db = require('../database/db');
const { aplicarRelesNoModulo } = require('../services/relesService');
const { ativarOverride, desativarOverrideEResincronizar } = require('../services/schedulerService');

const TOTAL_PORTAS = 16;

function buscarModulo(id) {
    return db.prepare('SELECT id FROM modulos WHERE id = ?').get(id);
}

function obterTemaAtivoId(moduloId) {
    const linha = db.prepare('SELECT tema_ativo_id FROM temas_estado WHERE modulo_id = ?').get(moduloId);
    return linha?.tema_ativo_id ?? null;
}

function formatarTema(tema, relesLinhas, temaAtivoId) {
    return {
        id: tema.id,
        moduloId: tema.modulo_id,
        nome: tema.nome,
        criadoEm: tema.criado_em,
        ativo: tema.id === temaAtivoId,
        reles: relesLinhas.map((r) => ({ posicaoIndice: r.posicao_indice, estado: r.estado })),
    };
}

function buscarRelesDoTema(temaId) {
    return db.prepare('SELECT * FROM temas_reles WHERE tema_id = ? ORDER BY posicao_indice').all(temaId);
}

// GET /api/modulos/:id/temas — lista os temas cadastrados pra este módulo, cada um já
// marcado com "ativo" (15-espc: nunca mais de um tema ativo por módulo ao mesmo tempo).
function listarTemas(req, res) {
    const { id } = req.params;
    if (!buscarModulo(id)) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    const temaAtivoId = obterTemaAtivoId(id);
    const temas = db.prepare('SELECT * FROM temas WHERE modulo_id = ? ORDER BY id').all(id);
    res.json(temas.map((tema) => formatarTema(tema, buscarRelesDoTema(tema.id), temaAtivoId)));
}

// POST /api/modulos/:id/temas — cria um tema novo. Body: { nome, reles: [{posicaoIndice, estado}] }
// "reles" só precisa ter as portas que fazem PARTE do tema — não as 16 (ver aplicarTema
// abaixo: aplicar um tema só sobrescreve os índices presentes nele, o resto fica como está).
// Um tema recém-criado nunca começa ativo.
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
    res.status(201).json(formatarTema(tema, buscarRelesDoTema(temaId), null));
}

// PUT /api/temas/:id — edita um tema existente (nome + reles). Substitui TODAS as linhas de
// temas_reles pelas novas (mais simples que tentar diffar upsert/delete parcial — o form de
// edição no client já manda o conjunto completo de novo). Não reaplica nada nos relés de
// verdade sozinho — editar só muda a definição salva; se o usuário quiser refletir a
// mudança no hardware, clica em aplicar de novo.
function atualizarTema(req, res) {
    const { id } = req.params;
    const temaExistente = db.prepare('SELECT * FROM temas WHERE id = ?').get(id);
    if (!temaExistente) {
        return res.status(404).json({ erro: 'Tema nao encontrado.' });
    }

    const { nome, reles } = req.body;
    if (!nome || !Array.isArray(reles) || reles.length === 0) {
        return res.status(400).json({ erro: 'Campos "nome" e "reles" (array nao vazio) sao obrigatorios.' });
    }

    db.exec('BEGIN');
    try {
        db.prepare('UPDATE temas SET nome = ? WHERE id = ?').run(nome, id);
        db.prepare('DELETE FROM temas_reles WHERE tema_id = ?').run(id);

        const inserir = db.prepare('INSERT INTO temas_reles (tema_id, posicao_indice, estado) VALUES (?, ?, ?)');
        for (const r of reles) {
            const indice = Number(r.posicaoIndice);
            if (!Number.isInteger(indice) || indice < 0 || indice >= TOTAL_PORTAS) continue;
            inserir.run(id, indice, r.estado ? 1 : 0);
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    const temaAtualizado = db.prepare('SELECT * FROM temas WHERE id = ?').get(id);
    const temaAtivoId = obterTemaAtivoId(temaExistente.modulo_id);
    res.json(formatarTema(temaAtualizado, buscarRelesDoTema(id), temaAtivoId));
}

// DELETE /api/temas/:id — remove o tema (e seus reles associados, ON DELETE CASCADE; se era
// o tema ativo, temas_estado.tema_ativo_id vira NULL sozinho via ON DELETE SET NULL).
function deletarTema(req, res) {
    const { id } = req.params;
    const resultado = db.prepare('DELETE FROM temas WHERE id = ?').run(id);
    if (resultado.changes === 0) {
        return res.status(404).json({ erro: 'Tema nao encontrado.' });
    }
    res.status(204).send();
}

// POST /api/temas/:id/aplicar — aplica o tema de verdade, respeitando a regra de exclusão
// mútua (15-espc: nunca dois temas ativos ao mesmo tempo por módulo):
//   - Se ESTE tema já é o ativo: DESATIVA (desliga só os relés que fazem parte dele, marca
//     tema_ativo_id = NULL). Clicar de novo no tema ativo funciona como um "desligar".
//   - Se é outro tema (ou nenhum estava ativo): desliga os relés do tema anteriormente
//     ativo (se houver) que NÃO fazem parte do novo tema, depois aplica os estados do novo
//     tema por cima (que tem precedência nos índices que ele define — um relé presente nos
//     dois temas fica no estado que o novo tema pede, não desligado), e marca este tema
//     como o ativo agora.
// Em ambos os casos, o array final passa por relesService.js (mesma proteção de portas
// bloqueadas + histórico dos outros acionamentos), com origem "tema".
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

    const temaAtivoAntes = obterTemaAtivoId(tema.modulo_id);

    let estadoBase = Array(TOTAL_PORTAS).fill(0);
    try {
        const respostaAtual = await fetch(`http://${modulo.ip}/api/reles`, { signal: AbortSignal.timeout(4000) });
        if (respostaAtual.ok) {
            const dadosAtuais = await respostaAtual.json();
            if (Array.isArray(dadosAtuais.reles)) estadoBase = dadosAtuais.reles;
        }
    } catch {
        // sem leitura do estado atual, segue com base zerada
    }

    const novoArray = [...estadoBase];
    let novoTemaAtivoId;
    let detalheHistorico;

    if (temaAtivoAntes === tema.id) {
        // Tocou no tema que já estava ativo -> desativa (desliga só os relés dele)
        for (const r of buscarRelesDoTema(id)) novoArray[r.posicao_indice] = 0;
        novoTemaAtivoId = null;
        detalheHistorico = `${tema.nome} (desativado)`;
    } else {
        if (temaAtivoAntes) {
            for (const r of buscarRelesDoTema(temaAtivoAntes)) novoArray[r.posicao_indice] = 0;
        }
        for (const r of buscarRelesDoTema(id)) novoArray[r.posicao_indice] = r.estado;
        novoTemaAtivoId = tema.id;
        detalheHistorico = tema.nome;
    }

    const resultado = await aplicarRelesNoModulo(tema.modulo_id, novoArray, 'tema', detalheHistorico);
    if (!resultado.ok) {
        return res.json({ disponivel: false, motivo: resultado.motivo });
    }

    db.prepare(
        `INSERT INTO temas_estado (modulo_id, tema_ativo_id) VALUES (?, ?)
         ON CONFLICT (modulo_id) DO UPDATE SET tema_ativo_id = excluded.tema_ativo_id`
    ).run(tema.modulo_id, novoTemaAtivoId);

    // 18-espc: aplicar um Tema (Manual) ativa o Override do Motor de Agendamento — desativar
    // (clicar de novo no tema ja ativo) desliga o override e dispara a re-sincronizacao na
    // hora, ver schedulerService.js.
    if (novoTemaAtivoId) {
        ativarOverride(tema.modulo_id, tema.nome);
    } else {
        await desativarOverrideEResincronizar(tema.modulo_id, tema.nome);
    }

    res.json({ disponivel: true, reles: resultado.reles, temaAtivoId: novoTemaAtivoId });
}

module.exports = { listarTemas, criarTema, atualizarTema, deletarTema, aplicarTema };
