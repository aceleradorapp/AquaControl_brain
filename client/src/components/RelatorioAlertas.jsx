import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import CartaoKPI from './CartaoKPI';
import EstadoVazioRelatorio from './EstadoVazioRelatorio';
import { formatarDataHora } from '../utils/formatoRelatorio';
import { exportarCsv } from '../utils/exportarRelatorio';
import { Download } from 'lucide-react';

function formatarUptime(segundos) {
    if (segundos === null || segundos === undefined) return '--';
    const horas = Math.floor(segundos / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    return `${horas}h ${minutos}min`;
}

// Aba 4 (17-espc): alertas derivados do que ja e persistido — desconexao de sensor e valor
// fora da faixa segura (historico_sensores), alerta de inclinacao (idem), e eventos do motor
// de automacao (historico_autocontrol). Uptime dos modulos e uma leitura AO VIVO (nao existe
// historico de uptime persistido) — ver relatoriosService.js:obterUptimesAtuais. "Erro de
// API" nao aparece como categoria: nao ha nenhum log persistido pra isso hoje (ver
// 01-espc-geral/17_central_relatorios.md).
export default function RelatorioAlertas({ dados, carregando }) {
    if (carregando) return <p className="hud-tag">Carregando relatorio...</p>;

    if (!dados?.disponivel) {
        return <EstadoVazioRelatorio titulo="Sem dados" mensagem="Nao foi possivel montar este relatorio agora." />;
    }

    if (dados.log.length === 0) {
        return <EstadoVazioRelatorio titulo="Nenhum evento no periodo" mensagem="Nenhum alerta ou evento de automacao foi registrado no intervalo selecionado." />;
    }

    function exportarLog() {
        exportarCsv('log_alertas', [
            { chave: 'timestamp', rotulo: 'Data/Hora' },
            { chave: 'origem', rotulo: 'Origem' },
            { chave: 'categoria', rotulo: 'Categoria' },
            { chave: 'descricao', rotulo: 'Descricao' },
            { chave: 'resolvido', rotulo: 'Resolvido em' },
        ], dados.log);
    }

    return (
        <div className="relatorio-aba">
            <div className="relatorio-kpis">
                <CartaoKPI titulo="TOTAL DE ALERTAS" valor={dados.kpis.totalAlertas} cor="#f87171" />
                <CartaoKPI titulo="TEMPO MEDIO DE RESOLUCAO" valor={dados.kpis.tempoMedioResolucaoMinutos ?? '--'} unidade={dados.kpis.tempoMedioResolucaoMinutos !== null ? ' min' : ''} cor="#ffbe00" />
                {dados.kpis.uptimeAtual.map((modulo) => (
                    <CartaoKPI key={modulo.nome} titulo={`UPTIME — ${modulo.nome.toUpperCase()}`} valor={formatarUptime(modulo.uptimeSegundos)} cor="#00ff7f" />
                ))}
            </div>

            <div className="hud-painel">
                <h3 className="hud-titulo relatorio-subtitulo">Alertas por Categoria</h3>
                {dados.porCategoria.length === 0 && <p className="hud-tag">Nenhuma categoria registrada.</p>}
                {dados.porCategoria.length > 0 && (
                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={dados.porCategoria} layout="vertical" margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,240,255,0.08)" horizontal={false} />
                            <XAxis type="number" tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                            <YAxis type="category" dataKey="categoria" tick={{ fill: '#5f8aa3', fontSize: 11 }} axisLine={false} tickLine={false} width={150} />
                            <Tooltip contentStyle={{ background: '#071527', border: '1px solid #124059', fontFamily: 'Share Tech Mono, monospace', fontSize: 12 }} />
                            <Bar dataKey="total" name="Eventos" fill="#f87171" radius={[0, 3, 3, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                )}
            </div>

            <div className="hud-painel">
                <div className="painel-cabecalho">
                    <h3 className="hud-titulo relatorio-subtitulo">Historico Consolidado (Audit Log)</h3>
                    <button className="botao-icone" onClick={exportarLog} aria-label="Exportar CSV" type="button" title="Exportar CSV">
                        <Download size={16} />
                    </button>
                </div>
                <div className="relatorio-tabela hud-scrollbar">
                    <table>
                        <thead>
                            <tr>
                                <th>Data/Hora</th>
                                <th>Origem</th>
                                <th>Categoria</th>
                                <th>Descricao</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {dados.log.map((item, indice) => (
                                <tr key={`${item.timestamp}-${indice}`}>
                                    <td>{formatarDataHora(item.timestamp)}</td>
                                    <td>{item.origem}</td>
                                    <td>{item.categoria}</td>
                                    <td>{item.descricao}</td>
                                    <td>
                                        {item.resolvido === 'n/a' ? (
                                            <span className="hud-tag">—</span>
                                        ) : item.resolvido ? (
                                            <span className="relatorio-status resolvido">Resolvido {formatarDataHora(item.resolvido)}</span>
                                        ) : (
                                            <span className="relatorio-status pendente">Em aberto</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
