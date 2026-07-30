// Retencao/limpeza de historico (19-espc, "Armazenamento e Integracao" em Configuracoes
// Globais) — sem isso as tabelas de historico (principalmente historico_sensores, que desde
// o 17-espc grava o fluxometro TODO ciclo de 5s) cresceriam pra sempre. Roda uma vez no boot
// e depois a cada 24h; le "retencao_historico_dias" de configuracoes_gerais (default 90 —
// mesmo default de configuracoesGeraisController.js) a cada execucao, entao mudar o valor na
// tela de Configuracoes vale a partir da proxima limpeza, sem precisar reiniciar o servidor.
const db = require('../database/db');

const INTERVALO_MS = 24 * 60 * 60 * 1000;
const RETENCAO_PADRAO_DIAS = 90;

const TABELAS_COM_HISTORICO = [
    { tabela: 'historico_sensores', coluna: 'criado_em' },
    { tabela: 'historico_reles', coluna: 'criado_em' },
    { tabela: 'historico_autocontrol', coluna: 'timestamp' },
];

function obterRetencaoDias() {
    const linha = db.prepare("SELECT valor FROM configuracoes_gerais WHERE chave = 'retencao_historico_dias'").get();
    const dias = Number(linha?.valor);
    return Number.isFinite(dias) && dias > 0 ? dias : RETENCAO_PADRAO_DIAS;
}

function limparHistoricoAntigo() {
    const dias = obterRetencaoDias();
    const limite = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

    for (const { tabela, coluna } of TABELAS_COM_HISTORICO) {
        const resultado = db.prepare(`DELETE FROM ${tabela} WHERE ${coluna} < ?`).run(limite);
        if (resultado.changes > 0) {
            console.log(`[manutencao] ${tabela}: ${resultado.changes} linha(s) mais antiga(s) que ${dias} dias removida(s).`);
        }
    }
}

function iniciarManutencao() {
    limparHistoricoAntigo();
    setInterval(limparHistoricoAntigo, INTERVALO_MS);
}

module.exports = { iniciarManutencao, limparHistoricoAntigo };
