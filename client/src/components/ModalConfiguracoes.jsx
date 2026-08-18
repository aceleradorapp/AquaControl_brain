import { useEffect, useMemo, useState } from 'react';
import {
    Cpu,
    Database,
    Download,
    Lock,
    Monitor,
    Pencil,
    Plus,
    Power,
    RefreshCw,
    RotateCcw,
    Search,
    Send,
    Thermometer,
    Trash2,
    Unlock,
    Upload,
    Wifi,
    X,
} from 'lucide-react';
import ModalHud from './ModalHud';
import ModalEquipamentoAutomacao from './ModalEquipamentoAutomacao';
import PreviewTelaProtecao from './PreviewTelaProtecao';
import { CampoNumero, CampoSelect, CampoToggle, CartaoSecao, LinhaConfiguracao } from './CamposConfiguracao';
import { CHAVE_TOKEN_MASTER } from '../App';

// Sincronizar com Servidor — mesmo mecanismo de Exportar/Importar (GET/POST
// /api/configuracoes/backup|restaurar), so que direto de maquina pra maquina em vez de
// arquivo: busca o backup LOCAL, recorta so as tabelas do(s) grupo(s) escolhido(s), e manda
// pro IP digitado (CORS ja aberto no backend, ver server.js). "admin" fica de fora do botao
// "Enviar Tudo" por padrao seria arriscado demais silencioso — mas o usuario pediu que
// aparecesse como bloco individual mesmo assim, com aviso proprio (ver GRUPOS_SINCRONIZACAO).
const CHAVE_LOCALSTORAGE_SYNC_IP = 'aquacontrol_sync_ip';
const CHAVE_LOCALSTORAGE_SYNC_PORTA = 'aquacontrol_sync_porta';

const GRUPOS_SINCRONIZACAO = [
    { chave: 'fauna', rotulo: 'Gestao de Fauna', tabelas: ['fauna'] },
    { chave: 'modulos', rotulo: 'Modulos & Mapeamento de Portas', tabelas: ['modulos', 'portas_mapeamento'] },
    { chave: 'temas', rotulo: 'Temas', tabelas: ['temas', 'temas_reles'] },
    { chave: 'agendamentos', rotulo: 'Agendamentos', tabelas: ['agendamentos', 'agendamentos_horarios'] },
    { chave: 'sensores', rotulo: 'Sensores Personalizados', tabelas: ['sensores_personalizados', 'config_display_sensores'] },
    { chave: 'display', rotulo: 'Configuracao do Display', tabelas: ['config_display'] },
    {
        chave: 'configuracoes',
        rotulo: 'Configuracoes Gerais & Calibracoes',
        tabelas: ['configuracoes_gerais', 'faixas_seguras', 'calibracao_fluxo', 'equipamentos_automacao'],
    },
    { chave: 'qrcodes', rotulo: 'QR Codes', tabelas: ['qrcodes'] },
    { chave: 'admin', rotulo: 'Conta de Admin (login)', tabelas: ['admin_conta'], perigoso: true },
];

// Self-Update do sistema (git pull + npm install + build + pm2 restart) exige o token JWT no
// header Authorization, mesma guarda de /api/fauna (ver ModalGestaoFauna.jsx) — a rota
// /api/sistema/atualizar e a PRIMEIRA fora de Fauna a exigir isso de verdade.
function cabecalhoAuth() {
    const token = localStorage.getItem(CHAVE_TOKEN_MASTER);
    return token ? { Authorization: `Bearer ${token}` } : {};
}

const CATEGORIAS = [
    { chave: 'sistema', rotulo: 'Sistema & Plataforma', icone: Monitor },
    { chave: 'modulos', rotulo: 'Modulos Hardware & Conectividade', icone: Cpu },
    { chave: 'sensores', rotulo: 'Sensores & Telemetria', icone: Thermometer },
    { chave: 'atuadores', rotulo: 'Atuadores & Controle', icone: Power },
    { chave: 'armazenamento', rotulo: 'Armazenamento e Integracao', icone: Database },
    { chave: 'sincronizacao', rotulo: 'Sincronizar com Servidor', icone: Send },
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
    alerta_nivel: 'Alerta de Transbordamento (%) — acima deste valor dispara "Valor Fora do Limite"',
};

const MAPA_PINOS_SENSORES = [
    { sensor: 'DS18B20 (Temp. Agua x3)', pino: 'GPIO 18 (barramento OneWire)' },
    { sensor: 'DHT11 (Temp./Umidade Ar)', pino: 'GPIO 19' },
    { sensor: 'YF-S201 (Fluxo)', pino: 'GPIO 23' },
    { sensor: 'pH (analogico)', pino: 'GPIO 34 (ADC, so leitura)' },
    { sensor: 'Nivel de Agua (ultrassom, TRIG, 39-espc)', pino: 'GPIO 21' },
    { sensor: 'Nivel de Agua (ultrassom, ECHO, 39-espc)', pino: 'GPIO 22' },
    { sensor: 'Alerta de Nivel (sensor de contato, 3 zonas, 38-espc)', pino: 'GPIO 36 (ADC1/VP, so leitura)' },
    { sensor: 'Deteccao de Vazamento (analogico, 27-espc)', pino: 'GPIO 39 (ADC1/VN, so leitura)' },
    { sensor: 'YF-S201 (Fluxo 2, 27-espc)', pino: 'GPIO 35 (so leitura)' },
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
    onDesparear,
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

    // Protecao de Tela do Display (Matrix Core Mode: tempo + cor) — tabela/endpoint PROPRIOS
    // (GET/PUT /api/config-display), separados do "config" geral acima. Tem seu proprio botao
    // "Enviar ao Display" (persiste no Brain E empurra ao vivo pro ESP32 numa unica acao), fora
    // da barra de salvar generica — mesmo espirito de "persistencia imediata" ja usado por
    // Equipamentos & Automacao.
    const [configDisplay, setConfigDisplay] = useState(null);
    const [enviandoProtecao, setEnviandoProtecao] = useState(false);

    const [modalEquipamentoAberto, setModalEquipamentoAberto] = useState(false);
    const [equipamentoEditando, setEquipamentoEditando] = useState(null);

    // Seguranca e Dispositivos (33-espc) — "authConfig" so tem "bloquearCadastro" (a Master
    // Key em si nunca volta do backend, ver GET /api/auth/configuracoes — so da pra
    // SOBRESCREVER as cegas). "novaMasterKey" e um campo write-only proprio, separado do
    // resto do rascunho "config" desta tela — muda com seu proprio botao "Alterar", nao com o
    // "Salvar Alteracoes" generico (nao faz sentido a Master Key mudar sem uma acao explicita
    // dedicada, ao contrario de um numero de configuracao qualquer).
    const [commitsPendentes, setCommitsPendentes] = useState(null);
    const [verificandoVersao, setVerificandoVersao] = useState(false);
    const [atualizando, setAtualizando] = useState(false);
    const [mensagemAtualizacao, setMensagemAtualizacao] = useState('');
    const [erroAtualizacao, setErroAtualizacao] = useState('');

    const [ipSincronizacao, setIpSincronizacao] = useState(() => localStorage.getItem(CHAVE_LOCALSTORAGE_SYNC_IP) ?? '');
    const [portaSincronizacao, setPortaSincronizacao] = useState(() => localStorage.getItem(CHAVE_LOCALSTORAGE_SYNC_PORTA) ?? '5000');
    const [testandoConexaoSync, setTestandoConexaoSync] = useState(false);
    const [statusConexaoSync, setStatusConexaoSync] = useState(null);
    const [enviandoSync, setEnviandoSync] = useState(false);
    const [confirmacaoSync, setConfirmacaoSync] = useState(null);

    const [authConfig, setAuthConfig] = useState({ bloquearCadastro: false });
    const [novaMasterKey, setNovaMasterKey] = useState('');
    const [salvandoMasterKey, setSalvandoMasterKey] = useState(false);

    // Usuarios Administradores (34-espc) — lista/criar/editar/bloquear/excluir. "adminUsuarios"
    // nunca tem senha_hash nenhum (o backend ja filtra, ver authService.js:listarAdmins).
    // Edicao inline por linha (usuarioEditandoId aponta qual linha esta em modo de edicao, so
    // uma por vez) — nao precisa de uma modal separada pra so 2 campos (nome/senha nova).
    const [adminUsuarios, setAdminUsuarios] = useState([]);
    const [formNovoUsuarioAberto, setFormNovoUsuarioAberto] = useState(false);
    const [novoUsuarioNome, setNovoUsuarioNome] = useState('');
    const [novoUsuarioSenha, setNovoUsuarioSenha] = useState('');
    const [novoUsuarioConfirmar, setNovoUsuarioConfirmar] = useState('');
    const [erroNovoUsuario, setErroNovoUsuario] = useState('');
    const [salvandoNovoUsuario, setSalvandoNovoUsuario] = useState(false);
    const [usuarioEditandoId, setUsuarioEditandoId] = useState(null);
    const [usuarioEditandoNome, setUsuarioEditandoNome] = useState('');
    const [usuarioEditandoSenha, setUsuarioEditandoSenha] = useState('');
    const [erroEdicaoUsuario, setErroEdicaoUsuario] = useState('');

    const moduloAtuador = modulos.find((m) => m.tipo === 'atuador') ?? null;
    const moduloTelemetria = modulos.find((m) => m.tipo === 'telemetria') ?? null;
    const moduloDisplay = modulos.find((m) => m.tipo === 'display') ?? null;

    useEffect(() => {
        if (!aberto) return;
        setCarregando(true);
        Promise.all([
            fetch('/api/configuracoes').then((r) => r.json()),
            fetch('/api/configuracoes/faixas-seguras').then((r) => r.json()),
            fetch('/api/configuracoes/calibracao-fluxo').then((r) => r.json()),
            fetch('/api/configuracoes/equipamentos').then((r) => r.json()),
            fetch('/api/config-display').then((r) => r.json()),
            fetch('/api/auth/configuracoes').then((r) => r.json()),
            fetch('/api/auth/usuarios').then((r) => r.json()),
        ]).then(([dadosConfig, dadosFaixas, dadosCalibracaoFluxo, dadosEquipamentos, dadosConfigDisplay, dadosAuth, dadosUsuarios]) => {
            setConfig(dadosConfig);
            setConfigOriginal(dadosConfig);
            setFaixas(dadosFaixas);
            setFaixasOriginal(dadosFaixas);
            setCalibracaoFluxo(dadosCalibracaoFluxo);
            setCalibracaoFluxoOriginal(dadosCalibracaoFluxo);
            setEquipamentos(dadosEquipamentos);
            setConfigDisplay(dadosConfigDisplay);
            setAuthConfig(dadosAuth);
            setAdminUsuarios(dadosUsuarios);
            setCarregando(false);
        });
    }, [aberto]);

    function recarregarUsuarios() {
        fetch('/api/auth/usuarios')
            .then((r) => r.json())
            .then(setAdminUsuarios)
            .catch(() => {});
    }

    async function criarNovoUsuario() {
        setErroNovoUsuario('');
        if (novoUsuarioSenha !== novoUsuarioConfirmar) {
            setErroNovoUsuario('As senhas nao coincidem.');
            return;
        }
        setSalvandoNovoUsuario(true);
        try {
            const resposta = await fetch('/api/auth/usuarios', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario: novoUsuarioNome.trim(), senha: novoUsuarioSenha }),
            });
            const dados = await resposta.json();
            if (!resposta.ok) {
                setErroNovoUsuario(dados.erro ?? 'Falha ao criar usuario.');
                return;
            }
            registrarLog?.(`Usuario administrador "${dados.usuario}" criado.`, 'sucesso');
            setNovoUsuarioNome('');
            setNovoUsuarioSenha('');
            setNovoUsuarioConfirmar('');
            setFormNovoUsuarioAberto(false);
            recarregarUsuarios();
        } catch {
            setErroNovoUsuario('Falha de comunicacao com o servidor.');
        } finally {
            setSalvandoNovoUsuario(false);
        }
    }

    function iniciarEdicaoUsuario(usuarioLinha) {
        setUsuarioEditandoId(usuarioLinha.id);
        setUsuarioEditandoNome(usuarioLinha.usuario);
        setUsuarioEditandoSenha('');
        setErroEdicaoUsuario('');
    }

    function cancelarEdicaoUsuario() {
        setUsuarioEditandoId(null);
        setErroEdicaoUsuario('');
    }

    async function salvarEdicaoUsuario(id) {
        setErroEdicaoUsuario('');
        if (usuarioEditandoSenha && usuarioEditandoSenha.length < 4) {
            setErroEdicaoUsuario('Senha deve ter no minimo 4 caracteres.');
            return;
        }
        try {
            const corpo = { usuario: usuarioEditandoNome.trim() };
            if (usuarioEditandoSenha) corpo.senha = usuarioEditandoSenha;
            const resposta = await fetch(`/api/auth/usuarios/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corpo),
            });
            const dados = await resposta.json();
            if (!resposta.ok) {
                setErroEdicaoUsuario(dados.erro ?? 'Falha ao salvar.');
                return;
            }
            registrarLog?.(`Usuario administrador "${dados.usuario}" editado.`, 'alerta');
            setUsuarioEditandoId(null);
            recarregarUsuarios();
        } catch {
            setErroEdicaoUsuario('Falha de comunicacao com o servidor.');
        }
    }

    async function alternarBloqueioUsuario(usuarioLinha) {
        try {
            const resposta = await fetch(`/api/auth/usuarios/${usuarioLinha.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bloqueado: !usuarioLinha.bloqueado }),
            });
            const dados = await resposta.json();
            if (!resposta.ok) {
                registrarLog?.(dados.erro ?? 'Falha ao alterar o bloqueio.', 'erro');
                return;
            }
            registrarLog?.(`Usuario "${usuarioLinha.usuario}" ${dados.bloqueado ? 'bloqueado' : 'desbloqueado'}.`, 'alerta');
            recarregarUsuarios();
        } catch {
            registrarLog?.('Falha de comunicacao com o servidor.', 'erro');
        }
    }

    async function excluirUsuarioAdmin(usuarioLinha) {
        if (!window.confirm(`Excluir o usuario "${usuarioLinha.usuario}"? Essa acao nao pode ser desfeita.`)) return;
        try {
            const resposta = await fetch(`/api/auth/usuarios/${usuarioLinha.id}`, { method: 'DELETE' });
            const dados = await resposta.json();
            if (!resposta.ok) {
                registrarLog?.(dados.erro ?? 'Falha ao excluir o usuario.', 'erro');
                return;
            }
            registrarLog?.(`Usuario administrador "${usuarioLinha.usuario}" excluido.`, 'alerta');
            recarregarUsuarios();
        } catch {
            registrarLog?.('Falha de comunicacao com o servidor.', 'erro');
        }
    }

    // Bloquear Cadastro (33-espc) — persiste IMEDIATAMENTE ao alternar (mesmo espirito de
    // "Enviar ao Display" acima: um toggle de seguranca nao deveria depender de lembrar de
    // clicar "Salvar Alteracoes" no rodape pra valer de verdade).
    async function alternarBloquearCadastro(novoValor) {
        setAuthConfig((atual) => ({ ...atual, bloquearCadastro: novoValor }));
        try {
            const resposta = await fetch('/api/auth/configuracoes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bloquearCadastro: novoValor }),
            });
            const dados = await resposta.json();
            setAuthConfig(dados);
            registrarLog?.(`Bloquear Cadastro ${novoValor ? 'ativado' : 'desativado'}.`, 'alerta');
        } catch {
            setAuthConfig((atual) => ({ ...atual, bloquearCadastro: !novoValor })); // desfaz o otimista
            registrarLog?.('Falha ao salvar Bloquear Cadastro.', 'erro');
        }
    }

    async function alterarMasterKey() {
        if (!novaMasterKey.trim()) return;
        setSalvandoMasterKey(true);
        try {
            await fetch('/api/auth/configuracoes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ masterKey: novaMasterKey.trim() }),
            });
            registrarLog?.('Master Key do atalho Ctrl+F12 alterada.', 'alerta');
            setNovaMasterKey('');
        } catch {
            registrarLog?.('Falha ao alterar a Master Key.', 'erro');
        } finally {
            setSalvandoMasterKey(false);
        }
    }

    function confirmarDesparear() {
        if (window.confirm('Desparear este dispositivo? Voce vai precisar entrar novamente (usuario e senha) pra acessar o Dashboard neste navegador.')) {
            onDesparear?.();
        }
    }

    // Salva no Brain (PUT /api/config-display) E, se houver um modulo "display" cadastrado,
    // empurra ao vivo pro ESP32 (POST /api/modulos/:id/config-protecao) — as duas coisas numa
    // unica acao, ja que nao faz sentido persistir sem enviar (o Display so buscaria isso de
    // novo no proximo boot) nem enviar sem persistir (se perderia no proximo reboot do Display).
    async function enviarConfigProtecao() {
        setEnviandoProtecao(true);
        try {
            const respostaSalvar = await fetch('/api/config-display', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(configDisplay),
            });
            const dadosSalvos = await respostaSalvar.json();
            setConfigDisplay(dadosSalvos);

            if (!moduloDisplay) {
                registrarLog?.('Protecao de tela salva no Brain — nenhum modulo "display" cadastrado pra enviar ao vivo agora.', 'alerta');
                return;
            }

            const respostaEnvio = await fetch(`/api/modulos/${moduloDisplay.id}/config-protecao`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tempoEsperaSegundos: Number(dadosSalvos.tempo_espera_protecao_segundos),
                    corHex: dadosSalvos.cor_protecao_hex,
                }),
            });
            const dadosEnvio = await respostaEnvio.json();
            if (dadosEnvio.disponivel) {
                registrarLog?.('Protecao de tela enviada ao Display com sucesso.', 'sucesso');
            } else {
                registrarLog?.(`Salva no Brain, mas nao foi possivel enviar ao Display agora: ${dadosEnvio.motivo}`, 'alerta');
            }
        } catch (erro) {
            registrarLog?.(erro.message || 'Falha ao enviar a protecao de tela.', 'erro');
        } finally {
            setEnviandoProtecao(false);
        }
    }

    // Calibracao ao vivo do sensor de contato (38-espc, renomeado de "nivel de agua"; 40-espc:
    // virou um alarme de TRANSBORDAMENTO, nao mais de nivel baixo — ver WidgetAlertaNivel.jsx):
    // mostra o ADC bruto atual + o minimo/maximo que o firmware ja registra sozinho, reaproveita
    // o MESMO "dadosSensores" que ja chega por prop (poll de 5s do Dashboard, sem fetch proprio
    // aqui). Os campos abaixo SALVAM de verdade no ESP32 (NVS, POST /api/alerta-nivel/calibracao)
    // — nao precisa reflashar pra reajustar.
    const [resetandoRegistroAlertaNivel, setResetandoRegistroAlertaNivel] = useState(false);
    const [calibracaoAlertaNivelForm, setCalibracaoAlertaNivelForm] = useState(null);
    const [salvandoCalibracaoAlertaNivel, setSalvandoCalibracaoAlertaNivel] = useState(false);
    const sensorAlertaNivel = dadosSensores?.disponivel ? dadosSensores.sensores.find((s) => s.id === 'alerta_nivel') : null;

    // So preenche o formulario UMA VEZ com o que o ESP tem salvo (nao a cada poll de 5s —
    // senao sobrescreveria o que o usuario esta digitando antes de clicar em "Salvar").
    useEffect(() => {
        if (calibracaoAlertaNivelForm === null && sensorAlertaNivel) {
            setCalibracaoAlertaNivelForm({
                ideal: sensorAlertaNivel.ideal_adc !== undefined ? String(sensorAlertaNivel.ideal_adc) : '',
                baixo: sensorAlertaNivel.baixo_adc !== undefined ? String(sensorAlertaNivel.baixo_adc) : '',
            });
        }
    }, [sensorAlertaNivel, calibracaoAlertaNivelForm]);

    function atualizarCalibracaoAlertaNivelForm(campo, valor) {
        setCalibracaoAlertaNivelForm((atual) => ({ ...(atual ?? { ideal: '', baixo: '' }), [campo]: valor }));
    }

    async function resetarRegistroAlertaNivel() {
        if (!moduloTelemetria) return;
        setResetandoRegistroAlertaNivel(true);
        try {
            const resposta = await fetch(`/api/modulos/${moduloTelemetria.id}/alerta-nivel/resetar-calibracao`, { method: 'POST' });
            const dados = await resposta.json();
            if (dados.disponivel) {
                registrarLog?.('Registro de minimo/maximo do Alerta de Nivel resetado.', 'sucesso');
            } else {
                registrarLog?.(`Nao foi possivel resetar agora: ${dados.motivo}`, 'alerta');
            }
        } catch (erro) {
            registrarLog?.(erro.message || 'Falha ao resetar o registro do Alerta de Nivel.', 'erro');
        } finally {
            setResetandoRegistroAlertaNivel(false);
        }
    }

    async function salvarCalibracaoAlertaNivel() {
        if (!moduloTelemetria || !calibracaoAlertaNivelForm) return;
        const ideal = Number(calibracaoAlertaNivelForm.ideal);
        const baixo = Number(calibracaoAlertaNivelForm.baixo);
        if (!Number.isFinite(ideal) || !Number.isFinite(baixo) || ideal <= baixo) {
            registrarLog?.('Calibracao invalida: "IDEAL" precisa ser um numero maior que "BAIXO".', 'erro');
            return;
        }
        setSalvandoCalibracaoAlertaNivel(true);
        try {
            const resposta = await fetch(`/api/modulos/${moduloTelemetria.id}/alerta-nivel/calibracao`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ideal, baixo }),
            });
            const dados = await resposta.json();
            if (dados.disponivel) {
                registrarLog?.(`Calibracao do Alerta de Nivel atualizada no ESP32 (ideal=${ideal}, baixo=${baixo}).`, 'sucesso');
            } else {
                registrarLog?.(`Nao foi possivel salvar agora: ${dados.motivo}`, 'alerta');
            }
        } catch (erro) {
            registrarLog?.(erro.message || 'Falha ao salvar a calibracao do Alerta de Nivel.', 'erro');
        } finally {
            setSalvandoCalibracaoAlertaNivel(false);
        }
    }

    // Calibracao do Nivel por Ultrassom (39-espc): as 4 dimensoes (largura/comprimento/altura/
    // offset) sao parte do "config" generico (configuracoesGeraisController.js PADRAO), editam e
    // salvam pelo botao "Salvar Alteracoes" comum — igual o offset de temperatura acima. So o
    // botao "Calibrar Nivel Maximo (Zerar)" e uma acao PROPRIA que persiste na hora (nao espera
    // o "Salvar" generico), porque ele le a DISTANCIA AO VIVO do sensor — nao e algo que o
    // usuario digita, e um valor capturado do sensor real no momento do clique.
    const [calibrandoOffsetUltrassom, setCalibrandoOffsetUltrassom] = useState(false);
    const sensorNivelUltrassom = dadosSensores?.disponivel ? dadosSensores.sensores.find((s) => s.id === 'nivel_agua') : null;

    async function calibrarOffsetUltrassom() {
        setCalibrandoOffsetUltrassom(true);
        try {
            const resposta = await fetch('/api/configuracoes/calibrar-nivel-ultrassom', { method: 'POST' });
            const dados = await resposta.json();
            if (!resposta.ok) {
                registrarLog?.(dados.erro ?? 'Falha ao calibrar o nivel maximo.', 'erro');
                return;
            }
            const offsetString = String(dados.distanciaOffsetCm);
            setConfig((atual) => ({ ...atual, aquario_distancia_offset_cm: offsetString }));
            setConfigOriginal((atual) => ({ ...atual, aquario_distancia_offset_cm: offsetString }));
            registrarLog?.(`Nivel maximo calibrado: offset = ${offsetString} cm.`, 'sucesso');
        } catch (erro) {
            registrarLog?.(erro.message || 'Falha ao calibrar o nivel maximo.', 'erro');
        } finally {
            setCalibrandoOffsetUltrassom(false);
        }
    }

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
            'Restaurar um backup SUBSTITUI toda a configuracao atual (modulos, mapeamentos, temas, agendamentos, automacao, contas de admin, Gestao de Fauna, etc.) pelo conteudo do arquivo. Contas de admin atuais serao trocadas pelas do backup. Esta acao nao pode ser desfeita. Continuar?'
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

    async function verificarAtualizacoes() {
        setVerificandoVersao(true);
        setErroAtualizacao('');
        try {
            const resposta = await fetch('/api/sistema/versao-status', { headers: cabecalhoAuth() });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? 'Falha ao verificar atualizacoes.');
            setCommitsPendentes(dados.commitsPendentes);
        } catch (erro) {
            setErroAtualizacao(erro.message);
        } finally {
            setVerificandoVersao(false);
        }
    }

    // Faz polling do status ate dar "sucesso"/"erro" — o servidor reinicia (pm2 restart) no
    // meio do caminho, entao alguns ciclos vao falhar com erro de rede (conexao recusada); isso
    // e esperado, so continuamos tentando ate o timeout de seguranca.
    function acompanharAtualizacao() {
        const inicioEm = Date.now();
        const TIMEOUT_MS = 6 * 60 * 1000;

        const intervalo = setInterval(async () => {
            if (Date.now() - inicioEm > TIMEOUT_MS) {
                clearInterval(intervalo);
                setErroAtualizacao('Tempo limite esperando a atualizacao terminar — verifique o servidor manualmente.');
                setAtualizando(false);
                return;
            }

            try {
                const resposta = await fetch('/api/sistema/atualizar/status', { headers: cabecalhoAuth() });
                if (!resposta.ok) return; // servidor reiniciando (pm2 restart) — tenta de novo no proximo ciclo
                const dados = await resposta.json();

                if (dados.status === 'sucesso') {
                    clearInterval(intervalo);
                    setMensagemAtualizacao(`Atualizacao concluida (commit ${dados.commit}). Recarregando a pagina...`);
                    setTimeout(() => window.location.reload(), 4000);
                } else if (dados.status === 'erro') {
                    clearInterval(intervalo);
                    setErroAtualizacao(`Falha na atualizacao: ${dados.mensagem}`);
                    setAtualizando(false);
                }
                // 'em_andamento' — continua fazendo polling.
            } catch {
                // conexao recusada durante o restart do pm2 — normal, so tenta de novo.
            }
        }, 3000);
    }

    async function dispararAtualizacaoSistema() {
        const confirmado = window.confirm(
            'Isso vai baixar a versao mais recente do repositorio, reinstalar dependencias, recompilar o painel e reiniciar o servidor (pm2). O sistema fica indisponivel por cerca de 1 minuto. Continuar?'
        );
        if (!confirmado) return;

        setErroAtualizacao('');
        setAtualizando(true);
        setMensagemAtualizacao('Atualizando sistema, baixando arquivos e recompilando... isso pode levar cerca de 1 minuto.');

        try {
            const resposta = await fetch('/api/sistema/atualizar', { method: 'POST', headers: cabecalhoAuth() });
            const dados = await resposta.json();
            if (resposta.status === 409) {
                setErroAtualizacao(dados.erro ?? 'Ja existe uma atualizacao em andamento.');
                setAtualizando(false);
                return;
            }
            if (!resposta.ok) throw new Error(dados.erro ?? 'Falha ao iniciar a atualizacao.');
            registrarLog?.('Atualizacao do sistema iniciada.', 'alerta');
            acompanharAtualizacao();
        } catch (erro) {
            setErroAtualizacao(erro.message);
            setAtualizando(false);
        }
    }

    function urlSincronizacao(caminho) {
        return `http://${ipSincronizacao.trim()}:${portaSincronizacao.trim() || '5000'}${caminho}`;
    }

    function salvarDestinoSincronizacao(ip, porta) {
        setIpSincronizacao(ip);
        setPortaSincronizacao(porta);
        localStorage.setItem(CHAVE_LOCALSTORAGE_SYNC_IP, ip);
        localStorage.setItem(CHAVE_LOCALSTORAGE_SYNC_PORTA, porta);
    }

    async function testarConexaoSincronizacao() {
        setTestandoConexaoSync(true);
        setStatusConexaoSync(null);
        try {
            const resposta = await fetch(urlSincronizacao('/api/auth/status'), { signal: AbortSignal.timeout(5000) });
            if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
            const dados = await resposta.json();
            setStatusConexaoSync({
                ok: true,
                mensagem: dados.existeAdmin ? 'Servidor encontrado — tem conta de admin configurada.' : 'Servidor encontrado — sem conta de admin ainda.',
            });
        } catch (erro) {
            setStatusConexaoSync({ ok: false, mensagem: `Nao foi possivel conectar: ${erro.message}` });
        } finally {
            setTestandoConexaoSync(false);
        }
    }

    // Busca o backup LOCAL (ja existe, ver exportarBackup acima), recorta so as tabelas do(s)
    // grupo(s) escolhido(s) e monta o resumo pra tela de confirmacao — nada e enviado ainda.
    async function prepararEnvioSincronizacao(chaveGrupoOuTudo) {
        try {
            const backupCompleto = await fetch('/api/configuracoes/backup').then((r) => r.json());
            const grupos = chaveGrupoOuTudo === 'tudo' ? GRUPOS_SINCRONIZACAO : GRUPOS_SINCRONIZACAO.filter((g) => g.chave === chaveGrupoOuTudo);

            const tabelasParaEnviar = {};
            const resumo = grupos.map((grupo) => {
                let total = 0;
                for (const tabela of grupo.tabelas) {
                    const linhas = backupCompleto.tabelas[tabela] ?? [];
                    tabelasParaEnviar[tabela] = linhas;
                    total += linhas.length;
                }
                return { rotulo: grupo.rotulo, total, perigoso: grupo.perigoso };
            });

            setConfirmacaoSync({ grupos, tabelas: tabelasParaEnviar, resumo });
        } catch (erro) {
            registrarLog?.(`Falha ao preparar sincronizacao: ${erro.message}`, 'erro');
        }
    }

    async function confirmarEnvioSincronizacao() {
        if (!confirmacaoSync) return;
        const { tabelas, resumo } = confirmacaoSync;
        const destino = `${ipSincronizacao}:${portaSincronizacao}`;

        setEnviandoSync(true);
        try {
            const resposta = await fetch(urlSincronizacao('/api/configuracoes/restaurar'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tabelas }),
                signal: AbortSignal.timeout(20000),
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? 'Falha ao enviar.');
            registrarLog?.(`Enviado para ${destino}: ${resumo.map((r) => r.rotulo).join(', ')}.`, 'sucesso');
        } catch (erro) {
            registrarLog?.(`Falha ao sincronizar com ${destino}: ${erro.message}`, 'erro');
        } finally {
            setEnviandoSync(false);
            setConfirmacaoSync(null);
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

                                {corresponde('Usuario', 'Seguranca', 'Senha', 'Dispositivo', 'Master Key', 'Visitante') && (
                                    <CartaoSecao titulo="Seguranca e Dispositivos">
                                        <p className="hud-tag config-nota">
                                            Pareamento Silencioso de Dispositivo (33-espc): o token permanente fica so no navegador
                                            (localStorage) — isto aqui controla a Pagina de Visitante e o atalho secreto, NAO bloqueia
                                            as rotas da API (uso interno de rede local, sem exposicao a internet).
                                        </p>

                                        <LinhaConfiguracao
                                            titulo="Bloquear Cadastro"
                                            descricao='Oculta o botao "[Acesso Administrativo]" na Pagina de Visitante — o atalho Ctrl+F12 continua funcionando.'
                                        >
                                            <CampoToggle checked={!!authConfig.bloquearCadastro} onChange={alternarBloquearCadastro} />
                                        </LinhaConfiguracao>

                                        <LinhaConfiguracao titulo="Master Key do Atalho (Ctrl+F12)" descricao="Padrao inicial: 718848. Nunca e exibida depois de trocada.">
                                            <div className="config-campo-numero">
                                                <input
                                                    className="hud-input"
                                                    type="text"
                                                    placeholder="Nova Master Key"
                                                    value={novaMasterKey}
                                                    onChange={(e) => setNovaMasterKey(e.target.value)}
                                                />
                                                <button
                                                    className="botao-primario"
                                                    type="button"
                                                    onClick={alterarMasterKey}
                                                    disabled={salvandoMasterKey || !novaMasterKey.trim()}
                                                >
                                                    {salvandoMasterKey ? 'Salvando...' : 'Alterar'}
                                                </button>
                                            </div>
                                        </LinhaConfiguracao>

                                        <LinhaConfiguracao
                                            titulo="Dispositivo Atual"
                                            descricao="Remove o token deste navegador e encerra a sessao Master aqui."
                                        >
                                            <button className="botao-primario config-botao-perigo" type="button" onClick={confirmarDesparear}>
                                                Desparear Este Dispositivo
                                            </button>
                                        </LinhaConfiguracao>
                                    </CartaoSecao>
                                )}

                                {corresponde('Usuario', 'Administrador', 'Conta', 'Bloquear', 'Excluir') && (
                                    <CartaoSecao
                                        titulo="Usuarios Administradores"
                                        acao={
                                            <button
                                                className="botao-icone"
                                                type="button"
                                                aria-label="Adicionar usuario"
                                                onClick={() => {
                                                    setErroNovoUsuario('');
                                                    setFormNovoUsuarioAberto((v) => !v);
                                                }}
                                            >
                                                {formNovoUsuarioAberto ? <X size={16} /> : <Plus size={16} />}
                                            </button>
                                        }
                                    >
                                        {formNovoUsuarioAberto && (
                                            <div className="config-novo-usuario">
                                                <input
                                                    className="hud-input"
                                                    type="text"
                                                    placeholder="Usuario"
                                                    value={novoUsuarioNome}
                                                    onChange={(e) => setNovoUsuarioNome(e.target.value)}
                                                />
                                                <input
                                                    className="hud-input"
                                                    type="password"
                                                    placeholder="Senha"
                                                    value={novoUsuarioSenha}
                                                    onChange={(e) => setNovoUsuarioSenha(e.target.value)}
                                                />
                                                <input
                                                    className="hud-input"
                                                    type="password"
                                                    placeholder="Confirmar Senha"
                                                    value={novoUsuarioConfirmar}
                                                    onChange={(e) => setNovoUsuarioConfirmar(e.target.value)}
                                                />
                                                {erroNovoUsuario && <p className="mensagem-erro hud-tag">{erroNovoUsuario}</p>}
                                                <button
                                                    className="botao-primario"
                                                    type="button"
                                                    disabled={salvandoNovoUsuario || !novoUsuarioNome.trim() || !novoUsuarioSenha}
                                                    onClick={criarNovoUsuario}
                                                >
                                                    {salvandoNovoUsuario ? 'Criando...' : 'Criar Usuario'}
                                                </button>
                                            </div>
                                        )}

                                        {adminUsuarios.length === 0 && <p className="hud-tag">Nenhum usuario cadastrado.</p>}

                                        {adminUsuarios.map((usuarioLinha) =>
                                            usuarioEditandoId === usuarioLinha.id ? (
                                                <div key={usuarioLinha.id} className="config-novo-usuario">
                                                    <input
                                                        className="hud-input"
                                                        type="text"
                                                        value={usuarioEditandoNome}
                                                        onChange={(e) => setUsuarioEditandoNome(e.target.value)}
                                                    />
                                                    <input
                                                        className="hud-input"
                                                        type="password"
                                                        placeholder="Nova senha (deixe em branco pra manter)"
                                                        value={usuarioEditandoSenha}
                                                        onChange={(e) => setUsuarioEditandoSenha(e.target.value)}
                                                    />
                                                    {erroEdicaoUsuario && <p className="mensagem-erro hud-tag">{erroEdicaoUsuario}</p>}
                                                    <div className="config-linha__campo">
                                                        <button className="botao-primario" type="button" onClick={() => salvarEdicaoUsuario(usuarioLinha.id)}>
                                                            Salvar
                                                        </button>
                                                        <button className="botao-primario" type="button" onClick={cancelarEdicaoUsuario}>
                                                            Cancelar
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <LinhaConfiguracao
                                                    key={usuarioLinha.id}
                                                    titulo={usuarioLinha.usuario}
                                                    descricao={`Criado em ${usuarioLinha.criado_em}${usuarioLinha.bloqueado ? ' — BLOQUEADO' : ''}`}
                                                >
                                                    <button className="botao-icone" type="button" aria-label="Editar" onClick={() => iniciarEdicaoUsuario(usuarioLinha)}>
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button
                                                        className="botao-icone"
                                                        type="button"
                                                        aria-label={usuarioLinha.bloqueado ? 'Desbloquear' : 'Bloquear'}
                                                        onClick={() => alternarBloqueioUsuario(usuarioLinha)}
                                                    >
                                                        {usuarioLinha.bloqueado ? <Unlock size={14} /> : <Lock size={14} />}
                                                    </button>
                                                    <button
                                                        className="botao-icone botao-icone--erro"
                                                        type="button"
                                                        aria-label="Excluir"
                                                        onClick={() => excluirUsuarioAdmin(usuarioLinha)}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </LinhaConfiguracao>
                                            )
                                        )}
                                    </CartaoSecao>
                                )}

                                {corresponde('Atualizacao', 'Update', 'Versao', 'Git Pull', 'Deploy') && (
                                    <CartaoSecao titulo="Atualizacao do Sistema">
                                        <p className="hud-tag config-nota">
                                            Baixa a versao mais recente do repositorio, reinstala dependencias, recompila o painel e reinicia o
                                            servidor (pm2). O sistema fica indisponivel por cerca de 1 minuto durante o processo.
                                        </p>

                                        <div className="config-linha" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                                            <button
                                                type="button"
                                                className="botao-primario"
                                                onClick={verificarAtualizacoes}
                                                disabled={verificandoVersao || atualizando}
                                            >
                                                <RefreshCw size={14} />
                                                {verificandoVersao ? 'Verificando...' : 'Verificar Atualizacoes'}
                                            </button>

                                            <button
                                                type="button"
                                                className="botao-primario"
                                                onClick={dispararAtualizacaoSistema}
                                                disabled={atualizando}
                                            >
                                                <Download size={14} />
                                                {atualizando ? 'Atualizando...' : 'Atualizar Sistema'}
                                            </button>

                                            {commitsPendentes !== null && !atualizando && (
                                                <span className="hud-tag">
                                                    {commitsPendentes === 0
                                                        ? 'Sistema ja esta na versao mais recente.'
                                                        : `${commitsPendentes} commit(s) novo(s) disponivel(is).`}
                                                </span>
                                            )}
                                        </div>

                                        {atualizando && (
                                            <p className="hud-tag config-nota" style={{ marginTop: '0.5rem' }}>
                                                {mensagemAtualizacao}
                                            </p>
                                        )}
                                        {erroAtualizacao && (
                                            <p className="hud-tag config-nota" style={{ marginTop: '0.5rem', color: 'var(--cor-erro)' }}>
                                                {erroAtualizacao}
                                            </p>
                                        )}
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

                                {configDisplay && corresponde('Protecao de Tela', 'Matrix Core Mode', 'Screensaver', 'Descanso', 'Cor') && (
                                    <CartaoSecao titulo="Protecao de Tela do Display (Matrix Core Mode)">
                                        <LinhaConfiguracao
                                            titulo="Tempo de Espera"
                                            descricao="Tempo sem toques no Display antes do protetor de tela entrar."
                                        >
                                            <CampoNumero
                                                valor={configDisplay.tempo_espera_protecao_segundos}
                                                onChange={(v) => setConfigDisplay((atual) => ({ ...atual, tempo_espera_protecao_segundos: v }))}
                                                unidade="s"
                                                min={10}
                                                step={10}
                                            />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Cor da Chuva Digital" descricao="Cor da animacao do protetor de tela do Display.">
                                            <input
                                                type="color"
                                                className="config-seletor-cor"
                                                value={configDisplay.cor_protecao_hex}
                                                onChange={(e) => setConfigDisplay((atual) => ({ ...atual, cor_protecao_hex: e.target.value }))}
                                            />
                                            <span className="hud-tag hud-mono">{configDisplay.cor_protecao_hex}</span>
                                        </LinhaConfiguracao>

                                        <PreviewTelaProtecao corHex={configDisplay.cor_protecao_hex} />

                                        {!moduloDisplay && (
                                            <p className="hud-tag config-nota">
                                                Nenhum modulo do tipo "display" cadastrado ainda — a configuracao vai ficar salva no Brain, mas
                                                so chega no Display quando ele buscar no proximo boot.
                                            </p>
                                        )}

                                        <button className="botao-primario" type="button" onClick={enviarConfigProtecao} disabled={enviandoProtecao}>
                                            {enviandoProtecao ? 'Enviando...' : 'Enviar ao Display'}
                                        </button>
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

                                {corresponde('Ajuste Fino', 'Calibracao', 'Temperatura', 'Termometro', 'Offset') && (
                                    <CartaoSecao titulo="Ajuste Fino — Temperatura da Agua">
                                        <p className="hud-tag config-nota">
                                            Some (ou subtrai) este valor de TODOS os sensores de temperatura da agua (temp_agua_1, temp_agua_2,
                                            etc.) antes de qualquer calculo — media em Parametros Vitais, historico, Display e relatorios ja
                                            saem calibrados. Use um termometro de referencia pra medir a diferenca real e ajustar aqui; e o mesmo
                                            offset pra todos os sensores de agua, nao um ajuste por sensor individual.
                                        </p>
                                        <LinhaConfiguracao titulo="Offset de Temperatura da Agua">
                                            <CampoNumero
                                                valor={config.calibracao_temp_agua_offset}
                                                onChange={(v) => atualizarConfig('calibracao_temp_agua_offset', v)}
                                                unidade="°C"
                                                min={-5}
                                                max={5}
                                                step={0.1}
                                            />
                                        </LinhaConfiguracao>
                                    </CartaoSecao>
                                )}

                                {corresponde('Nivel por Ultrassom', 'Aquario', 'Volume', 'Litros', 'Offset', 'Calibracao') && (
                                    <CartaoSecao titulo="Calibracao do Nivel por Ultrassom (Aquario)">
                                        <p className="hud-tag config-nota">
                                            Dimensoes UTEIS da area de agua (nao do vidro/estrutura) — usadas pra converter a distancia que o
                                            sensor ultrassonico le em volume (litros) e porcentagem. "Distancia Offset" e a leitura do sensor com
                                            a agua no nivel maximo desejado — use o botao abaixo pra capturar isso automaticamente em vez de medir
                                            na mao.
                                        </p>

                                        {/* Leitura ao vivo em destaque, ANTES de qualquer campo — pedido explicito do usuario: precisa dar
                                            pra confirmar que o sensor esta respondendo de verdade antes de mexer em qualquer configuracao ou
                                            calibrar. Atualiza sozinha a cada poll (~5s, mesmo "dadosSensores" que o resto do dashboard usa). */}
                                        <div className="config-nivel-ultrassom__leitura-vivo">
                                            <span className="hud-tag">DISTANCIA LIDA AGORA (AO VIVO)</span>
                                            <span
                                                className={`config-nivel-ultrassom__leitura-valor hud-mono ${
                                                    typeof sensorNivelUltrassom?.distancia_cm === 'number' ? '' : 'config-nivel-ultrassom__leitura-valor--vazia'
                                                }`}
                                            >
                                                {typeof sensorNivelUltrassom?.distancia_cm === 'number' ? `${sensorNivelUltrassom.distancia_cm} cm` : '-- cm'}
                                            </span>
                                            {!sensorNivelUltrassom?.conectado && (
                                                <span className="hud-tag config-nivel-ultrassom__leitura-aviso">
                                                    Sensor nao esta respondendo agora — confira a fiacao (VIN/GND/TRIG 21/ECHO 22) antes de calibrar.
                                                </span>
                                            )}
                                        </div>

                                        <LinhaConfiguracao titulo="Largura Util da Agua">
                                            <CampoNumero
                                                valor={config.aquario_largura_cm}
                                                onChange={(v) => atualizarConfig('aquario_largura_cm', v)}
                                                unidade="cm"
                                                min={1}
                                                max={1000}
                                                step={1}
                                            />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Comprimento Util da Agua">
                                            <CampoNumero
                                                valor={config.aquario_comprimento_cm}
                                                onChange={(v) => atualizarConfig('aquario_comprimento_cm', v)}
                                                unidade="cm"
                                                min={1}
                                                max={1000}
                                                step={1}
                                            />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Altura Maxima da Coluna de Agua">
                                            <CampoNumero
                                                valor={config.aquario_altura_max_cm}
                                                onChange={(v) => atualizarConfig('aquario_altura_max_cm', v)}
                                                unidade="cm"
                                                min={1}
                                                max={500}
                                                step={1}
                                            />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao
                                            titulo="Distancia Offset (Zero do Sensor)"
                                            descricao="Leitura do sensor com a agua no nivel maximo — em cm"
                                        >
                                            <CampoNumero
                                                valor={config.aquario_distancia_offset_cm}
                                                onChange={(v) => atualizarConfig('aquario_distancia_offset_cm', v)}
                                                unidade="cm"
                                                min={0}
                                                max={500}
                                                step={0.1}
                                            />
                                        </LinhaConfiguracao>

                                        <div className="config-nivel-ultrassom__acao">
                                            <span className="hud-tag">
                                                Ao calibrar, o valor "distancia lida agora" (acima) vira o novo offset.
                                            </span>
                                            <button
                                                className="botao-primario"
                                                type="button"
                                                onClick={calibrarOffsetUltrassom}
                                                disabled={calibrandoOffsetUltrassom || typeof sensorNivelUltrassom?.distancia_cm !== 'number'}
                                            >
                                                {calibrandoOffsetUltrassom ? 'Calibrando...' : 'Calibrar Nivel Maximo (Zerar)'}
                                            </button>
                                        </div>

                                        <p className="hud-tag config-nota">
                                            Volume maximo calculado com os valores acima:{' '}
                                            <span className="hud-mono">
                                                {(
                                                    (Number(config.aquario_largura_cm) * Number(config.aquario_comprimento_cm) * Number(config.aquario_altura_max_cm)) /
                                                    1000
                                                ).toFixed(0)}{' '}
                                                L
                                            </span>
                                        </p>
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

                                {corresponde('Alerta de Nivel', 'Transbordamento', 'Calibracao', 'ADC', 'Ideal', 'Baixo', 'Reservatorio') && (
                                    <CartaoSecao titulo="Calibracao ao Vivo — Alarme de Transbordamento (Sensor de Contato, GPIO 36)">
                                        <p className="hud-tag config-nota">
                                            40-espc: este sensor de contato deixou de ser o alerta principal de nivel (isso agora e o "Nivel de
                                            Agua" via ultrassom, mais preciso) e virou um alarme de TRANSBORDAMENTO — dispara quando a agua chega
                                            perto/passa do ponto "Limite Maximo" abaixo. Mova o sensor fisico entre o ponto de limite maximo e um
                                            ponto mais baixo, deixe alguns segundos em cada, e anote os dois valores de ADC bruto. Os campos abaixo
                                            SALVAM de verdade no ESP32 (memoria NVS) e aplicam na hora — nao precisa reflashar pra reajustar.
                                        </p>

                                        {!moduloTelemetria && (
                                            <p className="hud-tag">Cadastre um modulo do tipo "telemetria" pra acompanhar a calibracao.</p>
                                        )}

                                        {moduloTelemetria && !sensorAlertaNivel && (
                                            <p className="hud-tag">
                                                Sensor "alerta_nivel" ainda nao apareceu na ultima leitura do modulo — confira se o modulo esta
                                                online e se o firmware ja tem esse sensor (38-espc).
                                            </p>
                                        )}

                                        {sensorAlertaNivel && (
                                            <>
                                                <LinhaConfiguracao titulo="Estado Agora">
                                                    <span className="hud-mono">{sensorAlertaNivel.estado ?? '--'}</span>
                                                </LinhaConfiguracao>
                                                <LinhaConfiguracao titulo="ADC Bruto Agora">
                                                    <span className="hud-mono">{sensorAlertaNivel.adc_bruto?.toFixed(1) ?? '--'}</span>
                                                </LinhaConfiguracao>
                                                <LinhaConfiguracao titulo="Minimo Registrado (desde o ultimo reset)">
                                                    <span className="hud-mono">{sensorAlertaNivel.adc_minimo_registrado?.toFixed(1) ?? '--'}</span>
                                                </LinhaConfiguracao>
                                                <LinhaConfiguracao titulo="Maximo Registrado (desde o ultimo reset)">
                                                    <span className="hud-mono">{sensorAlertaNivel.adc_maximo_registrado?.toFixed(1) ?? '--'}</span>
                                                </LinhaConfiguracao>
                                                <button
                                                    className="botao-primario"
                                                    type="button"
                                                    onClick={resetarRegistroAlertaNivel}
                                                    disabled={resetandoRegistroAlertaNivel}
                                                >
                                                    {resetandoRegistroAlertaNivel ? 'Resetando...' : 'Resetar Minimo/Maximo Registrado'}
                                                </button>

                                                <hr className="hud-linha" />

                                                <LinhaConfiguracao titulo="Limite Maximo / Transbordamento (ADC)" descricao="Acima disso, dispara CRITICO">
                                                    <input
                                                        className="hud-input config-input-pequeno"
                                                        type="number"
                                                        step="0.1"
                                                        value={calibracaoAlertaNivelForm?.ideal ?? ''}
                                                        onChange={(e) => atualizarCalibracaoAlertaNivelForm('ideal', e.target.value)}
                                                    />
                                                </LinhaConfiguracao>
                                                <LinhaConfiguracao titulo="Aproximando do Limite (ADC)" descricao="Acima disso, dispara ATENCAO">
                                                    <input
                                                        className="hud-input config-input-pequeno"
                                                        type="number"
                                                        step="0.1"
                                                        value={calibracaoAlertaNivelForm?.baixo ?? ''}
                                                        onChange={(e) => atualizarCalibracaoAlertaNivelForm('baixo', e.target.value)}
                                                    />
                                                </LinhaConfiguracao>
                                                <button
                                                    className="botao-primario"
                                                    type="button"
                                                    onClick={salvarCalibracaoAlertaNivel}
                                                    disabled={salvandoCalibracaoAlertaNivel}
                                                >
                                                    {salvandoCalibracaoAlertaNivel ? 'Salvando...' : 'Salvar Calibracao no ESP32'}
                                                </button>
                                            </>
                                        )}
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
                                            Pra renomear sensores, use "Editar Controlador" no modulo de telemetria.
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

                                {corresponde('Tarifa', 'Energia', 'kWh', 'Consumo', 'Custo') && (
                                    <CartaoSecao titulo="Tarifa de Energia">
                                        <p className="hud-tag config-nota">
                                            Usada so pra converter o consumo ESTIMADO (potencia declarada em "Mapear Saidas"/"Editar Controlador"
                                            x tempo ligado) em custo em R$, na aba "Energia" da Central de Relatorios. Em branco ou zero, o
                                            relatorio mostra so kWh, sem custo.
                                        </p>
                                        <LinhaConfiguracao titulo="Preco do kWh">
                                            <CampoNumero
                                                valor={config.tarifa_energia_kwh}
                                                onChange={(v) => atualizarConfig('tarifa_energia_kwh', v)}
                                                unidade="R$"
                                                min={0}
                                                step={0.01}
                                            />
                                        </LinhaConfiguracao>
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
                                            seguras, contas de admin, Gestao de Fauna) — nao o historico de telemetria/reles/logs. O
                                            arquivo exportado inclui o hash da senha de login — trate como sensivel, nao compartilhe.
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

                        {categoriaAtiva === 'sincronizacao' && (
                            <>
                                {corresponde('Servidor', 'Destino', 'IP', 'Conexao', 'Testar') && (
                                    <CartaoSecao titulo="Servidor de Destino">
                                        <p className="hud-tag config-nota">
                                            Envia dados desta maquina direto pro servidor abaixo (mesma rede local) — como o
                                            Exportar/Importar de "Armazenamento", so sem precisar baixar/subir arquivo.
                                        </p>
                                        <LinhaConfiguracao titulo="IP do Servidor">
                                            <input
                                                className="hud-input"
                                                placeholder="192.168.98.14"
                                                value={ipSincronizacao}
                                                onChange={(e) => salvarDestinoSincronizacao(e.target.value, portaSincronizacao)}
                                            />
                                        </LinhaConfiguracao>
                                        <LinhaConfiguracao titulo="Porta">
                                            <input
                                                className="hud-input"
                                                style={{ maxWidth: '6rem' }}
                                                placeholder="5000"
                                                value={portaSincronizacao}
                                                onChange={(e) => salvarDestinoSincronizacao(ipSincronizacao, e.target.value)}
                                            />
                                        </LinhaConfiguracao>
                                        <div className="config-linha" style={{ gap: '0.75rem', flexWrap: 'wrap' }}>
                                            <button
                                                className="botao-primario"
                                                type="button"
                                                onClick={testarConexaoSincronizacao}
                                                disabled={!ipSincronizacao.trim() || testandoConexaoSync}
                                            >
                                                <Wifi size={14} />
                                                {testandoConexaoSync ? 'Testando...' : 'Testar Conexao'}
                                            </button>
                                            {statusConexaoSync && (
                                                <span className="hud-tag" style={{ color: statusConexaoSync.ok ? 'var(--cor-sucesso)' : 'var(--cor-erro)' }}>
                                                    {statusConexaoSync.mensagem}
                                                </span>
                                            )}
                                        </div>
                                    </CartaoSecao>
                                )}

                                {corresponde('Enviar Tudo', 'Sincronizar Tudo') && (
                                    <CartaoSecao titulo="Enviar Tudo">
                                        <p className="hud-tag config-nota">
                                            Envia todos os blocos abaixo de uma vez — util na primeira sincronizacao com um servidor novo.
                                            Mostra uma tela de confirmacao antes de enviar de verdade.
                                        </p>
                                        <button
                                            className="botao-primario"
                                            type="button"
                                            onClick={() => prepararEnvioSincronizacao('tudo')}
                                            disabled={!ipSincronizacao.trim() || enviandoSync}
                                        >
                                            <Send size={14} />
                                            Enviar Tudo
                                        </button>
                                    </CartaoSecao>
                                )}

                                {corresponde('Fauna', 'Modulos', 'Temas', 'Agendamentos', 'Sensores', 'QR', 'Admin', 'Display', 'Calibracoes') && (
                                    <CartaoSecao titulo="Enviar por Categoria">
                                        {GRUPOS_SINCRONIZACAO.map((grupo) => (
                                            <div key={grupo.chave} className="config-linha" style={{ justifyContent: 'space-between', gap: '0.75rem' }}>
                                                <span className="config-linha__titulo">
                                                    {grupo.rotulo}
                                                    {grupo.perigoso && (
                                                        <span className="hud-tag" style={{ color: 'var(--cor-erro)', marginLeft: '0.5rem' }}>
                                                            substitui o login
                                                        </span>
                                                    )}
                                                </span>
                                                <button
                                                    className="botao-primario"
                                                    type="button"
                                                    onClick={() => prepararEnvioSincronizacao(grupo.chave)}
                                                    disabled={!ipSincronizacao.trim() || enviandoSync}
                                                >
                                                    <Send size={14} />
                                                    Enviar
                                                </button>
                                            </div>
                                        ))}
                                    </CartaoSecao>
                                )}
                            </>
                        )}
                    </div>

                    {sujo && (
                        <div className="config-barra-salvar">
                            <span className="hud-tag">Alteracoes nao salvas</span>
                            <div className="config-barra-salvar__acoes">
                                <button className="botao-primario botao-primario--neutro" type="button" onClick={descartar}>
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

            {/* Confirmacao de Sincronizar com Servidor (pedido explicito: sempre mostrar pra
                onde vai e o que vai, tanto pros blocos individuais quanto pro "Enviar Tudo",
                inclusive — ou principalmente — pro bloco "admin" que troca o login de la). */}
            <ModalHud aberto={!!confirmacaoSync} titulo="Confirmar Envio" tag="SINCRONIZAR COM SERVIDOR" onFechar={() => setConfirmacaoSync(null)}>
                {confirmacaoSync && (
                    <>
                        <p className="hud-tag config-nota">
                            Isso vai <strong>substituir</strong> os dados abaixo no servidor{' '}
                            <span className="hud-mono">
                                {ipSincronizacao}:{portaSincronizacao}
                            </span>{' '}
                            pelos desta maquina. Esta acao nao pode ser desfeita.
                        </p>
                        <div className="status-modulo__lista">
                            {confirmacaoSync.resumo.map((item) => (
                                <div key={item.rotulo} className="status-modulo__linha">
                                    <span className="hud-tag">
                                        {item.rotulo}
                                        {item.perigoso && (
                                            <span style={{ color: 'var(--cor-erro)', marginLeft: '0.5rem' }}>(substitui o login de la)</span>
                                        )}
                                    </span>
                                    <span className="status-modulo__valor hud-mono">{item.total} registro(s)</span>
                                </div>
                            ))}
                        </div>
                        <div className="modal-hud__acoes" style={{ gap: 'var(--espaco-sm)' }}>
                            <button className="botao-primario botao-primario--neutro" type="button" onClick={() => setConfirmacaoSync(null)} disabled={enviandoSync}>
                                Cancelar
                            </button>
                            <button className="botao-primario" type="button" onClick={confirmarEnvioSincronizacao} disabled={enviandoSync}>
                                {enviandoSync ? 'Enviando...' : 'Confirmar Envio'}
                            </button>
                        </div>
                    </>
                )}
            </ModalHud>
        </ModalHud>
    );
}
