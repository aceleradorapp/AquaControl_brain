const db = require('../database/db');

const TOTAL_PORTAS = 16;

// Nota (01-espc-geral/06_...): esta camada só salva/busca o MAPEAMENTO (nomes e se a
// porta está liberada para uso) — ainda não existe comunicação real com o ESP32 de
// atuadores (o "GET /api/modulos/:id/status" da especificação, que combinaria o array
// [0,1,0,...] retornado pelo hardware de verdade com estes nomes). Isso é trabalho
// futuro, análogo ao que já está reservado em src/services/espsService.js.

// Garante que a resposta sempre tenha exatamente TOTAL_PORTAS posições (0 a 15), mesmo
// que o usuário ainda não tenha customizado nenhuma — preenche as que faltam com valores
// padrão (sem nome, habilitada).
function montarMapeamentoCompleto(linhasSalvas) {
    const porIndice = new Map(linhasSalvas.map((linha) => [linha.posicao_indice, linha]));
    const mapeamento = [];

    for (let indice = 0; indice < TOTAL_PORTAS; indice++) {
        const linha = porIndice.get(indice);
        mapeamento.push({
            posicaoIndice: indice,
            nomePersonalizado: linha?.nome_personalizado ?? '',
            habilitado: linha ? !!linha.habilitado : true,
            descricao: linha?.descricao ?? '',
        });
    }

    return mapeamento;
}

function buscarModulo(id) {
    return db.prepare('SELECT id FROM modulos WHERE id = ?').get(id);
}

// GET /api/modulos/:id/portas — busca o mapeamento das 16 portas do módulo
function buscarPortas(req, res) {
    const { id } = req.params;

    if (!buscarModulo(id)) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    const linhas = db.prepare('SELECT * FROM portas_mapeamento WHERE modulo_id = ? ORDER BY posicao_indice').all(id);
    res.json(montarMapeamentoCompleto(linhas));
}

// PUT /api/modulos/:id/portas — salva o mapeamento inteiro (upsert por posicao_indice).
// Body esperado: { "portas": [{ posicaoIndice, nomePersonalizado, habilitado, descricao }, ...] }
// (não precisa mandar as 16 — só as que mudaram; as omitidas mantêm o que já estava salvo)
function salvarPortas(req, res) {
    const { id } = req.params;

    if (!buscarModulo(id)) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    const portas = req.body.portas;
    if (!Array.isArray(portas)) {
        return res.status(400).json({ erro: 'Campo "portas" deve ser um array.' });
    }

    const upsert = db.prepare(`
        INSERT INTO portas_mapeamento (modulo_id, posicao_indice, nome_personalizado, habilitado, descricao)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (modulo_id, posicao_indice)
        DO UPDATE SET nome_personalizado = excluded.nome_personalizado,
                      habilitado = excluded.habilitado,
                      descricao = excluded.descricao
    `);

    db.exec('BEGIN');
    try {
        for (const porta of portas) {
            const indice = Number(porta.posicaoIndice);
            if (!Number.isInteger(indice) || indice < 0 || indice >= TOTAL_PORTAS) continue;

            upsert.run(id, indice, porta.nomePersonalizado || '', porta.habilitado === false ? 0 : 1, porta.descricao || '');
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    const linhasAtualizadas = db.prepare('SELECT * FROM portas_mapeamento WHERE modulo_id = ? ORDER BY posicao_indice').all(id);
    res.json(montarMapeamentoCompleto(linhasAtualizadas));
}

module.exports = { buscarPortas, salvarPortas };
