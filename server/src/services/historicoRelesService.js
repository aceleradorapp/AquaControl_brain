const db = require('../database/db');

// Histórico de acionamento dos relés (13-espc) — usado por relesController.js pra logar
// toda vez que uma porta muda de estado de verdade, e por historicoRelesController.js pra
// consultar depois (relatórios). Uma linha por PORTA que mudou, não por comando recebido.

// Compara o estado anterior com o novo e insere uma linha só pras posições que mudaram —
// "nome_porta" é uma cópia do nome atual (não uma referência viva), pra o histórico
// continuar legível mesmo que a porta seja renomeada depois. "temaNome" (14-espc) só é
// preenchido quando origem === 'tema' — identifica qual tema disparou a mudança, pra
// relatórios conseguirem distinguir de um clique avulso.
function registrarMudancas(moduloId, estadoAnterior, estadoNovo, origem, temaNome = null) {
    if (!Array.isArray(estadoAnterior) || !Array.isArray(estadoNovo)) return;

    const portas = db.prepare('SELECT posicao_indice, nome_personalizado FROM portas_mapeamento WHERE modulo_id = ?').all(moduloId);
    const nomePorIndice = new Map(portas.map((p) => [p.posicao_indice, p.nome_personalizado]));

    const inserir = db.prepare(
        'INSERT INTO historico_reles (modulo_id, posicao_indice, nome_porta, novo_estado, origem, tema_nome) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (let indice = 0; indice < estadoNovo.length; indice++) {
        if (estadoAnterior[indice] === estadoNovo[indice]) continue;

        const numero = String(indice + 1).padStart(2, '0');
        const nome = nomePorIndice.get(indice) || `Porta ${numero}`;
        inserir.run(moduloId, indice, nome, estadoNovo[indice], origem, origem === 'tema' ? temaNome : null);
    }
}

// Consulta pra relatórios — filtra por módulo se informado, mais recentes primeiro.
function listarHistorico({ moduloId, limite = 100 } = {}) {
    const limiteSeguro = Math.min(Math.max(Number(limite) || 100, 1), 1000);

    if (moduloId) {
        return db
            .prepare('SELECT * FROM historico_reles WHERE modulo_id = ? ORDER BY id DESC LIMIT ?')
            .all(moduloId, limiteSeguro);
    }
    return db.prepare('SELECT * FROM historico_reles ORDER BY id DESC LIMIT ?').all(limiteSeguro);
}

module.exports = { registrarMudancas, listarHistorico };
