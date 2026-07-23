import { useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Histórico térmico (Recharts) com abas "24 Horas" / "Visão Mensal (30 Dias)"
// (01-espc-geral/06_...) — os 4 conjuntos de dados vêm prontos do Dashboard (gerados uma
// única vez, ver src/utils/mockData.js), este componente só decide qual par mostrar.
export default function GraficoTemperatura({ dados24h, dados30d }) {
    const [periodo, setPeriodo] = useState('24h');
    const conjunto = periodo === '24h' ? dados24h : dados30d;

    const dados = conjunto.agua.map((ponto, indice) => ({
        hora: ponto.hora,
        agua: ponto.valor,
        ambiente: conjunto.ambiente[indice]?.valor,
    }));

    return (
        <div className="hud-painel grafico-temperatura">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Historico Termico</h2>
                <div className="abas-periodo">
                    <button
                        type="button"
                        className={`abas-periodo__item ${periodo === '24h' ? 'abas-periodo__item--ativo' : ''}`}
                        onClick={() => setPeriodo('24h')}
                    >
                        24 Horas
                    </button>
                    <button
                        type="button"
                        className={`abas-periodo__item ${periodo === '30d' ? 'abas-periodo__item--ativo' : ''}`}
                        onClick={() => setPeriodo('30d')}
                    >
                        Visao Mensal (30 Dias)
                    </button>
                </div>
            </div>

            <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={dados} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="gradienteAgua" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00f0ff" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="#00f0ff" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="gradienteAmbiente" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#ff9800" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#ff9800" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 240, 255, 0.08)" vertical={false} />
                    <XAxis
                        dataKey="hora"
                        tick={{ fill: '#5f8aa3', fontSize: 11 }}
                        axisLine={{ stroke: '#124059' }}
                        tickLine={false}
                        interval={periodo === '30d' ? 3 : 2}
                    />
                    <YAxis tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                    <Tooltip
                        contentStyle={{
                            background: '#071527',
                            border: '1px solid #124059',
                            fontFamily: 'Share Tech Mono, monospace',
                            fontSize: 12,
                        }}
                        labelStyle={{ color: '#00f0ff' }}
                    />
                    <Area type="monotone" dataKey="agua" name="Agua" stroke="#00f0ff" strokeWidth={2} fill="url(#gradienteAgua)" />
                    <Area
                        type="monotone"
                        dataKey="ambiente"
                        name="Ambiente"
                        stroke="#ff9800"
                        strokeWidth={2}
                        fill="url(#gradienteAmbiente)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
