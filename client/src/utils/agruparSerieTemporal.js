// Downsampling/agrupamento por intervalo de tempo (28-espc, "Historico Termico") — agrupa os
// pontos ESPARSOS de serieTemporal (GET /api/relatorios/telemetria: cada sensor so aparece
// numa linha quando o valor MUDA, ver relatoriosService.js) em blocos de N minutos, calculando
// a MEDIA de cada sensor presente no bloco. Sem isso o grafico do widget fica serrilhado (um
// ponto novo a cada poucos segundos, timestamps desalinhados entre sensores).
export function agruparSerieTemporal(serie, minutosPorBloco) {
    if (!minutosPorBloco || minutosPorBloco <= 0 || !serie || serie.length === 0) return serie ?? [];

    const blocoMs = minutosPorBloco * 60 * 1000;
    const blocos = new Map(); // inicioBlocoMs -> { chave: { soma, contagem } }

    for (const ponto of serie) {
        const dataPonto = new Date(`${ponto.timestamp.replace(' ', 'T')}Z`);
        if (Number.isNaN(dataPonto.getTime())) continue;
        const inicioBloco = Math.floor(dataPonto.getTime() / blocoMs) * blocoMs;

        if (!blocos.has(inicioBloco)) blocos.set(inicioBloco, {});
        const acumulador = blocos.get(inicioBloco);

        for (const [chave, valor] of Object.entries(ponto)) {
            if (chave === 'timestamp' || typeof valor !== 'number' || Number.isNaN(valor)) continue;
            if (!acumulador[chave]) acumulador[chave] = { soma: 0, contagem: 0 };
            acumulador[chave].soma += valor;
            acumulador[chave].contagem += 1;
        }
    }

    return [...blocos.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([inicioBlocoMs, acumulador]) => {
            const linha = { timestamp: new Date(inicioBlocoMs).toISOString().slice(0, 19).replace('T', ' ') };
            for (const [chave, { soma, contagem }] of Object.entries(acumulador)) {
                linha[chave] = Math.round((soma / contagem) * 100) / 100;
            }
            return linha;
        });
}

// Opcoes do seletor de amostragem (valor em MINUTOS, como string pra casar com o value de
// <select>) — "3 horas" e o padrao pedido.
export const OPCOES_AMOSTRAGEM = [
    { valor: '30', rotulo: '30 minutos' },
    { valor: '60', rotulo: '1 hora' },
    { valor: '120', rotulo: '2 horas' },
    { valor: '180', rotulo: '3 horas (Padrao)' },
    { valor: '360', rotulo: '6 horas' },
    { valor: '720', rotulo: '12 horas' },
];

export const AMOSTRAGEM_PADRAO = '180';
export const CHAVE_LOCALSTORAGE_AMOSTRAGEM = 'aquacontrol_chart_sample_rate';
