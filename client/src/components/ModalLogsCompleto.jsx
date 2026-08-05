import { useCallback, useEffect, useState } from 'react';
import { Activity, Cpu, Download, FilterX, Power, RefreshCw, Search, Thermometer, Wifi } from 'lucide-react';
import ModalHud from './ModalHud';
import ModalDetalheDiagnostico from './ModalDetalheDiagnostico';
import { exportarCsv } from '../utils/exportarRelatorio';

// Pagina completa do System Log (32-espc) — "/logs" na especificacao, mas este projeto não
// usa react-router em NENHUM lugar (toda "tela grande" aqui é um modal full-screen, ver o
// mesmo comentário em ModalCentralDiagnostico.jsx/ModalCentralRelatorios.jsx) — aberta pelo
// botão "[Ver Tudo]" no cabeçalho do widget compacto (TerminalLogs.jsx), não por navegação
// de URL. Auto-contida: busca os próprios dados (não reaproveita o "logs" em memória do
// Dashboard, que é só as últimas ~50 linhas pro widget compacto) com filtros e paginação
// próprios direto em GET /api/logs (ver logsController.js/logService.js).

const CATEGORIAS = [
    { valor: 'atuador', rotulo: 'Atuadores', Icone: Power },
    { valor: 'conexao', rotulo: 'Conectividade', Icone: Wifi },
    { valor: 'diagnostico', rotulo: 'Diagnosticos', Icone: Activity },
    { valor: 'sensor', rotulo: 'Sensores', Icone: Thermometer },
    { valor: 'sistema', rotulo: 'Sistema / UI', Icone: Cpu },
];
const ICONE_POR_CATEGORIA = Object.fromEntries(CATEGORIAS.map((c) => [c.valor, c.Icone]));

const NIVEIS = [
    { valor: 'info', rotulo: 'Info' },
    { valor: 'sucesso', rotulo: 'Sucesso' },
    { valor: 'alerta', rotulo: 'Alerta' },
    { valor: 'erro', rotulo: 'Critico' },
];

const FILTROS_PADRAO = { busca: '', categoria: '', niveis: [], origem: '', desde: '', ate: '', preset: '' };

// Formata um instante local (Date) pro MESMO formato que "criado_em" usa no banco
// (CURRENT_TIMESTAMP do SQLite: "AAAA-MM-DD HH:mm:ss", UTC, sem "Z") — comparação de texto
// simples só funciona certo se os dois lados estiverem no mesmo formato/fuso.
function paraCarimboSqlite(data) {
    return data.toISOString().slice(0, 19).replace('T', ' ');
}

function aplicarPreset(preset) {
    const agora = new Date();
    if (preset === 'hoje') {
        const inicio = new Date(agora);
        inicio.setHours(0, 0, 0, 0);
        return { desde: paraCarimboSqlite(inicio), ate: paraCarimboSqlite(agora) };
    }
    if (preset === '24h') {
        return { desde: paraCarimboSqlite(new Date(agora.getTime() - 24 * 60 * 60 * 1000)), ate: paraCarimboSqlite(agora) };
    }
    if (preset === '7dias') {
        return { desde: paraCarimboSqlite(new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000)), ate: paraCarimboSqlite(agora) };
    }
    return { desde: '', ate: '' };
}

// "criado_em" chega como "AAAA-MM-DD HH:mm:ss" (UTC, sem "Z") — precisa do "Z" explicito pra
// o Date entender que é UTC e converter certo pro horario local na exibição.
function formatarCarimbo(criadoEm) {
    return new Date(`${criadoEm.replace(' ', 'T')}Z`).toLocaleString('pt-BR', { hour12: false });
}

export default function ModalLogsCompleto({ aberto, onFechar }) {
    const [filtros, setFiltros] = useState(FILTROS_PADRAO);
    const [buscaInput, setBuscaInput] = useState('');
    const [pagina, setPagina] = useState(1);
    const [dados, setDados] = useState({ registros: [], totalFiltrado: 0, totalGeral: 0, totalPaginas: 1 });
    const [carregando, setCarregando] = useState(false);
    const [liveAtivo, setLiveAtivo] = useState(false);
    const [diagnosticoAbertoId, setDiagnosticoAbertoId] = useState(null);

    // Debounce da busca livre (350ms) — sem isso cada tecla digitada dispara um fetch novo.
    useEffect(() => {
        const temporizador = setTimeout(() => {
            setFiltros((atual) => ({ ...atual, busca: buscaInput }));
            setPagina(1);
        }, 350);
        return () => clearTimeout(temporizador);
    }, [buscaInput]);

    const buscar = useCallback(() => {
        if (!aberto) return;
        setCarregando(true);
        const parametros = new URLSearchParams({ page: String(pagina), limit: '50' });
        if (filtros.busca) parametros.set('search', filtros.busca);
        if (filtros.categoria) parametros.set('category', filtros.categoria);
        if (filtros.niveis.length > 0) parametros.set('severity', filtros.niveis.join(','));
        if (filtros.origem) parametros.set('origin', filtros.origem);
        if (filtros.desde) parametros.set('startDate', filtros.desde);
        if (filtros.ate) parametros.set('endDate', filtros.ate);

        fetch(`/api/logs?${parametros.toString()}`)
            .then((resposta) => resposta.json())
            .then(setDados)
            .catch(() => {})
            .finally(() => setCarregando(false));
    }, [aberto, pagina, filtros]);

    useEffect(() => {
        buscar();
    }, [buscar]);

    // "Atualizar Live" — mesmo espirito do polling do widget compacto, so que so roda
    // enquanto o usuario liga explicitamente (nao faz sentido consumir rede/CPU reconsultando
    // uma tabela paginada toda hora sem pedido).
    useEffect(() => {
        if (!aberto || !liveAtivo) return undefined;
        const intervalo = setInterval(buscar, 5000);
        return () => clearInterval(intervalo);
    }, [aberto, liveAtivo, buscar]);

    function atualizarFiltro(campo, valor) {
        setFiltros((atual) => ({ ...atual, [campo]: valor }));
        setPagina(1);
    }

    // Editar a data manualmente "desmarca" qualquer preset ativo (Hoje/24h/7 dias) — os dois
    // nunca ficam marcados ao mesmo tempo, senão o botão continuaria destacado com uma data
    // que o usuário já sobrescreveu.
    function definirDataManual(campo, valorInput) {
        setFiltros((atual) => ({
            ...atual,
            preset: '',
            [campo]: valorInput ? paraCarimboSqlite(new Date(valorInput)) : '',
        }));
        setPagina(1);
    }

    function alternarNivel(valor) {
        setFiltros((atual) => ({
            ...atual,
            niveis: atual.niveis.includes(valor) ? atual.niveis.filter((n) => n !== valor) : [...atual.niveis, valor],
        }));
        setPagina(1);
    }

    function selecionarPreset(preset) {
        const { desde, ate } = aplicarPreset(preset);
        setFiltros((atual) => ({ ...atual, preset, desde, ate }));
        setPagina(1);
    }

    function limparFiltros() {
        setFiltros(FILTROS_PADRAO);
        setBuscaInput('');
        setPagina(1);
    }

    // Exporta o CONJUNTO FILTRADO inteiro (não só a página atual na tela) — busca à parte,
    // com um limite generoso, sem paginar (ver exportarCsv em utils/exportarRelatorio.js,
    // mesmo utilitario ja usado pelos outros relatorios do sistema).
    async function exportar() {
        const parametros = new URLSearchParams({ page: '1', limit: '2000' });
        if (filtros.busca) parametros.set('search', filtros.busca);
        if (filtros.categoria) parametros.set('category', filtros.categoria);
        if (filtros.niveis.length > 0) parametros.set('severity', filtros.niveis.join(','));
        if (filtros.origem) parametros.set('origin', filtros.origem);
        if (filtros.desde) parametros.set('startDate', filtros.desde);
        if (filtros.ate) parametros.set('endDate', filtros.ate);

        const resposta = await fetch(`/api/logs?${parametros.toString()}`);
        const resultado = await resposta.json();
        exportarCsv(
            'system-log',
            [
                { chave: 'criado_em', rotulo: 'Data/Hora (UTC)' },
                { chave: 'nivel', rotulo: 'Severidade' },
                { chave: 'categoria', rotulo: 'Categoria' },
                { chave: 'origem', rotulo: 'Origem' },
                { chave: 'mensagem', rotulo: 'Mensagem' },
            ],
            resultado.registros ?? []
        );
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo="Sensory & System Log Audit // Core Repository"
            tag={`REGISTROS FILTRADOS: ${dados.totalFiltrado.toLocaleString('pt-BR')} / TOTAL: ${dados.totalGeral.toLocaleString('pt-BR')}`}
            onFechar={onFechar}
            largura="cheia"
        >
            <div className="pagina-logs">
                <div className="pagina-logs__acoes">
                    <button className="botao-primario" type="button" onClick={exportar}>
                        <Download size={14} />
                        Exportar CSV
                    </button>
                    <button className="botao-primario" type="button" onClick={limparFiltros}>
                        <FilterX size={14} />
                        Limpar Filtros
                    </button>
                    <button
                        className={`botao-primario ${liveAtivo ? 'pagina-logs__botao-live--ativo' : ''}`}
                        type="button"
                        onClick={() => setLiveAtivo((v) => !v)}
                    >
                        <RefreshCw size={14} className={liveAtivo ? 'pagina-logs__icone-girando' : ''} />
                        {liveAtivo ? 'Atualizar Live (ON)' : 'Atualizar Live (OFF)'}
                    </button>
                </div>

                <div className="pagina-logs__filtros hud-painel">
                    <label className="pagina-logs__busca">
                        <Search size={14} />
                        <input
                            className="hud-input"
                            type="text"
                            placeholder='Buscar (ex.: "Aquecedor", "192.168.98.224", "Timeout")'
                            value={buscaInput}
                            onChange={(e) => setBuscaInput(e.target.value)}
                        />
                    </label>

                    <div className="pagina-logs__filtro-bloco">
                        <span className="hud-tag">Periodo</span>
                        <div className="pagina-logs__presets">
                            {[
                                { valor: 'hoje', rotulo: 'Hoje' },
                                { valor: '24h', rotulo: 'Ultimas 24h' },
                                { valor: '7dias', rotulo: 'Ultimos 7 dias' },
                            ].map((p) => (
                                <button
                                    key={p.valor}
                                    type="button"
                                    className={`pagina-logs__pill ${filtros.preset === p.valor ? 'ativo' : ''}`}
                                    onClick={() => selecionarPreset(p.valor)}
                                >
                                    {p.rotulo}
                                </button>
                            ))}
                        </div>
                        <div className="pagina-logs__range">
                            <input
                                className="hud-input"
                                type="datetime-local"
                                value={filtros.desde ? filtros.desde.replace(' ', 'T') : ''}
                                onChange={(e) => definirDataManual('desde', e.target.value)}
                            />
                            <span className="hud-tag">ate</span>
                            <input
                                className="hud-input"
                                type="datetime-local"
                                value={filtros.ate ? filtros.ate.replace(' ', 'T') : ''}
                                onChange={(e) => definirDataManual('ate', e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="pagina-logs__filtro-bloco">
                        <span className="hud-tag">Categoria</span>
                        <select className="hud-input" value={filtros.categoria} onChange={(e) => atualizarFiltro('categoria', e.target.value)}>
                            <option value="">Todos os Tipos</option>
                            {CATEGORIAS.map((c) => (
                                <option key={c.valor} value={c.valor}>
                                    {c.rotulo}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="pagina-logs__filtro-bloco">
                        <span className="hud-tag">Severidade</span>
                        <div className="pagina-logs__presets">
                            {NIVEIS.map((n) => (
                                <button
                                    key={n.valor}
                                    type="button"
                                    className={`pagina-logs__pill pagina-logs__pill--${n.valor} ${filtros.niveis.includes(n.valor) ? 'ativo' : ''}`}
                                    onClick={() => alternarNivel(n.valor)}
                                >
                                    {n.rotulo}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="pagina-logs__filtro-bloco">
                        <span className="hud-tag">Origem</span>
                        <select className="hud-input" value={filtros.origem} onChange={(e) => atualizarFiltro('origem', e.target.value)}>
                            <option value="">Todas as Origens</option>
                            <option value="automatico">Automatico</option>
                            <option value="manual">Manual</option>
                        </select>
                    </div>
                </div>

                <div className="pagina-logs__tabela-wrap hud-scrollbar">
                    <table className="pagina-logs__tabela">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Timestamp</th>
                                <th>Categoria // Origem</th>
                                <th>Mensagem</th>
                                <th>Acoes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {carregando && (
                                <tr>
                                    <td colSpan={5} className="hud-tag">
                                        Carregando...
                                    </td>
                                </tr>
                            )}
                            {!carregando && dados.registros.length === 0 && (
                                <tr>
                                    <td colSpan={5} className="hud-tag">
                                        Nenhum registro encontrado com os filtros atuais.
                                    </td>
                                </tr>
                            )}
                            {!carregando &&
                                dados.registros.map((linha) => {
                                    const Icone = ICONE_POR_CATEGORIA[linha.categoria] ?? Cpu;
                                    return (
                                        <tr key={linha.id} className={`pagina-logs__linha pagina-logs__linha--${linha.nivel}`}>
                                            <td>
                                                <Icone size={14} />
                                                <span className={`hud-status-dot pagina-logs__led--${linha.nivel}`} />
                                            </td>
                                            <td className="hud-mono">{formatarCarimbo(linha.criado_em)}</td>
                                            <td>
                                                <span className="pagina-logs__badge">
                                                    [{linha.categoria.toUpperCase()} // {linha.origem ? linha.origem.toUpperCase() : '—'}]
                                                </span>
                                            </td>
                                            <td>
                                                {linha.diagnostico_id ? (
                                                    <button
                                                        type="button"
                                                        className="terminal-logs__link"
                                                        onClick={() => setDiagnosticoAbertoId(linha.diagnostico_id)}
                                                    >
                                                        {linha.mensagem}
                                                    </button>
                                                ) : (
                                                    linha.mensagem
                                                )}
                                            </td>
                                            <td>
                                                {linha.diagnostico_id && (
                                                    <button
                                                        type="button"
                                                        className="botao-icone"
                                                        aria-label="Ver detalhes do diagnostico"
                                                        onClick={() => setDiagnosticoAbertoId(linha.diagnostico_id)}
                                                    >
                                                        <Activity size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                        </tbody>
                    </table>
                </div>

                <div className="pagina-logs__paginacao">
                    <button className="botao-primario" type="button" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                        Anterior
                    </button>
                    <span className="hud-tag">
                        Pagina {dados.pagina ?? pagina} / {dados.totalPaginas}
                    </span>
                    <button
                        className="botao-primario"
                        type="button"
                        disabled={pagina >= dados.totalPaginas}
                        onClick={() => setPagina((p) => p + 1)}
                    >
                        Proxima
                    </button>
                </div>
            </div>

            <ModalDetalheDiagnostico
                aberto={!!diagnosticoAbertoId}
                diagnosticoId={diagnosticoAbertoId}
                onFechar={() => setDiagnosticoAbertoId(null)}
            />
        </ModalHud>
    );
}
