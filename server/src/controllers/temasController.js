const db = require('../database/db');
const { aplicarRelesNoModulo } = require('../services/relesService');
const { ativarOverride, desativarOverrideEResincronizar } = require('../services/schedulerService');
const { iniciarSessaoTempestade, encerrarSessaoTempestade } = require('../services/tempestadeService');

const TOTAL_PORTAS = 16;
const TOTAL_LAMPADAS = 8; // 35-espc — posicoes fisicas da calha, ver tema_tempestade_lampadas
// 35-espc: mesmos defaults de tempestadeService.js (em segundos aqui, o motor usa ms) — usados
// so pra formatarTema devolver numeros concretos pra UI quando o tema ainda nao tem um
// intervalo customizado salvo (tempestade_intervalo_min_s/max_s = NULL).
const INTERVALO_MIN_PADRAO_S = 15;
const INTERVALO_MAX_PADRAO_S = 60;

// Valida o par min/max (segundos) mandado pro tema tempestade — ambos ausentes/vazios =
// "usa o padrao do sistema" (NULL, NULL). Piso de 3s (nao deixa virar uma metralhadora de
// raios sem sentido) e teto de 3600s (1h, sanidade) — min tem que ser <= max.
function normalizarIntervalos(intervaloMinSegundos, intervaloMaxSegundos) {
    const minBruto = intervaloMinSegundos === '' || intervaloMinSegundos === undefined || intervaloMinSegundos === null ? null : Number(intervaloMinSegundos);
    const maxBruto = intervaloMaxSegundos === '' || intervaloMaxSegundos === undefined || intervaloMaxSegundos === null ? null : Number(intervaloMaxSegundos);

    if (minBruto === null && maxBruto === null) return { min: null, max: null, erro: null };

    const min = Number.isFinite(minBruto) ? Math.round(minBruto) : null;
    const max = Number.isFinite(maxBruto) ? Math.round(maxBruto) : null;

    if (min === null || max === null || min < 3 || max > 3600 || min > max) {
        return { min: null, max: null, erro: 'Intervalo minimo/maximo entre raios invalido (minimo >= 3s, maximo <= 3600s, minimo <= maximo).' };
    }
    return { min, max, erro: null };
}

function buscarModulo(id) {
    return db.prepare('SELECT id FROM modulos WHERE id = ?').get(id);
}

function obterTemaAtivoId(moduloId) {
    const linha = db.prepare('SELECT tema_ativo_id FROM temas_estado WHERE modulo_id = ?').get(moduloId);
    return linha?.tema_ativo_id ?? null;
}

// 35-espc: mapeamento das 8 lampadas -> indice de rele, so pra temas tipo_efeito='tempestade'.
// "nomeRele" e resolvido aqui (join em JS, nao SQL) so pra a UI mostrar o nome sem um
// segundo fetch — a fonte de verdade do nome continua sendo portas_mapeamento.
function buscarLampadasTempestade(temaId, moduloId) {
    const linhas = db
        .prepare('SELECT posicao_lampada AS posicaoLampada, posicao_indice_rele AS posicaoIndiceRele FROM tema_tempestade_lampadas WHERE tema_id = ? ORDER BY posicao_lampada')
        .all(temaId);
    const portas = db.prepare('SELECT posicao_indice, nome_personalizado FROM portas_mapeamento WHERE modulo_id = ?').all(moduloId);
    const nomePorIndice = new Map(portas.map((p) => [p.posicao_indice, p.nome_personalizado]));

    return linhas.map((l) => ({
        ...l,
        nomeRele: l.posicaoIndiceRele !== null ? nomePorIndice.get(l.posicaoIndiceRele) || null : null,
    }));
}

// Substitui as 8 linhas de tema_tempestade_lampadas pelo mapeamento novo (mesmo "delete-all +
// insert" de atualizarTema pra temas_reles) — sempre grava as 8 posicoes, mesmo as nao
// mapeadas (posicao_indice_rele = NULL), pra "montarMapeamentoCompleto" nunca precisar
// preencher default no lado do controller (mesmo espirito de portasMapeamentoController.js).
function salvarLampadasTempestade(temaId, lampadasRecebidas) {
    const mapa = new Map();
    if (Array.isArray(lampadasRecebidas)) {
        for (const l of lampadasRecebidas) {
            const posicao = Number(l.posicaoLampada);
            if (!Number.isInteger(posicao) || posicao < 1 || posicao > TOTAL_LAMPADAS) continue;

            const bruto = l.posicaoIndiceRele;
            const indiceRele = bruto === '' || bruto === undefined || bruto === null ? null : Number(bruto);
            const indiceValido = indiceRele !== null && Number.isInteger(indiceRele) && indiceRele >= 0 && indiceRele < TOTAL_PORTAS ? indiceRele : null;
            mapa.set(posicao, indiceValido);
        }
    }

    db.exec('BEGIN');
    try {
        db.prepare('DELETE FROM tema_tempestade_lampadas WHERE tema_id = ?').run(temaId);
        const inserir = db.prepare('INSERT INTO tema_tempestade_lampadas (tema_id, posicao_lampada, posicao_indice_rele) VALUES (?, ?, ?)');
        for (let posicao = 1; posicao <= TOTAL_LAMPADAS; posicao++) {
            inserir.run(temaId, posicao, mapa.has(posicao) ? mapa.get(posicao) : null);
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }
}

function formatarTema(tema, relesLinhas, temaAtivoId) {
    const formatado = {
        id: tema.id,
        moduloId: tema.modulo_id,
        nome: tema.nome,
        criadoEm: tema.criado_em,
        ativo: tema.id === temaAtivoId,
        tipoEfeito: tema.tipo_efeito,
        reles: relesLinhas.map((r) => ({ posicaoIndice: r.posicao_indice, estado: r.estado })),
    };
    if (tema.tipo_efeito === 'tempestade') {
        formatado.lampadas = buscarLampadasTempestade(tema.id, tema.modulo_id);
        formatado.intervaloMinSegundos = tema.tempestade_intervalo_min_s ?? INTERVALO_MIN_PADRAO_S;
        formatado.intervaloMaxSegundos = tema.tempestade_intervalo_max_s ?? INTERVALO_MAX_PADRAO_S;
    }
    return formatado;
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
//
// 35-espc: "tipoEfeito" ('estatico' default | 'tempestade') decide qual dos dois formatos o
// body carrega — um tema tempestade manda "lampadas" (mapeamento de 8 posicoes -> rele) em
// vez de "reles" (ele não tem um estado fixo ligado/desligado, ver tempestadeService.js).
function criarTema(req, res) {
    const { id } = req.params;
    if (!buscarModulo(id)) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    const { nome, reles, tipoEfeito, lampadas, intervaloMinSegundos, intervaloMaxSegundos } = req.body;
    const tipo = tipoEfeito === 'tempestade' ? 'tempestade' : 'estatico';

    if (!nome) {
        return res.status(400).json({ erro: 'Campo "nome" e obrigatorio.' });
    }
    if (tipo === 'estatico' && (!Array.isArray(reles) || reles.length === 0)) {
        return res.status(400).json({ erro: 'Campo "reles" (array nao vazio) e obrigatorio pra um tema estatico.' });
    }

    const intervalos = tipo === 'tempestade' ? normalizarIntervalos(intervaloMinSegundos, intervaloMaxSegundos) : { min: null, max: null, erro: null };
    if (intervalos.erro) {
        return res.status(400).json({ erro: intervalos.erro });
    }

    const resultado = db
        .prepare('INSERT INTO temas (modulo_id, nome, tipo_efeito, tempestade_intervalo_min_s, tempestade_intervalo_max_s) VALUES (?, ?, ?, ?, ?)')
        .run(id, nome, tipo, intervalos.min, intervalos.max);
    const temaId = resultado.lastInsertRowid;

    if (tipo === 'estatico') {
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
    } else {
        salvarLampadasTempestade(temaId, lampadas);
    }

    const tema = db.prepare('SELECT * FROM temas WHERE id = ?').get(temaId);
    res.status(201).json(formatarTema(tema, buscarRelesDoTema(temaId), null));
}

// PUT /api/temas/:id — edita um tema existente (nome + reles). Substitui TODAS as linhas de
// temas_reles pelas novas (mais simples que tentar diffar upsert/delete parcial — o form de
// edição no client já manda o conjunto completo de novo). Não reaplica nada nos relés de
// verdade sozinho — editar só muda a definição salva; se o usuário quiser refletir a
// mudança no hardware, clica em aplicar de novo.
// 35-espc: "tipoEfeito" no body decide o formato; se omitido, mantem o tipo que o tema ja
// tinha (nao muda de estatico<->tempestade por acidente so porque o form nao mandou o campo).
// Trocar de tipo limpa a tabela do tipo ANTERIOR (temas_reles ou tema_tempestade_lampadas) —
// nunca deixa dado orfao do formato antigo.
function atualizarTema(req, res) {
    const { id } = req.params;
    const temaExistente = db.prepare('SELECT * FROM temas WHERE id = ?').get(id);
    if (!temaExistente) {
        return res.status(404).json({ erro: 'Tema nao encontrado.' });
    }

    const { nome, reles, tipoEfeito, lampadas, intervaloMinSegundos, intervaloMaxSegundos } = req.body;
    const tipo = tipoEfeito === 'tempestade' || tipoEfeito === 'estatico' ? tipoEfeito : temaExistente.tipo_efeito;

    if (!nome) {
        return res.status(400).json({ erro: 'Campo "nome" e obrigatorio.' });
    }
    if (tipo === 'estatico' && (!Array.isArray(reles) || reles.length === 0)) {
        return res.status(400).json({ erro: 'Campo "reles" (array nao vazio) e obrigatorio pra um tema estatico.' });
    }

    const intervalos = tipo === 'tempestade' ? normalizarIntervalos(intervaloMinSegundos, intervaloMaxSegundos) : { min: null, max: null, erro: null };
    if (intervalos.erro) {
        return res.status(400).json({ erro: intervalos.erro });
    }

    db.exec('BEGIN');
    try {
        db.prepare('UPDATE temas SET nome = ?, tipo_efeito = ?, tempestade_intervalo_min_s = ?, tempestade_intervalo_max_s = ? WHERE id = ?').run(
            nome,
            tipo,
            intervalos.min,
            intervalos.max,
            id
        );
        db.prepare('DELETE FROM temas_reles WHERE tema_id = ?').run(id);

        if (tipo === 'estatico') {
            db.prepare('DELETE FROM tema_tempestade_lampadas WHERE tema_id = ?').run(id);
            const inserir = db.prepare('INSERT INTO temas_reles (tema_id, posicao_indice, estado) VALUES (?, ?, ?)');
            for (const r of reles) {
                const indice = Number(r.posicaoIndice);
                if (!Number.isInteger(indice) || indice < 0 || indice >= TOTAL_PORTAS) continue;
                inserir.run(id, indice, r.estado ? 1 : 0);
            }
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    if (tipo === 'tempestade') {
        salvarLampadasTempestade(id, lampadas);
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
        // 35-espc: tema tempestade nao tem reles fixos (o array aplicado acima e um no-op) —
        // abre a sessao JA (captura o snapshot "antes" + toca a Sequencia de Abertura) em vez
        // de esperar o proximo ciclo de 5s; tempestadeService.js assume os proximos eventos
        // sozinho a partir dai. Fire-and-forget: nao trava a resposta HTTP.
        if (tema.tipo_efeito === 'tempestade') {
            iniciarSessaoTempestade(tema.modulo_id, tema.id);
        }
    } else {
        await desativarOverrideEResincronizar(tema.modulo_id, tema.nome);
        // 35-espc: fecha a sessao JA (cancela rajada em andamento + restaura as lampadas ao
        // estado de antes da ativacao) em vez de esperar o proximo ciclo de 5s. Fire-and-forget.
        if (tema.tipo_efeito === 'tempestade') {
            encerrarSessaoTempestade(tema.modulo_id);
        }
    }

    res.json({ disponivel: true, reles: resultado.reles, temaAtivoId: novoTemaAtivoId });
}

module.exports = { listarTemas, criarTema, atualizarTema, deletarTema, aplicarTema };
