const db = require('../database/db');

// Configuracoes da Tela de Descanso (Matrix Core Mode) do Display — passam a viver aqui em
// vez de fixas em Config.h (09-espc). Uma linha só (id fixo 1, ver migrate.js). Ainda sem
// tela própria no dashboard pra editar isso (só a rota) — dá pra ajustar via
// Postman/Insomnia por enquanto; o Display busca no boot e cai nos mesmos valores default
// de Config.h se o Brain estiver inacessível ou a linha nao existir ainda.
const PADRAO = {
    tempo_espera_protecao_segundos: 120,
    protecao_info_duracao_ms: 5000,
    protecao_info_pausa_ms: 2000,
    cor_protecao_hex: '#00FF41',
};

function obterConfigDisplay(req, res) {
    const linha = db.prepare('SELECT * FROM config_display WHERE id = 1').get();
    if (!linha) {
        return res.json(PADRAO);
    }
    const { id, ...config } = linha;
    res.json(config);
}

function atualizarConfigDisplay(req, res) {
    const atual = db.prepare('SELECT * FROM config_display WHERE id = 1').get() ?? { id: 1, ...PADRAO };

    const tempo_espera_protecao_segundos = req.body.tempo_espera_protecao_segundos ?? atual.tempo_espera_protecao_segundos;
    const protecao_info_duracao_ms = req.body.protecao_info_duracao_ms ?? atual.protecao_info_duracao_ms;
    const protecao_info_pausa_ms = req.body.protecao_info_pausa_ms ?? atual.protecao_info_pausa_ms;
    const cor_protecao_hex = req.body.cor_protecao_hex ?? atual.cor_protecao_hex;

    db.prepare(
        `INSERT INTO config_display (id, tempo_espera_protecao_segundos, protecao_info_duracao_ms, protecao_info_pausa_ms, cor_protecao_hex)
         VALUES (1, ?, ?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET
            tempo_espera_protecao_segundos = excluded.tempo_espera_protecao_segundos,
            protecao_info_duracao_ms = excluded.protecao_info_duracao_ms,
            protecao_info_pausa_ms = excluded.protecao_info_pausa_ms,
            cor_protecao_hex = excluded.cor_protecao_hex`
    ).run(tempo_espera_protecao_segundos, protecao_info_duracao_ms, protecao_info_pausa_ms, cor_protecao_hex);

    const { id, ...config } = db.prepare('SELECT * FROM config_display WHERE id = 1').get();
    res.json(config);
}

module.exports = { obterConfigDisplay, atualizarConfigDisplay };
