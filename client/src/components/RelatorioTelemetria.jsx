import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import CartaoKPI from './CartaoKPI';
import EstadoVazioRelatorio from './EstadoVazioRelatorio';
import { formatarDataHora, formatarHoraCurta } from '../utils/formatoRelatorio';
import { exportarCsv } from '../utils/exportarRelatorio';
import { Download } from 'lucide-react';

const CORES = { agua1: '#07ffff', agua2: '#00b8d9', agua3: '#0088a3', ar: '#ff9800', umidade: '#00ff7f', ph: '#ffbe00' };

function textoResumo(resumo, unidade) {
    if (!resumo) return null;
    return `min ${resumo.min}${unidade} · max ${resumo.max}${unidade}`;
}

// Aba 1 (17-espc): Temperatura da agua (3x DS18B20) vs Temperatura/Umidade do ar (DHT11) num
// grafico multivariado, tendencia de pH com faixa ideal destacada, tabela de anomalias
// (leituras fora da faixa segura — configuravel em Configuracoes -> Sensores & Telemetria).
export default function RelatorioTelemetria({ dados, carregando }) {
    if (carregando) return <p className="hud-tag">Carregando relatorio...</p>;

    if (!dados?.disponivel) {
        return <EstadoVazioRelatorio titulo="Sem modulo de telemetria" mensagem={dados?.motivo ?? 'Cadastre o modulo de telemetria pra ver este relatorio.'} />;
    }

    const semDados = dados.serieTemporal.length === 0 && dados.anomalias.length === 0;
    if (semDados) {
        return <EstadoVazioRelatorio titulo="Sem leituras no periodo" mensagem="Nao ha registros de sensores no intervalo selecionado." />;
    }

    const faixaPh = dados.faixasSeguras.sensor_ph;

    function exportarTabela() {
        exportarCsv('anomalias_telemetria', [
            { chave: 'timestamp', rotulo: 'Data/Hora' },
            { chave: 'nome', rotulo: 'Sensor' },
            { chave: 'valor', rotulo: 'Valor' },
            { chave: 'unidade', rotulo: 'Unidade' },
            { chave: 'motivo', rotulo: 'Motivo' },
        ], dados.anomalias);
    }

    return (
        <div className="relatorio-aba">
            <div className="relatorio-kpis">
                <CartaoKPI titulo="TEMP. AGUA (MEDIA)" valor={dados.kpis.temperaturaAgua?.media ?? null} unidade="°C" cor={CORES.agua1} />
                <CartaoKPI titulo="TEMP. AR (MEDIA)" valor={dados.kpis.temperaturaAr?.media ?? null} unidade="°C" cor={CORES.ar} />
                <CartaoKPI titulo="UMIDADE DO AR (MEDIA)" valor={dados.kpis.umidadeAr?.media ?? null} unidade="%" cor={CORES.umidade} />
                <CartaoKPI titulo="PH (MEDIO)" valor={dados.kpis.ph?.media ?? null} cor={CORES.ph} />
                <CartaoKPI titulo="ESTABILIDADE" valor={dados.kpis.estabilidade} unidade="%" cor="var(--cor-sucesso)" />
            </div>
            <div className="relatorio-kpis__legenda">
                {dados.kpis.temperaturaAgua && <span className="hud-tag">Agua: {textoResumo(dados.kpis.temperaturaAgua, '°C')}</span>}
                {dados.kpis.temperaturaAr && <span className="hud-tag">Ar: {textoResumo(dados.kpis.temperaturaAr, '°C')}</span>}
                {dados.kpis.ph && <span className="hud-tag">pH: {textoResumo(dados.kpis.ph, '')}</span>}
            </div>

            <div className="hud-painel">
                <h3 className="hud-titulo relatorio-subtitulo">Temperatura da Agua vs Temperatura/Umidade do Ar</h3>
                <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={dados.serieTemporal} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.08)" vertical={false} />
                        <XAxis dataKey="timestamp" tickFormatter={formatarHoraCurta} tick={{ fill: '#5f8aa3', fontSize: 10 }} axisLine={{ stroke: '#124059' }} tickLine={false} minTickGap={50} />
                        <YAxis yAxisId="temp" tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                        <YAxis yAxisId="umid" orientation="right" tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                        <Tooltip
                            contentStyle={{ background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}
                            labelStyle={{ color: '#00f0ff' }}
                            labelFormatter={formatarDataHora}
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Line yAxisId="temp" type="monotone" dataKey="temp_agua_1" name="Agua 1" stroke={CORES.agua1} dot={false} connectNulls strokeWidth={2} />
                        <Line yAxisId="temp" type="monotone" dataKey="temp_agua_2" name="Agua 2" stroke={CORES.agua2} dot={false} connectNulls strokeWidth={2} />
                        <Line yAxisId="temp" type="monotone" dataKey="temp_agua_3" name="Agua 3" stroke={CORES.agua3} dot={false} connectNulls strokeWidth={2} />
                        <Line yAxisId="temp" type="monotone" dataKey="temp_ar" name="Ar" stroke={CORES.ar} dot={false} connectNulls strokeWidth={2} />
                        <Line yAxisId="umid" type="monotone" dataKey="umidade_ar" name="Umidade %" stroke={CORES.umidade} dot={false} connectNulls strokeWidth={2} strokeDasharray="4 3" />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="hud-painel">
                <h3 className="hud-titulo relatorio-subtitulo">Tendencia de pH (faixa ideal destacada)</h3>
                <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={dados.serieTemporal} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.08)" vertical={false} />
                        <XAxis dataKey="timestamp" tickFormatter={formatarHoraCurta} tick={{ fill: '#5f8aa3', fontSize: 10 }} axisLine={{ stroke: '#124059' }} tickLine={false} minTickGap={50} />
                        <YAxis domain={['dataMin - 0.5', 'dataMax + 0.5']} tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                        <Tooltip
                            contentStyle={{ background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}
                            labelStyle={{ color: '#00f0ff' }}
                            labelFormatter={formatarDataHora}
                        />
                        {faixaPh && <ReferenceArea y1={faixaPh.min} y2={faixaPh.max} fill="#00ff7f" fillOpacity={0.1} strokeOpacity={0} />}
                        <Line type="monotone" dataKey="ph_agua" name="pH" stroke={CORES.ph} dot={false} connectNulls strokeWidth={2} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="hud-painel">
                <div className="painel-cabecalho">
                    <h3 className="hud-titulo relatorio-subtitulo">Anomalias (fora da faixa segura)</h3>
                    <button className="botao-icone" onClick={exportarTabela} aria-label="Exportar CSV" type="button" title="Exportar CSV">
                        <Download size={16} />
                    </button>
                </div>
                {dados.anomalias.length === 0 && <p className="hud-tag">Nenhuma anomalia registrada no periodo.</p>}
                {dados.anomalias.length > 0 && (
                    <div className="relatorio-tabela hud-scrollbar">
                        <table>
                            <thead>
                                <tr>
                                    <th>Data/Hora</th>
                                    <th>Sensor</th>
                                    <th>Valor</th>
                                    <th>Motivo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dados.anomalias.map((item, indice) => (
                                    <tr key={`${item.sensorId}-${item.timestamp}-${indice}`}>
                                        <td>{formatarDataHora(item.timestamp)}</td>
                                        <td>{item.nome}</td>
                                        <td className="hud-mono">
                                            {item.valor}
                                            {item.unidade}
                                        </td>
                                        <td>{item.motivo}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
