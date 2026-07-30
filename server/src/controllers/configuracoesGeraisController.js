const db = require('../database/db');

// Configuracoes Globais do Sistema (19-espc) — armazem generico chave/valor
// (configuracoes_gerais) pra preferencias que nao justificam uma tabela propria. "PADRAO" e
// devolvido pra qualquer chave ainda nao salva, mesmo padrao de configDisplayController.js —
// o client sempre recebe o objeto inteiro preenchido, nunca precisa checar "undefined".
//
// IMPORTANTE (documentado tambem em 01-espc-geral/19_configuracoes_globais.md): nem toda
// chave aqui e "de verdade" consumida em algum lugar hoje — ver o spec pra saber quais sao
// so preferencia salva (ex.: severidade minima de notificacao) e quais realmente mudam o
// comportamento do sistema (ex.: intervalo de polling).
const PADRAO = {
    intervalo_polling_sensores_ms: '5000',
    intervalo_ping_modulos_ms: '10000',
    retencao_historico_dias: '90',
    som_alertas_ativado: 'true',
    popup_alertas_ativado: 'true',
    severidade_minima_notificacao: 'aviso',
    silencio_inicio: '',
    silencio_fim: '',
};

function obterConfiguracoesGerais(req, res) {
    const linhas = db.prepare('SELECT chave, valor FROM configuracoes_gerais').all();
    const salvo = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
    res.json({ ...PADRAO, ...salvo });
}

// PUT /api/configuracoes — so aceita chaves conhecidas (as de PADRAO); qualquer outra e
// ignorada silenciosamente (evita a tabela virar uma gaveta bagunçada com chaves de digitação
// errada vindas do client).
function salvarConfiguracoesGerais(req, res) {
    const corpo = req.body ?? {};
    const upsert = db.prepare(`
        INSERT INTO configuracoes_gerais (chave, valor, atualizado_em) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = CURRENT_TIMESTAMP
    `);

    db.exec('BEGIN');
    try {
        for (const chave of Object.keys(PADRAO)) {
            if (corpo[chave] !== undefined) upsert.run(chave, String(corpo[chave]));
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    const linhas = db.prepare('SELECT chave, valor FROM configuracoes_gerais').all();
    res.json({ ...PADRAO, ...Object.fromEntries(linhas.map((l) => [l.chave, l.valor])) });
}

// GET/PUT /api/configuracoes/faixas-seguras — antes uma constante hardcoded em
// relatoriosService.js, agora editavel (ver "temperatura segura" pedido pelo usuario).
function obterFaixasSeguras(req, res) {
    const linhas = db.prepare('SELECT sensor_tipo, minimo, maximo FROM faixas_seguras').all();
    res.json(linhas.map((l) => ({ sensorTipo: l.sensor_tipo, minimo: l.minimo, maximo: l.maximo })));
}

function salvarFaixasSeguras(req, res) {
    const faixas = req.body.faixas;
    if (!Array.isArray(faixas)) {
        return res.status(400).json({ erro: 'Campo "faixas" deve ser um array.' });
    }

    const upsert = db.prepare(`
        INSERT INTO faixas_seguras (sensor_tipo, minimo, maximo) VALUES (?, ?, ?)
        ON CONFLICT (sensor_tipo) DO UPDATE SET minimo = excluded.minimo, maximo = excluded.maximo
    `);

    db.exec('BEGIN');
    try {
        for (const faixa of faixas) {
            const minimo = Number(faixa.minimo);
            const maximo = Number(faixa.maximo);
            if (!faixa.sensorTipo || Number.isNaN(minimo) || Number.isNaN(maximo) || minimo >= maximo) continue;
            upsert.run(faixa.sensorTipo, minimo, maximo);
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    const linhas = db.prepare('SELECT sensor_tipo, minimo, maximo FROM faixas_seguras').all();
    res.json(linhas.map((l) => ({ sensorTipo: l.sensor_tipo, minimo: l.minimo, maximo: l.maximo })));
}

// GET/PUT /api/configuracoes/calibracao-fluxo (24-espc) — linha unica (so existe 1
// fluxometro), valores em LITROS/HORA (o sensor mede em L/min nativamente; a conversao
// acontece em relatoriosService.js na hora de comparar, nao aqui). "vazaoTrocaFiltroLh" e o
// 3º limite pedido pelo usuario: abaixo disso, mas ainda acima do minimo critico, sinaliza
// "vazao caindo, provavelmente o filtro esta entupindo" — pensado pra ser recalibrado na
// pratica com o tempo (ver historico ja gravado em historico_sensores).
function obterCalibracaoFluxo(req, res) {
    const linha = db.prepare('SELECT vazao_maxima_lh, vazao_minima_lh, vazao_troca_filtro_lh FROM calibracao_fluxo WHERE id = 1').get();
    res.json({
        vazaoMaximaLh: linha?.vazao_maxima_lh ?? 2000,
        vazaoMinimaLh: linha?.vazao_minima_lh ?? 200,
        vazaoTrocaFiltroLh: linha?.vazao_troca_filtro_lh ?? 800,
    });
}

function salvarCalibracaoFluxo(req, res) {
    const maxima = Number(req.body.vazaoMaximaLh);
    const minima = Number(req.body.vazaoMinimaLh);
    const trocaFiltro = Number(req.body.vazaoTrocaFiltroLh);

    if ([maxima, minima, trocaFiltro].some((v) => Number.isNaN(v) || v < 0)) {
        return res.status(400).json({ erro: 'Todos os valores de vazao devem ser numeros positivos.' });
    }
    if (!(minima < trocaFiltro && trocaFiltro < maxima)) {
        return res.status(400).json({ erro: 'A ordem deve ser: minima < troca de filtro < maxima.' });
    }

    db.prepare(
        `INSERT INTO calibracao_fluxo (id, vazao_maxima_lh, vazao_minima_lh, vazao_troca_filtro_lh, atualizado_em)
         VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (id) DO UPDATE SET
            vazao_maxima_lh = excluded.vazao_maxima_lh,
            vazao_minima_lh = excluded.vazao_minima_lh,
            vazao_troca_filtro_lh = excluded.vazao_troca_filtro_lh,
            atualizado_em = CURRENT_TIMESTAMP`
    ).run(maxima, minima, trocaFiltro);

    obterCalibracaoFluxo(req, res);
}

// Backup/Restauracao (19-espc) — dump/restauracao das tabelas de CONFIGURACAO (modulos,
// mapeamentos, temas, agendamentos, automacao etc.), NAO um backup completo do banco —
// historico_sensores/historico_reles ficam de fora de proposito (podem ser grandes, e o
// objetivo aqui e "restaurar a configuracao", nao "clonar o historico").
const TABELAS_BACKUP = [
    'modulos',
    'portas_mapeamento',
    'config_display',
    'config_display_sensores',
    'sensores_personalizados',
    'temas',
    'temas_reles',
    'agendamentos',
    'agendamentos_horarios',
    'configuracoes_gerais',
    'faixas_seguras',
    'calibracao_fluxo',
    'equipamentos_automacao',
    'qrcodes',
];

function gerarBackup(req, res) {
    const backup = { versao: 1, geradoEm: new Date().toISOString(), tabelas: {} };
    for (const tabela of TABELAS_BACKUP) {
        backup.tabelas[tabela] = db.prepare(`SELECT * FROM ${tabela}`).all();
    }
    res.json(backup);
}

// POST /api/configuracoes/restaurar — body e o MESMO formato que GET /backup devolve.
// Substitui o conteudo das tabelas de configuracao inteiro (delete-all + insert por tabela,
// na ordem de TABELAS_BACKUP — pais antes de filhos, respeitando as FOREIGN KEY). Acao
// destrutiva: o client pede confirmacao antes de chamar isso.
function restaurarBackup(req, res) {
    const { tabelas } = req.body;
    if (!tabelas || typeof tabelas !== 'object') {
        return res.status(400).json({ erro: 'Formato de backup invalido — esperado { tabelas: {...} }.' });
    }

    db.exec('BEGIN');
    try {
        for (const tabela of TABELAS_BACKUP) {
            const linhas = tabelas[tabela];
            if (!Array.isArray(linhas)) continue;

            db.exec(`DELETE FROM ${tabela}`);
            for (const linha of linhas) {
                const colunas = Object.keys(linha);
                if (colunas.length === 0) continue;
                const marcadores = colunas.map(() => '?').join(', ');
                db.prepare(`INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${marcadores})`).run(...colunas.map((c) => linha[c]));
            }
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        return res.status(500).json({ erro: `Falha ao restaurar backup: ${erro.message}` });
    }

    res.json({ status: 'ok' });
}

module.exports = {
    obterConfiguracoesGerais,
    salvarConfiguracoesGerais,
    obterFaixasSeguras,
    salvarFaixasSeguras,
    obterCalibracaoFluxo,
    salvarCalibracaoFluxo,
    gerarBackup,
    restaurarBackup,
};
