import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import CartaoKPI from './CartaoKPI';
import EstadoVazioRelatorio from './EstadoVazioRelatorio';
import { formatarDataHora, formatarDiaCurto, formatarHoraCurta } from '../utils/formatoRelatorio';
import { exportarCsv } from '../utils/exportarRelatorio';
import { Download } from 'lucide-react';

// Aba 2 (17-espc): consumo total estimado (soma dos deltas positivos do totalizador do
// fluxometro entre leituras consecutivas, ver relatoriosService.js — robusto a reset do
// contador num reboot do ESP), volume por dia, vazao ao longo do tempo e os 5 maiores picos.
export default function RelatorioConsumoAgua({ dados, carregando }) {
    if (carregando) return <p className="hud-tag">Carregando relatorio...</p>;

    if (!dados?.disponivel) {
        return <EstadoVazioRelatorio titulo="Sem modulo de telemetria" mensagem={dados?.motivo ?? 'Cadastre o modulo de telemetria pra ver este relatorio.'} />;
    }

    if (dados.serieVazao.length === 0) {
        return <EstadoVazioRelatorio titulo="Sem leituras de fluxo no periodo" mensagem="O fluxometro nao registrou leituras no intervalo selecionado." />;
    }

    // 27-espc: "porCanal" e novo — um resumo por sensor de fluxo encontrado no periodo. O
    // canal principal ("fluxo_agua") ja esta representado pelos KPIs/graficos de cima (raiz
    // de "dados", mantido por compatibilidade); aqui so procura um SEGUNDO canal pra mostrar
    // a leitura/grafico dele tambem, sem duplicar consumo total/picos do canal principal.
    const canal2 = dados.porCanal?.find((c) => c.sensorId === 'fluxo_agua_2' && c.serieVazao.length > 0) ?? null;

    function exportarPicos() {
        exportarCsv('picos_vazao', [
            { chave: 'timestamp', rotulo: 'Data/Hora' },
            { chave: 'vazao', rotulo: 'Vazao (L/min)' },
        ], dados.picos);
    }

    return (
        <div className="relatorio-aba">
            <div className="relatorio-kpis">
                <CartaoKPI titulo="CONSUMO TOTAL NO PERIODO" valor={dados.kpis.consumoTotalLitros} unidade=" L" cor="#249fff" />
                <CartaoKPI titulo="VAZAO MEDIA (ATIVA)" valor={dados.kpis.vazaoMediaAtiva} unidade=" L/min" cor="#07ffff" />
                <CartaoKPI titulo="VAZAO MAXIMA" valor={dados.kpis.vazaoMaxima} unidade=" L/min" cor="#ffbe00" />
            </div>

            <div className="hud-painel">
                <h3 className="hud-titulo relatorio-subtitulo">Volume Movimentado por Dia</h3>
                {dados.volumePorDia.length === 0 && <p className="hud-tag">Sem volume acumulado no periodo (vazao ficou em zero).</p>}
                {dados.volumePorDia.length > 0 && (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={dados.volumePorDia} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.08)" vertical={false} />
                            <XAxis dataKey="dia" tickFormatter={formatarDiaCurto} tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={{ stroke: '#124059' }} tickLine={false} />
                            <YAxis tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                            <Tooltip
                                contentStyle={{ background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}
                                labelStyle={{ color: '#00f0ff' }}
                                labelFormatter={formatarDiaCurto}
                                formatter={(valor) => [`${valor} L`, 'Volume']}
                            />
                            <Bar dataKey="litros" name="Litros" fill="#249fff" radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="hud-painel">
                <h3 className="hud-titulo relatorio-subtitulo">Vazao ao Longo do Tempo (identifique quedas/picos)</h3>
                <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dados.serieVazao} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.08)" vertical={false} />
                        <XAxis dataKey="timestamp" tickFormatter={formatarHoraCurta} tick={{ fill: '#5f8aa3', fontSize: 10 }} axisLine={{ stroke: '#124059' }} tickLine={false} minTickGap={50} />
                        <YAxis tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                        <Tooltip
                            contentStyle={{ background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}
                            labelStyle={{ color: '#00f0ff' }}
                            labelFormatter={formatarDataHora}
                            formatter={(valor) => [`${valor} L/min`, 'Vazao']}
                        />
                        <Line type="monotone" dataKey="vazao" name="Vazao" stroke="#07ffff" dot={false} strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="hud-painel">
                <div className="painel-cabecalho">
                    <h3 className="hud-titulo relatorio-subtitulo">Top 5 Picos de Vazao</h3>
                    <button className="botao-icone" onClick={exportarPicos} aria-label="Exportar CSV" type="button" title="Exportar CSV">
                        <Download size={16} />
                    </button>
                </div>
                {dados.picos.length === 0 && <p className="hud-tag">Nenhum pico de vazao registrado no periodo.</p>}
                {dados.picos.length > 0 && (
                    <div className="relatorio-tabela hud-scrollbar">
                        <table>
                            <thead>
                                <tr>
                                    <th>Data/Hora</th>
                                    <th>Vazao</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dados.picos.map((pico, indice) => (
                                    <tr key={`${pico.timestamp}-${indice}`}>
                                        <td>{formatarDataHora(pico.timestamp)}</td>
                                        <td className="hud-mono">{pico.vazao} L/min</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {canal2 && (
                <>
                    <div className="relatorio-kpis">
                        <CartaoKPI titulo="CONSUMO TOTAL — CANAL 2" valor={canal2.kpis.consumoTotalLitros} unidade=" L" cor="#00ff7f" />
                        <CartaoKPI titulo="VAZAO MEDIA — CANAL 2" valor={canal2.kpis.vazaoMediaAtiva} unidade=" L/min" cor="#00ff7f" />
                        <CartaoKPI titulo="VAZAO MAXIMA — CANAL 2" valor={canal2.kpis.vazaoMaxima} unidade=" L/min" cor="#00ff7f" />
                    </div>

                    <div className="hud-painel">
                        <h3 className="hud-titulo relatorio-subtitulo">Vazao ao Longo do Tempo — Segundo Canal (fluxo_agua_2)</h3>
                        <ResponsiveContainer width="100%" height={220}>
                            <LineChart data={canal2.serieVazao} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.08)" vertical={false} />
                                <XAxis dataKey="timestamp" tickFormatter={formatarHoraCurta} tick={{ fill: '#5f8aa3', fontSize: 10 }} axisLine={{ stroke: '#124059' }} tickLine={false} minTickGap={50} />
                                <YAxis tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                                <Tooltip
                                    contentStyle={{ background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}
                                    labelStyle={{ color: '#00ff7f' }}
                                    labelFormatter={formatarDataHora}
                                    formatter={(valor) => [`${valor} L/min`, 'Vazao Canal 2']}
                                />
                                <Line type="monotone" dataKey="vazao" name="Vazao Canal 2" stroke="#00ff7f" dot={false} strokeWidth={2} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </>
            )}
        </div>
    );
}
