const db = require('../database/db');

// CRUD de Equipamentos & Automacao (19-espc) — termostatos por histerese (aquecedor/
// resfriador), multiplos e independentes. Ver automacaoEquipamentosService.js pro motor que
// realmente liga/desliga os reles a partir destes cadastros.

function formatar(linha) {
    return {
        id: linha.id,
        moduloId: linha.modulo_id,
        posicaoIndice: linha.posicao_indice,
        nome: linha.nome,
        sensorId: linha.sensor_id,
        tipo: linha.tipo,
        tempMin: linha.temp_min,
        tempMax: linha.temp_max,
        atrasoSegundos: linha.atraso_segundos,
        ativo: !!linha.ativo,
    };
}

function validar(corpo) {
    if (!corpo.nome?.trim()) return 'Nome e obrigatorio.';
    if (!corpo.moduloId) return 'Modulo (controlador de reles) e obrigatorio.';
    const posicao = Number(corpo.posicaoIndice);
    if (Number.isNaN(posicao) || posicao < 0 || posicao > 15) return 'Posicao do rele invalida (0-15).';
    if (!corpo.sensorId) return 'Sensor a observar e obrigatorio.';
    if (!['aquecedor', 'resfriador'].includes(corpo.tipo)) return 'Tipo deve ser "aquecedor" ou "resfriador".';
    const min = Number(corpo.tempMin);
    const max = Number(corpo.tempMax);
    if (Number.isNaN(min) || Number.isNaN(max) || min >= max) return 'Temperatura minima deve ser menor que a maxima.';
    return null;
}

function listar(req, res) {
    const linhas = db.prepare('SELECT * FROM equipamentos_automacao ORDER BY id').all();
    res.json(linhas.map(formatar));
}

function criar(req, res) {
    const erro = validar(req.body);
    if (erro) return res.status(400).json({ erro });

    try {
        const resultado = db
            .prepare(
                `INSERT INTO equipamentos_automacao (modulo_id, posicao_indice, nome, sensor_id, tipo, temp_min, temp_max, atraso_segundos, ativo)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
                req.body.moduloId,
                Number(req.body.posicaoIndice),
                req.body.nome.trim(),
                req.body.sensorId,
                req.body.tipo,
                Number(req.body.tempMin),
                Number(req.body.tempMax),
                Number(req.body.atrasoSegundos) || 30,
                req.body.ativo === false ? 0 : 1
            );
        const criado = db.prepare('SELECT * FROM equipamentos_automacao WHERE id = ?').get(resultado.lastInsertRowid);
        res.status(201).json(formatar(criado));
    } catch (erroSql) {
        const duplicado = erroSql.message.includes('UNIQUE');
        res.status(400).json({ erro: duplicado ? 'Ja existe um equipamento cadastrado nesta porta deste modulo.' : erroSql.message });
    }
}

function atualizar(req, res) {
    const { id } = req.params;
    const existente = db.prepare('SELECT * FROM equipamentos_automacao WHERE id = ?').get(id);
    if (!existente) return res.status(404).json({ erro: 'Equipamento nao encontrado.' });

    const atual = formatar(existente);
    const corpo = { ...atual, ...req.body };
    const erro = validar(corpo);
    if (erro) return res.status(400).json({ erro });

    try {
        db.prepare(
            `UPDATE equipamentos_automacao
             SET modulo_id = ?, posicao_indice = ?, nome = ?, sensor_id = ?, tipo = ?, temp_min = ?, temp_max = ?, atraso_segundos = ?, ativo = ?
             WHERE id = ?`
        ).run(
            corpo.moduloId,
            Number(corpo.posicaoIndice),
            corpo.nome.trim(),
            corpo.sensorId,
            corpo.tipo,
            Number(corpo.tempMin),
            Number(corpo.tempMax),
            Number(corpo.atrasoSegundos) || 30,
            corpo.ativo ? 1 : 0,
            id
        );
        res.json(formatar(db.prepare('SELECT * FROM equipamentos_automacao WHERE id = ?').get(id)));
    } catch (erroSql) {
        const duplicado = erroSql.message.includes('UNIQUE');
        res.status(400).json({ erro: duplicado ? 'Ja existe um equipamento cadastrado nesta porta deste modulo.' : erroSql.message });
    }
}

function remover(req, res) {
    const resultado = db.prepare('DELETE FROM equipamentos_automacao WHERE id = ?').run(req.params.id);
    if (resultado.changes === 0) return res.status(404).json({ erro: 'Equipamento nao encontrado.' });
    res.status(204).send();
}

module.exports = { listar, criar, atualizar, remover };
