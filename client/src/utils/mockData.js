// Dados simulados para as partes do dashboard que ainda não têm uma API real por trás.
// A tabela "dispositivos" já existe no server (server/src/database/migrate.js), mas ainda
// não tem rotas REST próprias — só "modulos" (e o mapeamento de portas) tem CRUD real
// (GET/POST/PUT/DELETE /api/modulos, GET/PUT /api/modulos/:id/portas). Quando
// /api/dispositivos existir, troque as chamadas que usam este arquivo por fetch reais.

// Gera um histórico "plausível" de N pontos horários em torno de um valor base, com uma
// ondulação suave (seno) + um pouco de ruído aleatório — só para o gráfico ter uma forma
// realista, não é uma simulação de verdade. Usado pela aba "24 Horas".
export function gerarHistoricoTemperatura(valorBase, variacao, pontos = 24) {
    const agora = new Date();
    const historico = [];

    for (let i = pontos - 1; i >= 0; i--) {
        const horario = new Date(agora.getTime() - i * 60 * 60 * 1000);
        const ondulacao = Math.sin(i / 2.3) * variacao;
        const ruido = (Math.random() - 0.5) * variacao * 0.4;
        historico.push({
            hora: `${horario.getHours().toString().padStart(2, '0')}h`,
            valor: Number((valorBase + ondulacao + ruido).toFixed(1)),
        });
    }

    return historico;
}

// Mesma ideia, mas com um ponto por dia (não por hora) — usado pela aba "Visão Mensal (30 Dias)".
export function gerarHistoricoMensal(valorBase, variacao, dias = 30) {
    const agora = new Date();
    const historico = [];

    for (let i = dias - 1; i >= 0; i--) {
        const dia = new Date(agora.getTime() - i * 24 * 60 * 60 * 1000);
        const ondulacao = Math.sin(i / 4.5) * variacao;
        const ruido = (Math.random() - 0.5) * variacao * 0.5;
        historico.push({
            hora: `${dia.getDate().toString().padStart(2, '0')}/${(dia.getMonth() + 1).toString().padStart(2, '0')}`,
            valor: Number((valorBase + ondulacao + ruido).toFixed(1)),
        });
    }

    return historico;
}

// Umidade relativa do ar (%) — sem sensor real ainda, só um valor inicial plausível que o
// Dashboard faz oscilar levemente ao longo do tempo (ver useEffect em Dashboard.jsx).
export function gerarUmidadeInicial() {
    return Math.round(55 + Math.random() * 20);
}

