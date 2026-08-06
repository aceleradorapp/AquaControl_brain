import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2, TrendingDown, TrendingUp, Zap } from 'lucide-react';
import EstadoVazioRelatorio from './EstadoVazioRelatorio';
import { formatarDiaCurto } from '../utils/formatoRelatorio';

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const SETE_DIAS_MS = 7 * UM_DIA_MS;
const TRINTA_DIAS_MS = 30 * UM_DIA_MS;
const INTERVALO_ATUALIZACAO_MS = 60000;

// Widget de Consumo de Energia (36-espc) — mesmo espirito compacto do Historico Termico
// (GraficoTemperatura.jsx): um resumo "de relance" no proprio dashboard (gasto total,
// quem mais consome, tendencia de hoje vs a media, um mini-grafico diario), com um botao
// "Maximize2" que abre a aba "Energia" da Central de Relatorios pra analise completa
// (graficos individuais por equipamento, ranking, busca, export — nao duplicado aqui, de
// proposito, mesmo racional de ThermalAnalysisModal existir separado do widget termico).
export default function WidgetConsumoEnergia({ onAbrirRelatorioCompleto }) {
    const [periodo, setPeriodo] = useState('7d');
    const [dados, setDados] = useState(null);

    useEffect(() => {
        let cancelado = false;

        async function buscarConsumo() {
            try {
                const fim = new Date();
                const inicio = new Date(fim.getTime() - (periodo === '7d' ? SETE_DIAS_MS : TRINTA_DIAS_MS));
                const resposta = await fetch(`/api/relatorios/energia?inicio=${inicio.toISOString()}&fim=${fim.toISOString()}`);
                const json = await resposta.json();
                if (!cancelado) setDados(json);
            } catch {
                if (!cancelado) setDados({ disponivel: false, motivo: 'Falha ao carregar o consumo de energia.' });
            }
        }

        buscarConsumo();
        const intervalo = setInterval(buscarConsumo, INTERVALO_ATUALIZACAO_MS);
        return () => {
            cancelado = true;
            clearInterval(intervalo);
        };
    }, [periodo]);

    // "Hoje" e sempre a ultima entrada de kwhPorDia (a serie vem ordenada por dia, e o
    // endpoint sempre reagrega o dia atual antes de responder — ver energiaService.js).
    // Comparado com a media diaria do periodo pra dar uma leitura rapida de tendencia, sem
    // precisar abrir o relatorio completo pra perceber "hoje ta puxando mais que o normal".
    const hoje = dados?.disponivel ? dados.kwhPorDia.at(-1) : null;
    const media = dados?.disponivel ? dados.kpis.consumoMedioDiarioKwh : null;
    const variacaoHoje = hoje && media ? ((hoje.kwh - media) / media) * 100 : null;

    return (
        <div className="hud-painel widget-energia">
            <div className="painel-cabecalho">
                <div className="grafico-temperatura__titulo-linha">
                    <h2 className="hud-titulo">Consumo de Energia</h2>
                    <button
                        className="botao-icone"
                        type="button"
                        title="Ver relatorio completo (graficos por equipamento, ranking, busca)"
                        aria-label="Abrir relatorio completo de energia"
                        onClick={() => onAbrirRelatorioCompleto?.()}
                    >
                        <Maximize2 size={13} />
                    </button>
                </div>
                <div className="abas-periodo">
                    <button
                        type="button"
                        className={`abas-periodo__item ${periodo === '7d' ? 'abas-periodo__item--ativo' : ''}`}
                        onClick={() => setPeriodo('7d')}
                    >
                        7 Dias
                    </button>
                    <button
                        type="button"
                        className={`abas-periodo__item ${periodo === '30d' ? 'abas-periodo__item--ativo' : ''}`}
                        onClick={() => setPeriodo('30d')}
                    >
                        30 Dias
                    </button>
                </div>
            </div>

            {dados === null && <p className="hud-tag">Carregando consumo...</p>}

            {dados !== null && !dados.disponivel && (
                <EstadoVazioRelatorio
                    titulo="Sem consumo estimado"
                    mensagem={dados.motivo ?? 'Configure a potencia (W) de ao menos um equipamento em Mapear Saidas.'}
                />
            )}

            {dados?.disponivel && (
                <>
                    <div className="widget-energia__kpis">
                        <div className="widget-energia__kpi-principal">
                            <span className="hud-tag">GASTO TOTAL NO PERIODO</span>
                            <span className="widget-energia__valor-grande">
                                {dados.kpis.totalKwh}
                                <span className="widget-energia__unidade">kWh</span>
                            </span>
                            {dados.tarifaConfigurada && (
                                <span className="widget-energia__custo">≈ R$ {dados.kpis.custoEstimadoReais.toFixed(2).replace('.', ',')}</span>
                            )}
                        </div>

                        <div className="widget-energia__kpi-secundario">
                            <Zap size={16} className="widget-energia__icone-destaque" />
                            <div className="widget-energia__kpi-secundario-texto">
                                <span className="hud-tag">QUEM MAIS CONSOME</span>
                                <span className="widget-energia__destaque">{dados.kpis.equipamentoQueMaisConsome ?? '--'}</span>
                            </div>
                        </div>

                        {variacaoHoje !== null && Number.isFinite(variacaoHoje) && (
                            <div className={`widget-energia__tendencia ${variacaoHoje >= 0 ? 'widget-energia__tendencia--alta' : 'widget-energia__tendencia--baixa'}`}>
                                {variacaoHoje >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                                <span>
                                    Hoje {Math.abs(variacaoHoje).toFixed(0)}% {variacaoHoje >= 0 ? 'acima' : 'abaixo'} da media diaria
                                </span>
                            </div>
                        )}
                    </div>

                    {dados.kwhPorDia.length > 0 && (
                        <div className="widget-energia__grafico">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dados.kwhPorDia} margin={{ top: 6, right: 6, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.08)" vertical={false} />
                                    <XAxis
                                        dataKey="dia"
                                        tickFormatter={formatarDiaCurto}
                                        tick={{ fill: '#5f8aa3', fontSize: 10 }}
                                        axisLine={{ stroke: '#124059' }}
                                        tickLine={false}
                                        minTickGap={20}
                                    />
                                    <YAxis tick={{ fill: '#5f8aa3', fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                                    <Tooltip
                                        contentStyle={{ background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}
                                        labelFormatter={formatarDiaCurto}
                                        formatter={(valor) => [`${valor} kWh`, 'Consumo']}
                                    />
                                    <Bar dataKey="kwh" name="kWh" fill="#ffbe00" radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
