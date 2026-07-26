const db = require('../database/db');

// Configuracao de QUAIS sensores (no maximo 6) aparecem na tela principal do Display, e em
// que ordem (16-espc) — ver o widget "Sensores no Display" no dashboard. Mesmo espirito de
// "replace all" do mapeamento de portas (portasMapeamentoController.js), so que mais simples:
// aqui a lista inteira e trocada de uma vez (delete-all + insert), nao um upsert por posicao,
// porque o conjunto selecionado pode encolher (remover um sensor) e um DELETE seletivo por
// posicao nao daria conta disso sozinho.
const MAX_SENSORES_DISPLAY = 6;

// GET /api/config-display-sensores — lista { sensorId, posicao } ordenada, pronta pro widget
// combinar com o catalogo completo (GET /api/modulos/:id/sensores) e montar a visualizacao.
function obterConfigDisplaySensores(req, res) {
    const linhas = db.prepare('SELECT sensor_id, posicao FROM config_display_sensores ORDER BY posicao').all();
    res.json(linhas.map((l) => ({ sensorId: l.sensor_id, posicao: l.posicao })));
}

// PUT /api/config-display-sensores — body { selecionados: ["temp_ar", "umidade_ar", ...] },
// a ORDEM do array vira a posicao (0-5) — e a mesma ordem em que os slots aparecem no grid
// do Display. Maximo 6 (400 se passar disso); duplicados sao ignorados (Set).
function salvarConfigDisplaySensores(req, res) {
    const selecionados = req.body.selecionados;
    if (!Array.isArray(selecionados)) {
        return res.status(400).json({ erro: 'Campo "selecionados" deve ser um array.' });
    }

    const unicos = [...new Set(selecionados.filter((s) => typeof s === 'string' && s.trim()))];
    if (unicos.length > MAX_SENSORES_DISPLAY) {
        return res.status(400).json({ erro: `No maximo ${MAX_SENSORES_DISPLAY} sensores podem ser selecionados.` });
    }

    db.exec('BEGIN');
    try {
        db.prepare('DELETE FROM config_display_sensores').run();
        const inserir = db.prepare('INSERT INTO config_display_sensores (sensor_id, posicao) VALUES (?, ?)');
        unicos.forEach((sensorId, posicao) => inserir.run(sensorId, posicao));
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    const linhas = db.prepare('SELECT sensor_id, posicao FROM config_display_sensores ORDER BY posicao').all();
    res.json(linhas.map((l) => ({ sensorId: l.sensor_id, posicao: l.posicao })));
}

module.exports = { obterConfigDisplaySensores, salvarConfigDisplaySensores, MAX_SENSORES_DISPLAY };
