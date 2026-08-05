const db = require('../database/db');
const { registrarLog } = require('./logService');

// Histórico de acionamento dos relés (13-espc) — usado por relesController.js pra logar
// toda vez que uma porta muda de estado de verdade, e por historicoRelesController.js pra
// consultar depois (relatórios). Uma linha por PORTA que mudou, não por comando recebido.

// 31-espc: rótulo legível da origem pro System Log (ver registrarMudancas abaixo) — NÃO
// cobre 'automatico' de propósito: o motor de termostato (automacaoEquipamentosService.js)
// já loga um evento mais rico ali mesmo (com a temperatura que disparou a troca), então essa
// função pulа esse caso pra não duplicar a mesma mudança física em duas linhas do log.
const ROTULOS_ORIGEM = {
    manual: 'Manual via Dashboard',
    teste: 'Teste',
    agendamento: 'Automático (Agendamento)',
};

// 32-espc: classificacao manual/automatico pro filtro de Origem da pagina /logs — só
// 'agendamento' (cron do Motor de Agendamento) conta como automático aqui; 'manual'/'teste'/
// 'tema' são todos disparados por um clique direto do usuário, mesmo que 'tema' acione várias
// portas de uma vez.
const ORIGEM_LOG = {
    manual: 'manual',
    teste: 'manual',
    tema: 'manual',
    agendamento: 'automatico',
};

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

        // 31-espc: System Log (2.1 da especificação) — "automatico" fica de fora aqui de
        // proposito (ver comentario em ROTULOS_ORIGEM acima).
        if (origem === 'automatico') continue;
        const rotulo = origem === 'tema' ? `Automático (Tema "${temaNome}")` : ROTULOS_ORIGEM[origem] ?? origem;
        const ligou = estadoNovo[indice] === 1;
        registrarLog(`${nome} ${ligou ? 'LIGADO' : 'DESLIGADO'} (${rotulo})`, ligou ? 'sucesso' : 'alerta', 'atuador', null, ORIGEM_LOG[origem] ?? null);
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
