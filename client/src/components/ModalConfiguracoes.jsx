import { useEffect, useMemo, useState } from 'react';
import {
    Cpu,
    Database,
    Download,
    Monitor,
    Pencil,
    Plus,
    Power,
    RotateCcw,
    Search,
    Thermometer,
    Trash2,
    Upload,
} from 'lucide-react';
import ModalHud from './ModalHud';
import ModalEquipamentoAutomacao from './ModalEquipamentoAutomacao';
import { CampoNumero, CampoSelect, CampoToggle, CartaoSecao, LinhaConfiguracao } from './CamposConfiguracao';

const CATEGORIAS = [
    { chave: 'sistema', rotulo: 'Sistema & Plataforma', icone: Monitor },
    { chave: 'modulos', rotulo: 'Modulos Hardware & Conectividade', icone: Cpu },
    { chave: 'sensores', rotulo: 'Sensores & Telemetria', icone: Thermometer },
    { chave: 'atuadores', rotulo: 'Atuadores & Controle', icone: Power },
    { chave: 'armazenamento', rotulo: 'Armazenamento e Integracao', icone: Database },
];

// Temas visuais (22-espc, ver theme.css) — "cores" e so pro preview de 3 pontinhos no
// seletor (primaria/secundaria/fundo), nao afeta nada alem da propria tela de Configuracoes.
const TEMAS = [
    { chave: 'ciano', nome: 'Ciano Tatico', descricao: 'O tema original — HUD frio, ciano/azul eletrico.', cores: ['#00f0ff', '#0077ff', '#030914'] },
    { chave: 'abissal', nome: 'Abissal Bioluminescente', descricao: 'Verde-turquesa de aguas profundas — remete ao proprio aquario.', cores: ['#00ffb3', '#5b8fff', '#020f14'] },
    { chave: 'ambar', nome: 'Ambar Retro', descricao: 'Terminal sonar/CRT vintage — quente, alto contraste.', cores: ['#ffb000', '#ff7043', '#120c06'] },
    { chave: 'escuro', nome: 'Escuro Neutro', descricao: 'Dark mode flat/profissional — bem menos neon que os outros.', cores: ['#5b9dd9', '#7c8ba1', '#0d0f12'] },
    { chave: 'vivido', nome: 'Vivido', descricao: 'Vaporwave/synthwave — magenta, ciano e amarelo bem saturados.', cores: ['#ff2fd0', '#35e0ff', '#120019'] },
    { chave: 'claro', nome: 'Claro', descricao: 'Tema claro — quase branco, com variacao entre as camadas.', cores: ['#1d4ed8', '#6d28d9', '#f4f6f8'] },
];

// Espelha PADRAO em configuracoesGeraisController.js — usado so pelo botao "Restaurar
// Padrao" de cada secao (o backend ja devolve os defaults pra qualquer chave nao salva; isso
// aqui e so pra "resetar" um rascunho em edicao de volta pro default conhecido).
const PADRAO_CONFIGURACOES = {
    intervalo_polling_sensores_ms: '5000',
    intervalo_ping_modulos_ms: '10000',
    retencao_historico_dias: '90',
    som_alertas_ativado: 'true',
    popup_alertas_ativado: 'true',
    severidade_minima_notificacao: 'aviso',
    silencio_inicio: '',
    silencio_fim: '',
};

// 24-espc: agua e ar tinham UMA faixa compartilhada ("sensor_temp") — separadas porque sao 3x
// DS18B20 (agua, calibrada em GRUPO por media dos sensores ativos, ver relatoriosService.js)
// vs. 1x DHT11 (ar, sensor unico).
const MAPA_FAIXA_ROTULO = {
    temp_agua: 'Temperatura da Agua (°C) — media dos sensores ativos',
    temp_ar: 'Temperatura do Ar (°C)',
    ph_agua: 'pH da Agua',
    umidade_ar: 'Umidade do Ar (%)',
};

const MAPA_PINOS_SENSORES = [
    { sensor: 'DS18B20 (Temp. Agua x3)', pino: 'GPIO 18 (barramento OneWire)' },
    { sensor: 'DHT11 (Temp./Umidade Ar)', pino: 'GPIO 19' },
    { sensor: 'YF-S201 (Fluxo)', pino: 'GPIO 23' },
    { sensor: 'pH (analogico)', pino: 'GPIO 34 (ADC, so leitura)' },
    { sensor: 'SW-520D (Nivel de Agua)', pino: 'GPIO 21' },
];

function normalizarBusca(texto) {
    return texto.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Central de Configuracoes Globais do Sistema (19-espc, ver
// 01-espc-geral/19_configuracoes_globais.md) — layout estilo "VS Code Settings": sidebar de
// categorias a esquerda, conteudo + busca a direita, barra fixa inferior de "Salvar" quando
// ha alteracoes nao salvas em Configuracoes Gerais/Faixas Seguras (Equipamentos & Automacao
// tem seu proprio CRUD com persistencia imediata, sem passar pela barra de salvar — mesmo
// padrao de Temas/Agendamentos no resto do dashboard).
export default function ModalConfiguracoes({
    aberto,
    onFechar,
    modulos,
    dadosSensores,
    modoCompacto,
    onAlternarModoCompacto,
    escalaWidgets,
    onAlterarEscalaWidgets,
    tema,
    onAlterarTema,
    registrarLog,
}) {
    const [categoriaAtiva, setCategoriaAtiva] = useState('sistema');
    const [busca, setBusca] = useState('');

    const [configOriginal, setConfigOriginal] = useState(null);
    const [config, setConfig] = useState(null);
    const [faixasOriginal, setFaixasOriginal] = useState([]);
    const [faixas, setFaixas] = useState([]);
    const [calibracaoFluxoOriginal, setCalibracaoFluxoOriginal] = useState(null);
    const [calibracaoFluxo, setCalibracaoFluxo] = useState(null);
    const [equipamentos, setEquipamentos] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const [modalEquipamentoAberto, setModalEquipamentoAberto] = useState(false);
    const [equipamentoEditando, setEquipamentoEditando] = useState(null);

    const moduloAtuador = modulos.find((m) => m.tipo === 'atuador') ?? null;

    useEffect(() => {
        if (!aberto) return;
        setCarregando(true);
        Promise.all([
            fetch('/api/configuracoes').then((r) => r.json()),
            fetch('/api/configuracoes/faixas-seguras').then((r) => r.json()),
            fetch('/api/configuracoes/calibracao-fluxo').then((r) => r.json()),
            fetch('/api/configuracoes/equipamentos').then((r) => r.json()),
        ]).then(([dadosConfig, dadosFaixas, dadosCalibracaoFluxo, dadosEquipamentos]) => {
            setConfig(dadosConfig);
            setConfigOriginal(dadosConfig);
            setFaixas(dadosFaixas);
            setFaixasOriginal(dadosFaixas);
            setCalibracaoFluxo(dadosCalibracaoFluxo);
            setCalibracaoFluxoOriginal(dadosCalibracaoFluxo);
            setEquipamentos(dadosEquipamentos);
            setCarregando(false);
        });
    }, [aberto]);

    const sujo = useMemo(() => {
        if (!config || !configOriginal) return false;
        return (
            JSON.stringify(config) !== JSON.stringify(configOriginal) ||
            JSON.stringify(faixas) !== JSON.stringify(faixasOriginal) ||
            JSON.stringify(calibracaoFluxo) !== JSON.stringify(calibracaoFluxoOriginal)
        );
    }, [config, configOriginal, faixas, faixasOriginal, calibracaoFluxo, calibracaoFluxoOriginal]);

    function atualizarConfig(chave, valor) {
        setConfig((atual) => ({ ...atual, [chave]: valor }));
    }

    function atualizarFaixa(sensorTipo, campo, valor) {
        setFaixas((atual) => atual.map((f) => (f.sensorTipo === sensorTipo ? { ...f, [campo]: valor } : f)));
    }

    function atualizarCalibracaoFluxo(campo, valor) {
        setCalibracaoFluxo((atual) => ({ ...atual, [campo]: valor }));
    }

    function restaurarPadraoNotificacoes() {
        setConfig((atual) => ({
            ...atual,
            som_alertas_ativado: PADRAO_CONFIGURACOES.som_alertas_ativado,
            popup_alertas_ativado: PADRAO_CONFIGURACOES.popup_alertas_ativado,
            severidade_minima_notificacao: PADRAO_CONFIGURACOES.severidade_minima_notificacao,
            silencio_inicio: PADRAO_CONFIGURACOES.silencio_inicio,
            silencio_fim: PADRAO_CONFIGURACOES.silencio_fim,
        }));
    }

    function restaurarPadraoIntervalos() {
        setConfig((atual) => ({
            ...atual,
            intervalo_polling_sensores_ms: PADRAO_CONFIGURACOES.intervalo_polling_sensores_ms,
            intervalo_ping_modulos_ms: PADRAO_CONFIGURACOES.intervalo_ping_modulos_ms,
        }));
    }

    async function salvar() {
        setSalvando(true);
        try {
            const [respConfig, respFaixas, respCalibracaoFluxo] = await Promise.all([
                fetch('/api/configuracoes', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(config) }),
                fetch('/api/configuracoes/faixas-seguras', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ faixas }),
                }),
                fetch('/api/configuracoes/calibracao-fluxo', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(calibracaoFluxo),
                }),
            ]);
            if (!respCalibracaoFluxo.ok) {
                const erro = await respCalibracaoFluxo.json().catch(() => ({}));
                throw new Error(erro.erro || 'Falha ao salvar calibracao de vazao.');
            }
            const dadosConfig = await respConfig.json();
            const dadosFaixas = await respFaixas.json();
            const dadosCalibracaoFluxo = await respCalibracaoFluxo.json();
            setConfig(dadosConfig);
            setConfigOriginal(dadosConfig);
            setFaixas(dadosFaixas);
            setFaixasOriginal(dadosFaixas);
            setCalibracaoFluxo(dadosCalibracaoFluxo);
            setCalibracaoFluxoOriginal(dadosCalibracaoFluxo);
            registrarLog?.('Configuracoes globais salvas.', 'sucesso');
        } catch (erro) {
            registrarLog?.(erro.message || 'Falha ao salvar configuracoes.', 'erro');
        } finally {
            setSalvando(false);
        }
    }

    function descartar() {
        setConfig(configOriginal);
        setFaixas(faixasOriginal);
        setCalibracaoFluxo(calibracaoFluxoOriginal);
    }

    function abrirNovoEquipamento() {
        setEquipamentoEditando(null);
        setModalEquipamentoAberto(true);
    }

    function abrirEdicaoEquipamento(equipamento) {
        setEquipamentoEditando(equipamento);
        setModalEquipamentoAberto(true);
    }

    function aoSalvarEquipamento(equipamentoSalvo) {
        setEquipamentos((atual) => {
            const existe = atual.some((e) => e.id === equipamentoSalvo.id);
            return existe ? atual.map((e) => (e.id === equipamentoSalvo.id ? equipamentoSalvo : e)) : [...atual, equipamentoSalvo];
        });
    }

    async function alternarAtivoEquipamento(equipamento) {
        const resposta = await fetch(`/api/configuracoes/equipamentos/${equipamento.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativo: !equipamento.ativo }),
        });
        if (resposta.ok) setEquipamentos((atual) => atual.map((e) => (e.id === equipamento.id ? { ...e, ativo: !equipamento.ativo } : e)));
    }

    async function removerEquipamento(id) {
        const resposta = await fetch(`/api/configuracoes/equipamentos/${id}`, { method: 'DELETE' });
        if (resposta.ok || resposta.status === 204) {
            setEquipamentos((atual) => atual.filter((e) => e.id !== id));
            registrarLog?.('Equipamento de automacao removido.', 'alerta');
        }
    }

    async function exportarBackup() {
        const dados = await fetch('/api/configuracoes/backup').then((r) => r.json());
        const blob = new Blob([JSON.stringify(dados, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `aquacontrol_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        registrarLog?.('Backup de configuracoes exportado.', 'sucesso');
    }

    async function importarBackup(evento) {
        const arquivo = evento.target.files?.[0];
        evento.target.value = '';
        if (!arquivo) return;

        const confirmado = window.confirm(
            'Restaurar um backup SUBSTITUI toda a configuracao atual (modulos, mapeamentos, temas, agendamentos, automacao, etc.) pelo conteudo do arquivo. Esta acao nao pode ser desfeita. Continuar?'
        );
        if (!confirmado) return;

        try {
            const texto = await arquivo.text();
            const conteudo = JSON.parse(texto);
            const resposta = await fetch('/api/configuracoes/restaurar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(conteudo),
            });
            if (!resposta.ok) throw new Error((await resposta.json()).erro ?? 'Falha ao restaurar.');
            registrarLog?.('Backup restaurado com sucesso — recarregue a pagina.', 'sucesso');
            window.location.reload();
        } catch (erro) {
            registrarLog?.(`Falha ao restaurar backup: ${erro.message}`, 'erro');
        }
    }

    const termoBusca = normalizarBusca(busca);
    function corresponde(...textos) {
        if (!termoBusca) return true;
        return textos.some((t) => normalizarBusca(t ?? '').includes(termoBusca));
    }

    if (!config) {
        return (
            <ModalHud aberto={aberto} titulo="Configuracoes Globais do Sistema" onFechar={onFechar} largura="cheia">
                {carregando && <p className="hud-tag">Carregando configuracoes...</p>}
            </ModalHud>
        );
    }

    return (
        <ModalHud aberto={aberto} titulo="Configuracoes Globais do Sistema" tag="SISTEMA · MODULOS · SENSORES · ATUADORES · ARMAZENAMENTO" onFechar={onFechar} largura="cheia">
            <div className="config-pagina">
                <div className="config-sidebar">
                    {CATEGORIAS.map((cat) => {
                        const Icone = cat.icone;
                        return (
                            <button
                                key={cat.chave}
                                type="button"
                                className={`config-sidebar__item ${categoriaAtiva === cat.chave ? 'ativo' : ''}`}
                                onClick={() => setCategoriaAtiva(cat.chave)}
                            >
                                <Icone size={16} />
                                {cat.rotulo}
                            </button>
                        );
                    })}
                </div>

                <div className="config-conteudo">
                    <div className="config-busca">
                        <Search size={15} />
                        <input className="hud-input" placeholder="Search Settings..." value={busca} onChange={(e) => setBusca(e.target.value)} />
                    </div>

                    <div className="config-conteudo__corpo hud-scrollbar">
                        {categoriaAtiva === 'sistema' && (
                            <>
                                {corresponde('Tema Visual', 'Cores', 'Aparencia', 'Ciano', 'Abissal', 'Ambar') && (
                                    <CartaoSecao titulo="Tema Visual">
                                        <div className="config-tema-grade">
                                            {TEMAS.map((t) => (
                                                <button
                                                    key={t.chave}
                                                    type="button"
                                                    className={`config-tema-card ${tema === t.chave ? 'ativo' : ''}`}
                                                    onClick={() => onAlterarTema(t.chave)}
                                                >
                                                    <span className="config-tema-card__swatches">
                                                        {t.cores.map((cor) => (
                                                            <span key={cor} className="config-tema-card__swatch" style={{ background: cor }} />
                                                        ))}
                                                    </span>
                                                    <span className="config-tema-card__nome">{t.nome}</span>
                                                    <span className="config-tema-card__descricao">{t.descricao}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </CartaoSecao>
                                )}

                                {corresponde('Modo Compacto', 'Escala dos Widgets', 'Aparencia') && (
                                    <CartaoSecao titulo="Interface">
                                        <LinhaConfiguracao titulo="Modo Compacto" descricao="Widgets viram cartoes pequenos que abrem em modal ao clicar.">
                                            <CampoToggle checked={modoCompacto} onChange={onAlternarModoCompacto} />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Escala dos Widgets" descricao="Tamanho geral dos cartoes do dashboard (so telas grandes).">
                                            <input
                                                type="range"
                                                min="0.7"
                                                max="1.2"
                                                step="0.05"
                                                value={escalaWidgets}
                                                onChange={(e) => onAlterarEscalaWidgets(Number(e.target.value))}
                                            />
                                            <span className="hud-tag">{Math.round(escalaWidgets * 100)}%</span>
                                        </LinhaConfiguracao>
                                    </CartaoSecao>
                                )}

                                {corresponde('Notificacoes', 'Som', 'Popup', 'Severidade', 'Silencio') && (
                                    <CartaoSecao
                                        titulo="Notificacoes e Alertas"
                                        acao={
                                            <button className="botao-icone" onClick={restaurarPadraoNotificacoes} title="Restaurar padrao" type="button">
                                                <RotateCcw size={14} />
                                            </button>
                                        }
                                    >
                                        <LinhaConfiguracao titulo="Som no Navegador" descricao="Toca um bipe quando o Modo Panico e ativado.">
                                            <CampoToggle checked={config.som_alertas_ativado === 'true'} onChange={(v) => atualizarConfig('som_alertas_ativado', String(v))} />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Pop-ups de Alerta" descricao="Hoje os alertas ja aparecem no System Log; este toggle e reservado pra notificacoes pop-up dedicadas.">
                                            <CampoToggle checked={config.popup_alertas_ativado === 'true'} onChange={(v) => atualizarConfig('popup_alertas_ativado', String(v))} />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Severidade Minima" descricao="Preferencia salva — ainda nao filtra nenhuma notificacao de verdade.">
                                            <CampoSelect
                                                valor={config.severidade_minima_notificacao}
                                                onChange={(v) => atualizarConfig('severidade_minima_notificacao', v)}
                                                opcoes={[
                                                    { valor: 'info', rotulo: 'Info' },
                                                    { valor: 'aviso', rotulo: 'Aviso' },
                                                    { valor: 'critico', rotulo: 'Critico' },
                                                ]}
                                            />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Horario de Silencio" descricao="O bipe de som nao toca dentro dessa janela (deixe vazio pra desativar).">
                                            <input type="time" className="hud-input" value={config.silencio_inicio} onChange={(e) => atualizarConfig('silencio_inicio', e.target.value)} />
                                            <span className="hud-tag">ate</span>
                                            <input type="time" className="hud-input" value={config.silencio_fim} onChange={(e) => atualizarConfig('silencio_fim', e.target.value)} />
                                        </LinhaConfiguracao>
                                    </CartaoSecao>
                                )}

                                {corresponde('Usuario', 'Seguranca', 'Senha', 'API') && (
                                    <CartaoSecao titulo="Usuario e Seguranca">
                                        <p className="hud-tag config-nota">
                                            Este sistema nao tem autenticacao — e uma ferramenta de uso local (LAN), sem exposicao a internet.
                                            Nao ha login, senha, tempo de sessao ou chave de API pra configurar hoje. Adicionar isso mudaria o
                                            modelo de seguranca do projeto inteiro e nao foi implementado sem um pedido especifico pra essa mudanca.
                                        </p>
                                    </CartaoSecao>
                                )}
                            </>
                        )}

                        {categoriaAtiva === 'modulos' && (
                            <>
                                {corresponde('Intervalo', 'Heartbeat', 'Ping', 'Polling') && (
                                    <CartaoSecao
                                        titulo="Rede & Comunicacao"
                                        acao={
                                            <button className="botao-icone" onClick={restaurarPadraoIntervalos} title="Restaurar padrao" type="button">
                                                <RotateCcw size={14} />
                                            </button>
                                        }
                                    >
                                        <LinhaConfiguracao titulo="Intervalo de Ping dos Modulos" descricao="Frequencia com que o Brain verifica se cada modulo esta online.">
                                            <CampoNumero
                                                valor={config.intervalo_ping_modulos_ms}
                                                onChange={(v) => atualizarConfig('intervalo_ping_modulos_ms', v)}
                                                unidade="ms"
                                                min={2000}
                                                step={1000}
                                            />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Intervalo de Leitura dos Sensores" descricao="Frequencia com que o Brain busca GET /api/sensores no modulo de telemetria.">
                                            <CampoNumero
                                                valor={config.intervalo_polling_sensores_ms}
                                                onChange={(v) => atualizarConfig('intervalo_polling_sensores_ms', v)}
                                                unidade="ms"
                                                min={1000}
                                                step={500}
                                            />
                                        </LinhaConfiguracao>
                                    </CartaoSecao>
                                )}

                                {corresponde('Modulos', 'Dispositivos', 'Firmware', 'Wifi', 'IP') && (
                                    <CartaoSecao titulo="Gerenciamento de Dispositivos">
                                        <p className="hud-tag config-nota">
                                            SSID/senha/IP de cada ESP32 sao definidos no firmware (compilados em Segredos.h/Config.h) — nao ha
                                            rota remota pra mudar Wi-Fi ou IP sem reflashar a placa. A lista abaixo e so leitura.
                                        </p>
                                        <div className="relatorio-tabela">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Nome</th>
                                                        <th>IP</th>
                                                        <th>Tipo</th>
                                                        <th>Status</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {modulos.map((m) => (
                                                        <tr key={m.id}>
                                                            <td>{m.nome}</td>
                                                            <td className="hud-mono">{m.ip}</td>
                                                            <td>{m.tipo}</td>
                                                            <td>
                                                                <span className={`hud-status-dot ${m.online ? 'online' : 'offline'}`} /> {m.online ? 'Online' : 'Offline'}
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    </CartaoSecao>
                                )}
                            </>
                        )}

                        {categoriaAtiva === 'sensores' && (
                            <>
                                {corresponde('Temperatura Segura', 'pH Seguro', 'Umidade Segura', 'Faixa', 'Tolerancia', 'Calibracao') && (
                                    <CartaoSecao titulo="Limites e Calibracao (Faixas de Seguranca)">
                                        <p className="hud-tag config-nota">
                                            Usadas pra marcar anomalias na Central de Relatorios e pelos Equipamentos & Automacao (Atuadores) —
                                            ex.: "temperatura segura da agua" (minimo/maximo ideal).
                                        </p>
                                        {faixas.map((faixa) => (
                                            <LinhaConfiguracao key={faixa.sensorTipo} titulo={MAPA_FAIXA_ROTULO[faixa.sensorTipo] ?? faixa.sensorTipo}>
                                                <input
                                                    className="hud-input config-input-pequeno"
                                                    type="number"
                                                    step="0.1"
                                                    value={faixa.minimo}
                                                    onChange={(e) => atualizarFaixa(faixa.sensorTipo, 'minimo', Number(e.target.value))}
                                                />
                                                <span className="hud-tag">ate</span>
                                                <input
                                                    className="hud-input config-input-pequeno"
                                                    type="number"
                                                    step="0.1"
                                                    value={faixa.maximo}
                                                    onChange={(e) => atualizarFaixa(faixa.sensorTipo, 'maximo', Number(e.target.value))}
                                                />
                                            </LinhaConfiguracao>
                                        ))}
                                    </CartaoSecao>
                                )}

                                {calibracaoFluxo && corresponde('Vazao', 'Fluxo', 'Filtro', 'Litros', 'Bomba', 'Calibracao') && (
                                    <CartaoSecao titulo="Calibracao de Vazao (Fluxometro, L/h)">
                                        <p className="hud-tag config-nota">
                                            Valores em LITROS/HORA. "Maxima" e o padrao da bomba instalada (2000 L/h — ajuste se trocar de bomba).
                                            "Troca de Filtro" e o limiar preventivo: a vazao cai aos poucos conforme o filtro entope, entao esse
                                            valor serve pra avisar ANTES de chegar no minimo critico — recalibre com o tempo de uso real (o
                                            historico de vazao ja fica gravado na Central de Relatorios pra ajudar a achar esse ponto).
                                        </p>
                                        <LinhaConfiguracao titulo="Vazao Minima (critica)">
                                            <input
                                                className="hud-input config-input-pequeno"
                                                type="number"
                                                step="1"
                                                value={calibracaoFluxo.vazaoMinimaLh}
                                                onChange={(e) => atualizarCalibracaoFluxo('vazaoMinimaLh', Number(e.target.value))}
                                            />
                                            <span className="hud-tag">L/h</span>
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Vazao de Troca de Filtro (preventivo)">
                                            <input
                                                className="hud-input config-input-pequeno"
                                                type="number"
                                                step="1"
                                                value={calibracaoFluxo.vazaoTrocaFiltroLh}
                                                onChange={(e) => atualizarCalibracaoFluxo('vazaoTrocaFiltroLh', Number(e.target.value))}
                                            />
                                            <span className="hud-tag">L/h</span>
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Vazao Maxima (bomba)">
                                            <input
                                                className="hud-input config-input-pequeno"
                                                type="number"
                                                step="1"
                                                value={calibracaoFluxo.vazaoMaximaLh}
                                                onChange={(e) => atualizarCalibracaoFluxo('vazaoMaximaLh', Number(e.target.value))}
                                            />
                                            <span className="hud-tag">L/h</span>
                                        </LinhaConfiguracao>
                                    </CartaoSecao>
                                )}

                                {corresponde('Mapeamento de Pinos', 'GPIO', 'Portas') && (
                                    <CartaoSecao titulo="Mapeamento de Pinos e Portas (AquaControl_sensor)">
                                        <p className="hud-tag config-nota">
                                            Fixo no firmware — mudar exigiria reflashar o modulo de telemetria. Referencia rapida (ver tambem
                                            01-espc-geral/16_esquema_ligacao_sensores.md):
                                        </p>
                                        <div className="relatorio-tabela">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Sensor</th>
                                                        <th>Pino</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {MAPA_PINOS_SENSORES.map((linha) => (
                                                        <tr key={linha.sensor}>
                                                            <td>{linha.sensor}</td>
                                                            <td className="hud-mono">{linha.pino}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                        <p className="hud-tag config-nota">
                                            Pra renomear sensores (nome geral ou nome-so-pro-Display), use "Editar Controlador" no modulo de
                                            telemetria ou o widget "Sensores no Display".
                                        </p>
                                    </CartaoSecao>
                                )}
                            </>
                        )}

                        {categoriaAtiva === 'atuadores' && (
                            <>
                                {corresponde('Mapeamento de Cargas', 'Reles', 'Portas') && (
                                    <CartaoSecao titulo="Mapeamento de Cargas">
                                        <p className="hud-tag config-nota">
                                            Associacao de cada rele ao seu equipamento ja e gerenciada em "Mapear Saidas" (Central do Aquario /
                                            Menu de Acoes) — nao duplicado aqui.
                                        </p>
                                    </CartaoSecao>
                                )}

                                {corresponde('Equipamentos', 'Automacao', 'Aquecedor', 'Resfriador', 'Termostato') && (
                                    <CartaoSecao
                                        titulo="Equipamentos & Automacao (Termostatos)"
                                        acao={
                                            <button className="botao-icone" onClick={abrirNovoEquipamento} aria-label="Novo equipamento" type="button">
                                                <Plus size={16} />
                                            </button>
                                        }
                                    >
                                        {!moduloAtuador && <p className="hud-tag">Cadastre um modulo do tipo "atuador" pra configurar equipamentos.</p>}
                                        {moduloAtuador && equipamentos.length === 0 && (
                                            <p className="hud-tag">
                                                Nenhum equipamento configurado ainda — clique em "+" pra cadastrar um aquecedor/resfriador (pode
                                                cadastrar mesmo antes do equipamento fisico estar instalado).
                                            </p>
                                        )}
                                        {equipamentos.map((equip) => (
                                            <div key={equip.id} className="config-equipamento">
                                                <CampoToggle checked={equip.ativo} onChange={() => alternarAtivoEquipamento(equip)} />
                                                <div className="config-equipamento__texto">
                                                    <span className="config-linha__titulo">
                                                        {equip.nome} <span className="hud-tag">({equip.tipo})</span>
                                                    </span>
                                                    <span className="config-linha__descricao">
                                                        Sensor {equip.sensorId} · liga/desliga entre {equip.tempMin}°C e {equip.tempMax}°C · atraso{' '}
                                                        {equip.atrasoSegundos}s · Porta {String(equip.posicaoIndice + 1).padStart(2, '0')}
                                                    </span>
                                                </div>
                                                <button className="botao-icone" onClick={() => abrirEdicaoEquipamento(equip)} aria-label="Editar" type="button">
                                                    <Pencil size={14} />
                                                </button>
                                                <button className="botao-icone botao-icone--erro" onClick={() => removerEquipamento(equip.id)} aria-label="Remover" type="button">
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        ))}
                                        <p className="hud-tag config-nota">
                                            Regras de interlock/seguranca cruzada e estado padrao de inicializacao (fail-safe) exigiriam suporte
                                            novo no firmware do atuador — nao implementado ainda.
                                        </p>
                                    </CartaoSecao>
                                )}
                            </>
                        )}

                        {categoriaAtiva === 'armazenamento' && (
                            <>
                                {corresponde('Retencao', 'Historico', 'Logs', 'Limpeza') && (
                                    <CartaoSecao titulo="Banco de Dados & Logs">
                                        <LinhaConfiguracao titulo="Retencao de Historico" descricao="Leituras/eventos mais antigos que isso sao apagados automaticamente todo dia.">
                                            <CampoNumero
                                                valor={config.retencao_historico_dias}
                                                onChange={(v) => atualizarConfig('retencao_historico_dias', v)}
                                                unidade="dias"
                                                min={1}
                                            />
                                        </LinhaConfiguracao>
                                    </CartaoSecao>
                                )}

                                {corresponde('Backup', 'Restauracao', 'Exportar', 'Importar', 'JSON') && (
                                    <CartaoSecao titulo="Backup & Restauracao">
                                        <p className="hud-tag config-nota">
                                            Exporta/importa a CONFIGURACAO (modulos, mapeamentos, temas, agendamentos, automacao, faixas
                                            seguras) — nao o historico de telemetria/reles.
                                        </p>
                                        <div className="config-backup__acoes">
                                            <button className="botao-primario" type="button" onClick={exportarBackup}>
                                                <Download size={14} />
                                                Exportar Configuracao (JSON)
                                            </button>
                                            <label className="botao-primario config-backup__importar">
                                                <Upload size={14} />
                                                Importar Configuracao
                                                <input type="file" accept="application/json" onChange={importarBackup} hidden />
                                            </label>
                                        </div>
                                    </CartaoSecao>
                                )}
                            </>
                        )}
                    </div>

                    {sujo && (
                        <div className="config-barra-salvar">
                            <span className="hud-tag">Alteracoes nao salvas</span>
                            <div className="config-barra-salvar__acoes">
                                <button className="botao-icone" type="button" onClick={descartar}>
                                    Descartar
                                </button>
                                <button className="botao-primario" type="button" onClick={salvar} disabled={salvando}>
                                    {salvando ? 'Salvando...' : 'Salvar Alteracoes'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <ModalEquipamentoAutomacao
                aberto={modalEquipamentoAberto}
                onFechar={() => setModalEquipamentoAberto(false)}
                equipamento={equipamentoEditando}
                moduloAtuador={moduloAtuador}
                dadosSensores={dadosSensores}
                onSalvo={aoSalvarEquipamento}
            />
        </ModalHud>
    );
}
