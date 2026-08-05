// Gestao de Fauna (35-espc) — populacao de peixes exibida na Aba "Moradores" da Pagina de
// Visitante (GET publico) e gerenciada pelo painel ADM (POST/PUT/DELETE, protegidos por JWT
// — ver middlewares/autenticacao.js). Uma linha por ESPECIE (ou morfo/variedade, ver os 2
// cascudos abacaxi do seed) — "quantidade" e o numero de individuos daquela linha, editavel
// sem precisar apagar/recriar a especie inteira.
const db = require('../database/db');

function formatarFauna(linha) {
    return {
        id: linha.id,
        nomeComum: linha.nome_comum,
        nomeCientifico: linha.nome_cientifico,
        quantidade: linha.quantidade,
        phMinimo: linha.ph_minimo,
        phMaximo: linha.ph_maximo,
        temperaturaMinima: linha.temperatura_minima,
        temperaturaMaxima: linha.temperatura_maxima,
        origem: linha.origem,
        comportamento: linha.comportamento,
        imagemUrl: linha.imagem_url,
        criadoEm: linha.criado_em,
        atualizadoEm: linha.atualizado_em,
    };
}

// GET /api/fauna — publico (chamado pela Pagina de Visitante sem autenticacao nenhuma).
function listarFauna(req, res) {
    const linhas = db.prepare('SELECT * FROM fauna ORDER BY id ASC').all();
    res.json(linhas.map(formatarFauna));
}

function validarCampos(corpo) {
    const nomeComum = String(corpo.nomeComum ?? '').trim();
    if (!nomeComum) return { erro: 'Nome Comum e obrigatorio.' };

    const quantidade = Number(corpo.quantidade);
    if (!Number.isFinite(quantidade) || quantidade < 0) return { erro: 'Quantidade deve ser um numero maior ou igual a 0.' };

    for (const campo of ['phMinimo', 'phMaximo', 'temperaturaMinima', 'temperaturaMaxima']) {
        if (corpo[campo] !== undefined && corpo[campo] !== null && corpo[campo] !== '' && Number.isNaN(Number(corpo[campo]))) {
            return { erro: `${campo} deve ser um numero.` };
        }
    }

    return null;
}

// POST /api/fauna — protegido (ver routes/index.js: exigirAutenticacao aplicado so nas rotas
// de escrita).
function criarFauna(req, res) {
    const corpo = req.body ?? {};
    const erro = validarCampos(corpo);
    if (erro) return res.status(400).json(erro);

    const resultado = db
        .prepare(
            `INSERT INTO fauna (nome_comum, nome_cientifico, quantidade, ph_minimo, ph_maximo, temperatura_minima, temperatura_maxima, origem, comportamento, imagem_url)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
            String(corpo.nomeComum).trim(),
            corpo.nomeCientifico?.trim() || null,
            Number(corpo.quantidade),
            corpo.phMinimo !== '' && corpo.phMinimo != null ? Number(corpo.phMinimo) : null,
            corpo.phMaximo !== '' && corpo.phMaximo != null ? Number(corpo.phMaximo) : null,
            corpo.temperaturaMinima !== '' && corpo.temperaturaMinima != null ? Number(corpo.temperaturaMinima) : null,
            corpo.temperaturaMaxima !== '' && corpo.temperaturaMaxima != null ? Number(corpo.temperaturaMaxima) : null,
            corpo.origem?.trim() || null,
            corpo.comportamento?.trim() || null,
            corpo.imagemUrl?.trim() || null
        );

    const criado = db.prepare('SELECT * FROM fauna WHERE id = ?').get(resultado.lastInsertRowid);
    res.status(201).json(formatarFauna(criado));
}

// PUT /api/fauna/:id — protegido. Todos os campos opcionais, so atualiza o que veio no corpo
// (mesmo espirito de editarAdmin em authService.js) — permite, por exemplo, so mudar a
// "quantidade" depois de um nascimento/perda, sem reenviar a ficha inteira.
function editarFauna(req, res) {
    const id = Number(req.params.id);
    const atual = db.prepare('SELECT * FROM fauna WHERE id = ?').get(id);
    if (!atual) return res.status(404).json({ erro: 'Especie nao encontrada.' });

    const corpo = req.body ?? {};
    if (corpo.quantidade !== undefined && (!Number.isFinite(Number(corpo.quantidade)) || Number(corpo.quantidade) < 0)) {
        return res.status(400).json({ erro: 'Quantidade deve ser um numero maior ou igual a 0.' });
    }

    const mapaColunas = {
        nomeComum: 'nome_comum',
        nomeCientifico: 'nome_cientifico',
        quantidade: 'quantidade',
        phMinimo: 'ph_minimo',
        phMaximo: 'ph_maximo',
        temperaturaMinima: 'temperatura_minima',
        temperaturaMaxima: 'temperatura_maxima',
        origem: 'origem',
        comportamento: 'comportamento',
        imagemUrl: 'imagem_url',
    };

    const atualizacoes = [];
    const valores = [];
    for (const [campoCorpo, coluna] of Object.entries(mapaColunas)) {
        if (corpo[campoCorpo] === undefined) continue;
        atualizacoes.push(`${coluna} = ?`);
        const valor = corpo[campoCorpo];
        valores.push(typeof valor === 'string' ? (valor.trim() || null) : valor);
    }

    if (atualizacoes.length > 0) {
        atualizacoes.push('atualizado_em = CURRENT_TIMESTAMP');
        db.prepare(`UPDATE fauna SET ${atualizacoes.join(', ')} WHERE id = ?`).run(...valores, id);
    }

    res.json(formatarFauna(db.prepare('SELECT * FROM fauna WHERE id = ?').get(id)));
}

// DELETE /api/fauna/:id — protegido.
function excluirFauna(req, res) {
    const id = Number(req.params.id);
    const atual = db.prepare('SELECT id FROM fauna WHERE id = ?').get(id);
    if (!atual) return res.status(404).json({ erro: 'Especie nao encontrada.' });

    db.prepare('DELETE FROM fauna WHERE id = ?').run(id);
    res.json({ status: 'ok' });
}

module.exports = { listarFauna, criarFauna, editarFauna, excluirFauna };
