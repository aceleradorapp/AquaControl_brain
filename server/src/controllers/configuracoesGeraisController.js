const db = require('../database/db');
const { obterUltimaLeitura } = require('../services/sensoresTelemetriaService');
const { registrarLog } = require('../services/logService');

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
    // 28-espc: ajuste fino (offset aditivo, °C) aplicado a TODOS os sensores de temperatura
    // da agua (temp_agua_1/2/3...) antes de qualquer outra coisa consumir a leitura (media em
    // Parametros Vitais, historico, Display, relatorios) — ver sensoresTelemetriaService.js.
    // Existe pra calibrar contra um termometro de referencia real, nao pra "corrigir" um
    // sensor com defeito especifico (o offset e UNICO, aplicado igual a todos os canais).
    calibracao_temp_agua_offset: '0',
    // 36-espc: preco do kWh em R$, usado so pra converter kWh estimado em custo estimado no
    // relatorio de Energia — '0' = tarifa nao configurada, a UI esconde o "custo em R$" e
    // mostra so kWh (nunca inventa um preco).
    tarifa_energia_kwh: '0',
    // 39-espc: dimensoes uteis do aquario (cm) + offset de instalacao do sensor ultrassonico
    // (GPIO 21/22 do AquaControl_sensor) — usados por sensoresTelemetriaService.js pra converter
    // a DISTANCIA crua que o ESP manda em volume (L) e porcentagem. "aquario_distancia_offset_cm"
    // comeca em '0' (nao calibrado) — normalmente setado pelo botao "Calibrar Nivel Maximo
    // (Zerar)" (ver calibrarOffsetNivelUltrassom abaixo), nao digitado a mao.
    aquario_largura_cm: '200',
    aquario_comprimento_cm: '80',
    aquario_altura_max_cm: '130',
    aquario_distancia_offset_cm: '0',
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

// POST /api/configuracoes/calibrar-nivel-ultrassom (39-espc) — botao "Calibrar Nivel Maximo
// (Zerar)": pega a DISTANCIA instantanea que o sensor ultrassonico esta lendo AGORA (do cache
// em RAM de sensoresTelemetriaService.js, poll de ate 5s, mesma fonte que o resto do dashboard
// ja usa — sem fazer um fetch novo no ESP aqui) e salva como "aquario_distancia_offset_cm".
// Nao aceita um valor arbitrario do client de proposito — o objetivo e capturar exatamente o
// que o sensor esta vendo com a agua no nivel maximo/desejado, nao deixar o usuario digitar um
// numero por engano.
function calibrarOffsetNivelUltrassom(req, res) {
    const leitura = obterUltimaLeitura();
    const sensor = leitura?.disponivel ? leitura.sensores?.find((s) => s.id === 'nivel_agua') : null;

    // BUG (corrigido): "sensor.valor" NAO e mais a distancia crua aqui — sensoresTelemetriaService.js
    // (aplicarCalculoNivelUltrassom) ja reescreveu "valor" pro PERCENTUAL calculado antes de cachear
    // em obterUltimaLeitura(), guardando a distancia original separadamente em "distancia_cm". Usar
    // "valor" aqui criava um loop: salvava o percentual (ja errado) como se fosse cm, entao qualquer
    // recalibracao so reforcava o mesmo erro (nunca convergia pro valor real).
    if (!sensor || !sensor.conectado || typeof sensor.distancia_cm !== 'number') {
        return res.status(409).json({ erro: 'Sem leitura valida do sensor ultrassonico agora — confira se o modulo esta online e o sensor conectado.' });
    }

    const distanciaAtualCm = sensor.distancia_cm;
    db.prepare(
        `INSERT INTO configuracoes_gerais (chave, valor, atualizado_em) VALUES ('aquario_distancia_offset_cm', ?, CURRENT_TIMESTAMP)
         ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = CURRENT_TIMESTAMP`
    ).run(String(distanciaAtualCm));

    res.json({ status: 'ok', distanciaOffsetCm: distanciaAtualCm });
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

// Backup/Restauracao (19-espc, admin_conta/fauna adicionados depois pra cobrir o caso de uso
// "levar tudo de uma maquina pra outra" sem precisar versionar o .sqlite no git — ver
// DEPLOY_SERVIDOR.md) — dump/restauracao das tabelas de CONFIGURACAO + CONTA, NAO um backup
// completo do banco: historico_sensores/historico_reles/system_logs/consumo_energia_diario
// ficam de fora de proposito (podem ser grandes, e o objetivo aqui e "restaurar a
// configuracao e o acesso", nao "clonar o historico"). ATENCAO: "admin_conta" inclui o hash
// scrypt (sal:hash) da senha — o JSON exportado deve ser tratado como sensivel, nao
// compartilhado, mesmo a senha em si nao sendo reversivel a partir do hash.
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
    'admin_conta',
    'fauna',
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

    const tabelasAfetadas = [];

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
            tabelasAfetadas.push(`${tabela} (${linhas.length})`);
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        return res.status(500).json({ erro: `Falha ao restaurar backup: ${erro.message}` });
    }

    // Origem da requisicao (IP de quem chamou) — as rotas de configuracoes nao tem
    // autenticacao (decisao ja tomada no 33-espc), entao isso e o unico jeito de responder
    // depois "foi eu mesmo sincronizando de outra maquina, ou foi outra coisa" ao olhar o
    // System Log. Restauracao PARCIAL (Sincronizar com Servidor, so alguns grupos por vez) e
    // restauracao COMPLETA (Exportar/Importar arquivo) passam pelo mesmo endpoint — a lista de
    // tabelas afetadas no log distingue as duas.
    const origem = req.ip || req.socket?.remoteAddress || 'desconhecida';
    registrarLog(
        `Configuracao restaurada a partir de ${origem}: ${tabelasAfetadas.join(', ') || 'nenhuma tabela'}.`,
        'alerta',
        'sistema',
        null,
        'manual'
    );

    res.json({ status: 'ok' });
}

module.exports = {
    obterConfiguracoesGerais,
    salvarConfiguracoesGerais,
    calibrarOffsetNivelUltrassom,
    obterFaixasSeguras,
    salvarFaixasSeguras,
    obterCalibracaoFluxo,
    salvarCalibracaoFluxo,
    gerarBackup,
    restaurarBackup,
};
