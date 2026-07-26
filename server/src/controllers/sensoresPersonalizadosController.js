const db = require('../database/db');

// Nomes personalizados por sensor (16-espc) — ver "sensores_personalizados" em migrate.js.
// Dois campos por sensor: "nomePersonalizado" (nome geral, usado em todo o dashboard) e
// "nomeDisplay" (só pro que é enviado de verdade pro Display — ver
// sensoresTelemetriaService.js/telemetriaDisplayService.js, que mesclam esses valores por
// cima do que o firmware do sensor manda por padrão).

// GET /api/sensores-personalizados — lista todas as personalizacoes salvas.
function obterPersonalizacoes(req, res) {
    const linhas = db.prepare('SELECT sensor_id, nome_personalizado, nome_display FROM sensores_personalizados').all();
    res.json(linhas.map((l) => ({ sensorId: l.sensor_id, nomePersonalizado: l.nome_personalizado, nomeDisplay: l.nome_display })));
}

// PUT /api/sensores-personalizados — body { sensores: [{ sensorId, nomePersonalizado, nomeDisplay }, ...] }
// Upsert em lote (um sensor por vez pode ficar de fora da lista sem problema — só os
// enviados sao atualizados). Nome vazio/ausente volta a usar o nome de fabrica do firmware
// (grava NULL, nao string vazia).
function salvarPersonalizacoes(req, res) {
    const sensores = req.body.sensores;
    if (!Array.isArray(sensores)) {
        return res.status(400).json({ erro: 'Campo "sensores" deve ser um array.' });
    }

    const upsert = db.prepare(`
        INSERT INTO sensores_personalizados (sensor_id, nome_personalizado, nome_display, atualizado_em)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (sensor_id) DO UPDATE SET
            nome_personalizado = excluded.nome_personalizado,
            nome_display = excluded.nome_display,
            atualizado_em = CURRENT_TIMESTAMP
    `);

    db.exec('BEGIN');
    try {
        for (const sensor of sensores) {
            if (!sensor.sensorId) continue;
            upsert.run(sensor.sensorId, sensor.nomePersonalizado?.trim() || null, sensor.nomeDisplay?.trim() || null);
        }
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    const linhas = db.prepare('SELECT sensor_id, nome_personalizado, nome_display FROM sensores_personalizados').all();
    res.json(linhas.map((l) => ({ sensorId: l.sensor_id, nomePersonalizado: l.nome_personalizado, nomeDisplay: l.nome_display })));
}

module.exports = { obterPersonalizacoes, salvarPersonalizacoes };
