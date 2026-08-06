import { useEffect, useRef, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Maximize2 } from 'lucide-react';
import EstadoVazioRelatorio from './EstadoVazioRelatorio';
import ThermalAnalysisModal from './ThermalAnalysisModal';
import { CampoSelect } from './CamposConfiguracao';
import { paraDate, formatarDataHora, formatarHoraCurta } from '../utils/formatoRelatorio';
import { agruparSerieTemporal, AMOSTRAGEM_PADRAO, CHAVE_LOCALSTORAGE_AMOSTRAGEM, OPCOES_AMOSTRAGEM } from '../utils/agruparSerieTemporal';

const UM_DIA_MS = 24 * 60 * 60 * 1000;
const TRINTA_DIAS_MS = 30 * UM_DIA_MS;
const INTERVALO_ATUALIZACAO_MS = 30000;
const DURACAO_TOQUE_LONGO_MS = 500;

const CORES = {
    media: '#00f0ff',
    ambiente: '#ff9800',
    umidade: '#00ff7f',
    agua: { temp_agua_1: '#2f8bff', temp_agua_2: '#c9a0f5', temp_agua_3: '#8a5cf6' },
};

// Unidade de cada serie, so pro tooltip formatar "25.4 °C" / "65 %" em vez do numero cru.
const UNIDADE_POR_CHAVE = {
    agua_media: '°C',
    temp_ar: '°C',
    umidade_ar: '%',
    temp_agua_1: '°C',
    temp_agua_2: '°C',
    temp_agua_3: '°C',
};

function formatarValorTooltip(valor, nome, item) {
    if (valor === null || valor === undefined) return ['--', nome];
    const unidade = UNIDADE_POR_CHAVE[item.dataKey] ?? '';
    return [`${Number(valor).toFixed(1)}${unidade ? ` ${unidade}` : ''}`, nome];
}

// Rotulo do eixo X: so a hora ("11h", sem minutos/segundos) na aba de 24h — o exemplo dado na
// spec (28-espc) e exatamente "11h, 14h, 17h, 20h", que e o que sai naturalmente ao combinar
// isso com a amostragem padrao de 3 horas. Na Visao Mensal (30d) a hora sozinha seria ambigua
// (repete todo dia), entao usa dia/mes ali.
function formatarTickEixoX(timestampSql, periodo) {
    const data = paraDate(timestampSql);
    if (!data) return '';
    if (periodo === '30d') return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    return `${data.getHours()}h`;
}

// Marcacoes do eixo X (29-espc): o dominio agora e fixo (ver "dominioTempo" no componente,
// resolve o grafico esticando dados velhos pra preencher tudo), mas isso sozinho fazia o
// Recharts sempre calcular ~5 marcas evenly-spaced sobre o dominio inteiro (tickCount padrao
// do d3-scale), TRAVADO em ~4-6h de intervalo sempre — a amostragem escolhida no combo deixou
// de ter qualquer efeito na regua de baixo, so no "liso" da curva. Aqui o passo entre marcas e
// arredondado pra um multiplo exato do tamanho do bloco de amostragem (pra cada marca cair
// bem em cima de um bloco de verdade, nao um instante arbitrario entre dois blocos), calculado
// pra render entre IDEAL_TICKS marcas, ancoradas em "agora" (fimMs) andando pra tras — assim
// amostragem fina (30min) da uma regua mais granular, e amostragem grossa (12h) da uma regua
// mais espacada, do jeito que o combo sugere.
const IDEAL_TICKS_EIXO_X = 6;
function calcularTicksEixoX([inicioMs, fimMs], amostragemMinutos) {
    const passoBloco = Math.max(Number(amostragemMinutos) || 1, 1) * 60 * 1000;
    const spanMs = fimMs - inicioMs;
    const passoIdeal = spanMs / IDEAL_TICKS_EIXO_X;
    const passoMs = Math.max(passoBloco, Math.ceil(passoIdeal / passoBloco) * passoBloco);

    const ticks = [];
    for (let t = fimMs; t >= inicioMs; t -= passoMs) ticks.push(t);
    return ticks.reverse();
}

function carregarAmostragemSalva() {
    if (typeof localStorage === 'undefined') return AMOSTRAGEM_PADRAO;
    return localStorage.getItem(CHAVE_LOCALSTORAGE_AMOSTRAGEM) || AMOSTRAGEM_PADRAO;
}

// Historico termico (Recharts) com abas "24 Horas" / "Visao Mensal (30 Dias)" — usa dado REAL
// (GET /api/relatorios/telemetria, mesmo endpoint da Central de Relatorios, so troca o
// inicio/fim conforme a aba). "dadosSensores" (cache ao vivo ja usado pelo resto do Dashboard)
// decide QUAIS dos 3 sensores de agua estao conectados agora (mostra so os ativos) e fornece o
// nome personalizado (nomeDisplay) de cada serie na legenda/tooltip.
//
// 28-espc (auditoria/deep-dive): adiciona (1) o seletor de amostragem/agrupamento (downsampling
// client-side via agruparSerieTemporal, persistido em localStorage) que e a causa raiz do
// visual "serrilhado" reclamado — sem agrupar, cada sensor gera um ponto novo a cada poucos
// segundos, entao a curva "monotone" fica com dentes; agrupando em blocos de N minutos e
// tirando a media, a curva fica lisa de verdade; e (2) o gesto de abrir a Analise Termica
// Detalhada (duplo clique no desktop, toque-e-segurar ~500ms no celular) — ver
// ThermalAnalysisModal.jsx, que reusa o MESMO endpoint em resolucao total (sem agrupar) com
// zoom via Brush.
export default function GraficoTemperatura({ dadosSensores }) {
    const [periodo, setPeriodo] = useState('24h');
    const [dados, setDados] = useState(null);
    const [seriesOcultas, setSeriesOcultas] = useState({});
    const [amostragemMinutos, setAmostragemMinutos] = useState(carregarAmostragemSalva);
    const [modalAnaliseAberto, setModalAnaliseAberto] = useState(false);
    const timerToqueLongo = useRef(null);

    useEffect(() => {
        let cancelado = false;

        async function buscarHistorico() {
            try {
                const fim = new Date();
                const inicio = new Date(fim.getTime() - (periodo === '24h' ? UM_DIA_MS : TRINTA_DIAS_MS));
                const resposta = await fetch(`/api/relatorios/telemetria?inicio=${inicio.toISOString()}&fim=${fim.toISOString()}`);
                const json = await resposta.json();
                if (!cancelado) setDados(json);
            } catch {
                if (!cancelado) setDados({ disponivel: false, motivo: 'Falha ao carregar o historico termico.' });
            }
        }

        buscarHistorico();
        const intervalo = setInterval(buscarHistorico, INTERVALO_ATUALIZACAO_MS);
        return () => {
            cancelado = true;
            clearInterval(intervalo);
        };
    }, [periodo]);

    const sensoresPorId = {};
    if (dadosSensores?.disponivel) {
        for (const sensor of dadosSensores.sensores) sensoresPorId[sensor.id] = sensor;
    }
    const aguaAtivos = ['temp_agua_1', 'temp_agua_2', 'temp_agua_3'].filter((id) => sensoresPorId[id]?.conectado);
    const nomeSensor = (id, padrao) => sensoresPorId[id]?.nomeDisplay ?? padrao;

    // "timestampMs" (numero) e o que alimenta o eixo X de verdade (ver XAxis abaixo) — sem
    // isso o Recharts usa escala categorica (so plota os pontos que EXISTEM, esticados pra
    // preencher a largura toda do card), entao um sensor offline ha horas/dias fica
    // indistinguivel de "esta tudo em dia": os ultimos pontos reais simplesmente esticam ate
    // preencher o grafico inteiro, sem nenhum indicio visual do buraco de dados.
    const serieAgrupada = dados?.disponivel
        ? agruparSerieTemporal(dados.serieTemporal, Number(amostragemMinutos)).map((ponto) => ({
              ...ponto,
              timestampMs: paraDate(ponto.timestamp)?.getTime() ?? null,
          }))
        : [];
    // Dominio fixo = o periodo pedido de verdade (agora - 24h/30d ate agora), NAO
    // "dataMin/dataMax" dos pontos existentes — e o que faz o gap aparecer como um espaco em
    // branco real no lado direito do grafico quando o modulo esta offline, em vez de o
    // Recharts esconder o buraco esticando os ultimos dados bons pra preencher tudo.
    const agoraMs = Date.now();
    const dominioTempo = [agoraMs - (periodo === '24h' ? UM_DIA_MS : TRINTA_DIAS_MS), agoraMs];

    function alternarSerie(chave) {
        setSeriesOcultas((atual) => ({ ...atual, [chave]: !atual[chave] }));
    }

    function formatarItemLegenda(valor, entrada) {
        const oculta = !!seriesOcultas[entrada.dataKey];
        return <span style={{ opacity: oculta ? 0.35 : 1, textDecoration: oculta ? 'line-through' : 'none' }}>{valor}</span>;
    }

    function salvarAmostragem(valor) {
        setAmostragemMinutos(valor);
        if (typeof localStorage !== 'undefined') localStorage.setItem(CHAVE_LOCALSTORAGE_AMOSTRAGEM, valor);
    }

    function iniciarToqueLongo() {
        timerToqueLongo.current = setTimeout(() => setModalAnaliseAberto(true), DURACAO_TOQUE_LONGO_MS);
    }
    function cancelarToqueLongo() {
        if (timerToqueLongo.current) {
            clearTimeout(timerToqueLongo.current);
            timerToqueLongo.current = null;
        }
    }

    return (
        <div
            className="hud-painel grafico-temperatura"
            onDoubleClick={() => setModalAnaliseAberto(true)}
            onTouchStart={iniciarToqueLongo}
            onTouchEnd={cancelarToqueLongo}
            onTouchMove={cancelarToqueLongo}
        >
            <div className="painel-cabecalho">
                <div className="grafico-temperatura__titulo-linha">
                    <h2 className="hud-titulo">Historico Termico</h2>
                    <button
                        className="botao-icone"
                        type="button"
                        title="De duplo clique (ou toque e segure no celular) para abrir a Analise Detalhada"
                        aria-label="Abrir analise termica detalhada"
                        onClick={(e) => {
                            e.stopPropagation();
                            setModalAnaliseAberto(true);
                        }}
                    >
                        <Maximize2 size={13} />
                    </button>
                </div>
                <div className="grafico-temperatura__controles">
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
                    <CampoSelect valor={amostragemMinutos} onChange={salvarAmostragem} opcoes={OPCOES_AMOSTRAGEM} />
                </div>
            </div>

            {dados === null && <p className="hud-tag">Carregando historico...</p>}

            {dados !== null && !dados.disponivel && (
                <EstadoVazioRelatorio titulo="Sem historico termico" mensagem={dados.motivo ?? 'Nenhum modulo de telemetria cadastrado.'} />
            )}

            {dados?.disponivel && serieAgrupada.length === 0 && (
                <EstadoVazioRelatorio titulo="Sem leituras no periodo" mensagem="Ainda nao ha historico de sensores registrado neste intervalo." />
            )}

            {dados?.disponivel && serieAgrupada.length > 0 && (
                <ResponsiveContainer width="100%" height={250}>
                    <ComposedChart data={serieAgrupada} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                            <linearGradient id="gradienteMediaAgua" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={CORES.media} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={CORES.media} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 240, 255, 0.08)" vertical={false} />
                        <XAxis
                            dataKey="timestampMs"
                            type="number"
                            domain={dominioTempo}
                            ticks={calcularTicksEixoX(dominioTempo, amostragemMinutos)}
                            allowDataOverflow
                            tickFormatter={(v) => formatarTickEixoX(v, periodo)}
                            tick={{ fill: '#5f8aa3', fontSize: 11 }}
                            axisLine={{ stroke: '#124059' }}
                            tickLine={false}
                            minTickGap={30}
                        />
                        {/* Eixo esquerdo (°C) com dominio dinamico — foca na faixa real de operacao em vez
                            de uma escala fixa larga, pra pequenas variacoes ficarem visiveis. */}
                        <YAxis
                            yAxisId="temp"
                            domain={['dataMin - 1', 'dataMax + 1']}
                            tick={{ fill: '#5f8aa3', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={32}
                            tickFormatter={(v) => `${Math.round(v)}°`}
                        />
                        {/* Eixo direito (%), exclusivo da umidade — 0-100 fixo, nao compete com °C. */}
                        <YAxis
                            yAxisId="umid"
                            orientation="right"
                            domain={[0, 100]}
                            tick={{ fill: '#5f8aa3', fontSize: 11 }}
                            axisLine={false}
                            tickLine={false}
                            width={32}
                            tickFormatter={(v) => `${v}%`}
                        />
                        <Tooltip
                            contentStyle={{
                                background: '#071527',
                                border: '1px solid #124059',
                                fontFamily: 'Share Tech Mono, monospace',
                                fontSize: 12,
                            }}
                            labelStyle={{ color: '#00f0ff' }}
                            labelFormatter={formatarDataHora}
                            formatter={formatarValorTooltip}
                            cursor={{ stroke: '#124059', strokeWidth: 1 }}
                        />
                        <Legend
                            wrapperStyle={{ fontSize: 11, cursor: 'pointer' }}
                            onClick={(entrada) => alternarSerie(entrada.dataKey)}
                            formatter={formatarItemLegenda}
                        />

                        {/* --- Destaques: linhas solidas, mais grossas --- */}
                        <Area
                            yAxisId="temp"
                            type="monotone"
                            dataKey="agua_media"
                            name="Media da Agua"
                            stroke={CORES.media}
                            strokeWidth={3}
                            fill="url(#gradienteMediaAgua)"
                            connectNulls
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            hide={!!seriesOcultas.agua_media}
                        />

                        {/* --- Sensores individuais de agua: mesma espessura entre si, so os ATIVOS --- */}
                        {aguaAtivos.map((id, indice) => (
                            <Line
                                key={id}
                                yAxisId="temp"
                                type="monotone"
                                dataKey={id}
                                name={nomeSensor(id, `Agua ${indice + 1}`)}
                                stroke={CORES.agua[id]}
                                strokeWidth={1.75}
                                dot={false}
                                activeDot={{ r: 4, strokeWidth: 0 }}
                                connectNulls
                                hide={!!seriesOcultas[id]}
                            />
                        ))}

                        {/* Temp. Ambiente: posicionada depois dos sensores de agua na legenda (pedido do
                            usuario, 28-espc) — ordem de renderizacao aqui = ordem na legenda do Recharts.
                            Nome fixo "Temp. Ambiente" em vez de nomeSensor(): o nomeDisplay real desse
                            sensor ("T. Ar") foi encurtado pra caber no Display fisico (16-espc), o que
                            nao se aplica aqui — este grafico tem espaco de sobra. */}
                        <Line
                            yAxisId="temp"
                            type="monotone"
                            dataKey="temp_ar"
                            name="Temp. Ambiente"
                            stroke={CORES.ambiente}
                            strokeWidth={2.5}
                            dot={false}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            connectNulls
                            hide={!!seriesOcultas.temp_ar}
                        />

                        {/* --- Umidade: eixo proprio (direita), linha solida --- */}
                        <Line
                            yAxisId="umid"
                            type="monotone"
                            dataKey="umidade_ar"
                            name={nomeSensor('umidade_ar', 'Umidade %')}
                            stroke={CORES.umidade}
                            strokeWidth={2}
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 0 }}
                            connectNulls
                            hide={!!seriesOcultas.umidade_ar}
                        />
                    </ComposedChart>
                </ResponsiveContainer>
            )}

            <ThermalAnalysisModal aberto={modalAnaliseAberto} onFechar={() => setModalAnaliseAberto(false)} dadosSensores={dadosSensores} />
        </div>
    );
}
