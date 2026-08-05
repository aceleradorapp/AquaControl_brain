import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, Info, Search } from 'lucide-react';
import CartaoKPI from './CartaoKPI';
import EstadoVazioRelatorio from './EstadoVazioRelatorio';
import { formatarDiaCurto } from '../utils/formatoRelatorio';
import { exportarCsv } from '../utils/exportarRelatorio';

const PALETA = ['#ffbe00', '#07ffff', '#249fff', '#00ff7f', '#ff5da2', '#a78bfa', '#ff9800', '#f87171'];

const TOOLTIP_ESTILO = { background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 };

// Aba 5 (36-espc): consumo de energia ESTIMADO — potencia nominal declarada (Mapeamento de
// Saidas / Editar Controlador) x tempo real ligado (historico_reles), NUNCA medido por sensor
// nenhum (ver energiaService.js e o aviso fixo logo abaixo dos KPIs). "busca" filtra a grade
// de graficos individuais E a tabela de ranking (pedido explicito da especificacao); a pizza
// de distribuicao fica de fora do filtro de proposito — ela representa "quem gasta mais" no
// periodo inteiro, nao uma selecao.
export default function RelatorioConsumoEnergia({ dados, carregando }) {
    const [busca, setBusca] = useState('');

    const equipamentosFiltrados = useMemo(() => {
        if (!dados?.disponivel) return [];
        const termo = busca.trim().toLowerCase();
        if (!termo) return dados.porEquipamento;
        return dados.porEquipamento.filter((e) => e.nome.toLowerCase().includes(termo));
    }, [dados, busca]);

    if (carregando) return <p className="hud-tag">Carregando relatorio...</p>;

    if (!dados?.disponivel) {
        return (
            <EstadoVazioRelatorio
                titulo="Sem dados de energia ainda"
                mensagem={dados?.motivo ?? 'Configure a potencia (W) de ao menos um equipamento ou modulo pra ver este relatorio.'}
            />
        );
    }

    function exportarRanking() {
        exportarCsv('consumo_energia', [
            { chave: 'nome', rotulo: 'Equipamento/Modulo' },
            { chave: 'tipo', rotulo: 'Tipo' },
            { chave: 'kwhTotal', rotulo: 'kWh (estimado)' },
        ], dados.porEquipamento);
    }

    return (
        <div className="relatorio-aba">
            <div className="relatorio-kpis">
                <CartaoKPI titulo="CONSUMO TOTAL (ESTIMADO)" valor={dados.kpis.totalKwh} unidade=" kWh" cor="#ffbe00" />
                <CartaoKPI
                    titulo="CUSTO ESTIMADO"
                    valor={dados.kpis.custoEstimadoReais !== null ? dados.kpis.custoEstimadoReais.toFixed(2).replace('.', ',') : null}
                    unidade={dados.kpis.custoEstimadoReais !== null ? ' R$' : undefined}
                    cor="#00ff7f"
                />
                <CartaoKPI titulo="QUEM MAIS CONSOME" valor={dados.kpis.equipamentoQueMaisConsome ?? '--'} cor="#07ffff" />
                <CartaoKPI titulo="MEDIA DIARIA" valor={dados.kpis.consumoMedioDiarioKwh} unidade=" kWh" cor="#249fff" />
            </div>

            <p className="hud-tag relatorio-aviso-estimativa">
                <Info size={14} />
                Estimativa: potencia declarada pelo usuario x tempo real ligado — nao ha sensor de corrente medindo consumo de verdade.
                {!dados.tarifaConfigurada && ' Configure a tarifa (R$/kWh) em Configuracoes -> Atuadores & Controle pra ver o custo estimado.'}
            </p>

            <div className="hud-painel">
                <h3 className="hud-titulo relatorio-subtitulo">Consumo Geral por Dia</h3>
                {dados.kwhPorDia.length === 0 && <p className="hud-tag">Sem consumo estimado no periodo.</p>}
                {dados.kwhPorDia.length > 0 && (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={dados.kwhPorDia} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.08)" vertical={false} />
                            <XAxis dataKey="dia" tickFormatter={formatarDiaCurto} tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={{ stroke: '#124059' }} tickLine={false} />
                            <YAxis tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} width={34} />
                            <Tooltip contentStyle={TOOLTIP_ESTILO} labelStyle={{ color: '#00f0ff' }} labelFormatter={formatarDiaCurto} formatter={(valor) => [`${valor} kWh`, 'Consumo']} />
                            <Bar dataKey="kwh" name="kWh" fill="#ffbe00" radius={[3, 3, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="relatorio-grid-2">
                <div className="hud-painel">
                    <h3 className="hud-titulo relatorio-subtitulo">Quem Consome Mais</h3>
                    {dados.distribuicao.length === 0 && <p className="hud-tag">Sem consumo estimado no periodo.</p>}
                    {dados.distribuicao.length > 0 && (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={dados.distribuicao} dataKey="kwh" nameKey="nome" cx="50%" cy="50%" outerRadius={80}>
                                    {dados.distribuicao.map((entrada, indice) => (
                                        <Cell key={entrada.nome} fill={PALETA[indice % PALETA.length]} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={TOOLTIP_ESTILO} formatter={(valor) => [`${valor} kWh`, 'Consumo estimado']} />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="hud-painel">
                    <div className="painel-cabecalho">
                        <h3 className="hud-titulo relatorio-subtitulo">Ranking de Consumo</h3>
                        <div className="painel-cabecalho__acoes">
                            <label className="relatorio-busca">
                                <Search size={13} />
                                <input type="text" placeholder="Buscar equipamento..." value={busca} onChange={(e) => setBusca(e.target.value)} />
                            </label>
                            <button className="botao-icone" onClick={exportarRanking} aria-label="Exportar CSV" type="button" title="Exportar CSV">
                                <Download size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="relatorio-tabela hud-scrollbar">
                        <table>
                            <thead>
                                <tr>
                                    <th>Equipamento/Modulo</th>
                                    <th>Tipo</th>
                                    <th>kWh (est.)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {equipamentosFiltrados.map((equip) => (
                                    <tr key={equip.chave}>
                                        <td>{equip.nome}</td>
                                        <td className="hud-tag">{equip.tipo === 'modulo' ? 'Modulo' : 'Equipamento'}</td>
                                        <td className="hud-mono">{equip.kwhTotal} kWh</td>
                                    </tr>
                                ))}
                                {equipamentosFiltrados.length === 0 && (
                                    <tr>
                                        <td colSpan={3} className="hud-tag">Nenhum equipamento encontrado.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="hud-painel">
                <h3 className="hud-titulo relatorio-subtitulo">Consumo Individual por Equipamento</h3>
                {equipamentosFiltrados.length === 0 && <p className="hud-tag">Nenhum equipamento encontrado.</p>}
                {equipamentosFiltrados.length > 0 && (
                    <div className="relatorio-energia-grade">
                        {equipamentosFiltrados.map((equip, indice) => (
                            <div key={equip.chave} className="relatorio-energia-card">
                                <div className="relatorio-energia-card__cabecalho">
                                    <span className="relatorio-energia-card__nome" title={equip.nome}>{equip.nome}</span>
                                    <span className="relatorio-energia-card__total">{equip.kwhTotal} kWh</span>
                                </div>
                                <ResponsiveContainer width="100%" height={130}>
                                    <BarChart data={equip.serieDiaria} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                        <XAxis dataKey="dia" tickFormatter={formatarDiaCurto} tick={{ fill: '#5f8aa3', fontSize: 9 }} axisLine={{ stroke: '#124059' }} tickLine={false} />
                                        <YAxis tick={{ fill: '#5f8aa3', fontSize: 9 }} axisLine={false} tickLine={false} width={28} />
                                        <Tooltip contentStyle={TOOLTIP_ESTILO} labelFormatter={formatarDiaCurto} formatter={(valor) => [`${valor} kWh`, 'Consumo']} />
                                        <Bar dataKey="kwh" name="kWh" fill={PALETA[indice % PALETA.length]} radius={[2, 2, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
