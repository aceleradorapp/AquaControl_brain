// Formatacao de datas compartilhada pelas abas da Central de Relatorios (17-espc) — os
// timestamps vem do servidor no formato bruto do SQLite ("YYYY-MM-DD HH:MM:SS", UTC).
// Exportada (28-espc) pra ser reaproveitada fora daqui tambem (ex.: GraficoTemperatura.jsx,
// que precisa do mesmo parsing pra formatar os rotulos do eixo X do widget do Dashboard).
export function paraDate(timestampSql) {
    if (!timestampSql) return null;
    const iso = timestampSql.includes('T') ? timestampSql : `${timestampSql.replace(' ', 'T')}Z`;
    const data = new Date(iso);
    return Number.isNaN(data.getTime()) ? null : data;
}

export function formatarDataHora(timestampSql) {
    const data = paraDate(timestampSql);
    return data ? data.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--';
}

export function formatarHoraCurta(timestampSql) {
    const data = paraDate(timestampSql);
    return data ? data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
}

export function formatarDiaCurto(diaSql) {
    const data = paraDate(`${diaSql} 00:00:00`);
    return data ? data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : diaSql;
}
