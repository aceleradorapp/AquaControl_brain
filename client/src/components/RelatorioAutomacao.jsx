import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import CartaoKPI from './CartaoKPI';
import EstadoVazioRelatorio from './EstadoVazioRelatorio';
import TimelineReles from './TimelineReles';
import { exportarCsv } from '../utils/exportarRelatorio';
import { Download } from 'lucide-react';

const PALETA = ['#07ffff', '#ffbe00', '#249fff', '#00ff7f', '#ff5da2', '#a78bfa', '#ff9800', '#03efef', '#f87171', '#4ade80'];

// Aba 3 (17-espc): tempo total ligado + ciclos por equipamento (historico_reles), timeline
// de acionamentos (TimelineReles.jsx) e distribuicao do tempo de uso entre os equipamentos.
export default function RelatorioAutomacao({ dados, carregando }) {
    if (carregando) return <p className="hud-tag">Carregando relatorio...</p>;

    if (!dados?.disponivel) {
        return <EstadoVazioRelatorio titulo="Sem modulo atuador" mensagem={dados?.motivo ?? 'Cadastre o modulo atuador pra ver este relatorio.'} />;
    }

    if (dados.resumoPorPorta.length === 0) {
        return <EstadoVazioRelatorio titulo="Sem acionamentos no periodo" mensagem="Nenhum rele mudou de estado no intervalo selecionado." />;
    }

    function exportarResumo() {
        exportarCsv('automacao_reles', [
            { chave: 'nome', rotulo: 'Equipamento' },
            { chave: 'tempoLigadoHoras', rotulo: 'Tempo Ligado (h)' },
            { chave: 'ciclos', rotulo: 'Ciclos' },
        ], dados.resumoPorPorta);
    }

    return (
        <div className="relatorio-aba">
            <div className="relatorio-kpis">
                <CartaoKPI titulo="TOTAL DE CICLOS" valor={dados.kpis.totalCiclos} cor="#07ffff" />
                <CartaoKPI titulo="TEMPO TOTAL LIGADO" valor={dados.kpis.tempoTotalLigadoHoras} unidade=" h" cor="#ffbe00" />
                <CartaoKPI titulo="EQUIPAMENTO MAIS USADO" valor={dados.kpis.equipamentoMaisUsado ?? '--'} cor="#00ff7f" />
            </div>

            <div className="hud-painel">
                <h3 className="hud-titulo relatorio-subtitulo">Timeline de Acionamentos</h3>
                <TimelineReles intervalos={dados.intervalos} periodoInicio={dados.periodo.inicio} periodoFim={dados.periodo.fim} />
            </div>

            <div className="relatorio-grid-2">
                <div className="hud-painel">
                    <h3 className="hud-titulo relatorio-subtitulo">Distribuicao do Tempo de Uso</h3>
                    {dados.distribuicao.length === 0 && <p className="hud-tag">Sem tempo ligado registrado no periodo.</p>}
                    {dados.distribuicao.length > 0 && (
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie data={dados.distribuicao} dataKey="horas" nameKey="nome" cx="50%" cy="50%" outerRadius={80}>
                                    {dados.distribuicao.map((entrada, indice) => (
                                        <Cell key={entrada.nome} fill={PALETA[indice % PALETA.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }}
                                    formatter={(valor) => [`${valor} h`, 'Tempo ligado']}
                                />
                                <Legend wrapperStyle={{ fontSize: 11 }} />
                            </PieChart>
                        </ResponsiveContainer>
                    )}
                </div>

                <div className="hud-painel">
                    <div className="painel-cabecalho">
                        <h3 className="hud-titulo relatorio-subtitulo">Resumo por Equipamento</h3>
                        <button className="botao-icone" onClick={exportarResumo} aria-label="Exportar CSV" type="button" title="Exportar CSV">
                            <Download size={16} />
                        </button>
                    </div>
                    <div className="relatorio-tabela hud-scrollbar">
                        <table>
                            <thead>
                                <tr>
                                    <th>Equipamento</th>
                                    <th>Ligado</th>
                                    <th>Ciclos</th>
                                </tr>
                            </thead>
                            <tbody>
                                {dados.resumoPorPorta.map((porta) => (
                                    <tr key={porta.posicaoIndice}>
                                        <td>{porta.nome}</td>
                                        <td className="hud-mono">{porta.tempoLigadoHoras} h</td>
                                        <td className="hud-mono">{porta.ciclos}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
