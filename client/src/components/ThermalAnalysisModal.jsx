import { useEffect, useState } from 'react';
import { Area, Brush, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download } from 'lucide-react';
import ModalHud from './ModalHud';
import CartaoKPI from './CartaoKPI';
import EstadoVazioRelatorio from './EstadoVazioRelatorio';
import { formatarDataHora, formatarHoraCurta } from '../utils/formatoRelatorio';
import { exportarCsv } from '../utils/exportarRelatorio';

const CORES = {
    media: '#00f0ff',
    ambiente: '#ff9800',
    umidade: '#00ff7f',
    agua: { temp_agua_1: '#2f8bff', temp_agua_2: '#c9a0f5', temp_agua_3: '#8a5cf6' },
};

const PERIODOS = [
    { chave: 'hoje', rotulo: 'Hoje' },
    { chave: 'ontem', rotulo: 'Ontem' },
    { chave: '7dias', rotulo: 'Ultimos 7 dias' },
    { chave: 'personalizado', rotulo: 'Personalizado' },
];

const ROTULO_COLUNA_CSV = {
    agua_media: 'Media Agua (C)',
    temp_agua_1: 'Agua 1 (C)',
    temp_agua_2: 'Agua 2 (C)',
    temp_agua_3: 'Agua 3 (C)',
    temp_ar: 'Ambiente (C)',
    umidade_ar: 'Umidade (%)',
    ph_agua: 'pH',
    nivel_agua: 'Nivel Agua (%)',
};

function arredondar(numero, casas = 1) {
    if (numero === null || numero === undefined) return null;
    const fator = 10 ** casas;
    return Math.round(numero * fator) / fator;
}

// Calcula inicio/fim conforme o atalho escolhido — "personalizado" e uma DATA especifica +
// uma FAIXA DE HORARIO dentro dela (nao um intervalo de dia-a-dia como a Central de
// Relatorios), pedido explicito da spec (28-espc) pra permitir auditar, por exemplo, "das 22h
// as 6h de ontem".
function calcularIntervalo(periodo, dataEspecifica, horaInicio, horaFim) {
    const agora = new Date();

    if (periodo === 'hoje') {
        const inicio = new Date(agora);
        inicio.setHours(0, 0, 0, 0);
        return { inicio, fim: agora };
    }
    if (periodo === 'ontem') {
        const inicio = new Date(agora);
        inicio.setDate(inicio.getDate() - 1);
        inicio.setHours(0, 0, 0, 0);
        const fim = new Date(inicio);
        fim.setHours(23, 59, 59, 999);
        return { inicio, fim };
    }
    if (periodo === '7dias') {
        return { inicio: new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000), fim: agora };
    }

    const dia = dataEspecifica || agora.toISOString().slice(0, 10);
    const inicio = new Date(`${dia}T${horaInicio || '00:00'}:00`);
    const fim = new Date(`${dia}T${horaFim || '23:59'}:59`);
    return { inicio, fim };
}

// Modal de "Analise Detalhada (Deep Dive)" (28-espc) — auditoria do historico termico, aberta
// por gesto (duplo clique no desktop / toque-e-segurar no celular, ver GraficoTemperatura.jsx)
// a partir do widget do Dashboard. Reaproveita o MESMO endpoint da Central de Relatorios (GET
// /api/relatorios/telemetria) — sem isso precisar de nenhuma rota nova no Brain — so que com
// seletor de Data+Hora especifico e o grafico em resolucao TOTAL (sem downsampling, ao
// contrario do widget compacto), com zoom via Brush.
export default function ThermalAnalysisModal({ aberto, onFechar, dadosSensores }) {
    const [periodo, setPeriodo] = useState('hoje');
    const [dataEspecifica, setDataEspecifica] = useState(() => new Date().toISOString().slice(0, 10));
    const [horaInicio, setHoraInicio] = useState('00:00');
    const [horaFim, setHoraFim] = useState('23:59');
    const [dados, setDados] = useState(null);

    useEffect(() => {
        if (!aberto) return undefined;

        const { inicio, fim } = calcularIntervalo(periodo, dataEspecifica, horaInicio, horaFim);
        let cancelado = false;
        setDados(null);

        fetch(`/api/relatorios/telemetria?inicio=${encodeURIComponent(inicio.toISOString())}&fim=${encodeURIComponent(fim.toISOString())}`)
            .then((resposta) => resposta.json())
            .then((json) => {
                if (!cancelado) setDados(json);
            })
            .catch(() => {
                if (!cancelado) setDados({ disponivel: false, motivo: 'Falha ao consultar o AquaControl_Brain.' });
            });

        return () => {
            cancelado = true;
        };
    }, [aberto, periodo, dataEspecifica, horaInicio, horaFim]);

    const sensoresPorId = {};
    if (dadosSensores?.disponivel) {
        for (const sensor of dadosSensores.sensores) sensoresPorId[sensor.id] = sensor;
    }
    const aguaAtivos = ['temp_agua_1', 'temp_agua_2', 'temp_agua_3'].filter((id) => sensoresPorId[id]?.conectado);
    const nomeSensor = (id, padrao) => sensoresPorId[id]?.nomeDisplay ?? padrao;

    const kpiAgua = dados?.disponivel ? dados.kpis.temperaturaAgua : null;
    const picoUmidade = dados?.disponivel ? dados.kpis.umidadeAr?.max ?? null : null;
    const delta = kpiAgua ? arredondar(kpiAgua.max - kpiAgua.min, 1) : null;

    function exportarPeriodoCsv() {
        if (!dados?.disponivel || dados.serieTemporal.length === 0) return;
        const chaves = new Set();
        dados.serieTemporal.forEach((ponto) => Object.keys(ponto).forEach((chave) => chave !== 'timestamp' && chaves.add(chave)));
        const colunas = [
            { chave: 'timestamp', rotulo: 'Data/Hora' },
            ...[...chaves].map((chave) => ({ chave, rotulo: ROTULO_COLUNA_CSV[chave] ?? chave })),
        ];
        exportarCsv('historico_termico_auditoria', colunas, dados.serieTemporal);
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo="Analise Termica Detalhada"
            tag="AUDITORIA · HISTORICO COMPLETO"
            onFechar={onFechar}
            largura="cheia"
        >
            <div className="central-relatorios">
                <div className="central-relatorios__cabecalho">
                    <div className="abas-periodo">
                        {PERIODOS.map((p) => (
                            <button
                                key={p.chave}
                                type="button"
                                className={`abas-periodo__item ${periodo === p.chave ? 'abas-periodo__item--ativo' : ''}`}
                                onClick={() => setPeriodo(p.chave)}
                            >
                                {p.rotulo}
                            </button>
                        ))}
                    </div>

                    {periodo === 'personalizado' && (
                        <div className="central-relatorios__periodo-custom">
                            <input type="date" className="hud-input" value={dataEspecifica} onChange={(e) => setDataEspecifica(e.target.value)} />
                            <span className="hud-tag">das</span>
                            <input type="time" className="hud-input" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} />
                            <span className="hud-tag">as</span>
                            <input type="time" className="hud-input" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
                        </div>
                    )}

                    <div className="central-relatorios__acoes">
                        <button className="botao-primario central-relatorios__botao-acao" type="button" onClick={exportarPeriodoCsv}>
                            <Download size={14} />
                            Baixar CSV
                        </button>
                    </div>
                </div>

                {dados === null && <p className="hud-tag">Carregando...</p>}

                {dados !== null && !dados.disponivel && (
                    <EstadoVazioRelatorio titulo="Sem historico termico" mensagem={dados.motivo ?? 'Nenhum modulo de telemetria cadastrado.'} />
                )}

                {dados?.disponivel && dados.serieTemporal.length === 0 && (
                    <EstadoVazioRelatorio titulo="Sem leituras no periodo" mensagem="Nao ha registros de sensores no intervalo selecionado." />
                )}

                {dados?.disponivel && dados.serieTemporal.length > 0 && (
                    <>
                        <div className="relatorio-kpis">
                            <CartaoKPI titulo="TEMP. MAXIMA" valor={kpiAgua?.max ?? null} unidade="°C" cor={CORES.media} />
                            <CartaoKPI titulo="TEMP. MINIMA" valor={kpiAgua?.min ?? null} unidade="°C" cor={CORES.media} />
                            <CartaoKPI titulo="MEDIA TERMICA" valor={kpiAgua?.media ?? null} unidade="°C" cor={CORES.media} />
                            <CartaoKPI titulo="DELTA / VARIACAO" valor={delta} unidade="°C" cor={CORES.ambiente} />
                            <CartaoKPI titulo="PICO DE UMIDADE" valor={picoUmidade} unidade="%" cor={CORES.umidade} />
                        </div>

                        <div className="central-relatorios__conteudo hud-scrollbar">
                            <ResponsiveContainer width="100%" height={440}>
                                <ComposedChart data={dados.serieTemporal} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="gradienteMediaAguaDeepDive" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={CORES.media} stopOpacity={0.35} />
                                            <stop offset="100%" stopColor={CORES.media} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0, 240, 255, 0.08)" vertical={false} />
                                    <XAxis
                                        dataKey="timestamp"
                                        tickFormatter={formatarHoraCurta}
                                        tick={{ fill: '#5f8aa3', fontSize: 11 }}
                                        axisLine={{ stroke: '#124059' }}
                                        tickLine={false}
                                        minTickGap={60}
                                    />
                                    <YAxis
                                        yAxisId="temp"
                                        domain={['dataMin - 1', 'dataMax + 1']}
                                        tick={{ fill: '#5f8aa3', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={36}
                                        tickFormatter={(v) => `${Math.round(v)}°`}
                                    />
                                    <YAxis
                                        yAxisId="umid"
                                        orientation="right"
                                        domain={[0, 100]}
                                        tick={{ fill: '#5f8aa3', fontSize: 11 }}
                                        axisLine={false}
                                        tickLine={false}
                                        width={36}
                                        tickFormatter={(v) => `${v}%`}
                                    />
                                    <Tooltip
                                        contentStyle={{ background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}
                                        labelStyle={{ color: '#00f0ff' }}
                                        labelFormatter={formatarDataHora}
                                        cursor={{ stroke: '#124059', strokeWidth: 1 }}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 11 }} />

                                    <Area
                                        yAxisId="temp"
                                        type="monotone"
                                        dataKey="agua_media"
                                        name="Media da Agua"
                                        stroke={CORES.media}
                                        strokeWidth={2.5}
                                        fill="url(#gradienteMediaAguaDeepDive)"
                                        connectNulls
                                        dot={false}
                                        activeDot={{ r: 5, strokeWidth: 0 }}
                                    />
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
                                        />
                                    ))}
                                    <Line
                                        yAxisId="temp"
                                        type="monotone"
                                        dataKey="temp_ar"
                                        name={nomeSensor('temp_ar', 'Ambiente')}
                                        stroke={CORES.ambiente}
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{ r: 5, strokeWidth: 0 }}
                                        connectNulls
                                    />
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
                                    />

                                    <Brush dataKey="timestamp" height={26} stroke={CORES.media} tickFormatter={formatarHoraCurta} travellerWidth={8} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </>
                )}
            </div>
        </ModalHud>
    );
}
