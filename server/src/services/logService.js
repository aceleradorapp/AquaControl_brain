// System Log persistido (31-espc, filtros/paginacao 32-espc) — fonte de verdade nova pro
// "System Log" do dashboard. Escrito pelo BACKEND, nos pontos reais onde um evento acontece
// (mudança de relé, conectividade de módulo, diagnóstico), não mais só por cliques do
// usuário no navegador — é o que garante que eventos automáticos (termostato, agendamento,
// queda de conexão) fiquem registrados mesmo com ninguém olhando o dashboard, e que o
// histórico sobreviva a um refresh (ver GET /api/logs em logsController.js).
const db = require('../database/db');

const NIVEIS_VALIDOS = ['info', 'sucesso', 'alerta', 'erro'];
const ORIGENS_VALIDAS = ['manual', 'automatico'];

// "diagnosticoId" (opcional) é o que torna esta linha CLICÁVEL no front — aponta pra uma
// linha de system_diagnostics já salva (ver diagnosticoService.js), nunca criado aqui.
// "origem" (32-espc, opcional): 'manual' | 'automatico' | null (quando a distinção não se
// aplica ao evento, ex.: uma linha genérica de categoria 'sistema') — filtro da pagina /logs.
function registrarLog(mensagem, nivel = 'info', categoria = 'sistema', diagnosticoId = null, origem = null) {
    const nivelSeguro = NIVEIS_VALIDOS.includes(nivel) ? nivel : 'info';
    const origemSegura = ORIGENS_VALIDAS.includes(origem) ? origem : null;
    const resultado = db
        .prepare('INSERT INTO system_logs (nivel, categoria, mensagem, diagnostico_id, origem) VALUES (?, ?, ?, ?, ?)')
        .run(nivelSeguro, categoria, mensagem, diagnosticoId, origemSegura);
    return db.prepare('SELECT * FROM system_logs WHERE id = ?').get(resultado.lastInsertRowid);
}

// 32-espc: aliases em ingles aceitos pelos filtros da pagina /logs (a especificacao documenta
// a API com esses nomes) — traduzidos pros valores em portugues que a tabela guarda de
// verdade. Aceita TAMBEM o valor em portugues direto (a mesma rota serve o polling do widget
// compacto, que nunca manda esses aliases) — nunca rejeita um valor desconhecido, so ignora.
const ALIAS_CATEGORIA = {
    actuator: 'atuador',
    connectivity: 'conexao',
    diagnostic: 'diagnostico',
    sensor: 'sensor',
    system: 'sistema',
};
const ALIAS_NIVEL = { info: 'info', success: 'sucesso', warning: 'alerta', error: 'erro' };
const ALIAS_ORIGEM = { auto: 'automatico', manual: 'manual' };

function normalizarCategoria(valor) {
    return ALIAS_CATEGORIA[valor] ?? valor;
}
function normalizarNivel(valor) {
    return ALIAS_NIVEL[valor] ?? valor;
}
function normalizarOrigem(valor) {
    return ALIAS_ORIGEM[valor] ?? valor;
}

// Monta o WHERE (+ parametros) compartilhado entre a contagem e a busca paginada — as DUAS
// consultas precisam do MESMO filtro, senao "REGISTROS FILTRADOS: X" e a pagina X/Y de
// resultados divergiam entre si.
function montarFiltro({ busca, categoria, nivel, origem, desde, ate }) {
    const condicoes = [];
    const parametros = [];

    if (busca && busca.trim()) {
        condicoes.push('mensagem LIKE ?');
        parametros.push(`%${busca.trim()}%`);
    }
    if (categoria) {
        condicoes.push('categoria = ?');
        parametros.push(normalizarCategoria(categoria));
    }
    if (nivel) {
        // Aceita lista separada por virgula (pills marcaveis em multipla escolha, ver
        // requisito 2.2.4 da especificacao) — "IN (?,?,...)" montado dinamicamente.
        const niveis = nivel
            .split(',')
            .map((v) => normalizarNivel(v.trim()))
            .filter(Boolean);
        if (niveis.length > 0) {
            condicoes.push(`nivel IN (${niveis.map(() => '?').join(',')})`);
            parametros.push(...niveis);
        }
    }
    if (origem) {
        condicoes.push('origem = ?');
        parametros.push(normalizarOrigem(origem));
    }
    if (desde) {
        condicoes.push('criado_em >= ?');
        parametros.push(desde);
    }
    if (ate) {
        condicoes.push('criado_em <= ?');
        parametros.push(ate);
    }

    return {
        whereSql: condicoes.length > 0 ? `WHERE ${condicoes.join(' AND ')}` : '',
        parametros,
    };
}

// Mais recentes primeiro (ver requisito 4.3/3 da especificacao) — "pagina"/"limite" viram
// OFFSET/LIMIT. Devolve tambem "totalFiltrado" (quantas linhas batem com o filtro atual, sem
// paginar — usado pro cabecalho "REGISTROS FILTRADOS: X" e pro calculo de paginas) e
// "totalGeral" (contagem SEM filtro nenhum, sempre a mesma pro "/ TOTAL: Y" do cabecalho).
function listarLogs(filtro = {}) {
    const pagina = Math.max(Number(filtro.pagina) || 1, 1);
    const limite = Math.min(Math.max(Number(filtro.limite) || 50, 1), 200);
    const offset = (pagina - 1) * limite;

    const { whereSql, parametros } = montarFiltro(filtro);

    const totalGeral = db.prepare('SELECT COUNT(*) AS total FROM system_logs').get().total;
    const totalFiltrado = db.prepare(`SELECT COUNT(*) AS total FROM system_logs ${whereSql}`).get(...parametros).total;
    const registros = db
        .prepare(`SELECT * FROM system_logs ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`)
        .all(...parametros, limite, offset);

    return {
        registros,
        pagina,
        limite,
        totalFiltrado,
        totalGeral,
        totalPaginas: Math.max(Math.ceil(totalFiltrado / limite), 1),
    };
}

module.exports = { registrarLog, listarLogs };
