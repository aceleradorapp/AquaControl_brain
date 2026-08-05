import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Download, Droplets, Power, Printer, Zap } from 'lucide-react';
import ModalHud from './ModalHud';
import RelatorioTelemetria from './RelatorioTelemetria';
import RelatorioConsumoAgua from './RelatorioConsumoAgua';
import RelatorioAutomacao from './RelatorioAutomacao';
import RelatorioAlertas from './RelatorioAlertas';
import RelatorioConsumoEnergia from './RelatorioConsumoEnergia';
import { exportarCsv, exportarPdf } from '../utils/exportarRelatorio';

const ABAS = [
    { chave: 'telemetria', rotulo: 'Telemetria & Agua', icone: Droplets, rota: 'telemetria' },
    { chave: 'consumo', rotulo: 'Consumo & Vazao', icone: Activity, rota: 'consumo-agua' },
    { chave: 'automacao', rotulo: 'Automacao & Reles', icone: Power, rota: 'automacao' },
    { chave: 'energia', rotulo: 'Energia', icone: Zap, rota: 'energia' },
    { chave: 'alertas', rotulo: 'Alertas & Saude', icone: AlertTriangle, rota: 'alertas' },
];

const PERIODOS = [
    { chave: 'hoje', rotulo: 'Hoje' },
    { chave: '7d', rotulo: 'Ultimos 7 dias' },
    { chave: '30d', rotulo: 'Ultimos 30 dias' },
    { chave: 'personalizado', rotulo: 'Personalizado' },
];

function calcularIntervalo(periodo, dataInicioPersonalizada, dataFimPersonalizada) {
    const agora = new Date();
    if (periodo === 'hoje') {
        const inicio = new Date(agora);
        inicio.setHours(0, 0, 0, 0);
        return { inicio, fim: agora };
    }
    if (periodo === '30d') {
        return { inicio: new Date(agora.getTime() - 30 * 24 * 60 * 60 * 1000), fim: agora };
    }
    if (periodo === 'personalizado') {
        const inicio = dataInicioPersonalizada ? new Date(`${dataInicioPersonalizada}T00:00:00`) : new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000);
        const fim = dataFimPersonalizada ? new Date(`${dataFimPersonalizada}T23:59:59`) : agora;
        return { inicio, fim };
    }
    return { inicio: new Date(agora.getTime() - 7 * 24 * 60 * 60 * 1000), fim: agora }; // '7d' (default)
}

// Central de Relatorios e Analises (17-espc, ver 01-espc-geral/17_central_relatorios.md) —
// modal full-screen (nao uma rota de verdade: este projeto nao usa react-router, TODA outra
// tela do dashboard ja e um modal, entao seguir o mesmo padrao evita introduzir uma lib de
// roteamento so pra isto) com navegacao por abas, um filtro de periodo global (Hoje/7d/30d/
// Personalizado) que dispara os 4 relatorios de uma vez (fetch em paralelo — trocar de aba e
// instantaneo, ja esta tudo carregado), e exportacao CSV (da tabela principal da aba ativa) /
// PDF (impressao nativa do navegador, ver exportarRelatorio.js e o "@media print" em
// relatorios.css).
// 36-espc: "abaInicial" deixa quem abre o modal escolher em qual aba ele comeca (ex.: o
// widget de Consumo de Energia do dashboard quer abrir direto na aba "energia", em vez de
// sempre cair em "telemetria") — o efeito abaixo so reaplica no momento em que o modal abre
// (dependencia so em "aberto", nao em "abaInicial"), entao nao interrompe o usuario
// trocando de aba livremente enquanto o modal ja esta aberto.
export default function ModalCentralRelatorios({ aberto, onFechar, abaInicial = 'telemetria' }) {
    const [abaAtiva, setAbaAtiva] = useState(abaInicial);
    const [periodo, setPeriodo] = useState('7d');
    const [dataInicioPersonalizada, setDataInicioPersonalizada] = useState('');
    const [dataFimPersonalizada, setDataFimPersonalizada] = useState('');

    useEffect(() => {
        if (aberto) setAbaAtiva(abaInicial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto]);

    const [dados, setDados] = useState({ telemetria: null, consumo: null, automacao: null, energia: null, alertas: null });
    const [carregando, setCarregando] = useState(false);
    // Nomes personalizados por sensor (sensorId -> nomePersonalizado, ver
    // sensoresPersonalizadosController.js) — buscado uma vez quando o modal abre (nao depende
    // do periodo escolhido) so pra legendas de grafico usarem o nome de VERDADE do sensor
    // (ex.: "Fundo"/"Superficie") em vez de um rotulo generico tipo "Agua 1"/"Agua 2".
    const [nomesSensores, setNomesSensores] = useState({});

    useEffect(() => {
        if (!aberto) return undefined;
        let cancelado = false;
        fetch('/api/sensores-personalizados')
            .then((resposta) => resposta.json())
            .then((lista) => {
                if (cancelado || !Array.isArray(lista)) return;
                setNomesSensores(Object.fromEntries(lista.map((s) => [s.sensorId, s.nomePersonalizado])));
            })
            .catch(() => {});
        return () => {
            cancelado = true;
        };
    }, [aberto]);

    useEffect(() => {
        if (!aberto) return;
        if (periodo === 'personalizado' && (!dataInicioPersonalizada || !dataFimPersonalizada)) return;

        const { inicio, fim } = calcularIntervalo(periodo, dataInicioPersonalizada, dataFimPersonalizada);
        const query = `?inicio=${encodeURIComponent(inicio.toISOString())}&fim=${encodeURIComponent(fim.toISOString())}`;

        let cancelado = false;
        setCarregando(true);

        Promise.all(
            ABAS.map((aba) =>
                fetch(`/api/relatorios/${aba.rota}${query}`)
                    .then((resposta) => resposta.json())
                    .catch(() => ({ disponivel: false, motivo: 'Falha ao consultar o AquaControl_Brain.' }))
            )
        ).then(([telemetria, consumo, automacao, energia, alertas]) => {
            if (cancelado) return;
            setDados({ telemetria, consumo, automacao, energia, alertas });
            setCarregando(false);
        });

        return () => {
            cancelado = true;
        };
    }, [aberto, periodo, dataInicioPersonalizada, dataFimPersonalizada]);

    function exportarCsvDaAbaAtiva() {
        if (abaAtiva === 'telemetria' && dados.telemetria?.disponivel) {
            exportarCsv(
                'telemetria_anomalias',
                [
                    { chave: 'timestamp', rotulo: 'Data/Hora' },
                    { chave: 'nome', rotulo: 'Sensor' },
                    { chave: 'valor', rotulo: 'Valor' },
                    { chave: 'unidade', rotulo: 'Unidade' },
                    { chave: 'motivo', rotulo: 'Motivo' },
                ],
                dados.telemetria.anomalias
            );
        } else if (abaAtiva === 'consumo' && dados.consumo?.disponivel) {
            exportarCsv(
                'consumo_agua_por_dia',
                [
                    { chave: 'dia', rotulo: 'Dia' },
                    { chave: 'litros', rotulo: 'Litros' },
                ],
                dados.consumo.volumePorDia
            );
        } else if (abaAtiva === 'automacao' && dados.automacao?.disponivel) {
            exportarCsv(
                'automacao_reles',
                [
                    { chave: 'nome', rotulo: 'Equipamento' },
                    { chave: 'tempoLigadoHoras', rotulo: 'Tempo Ligado (h)' },
                    { chave: 'ciclos', rotulo: 'Ciclos' },
                ],
                dados.automacao.resumoPorPorta
            );
        } else if (abaAtiva === 'energia' && dados.energia?.disponivel) {
            exportarCsv(
                'consumo_energia',
                [
                    { chave: 'nome', rotulo: 'Equipamento/Modulo' },
                    { chave: 'tipo', rotulo: 'Tipo' },
                    { chave: 'kwhTotal', rotulo: 'kWh (estimado)' },
                ],
                dados.energia.porEquipamento
            );
        } else if (abaAtiva === 'alertas' && dados.alertas?.disponivel) {
            exportarCsv(
                'log_alertas',
                [
                    { chave: 'timestamp', rotulo: 'Data/Hora' },
                    { chave: 'origem', rotulo: 'Origem' },
                    { chave: 'categoria', rotulo: 'Categoria' },
                    { chave: 'descricao', rotulo: 'Descricao' },
                ],
                dados.alertas.log
            );
        }
    }

    return (
        <ModalHud aberto={aberto} titulo="Central de Relatorios e Analises" tag="TELEMETRIA · CONSUMO · AUTOMACAO · ALERTAS" onFechar={onFechar} largura="cheia">
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
                            <input type="date" className="hud-input" value={dataInicioPersonalizada} onChange={(e) => setDataInicioPersonalizada(e.target.value)} />
                            <span className="hud-tag">ate</span>
                            <input type="date" className="hud-input" value={dataFimPersonalizada} onChange={(e) => setDataFimPersonalizada(e.target.value)} />
                        </div>
                    )}

                    <div className="central-relatorios__acoes">
                        <button className="botao-primario central-relatorios__botao-acao" type="button" onClick={exportarCsvDaAbaAtiva}>
                            <Download size={14} />
                            Exportar CSV
                        </button>
                        <button className="botao-primario central-relatorios__botao-acao" type="button" onClick={exportarPdf}>
                            <Printer size={14} />
                            Gerar PDF
                        </button>
                    </div>
                </div>

                <div className="relatorio-abas">
                    {ABAS.map((aba) => {
                        const Icone = aba.icone;
                        return (
                            <button
                                key={aba.chave}
                                type="button"
                                className={`relatorio-abas__item ${abaAtiva === aba.chave ? 'relatorio-abas__item--ativo' : ''}`}
                                onClick={() => setAbaAtiva(aba.chave)}
                            >
                                <Icone size={15} />
                                {aba.rotulo}
                            </button>
                        );
                    })}
                </div>

                <div className="central-relatorios__conteudo relatorio-imprimivel hud-scrollbar">
                    {abaAtiva === 'telemetria' && <RelatorioTelemetria dados={dados.telemetria} carregando={carregando} nomesSensores={nomesSensores} />}
                    {abaAtiva === 'consumo' && <RelatorioConsumoAgua dados={dados.consumo} carregando={carregando} />}
                    {abaAtiva === 'automacao' && <RelatorioAutomacao dados={dados.automacao} carregando={carregando} />}
                    {abaAtiva === 'energia' && <RelatorioConsumoEnergia dados={dados.energia} carregando={carregando} />}
                    {abaAtiva === 'alertas' && <RelatorioAlertas dados={dados.alertas} carregando={carregando} />}
                </div>
            </div>
        </ModalHud>
    );
}
