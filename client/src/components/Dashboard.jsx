import { useCallback, useEffect, useRef, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
    Settings,
    Sparkles,
    LayoutGrid,
    CircuitBoard,
    CalendarClock,
    Gauge,
    Thermometer,
    Power,
    Grid3x3,
    Server,
    QrCode,
    Terminal,
    WifiOff,
    CloudOff,
    ServerCrash,
    MonitorOff,
} from 'lucide-react';
import HeaderTatico from './HeaderTatico';
import AlertasConectividade from './AlertasConectividade';
import PainelParametrosVitais from './PainelParametrosVitais';
import GraficoTemperatura from './GraficoTemperatura';
import PainelEquipamentos from './PainelEquipamentos';
import ModulosControladores from './ModulosControladores';
import TerminalLogs from './TerminalLogs';
import ModalMapeamentoPortas from './ModalMapeamentoPortas';
import ModalWidgets from './ModalWidgets';
import MatrizReles16CH from './MatrizReles16CH';
import PainelQrCodes from './PainelQrCodes';
import PainelTemas from './PainelTemas';
import ModalCriarTema from './ModalCriarTema';
import ModalMenuAcoes from './ModalMenuAcoes';
import EsquematicoInterativo from './EsquematicoInterativo';
import AgendamentosWidget from './AgendamentosWidget';
import ModalAgendamento from './ModalAgendamento';
import ModalTimer from './ModalTimer';
import ColunaWidgets from './ColunaWidgets';
import { gerarHistoricoMensal, gerarHistoricoTemperatura, gerarUmidadeInicial } from '../utils/mockData';
import '../styles/dashboard.css';
import '../styles/agendamentos.css';
import '../styles/widgets-layout.css';
import '../styles/alertas.css';

let proximoIdLog = 1;

const CHAVE_LOCALSTORAGE_WIDGETS = 'aquacontrol_brain_widgets_visiveis';
// Layout movivel + Modo Compacto (20-espc, só monitores/tablets — sem preocupação especial
// com telas de celular aqui). Cada MODO tem seu proprio arranjo salvo, independente um do
// outro (20.1-espc: antes era uma unica chave compartilhada — reorganizar no Modo Compacto
// bagunçava o Normal e vice-versa, ja que os dois liam/escreviam o mesmo lugar). Independe
// de "visibilidadeWidgets" (show/hide), que continua decidindo só se o widget aparece ou
// não; um widget escondido mantém o lugar dele no layout do modo atual, reaparece na mesma
// posição se reativado em Layout/Widgets (ver ColunaWidgets.jsx).
const CHAVE_LOCALSTORAGE_LAYOUT_LEGADO = 'aquacontrol_brain_layout_widgets'; // pre-20.1-espc, um layout so
const CHAVE_LOCALSTORAGE_LAYOUT_NORMAL = 'aquacontrol_brain_layout_widgets_normal';
const CHAVE_LOCALSTORAGE_LAYOUT_COMPACTO = 'aquacontrol_brain_layout_widgets_compacto';
const CHAVE_LOCALSTORAGE_MODO_COMPACTO = 'aquacontrol_brain_modo_compacto';
const COLUNAS = ['coluna0', 'coluna1', 'coluna2'];
const LAYOUT_PADRAO = {
    coluna0: ['parametrosVitais', 'historicoTermico'],
    coluna1: ['centralAquario', 'matrizReles', 'temas', 'agendamentos'],
    coluna2: ['modulosControladores', 'qrcodes', 'systemLog'],
};

const VISIBILIDADE_PADRAO = {
    parametrosVitais: true,
    historicoTermico: true,
    centralAquario: true,
    modulosControladores: true,
    systemLog: true,
    matrizReles: true,
    qrcodes: true,
    temas: true,
    agendamentos: true,
};

// Preserva a posição salva de cada widget (filtrando chaves que não existem mais) e insere,
// no fim da coluna padrão dele, qualquer widget novo (ex.: adicionado numa atualização
// futura) que ainda não apareça em nenhuma coluna do layout salvo — nunca perde um widget
// "engolido" por esquecimento.
function normalizarLayout(bruto) {
    const chavesValidas = new Set(Object.keys(VISIBILIDADE_PADRAO));
    const layout = { coluna0: [], coluna1: [], coluna2: [] };
    const vistas = new Set();

    for (const coluna of COLUNAS) {
        const lista = Array.isArray(bruto?.[coluna]) ? bruto[coluna] : [];
        for (const chave of lista) {
            if (chavesValidas.has(chave) && !vistas.has(chave)) {
                layout[coluna].push(chave);
                vistas.add(chave);
            }
        }
    }

    for (const coluna of COLUNAS) {
        for (const chave of LAYOUT_PADRAO[coluna]) {
            if (chavesValidas.has(chave) && !vistas.has(chave)) {
                layout[coluna].push(chave);
                vistas.add(chave);
            }
        }
    }

    return layout;
}

// "chave" e a chave especifica do modo (normal OU compacto); se ainda não existe nada
// salvo nela (primeira vez que este modo é usado), cai pro layout único antigo — assim
// quem já tinha organizado o dashboard antes desta mudança não perde o arranjo, ele so
// passa a valer como ponto de partida pros dois modos, que dai em diante divergem
// independentemente conforme o usuario mexe em cada um.
function carregarLayoutSalvo(chave) {
    try {
        const salvo = localStorage.getItem(chave) ?? localStorage.getItem(CHAVE_LOCALSTORAGE_LAYOUT_LEGADO);
        return normalizarLayout(salvo ? JSON.parse(salvo) : LAYOUT_PADRAO);
    } catch {
        return normalizarLayout(LAYOUT_PADRAO);
    }
}

function carregarModoCompactoSalvo() {
    return localStorage.getItem(CHAVE_LOCALSTORAGE_MODO_COMPACTO) === 'true';
}

function carregarVisibilidadeSalva() {
    try {
        const salvo = localStorage.getItem(CHAVE_LOCALSTORAGE_WIDGETS);
        if (!salvo) return VISIBILIDADE_PADRAO;
        return { ...VISIBILIDADE_PADRAO, ...JSON.parse(salvo) };
    } catch {
        return VISIBILIDADE_PADRAO;
    }
}

// Componente principal do Dashboard (01-espc-geral/05_.../06_...) — grid de 3 colunas.
// Dono de todo o estado: módulos (real, via /api/modulos), equipamentos/umidade/histórico
// (local/simulados, ver src/utils/mockData.js), visibilidade de widgets (persistida em
// localStorage) e o log de eventos. Cada painel recebe só o que precisa via props.
export default function Dashboard() {
    const [modulos, setModulos] = useState([]);
    const [carregandoModulos, setCarregandoModulos] = useState(true);
    const [erroModulos, setErroModulos] = useState(null);
    const [backendOnline, setBackendOnline] = useState(true);
    // Central de Alertas de Conectividade (21-espc) — "internetOnline" reflete o
    // navigator.onLine do proprio navegador (sinal nativo, sem bater numa URL externa pra
    // testar de verdade — o bastante pra "perdeu a rede local", que e o que derruba tudo
    // mais aqui: o Brain roda na mesma LAN). Ver alertasConectividade mais abaixo, que
    // combina isso com backendOnline/modulos pra montar o banner laranja (AlertasConectividade.jsx).
    const [internetOnline, setInternetOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));
    const [latenciaMs, setLatenciaMs] = useState(null);
    // null = ainda não leu o estado real (ou não há módulo atuador acessível) -> "modo
    // demo", só mock local. Array de 16 posições = leitura real via GET /api/modulos/:id/reles.
    const [estadoReles, setEstadoReles] = useState(null);
    // Mapeamento das 16 portas (nome + habilitado/bloqueado) — fonte única compartilhada
    // pela Central do Aquario (só mostra portas mapeadas E habilitadas) e pela Matriz de
    // Reles 16CH (mostra as 16, mas marca as desabilitadas como bloqueadas). Levantado pra
    // cá (13-espc) porque os dois painéis precisam do mesmo dado — antes cada um buscava
    // por conta própria. Atualizado ao trocar de módulo E imediatamente após salvar o
    // Mapeamento de Saidas (ver onSalvo do modal, abaixo).
    const [portasMapeamento, setPortasMapeamento] = useState([]);
    // Filtro da Central do Aquario (14-espc): "ativos" (default) mostra portas mapeadas E
    // habilitadas, como sempre; "bloqueados" inverte pra mostrar as mapeadas mas desabilitadas
    // ("Oculta" no Mapeamento de Saidas) — só pra dar visibilidade de quais existem, sem
    // deixar acionar (ver InterruptorEquipamento --bloqueado).
    const [filtroEquipamentos, setFiltroEquipamentos] = useState('ativos');
    // Temas (14-espc): grupos nomeados de relés com estado definido — ver PainelTemas.jsx/
    // ModalCriarTema.jsx. Buscados sempre que o módulo atuador muda (mesmo padrão de
    // portasMapeamento acima).
    const [temas, setTemas] = useState([]);
    // Motor de Agendamento (18-espc, ver AgendamentosWidget.jsx/schedulerService.js no
    // server): "agendamentos" e a lista completa cadastrada, "timers" os Timers Rapidos
    // ainda rodando, "estadoAgendamentos" o resumo pronto do servidor (o que esta ligado
    // agora pela agenda, o proximo, e se o Override Manual esta pausando tudo) — os tres
    // sao buscados juntos a cada poucos segundos (mesmo padrao de estadoReles acima).
    const [agendamentos, setAgendamentos] = useState([]);
    const [timers, setTimers] = useState([]);
    const [estadoAgendamentos, setEstadoAgendamentos] = useState(null);
    const [modalAgendamentoAberto, setModalAgendamentoAberto] = useState(false);
    const [agendamentoEditando, setAgendamentoEditando] = useState(null);
    const [modalTimerAberto, setModalTimerAberto] = useState(false);
    const [umidadeAr, setUmidadeAr] = useState(gerarUmidadeInicial);
    const [logs, setLogs] = useState([]);
    const [visibilidadeWidgets, setVisibilidadeWidgets] = useState(carregarVisibilidadeSalva);
    // Layout movivel + Modo Compacto (20-espc, layouts independentes no 20.1-espc) —
    // "layoutNormal"/"layoutCompacto" guardam, CADA UM, em qual coluna e em que ordem cada
    // widget esta NAQUELE modo; "modoCompacto" alterna entre o widget cheio (normal) e um
    // cartao pequeno e uniforme que abre em modal ao clicar (ver HeaderTatico.jsx/
    // ColunaWidgets.jsx/WidgetSlot.jsx). "chaveArrastando" so existe enquanto um drag esta
    // em andamento, pra desenhar o preview flutuante (DragOverlay).
    const [layoutNormal, setLayoutNormal] = useState(() => carregarLayoutSalvo(CHAVE_LOCALSTORAGE_LAYOUT_NORMAL));
    const [layoutCompacto, setLayoutCompacto] = useState(() => carregarLayoutSalvo(CHAVE_LOCALSTORAGE_LAYOUT_COMPACTO));
    const [modoCompacto, setModoCompacto] = useState(carregarModoCompactoSalvo);
    const [chaveArrastando, setChaveArrastando] = useState(null);
    // "layoutWidgets"/"setLayoutWidgets" apontam pro layout do modo ATUAL — toda a logica de
    // arrasto abaixo (aoArrastarSobre/aoFinalizarArrasto/encontrarColunaDoWidget) so conhece
    // esse par generico, sem precisar saber em qual modo esta; trocar de modo troca pra qual
    // state real eles apontam, automaticamente.
    const layoutWidgets = modoCompacto ? layoutCompacto : layoutNormal;
    const setLayoutWidgets = modoCompacto ? setLayoutCompacto : setLayoutNormal;
    const [modalPortasAberto, setModalPortasAberto] = useState(false);
    const [modalWidgetsAberto, setModalWidgetsAberto] = useState(false);
    const [modalCriarTemaAberto, setModalCriarTemaAberto] = useState(false);
    // Tema sendo editado no modal (15-espc) — null quando o modal está em modo "criar novo".
    // Ver abrirEdicaoTema/ModalCriarTema.jsx.
    const [temaEditando, setTemaEditando] = useState(null);
    // Menu de Acoes (14-espc, ver 01-espc-geral/14_menu_de_acoes.md): acesso permanente a
    // qualquer tela de configuracao, mesmo com o widget correspondente escondido.
    const [modalMenuAberto, setModalMenuAberto] = useState(false);
    // Esquematico Interativo (16-espc) — aberto pelo header, pelo Menu de Acoes, ou pelo
    // botao "Ver Esquematico Tatico" dentro do modal de status em ModulosControladores.jsx.
    const [modalEsquematicoAberto, setModalEsquematicoAberto] = useState(false);
    // Modo Panico: gadget de emergencia no header (ver HeaderTatico) — desliga os 16 reles
    // de uma vez e retinta o tema inteiro de vermelho (ver ".dashboard--panico" em
    // theme.css), so trocando variaveis CSS, nenhum componente precisa saber que esta em
    // modo panico. So sai daqui com "Normalizar".
    const [modoPanico, setModoPanico] = useState(false);

    // Históricos gerados uma única vez (não a cada render) — 4 conjuntos: água/ambiente x 24h/30d
    const dados24h = useRef({
        agua: gerarHistoricoTemperatura(24.5, 1.2),
        ambiente: gerarHistoricoTemperatura(23, 1.8),
    }).current;
    const dados30d = useRef({
        agua: gerarHistoricoMensal(24.5, 1.5),
        ambiente: gerarHistoricoMensal(23, 2.2),
    }).current;

    // Módulo alvo pra tudo que fala com o hardware real de relés (mapeamento de portas E
    // acionamento) — o primeiro cadastrado do tipo "atuador". Ainda não existe um seletor
    // explícito de "qual módulo é a Central do Aquário"; essa é a simplificação assumida
    // por enquanto (01-espc-geral/07_...).
    const moduloAtuador = modulos.find((m) => m.tipo === 'atuador') ?? null;

    const registrarLog = useCallback((mensagem, nivel = 'info') => {
        setLogs((atual) => {
            const entrada = {
                id: proximoIdLog++,
                hora: new Date().toLocaleTimeString('pt-BR', { hour12: false }),
                mensagem,
                nivel,
            };
            return [...atual.slice(-49), entrada]; // mantém só as últimas 50 linhas
        });
    }, []);

    // Busca a lista de módulos e, de quebra, mede a latência real do round-trip — não é
    // simulado, é o tempo de resposta de verdade do fetch a /api/modulos.
    const buscarModulos = useCallback(async () => {
        const inicio = performance.now();
        try {
            const resposta = await fetch('/api/modulos');
            if (!resposta.ok) throw new Error('Resposta invalida do servidor');
            const dados = await resposta.json();
            setModulos(dados);
            setBackendOnline(true);
            setLatenciaMs(Math.round(performance.now() - inicio));
            setErroModulos(null);
        } catch {
            setBackendOnline(false);
            setErroModulos('Falha ao conectar com o AquaControl_Brain (porta 5000).');
        } finally {
            setCarregandoModulos(false);
        }
    }, []);

    useEffect(() => {
        registrarLog('Dashboard inicializado. Conectando ao AquaControl_Brain...');
        buscarModulos();

        const intervalo = setInterval(buscarModulos, 8000); // refresh periódico da lista + latência
        return () => clearInterval(intervalo);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Internet do navegador (21-espc) — eventos nativos 'online'/'offline' da janela, sem
    // polling: o proprio navegador dispara isso quando o adaptador de rede muda de estado.
    useEffect(() => {
        function aoFicarOnline() {
            setInternetOnline(true);
            registrarLog('Conexao com a internet restabelecida.', 'sucesso');
        }
        function aoFicarOffline() {
            setInternetOnline(false);
            registrarLog('Conexao com a internet perdida.', 'erro');
        }

        window.addEventListener('online', aoFicarOnline);
        window.addEventListener('offline', aoFicarOffline);
        return () => {
            window.removeEventListener('online', aoFicarOnline);
            window.removeEventListener('offline', aoFicarOffline);
        };
    }, [registrarLog]);

    // Modo Panico é um estado global do Brain (09-espc), não só local — porque o Display
    // pode acioná-lo/normalizá-lo também (toque na tela dele), e o dashboard precisa saber
    // disso mesmo sem ter sido ele quem clicou. Sem WebSocket nesta stack, então isso é
    // feito por polling (mesmo padrão de buscarModulos/atualizarEstadoReles acima).
    useEffect(() => {
        let cancelado = false;

        async function sincronizarPanico() {
            try {
                const resposta = await fetch('/api/panico');
                const dados = await resposta.json();
                if (!cancelado) setModoPanico(dados.ativo);
            } catch {
                // silencioso — o dashboard so fica "atrasado" ate o backend voltar
            }
        }

        sincronizarPanico();
        const intervalo = setInterval(sincronizarPanico, 4000);
        return () => {
            cancelado = true;
            clearInterval(intervalo);
        };
    }, []);

    // Umidade do ar ainda não vem de um sensor real — oscila levemente pra parecer "viva"
    // (mesmo espírito do simulador do AquaControl_Hardware: pequenas variações periódicas).
    useEffect(() => {
        const intervalo = setInterval(() => {
            setUmidadeAr((atual) => Math.min(95, Math.max(25, Math.round(atual + (Math.random() - 0.5) * 6))));
        }, 15000);
        return () => clearInterval(intervalo);
    }, []);

    // Consulta periódica do estado real dos 16 relés (01-espc-geral/07_...), via
    // GET /api/modulos/:id/reles (o Brain fala com o ESP32 de verdade). Sem módulo atuador
    // cadastrado, nem tenta — fica em "modo demo" (estadoReles = null).
    useEffect(() => {
        if (!moduloAtuador) {
            setEstadoReles(null);
            return undefined;
        }

        let cancelado = false;

        async function atualizarEstadoReles() {
            try {
                const resposta = await fetch(`/api/modulos/${moduloAtuador.id}/reles`);
                const dados = await resposta.json();
                // "disponivel:false" (ESP inacessivel/MCP nao inicializado) é uma resposta
                // 200 normal agora, não uma falha de fetch — ver relesController.js. Sem log
                // aqui de propósito: se ainda não há hardware real ligado, isso acontece o
                // tempo todo e poluiria o terminal. O log de erro de verdade só acontece
                // quando o usuário tenta ACIONAR um relé (ver alternarEquipamento/alternarPorta).
                if (!cancelado && dados.disponivel) setEstadoReles(dados.reles);
            } catch {
                // Falha de rede de verdade (Brain fora do ar, etc.) — também sem log aqui.
            }
        }

        atualizarEstadoReles();
        const intervalo = setInterval(atualizarEstadoReles, 6000);
        return () => {
            cancelado = true;
            clearInterval(intervalo);
        };
    }, [moduloAtuador?.id]);

    // Busca o mapeamento das 16 portas (nomes + habilitado) só quando o módulo atuador de
    // verdade muda (troca de ESP) — dependência é "moduloAtuador?.id", não o objeto inteiro,
    // pelo mesmo motivo documentado em ModalMapeamentoPortas.jsx (evita refetch a cada poll
    // de 8s de /api/modulos). Reexecutado manualmente após salvar o modal, via onSalvo.
    useEffect(() => {
        if (!moduloAtuador) {
            setPortasMapeamento([]);
            return;
        }

        fetch(`/api/modulos/${moduloAtuador.id}/portas`)
            .then((resposta) => resposta.json())
            .then(setPortasMapeamento)
            .catch(() => {});
    }, [moduloAtuador?.id]);

    // Busca os Temas cadastrados (14-espc) — mesmo padrão do mapeamento acima: só quando o
    // módulo de verdade muda, não a cada poll de /api/modulos.
    useEffect(() => {
        if (!moduloAtuador) {
            setTemas([]);
            return;
        }

        fetch(`/api/modulos/${moduloAtuador.id}/temas`)
            .then((resposta) => resposta.json())
            .then(setTemas)
            .catch(() => {});
    }, [moduloAtuador?.id]);

    // Motor de Agendamento (18-espc): busca a lista cadastrada + timers ativos + o resumo
    // pronto do servidor (GET /api/agendamentos/estado) a cada 10s — mesmo intervalo do
    // ciclo do motor no server, pra o widget nunca ficar "atrasado" em relacao ao que
    // realmente esta sendo aplicado nos reles. Refaz tudo do zero a cada poll (mais simples
    // que tentar diffar) — a lista raramente passa de poucas dezenas de linhas.
    useEffect(() => {
        if (!moduloAtuador) {
            setAgendamentos([]);
            setTimers([]);
            setEstadoAgendamentos(null);
            return undefined;
        }

        let cancelado = false;

        async function atualizarAgendamentos() {
            try {
                const [respAgendamentos, respTimers, respEstado] = await Promise.all([
                    fetch(`/api/agendamentos?moduloId=${moduloAtuador.id}`),
                    fetch(`/api/timers?moduloId=${moduloAtuador.id}`),
                    fetch(`/api/agendamentos/estado?moduloId=${moduloAtuador.id}`),
                ]);
                const [dadosAgendamentos, dadosTimers, dadosEstado] = await Promise.all([
                    respAgendamentos.json(),
                    respTimers.json(),
                    respEstado.json(),
                ]);
                if (cancelado) return;
                setAgendamentos(dadosAgendamentos);
                setTimers(dadosTimers);
                setEstadoAgendamentos(dadosEstado);
            } catch {
                // silencioso — mesmo espirito do polling de estadoReles acima
            }
        }

        atualizarAgendamentos();
        const intervalo = setInterval(atualizarAgendamentos, 10000);
        return () => {
            cancelado = true;
            clearInterval(intervalo);
        };
    }, [moduloAtuador?.id]);

    async function criarModulo(dadosForm) {
        try {
            const resposta = await fetch('/api/modulos', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(dadosForm),
            });
            if (!resposta.ok) throw new Error();
            const novoModulo = await resposta.json();
            setModulos((atual) => [...atual, novoModulo]);
            registrarLog(`Modulo cadastrado: ${novoModulo.nome} (${novoModulo.ip})`, 'sucesso');
        } catch {
            registrarLog('Falha ao cadastrar modulo.', 'erro');
        }
    }

    async function removerModulo(id) {
        const modulo = modulos.find((m) => m.id === id);
        try {
            const resposta = await fetch(`/api/modulos/${id}`, { method: 'DELETE' });
            if (!resposta.ok && resposta.status !== 204) throw new Error();
            setModulos((atual) => atual.filter((m) => m.id !== id));
            registrarLog(`Modulo removido: ${modulo?.nome ?? id}`, 'alerta');
        } catch {
            registrarLog('Falha ao remover modulo.', 'erro');
        }
    }

    // Sincroniza a lista local depois do Modal de Editar Controlador salvar o nome (12-espc,
    // PUT /api/modulos/:id já feito lá dentro) — evita esperar o próximo poll de 8s de
    // buscarModulos pra refletir o nome novo na lista.
    function atualizarModuloLocal(moduloAtualizado) {
        setModulos((atual) => atual.map((m) => (m.id === moduloAtualizado.id ? moduloAtualizado : m)));
    }

    // Núcleo compartilhado de acionamento: manda um array de 16 posições de verdade via
    // POST /api/modulos/:id/reles (Brain -> ESP32, GPIO direto), com atualização otimista +
    // revert em caso de falha. Usado por enviarComandoRele (1 porta), acionarTodasAsPortas
    // (Ligar/Desligar Todos) e ativarModoPanico (desliga tudo). "origem" só existe pro
    // histórico no servidor (ver relesController.js) — "manual" pra qualquer clique direto
    // do usuário, "automatico" só pro Modo Panico.
    //
    // "demo" só acontece se não existe NENHUM módulo atuador cadastrado — nunca só porque
    // ainda não lemos o estado real (estadoReles null). Com um módulo cadastrado, o comando
    // é sempre enviado de verdade pro ESP, e a resposta já vem com o array CORRIGIDO pelo
    // servidor (portas bloqueadas forçadas a 0 — ver relesController.js), então o estado
    // otimista local é sincronizado com o que realmente foi aplicado, sem precisar de um
    // GET extra.
    async function enviarArrayReles(novoArray, origem = 'manual') {
        if (!moduloAtuador) {
            return { demo: true };
        }

        const estadoAnterior = estadoReles;
        if (estadoReles) setEstadoReles(novoArray); // otimista só quando já havia estado real confirmado

        try {
            const resposta = await fetch(`/api/modulos/${moduloAtuador.id}/reles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reles: novoArray, origem }),
            });
            const dados = await resposta.json();
            if (!resposta.ok || !dados.disponivel) {
                if (estadoReles) setEstadoReles(estadoAnterior);
                return { erro: true, motivo: dados.motivo ?? 'ESP nao respondeu.' };
            }
            const estadoFinal = Array.isArray(dados.reles) ? dados.reles : novoArray;
            setEstadoReles(estadoFinal);
            return { sucesso: true, estado: estadoFinal };
        } catch (erro) {
            if (estadoReles) setEstadoReles(estadoAnterior); // reverte: o comando nao chegou de verdade no ESP
            return { erro: true, motivo: erro.message };
        }
    }

    // Alterna UM índice (0-15) — usado por alternarEquipamento/alternarPorta abaixo.
    async function enviarComandoRele(indice) {
        if (!moduloAtuador) {
            return { demo: true };
        }

        // Sem leitura real confirmada ainda (estadoReles null): assume os 16 desligados como
        // base, já que é o estado de boot seguro do firmware (ver AquaControl_Hardware).
        const base = estadoReles ?? Array(16).fill(0);
        const novoValor = base[indice] === 1 ? 0 : 1;
        const novoArray = [...base];
        novoArray[indice] = novoValor;

        const resultado = await enviarArrayReles(novoArray, 'manual');
        if (resultado.sucesso) {
            return { sucesso: true, novoValor: resultado.estado[indice] };
        }
        return resultado;
    }

    // Aciona um equipamento mapeado (Central do Aquário) — a lista já vem filtrada só com
    // portas mapeadas E habilitadas (ver equipamentosExibidos), então isto só é chamado pra
    // algo que já sabemos que é seguro acionar.
    async function alternarEquipamento(id) {
        const equipamento = equipamentosExibidos.find((e) => e.id === id);
        if (!equipamento || equipamento.bloqueado) return;

        const resultado = await enviarComandoRele(equipamento.posicaoIndice);

        if (resultado.demo) {
            registrarLog(`Nao foi possivel acionar ${equipamento.nome} — nenhum modulo atuador acessivel.`, 'alerta');
        } else if (resultado.erro) {
            registrarLog(`Falha ao acionar ${equipamento.nome} no modulo real (${moduloAtuador.ip}): ${resultado.motivo}`, 'erro');
        } else {
            registrarLog(`${equipamento.nome} -> ${resultado.novoValor === 1 ? 'ACTIVE' : 'STANDBY'}`, resultado.novoValor === 1 ? 'sucesso' : 'alerta');
        }
    }

    // Aciona uma porta crua (0-15) a partir da Matriz de Relés 16CH (08-espc) — mesmo
    // núcleo de cima, só muda o formato da mensagem de log.
    async function alternarPorta(indice) {
        const numero = String(indice + 1).padStart(2, '0');
        const resultado = await enviarComandoRele(indice);

        if (resultado.demo) {
            registrarLog(`Porta [${numero}] nao alterada — nenhum modulo atuador acessivel.`, 'alerta');
        } else if (resultado.erro) {
            registrarLog(`Falha ao alterar Porta [${numero}] no modulo real (${moduloAtuador.ip}): ${resultado.motivo}`, 'erro');
        } else {
            const estado = resultado.novoValor === 1 ? 'ACTIVE' : 'STANDBY';
            registrarLog(`Porta [${numero}] alterada para ${estado} no Modulo ${moduloAtuador.ip}`, resultado.novoValor === 1 ? 'sucesso' : 'alerta');
        }
    }

    // Ligar/Desligar Todos (Diagnostico de Reles 16CH) — "ligar" só afeta portas habilitadas
    // (as bloqueadas nunca são ligadas por aqui, reforçado de novo no servidor); "desligar"
    // sempre desliga as 16, é sempre seguro.
    async function acionarTodasAsPortas(ligar) {
        if (!moduloAtuador) {
            registrarLog('Nao foi possivel acionar os reles — nenhum modulo atuador acessivel.', 'alerta');
            return;
        }

        const novoArray = Array.from({ length: 16 }, (_, indice) => {
            const porta = portasMapeamento[indice];
            const habilitada = porta ? porta.habilitado : true;
            return ligar && habilitada ? 1 : 0;
        });

        const resultado = await enviarArrayReles(novoArray, 'manual');
        if (resultado.erro) {
            registrarLog(`Falha ao ${ligar ? 'ligar' : 'desligar'} todos os reles no modulo real (${moduloAtuador.ip}): ${resultado.motivo}`, 'erro');
        } else {
            registrarLog(
                ligar ? 'Todos os reles habilitados foram ligados via Diagnostico de Reles.' : 'Todos os reles foram desligados via Diagnostico de Reles.',
                ligar ? 'sucesso' : 'alerta'
            );
        }
    }

    // Aplica um Tema de verdade (14/15-espc) — POST /api/temas/:id/aplicar. Regra de
    // exclusão mútua (nunca dois temas ativos ao mesmo tempo) é decidida no servidor —
    // aqui só reflete o resultado: sincroniza o estado otimista dos relés com o array
    // corrigido que volta, e marca qual tema (se algum) ficou "ativo" (clicar no tema já
    // ativo desativa ele, ver temasController.js:aplicarTema).
    async function aplicarTema(temaId) {
        const tema = temas.find((t) => t.id === temaId);
        if (!tema) return;

        try {
            const resposta = await fetch(`/api/temas/${temaId}/aplicar`, { method: 'POST' });
            const dados = await resposta.json();
            if (!resposta.ok || !dados.disponivel) {
                registrarLog(`Falha ao aplicar o tema "${tema.nome}": ${dados.motivo ?? 'ESP nao respondeu.'}`, 'erro');
                return;
            }
            if (Array.isArray(dados.reles)) setEstadoReles(dados.reles);
            setTemas((atual) => atual.map((t) => ({ ...t, ativo: t.id === dados.temaAtivoId })));
            registrarLog(
                dados.temaAtivoId === temaId
                    ? `Tema "${tema.nome}" aplicado (${tema.reles.length} rele(s)).`
                    : `Tema "${tema.nome}" desativado.`,
                dados.temaAtivoId === temaId ? 'sucesso' : 'alerta'
            );
        } catch (erro) {
            registrarLog(`Falha de comunicacao ao aplicar o tema "${tema.nome}": ${erro.message}`, 'erro');
        }
    }

    async function removerTema(temaId) {
        const tema = temas.find((t) => t.id === temaId);
        try {
            const resposta = await fetch(`/api/temas/${temaId}`, { method: 'DELETE' });
            if (!resposta.ok && resposta.status !== 204) throw new Error();
            setTemas((atual) => atual.filter((t) => t.id !== temaId));
            registrarLog(`Tema removido: ${tema?.nome ?? temaId}`, 'alerta');
        } catch {
            registrarLog('Falha ao remover tema.', 'erro');
        }
    }

    // Abre o ModalAgendamento em modo "criar novo" ou "editar" — mesmo padrao de
    // abrirCriarTema/abrirEdicaoTema logo abaixo.
    function abrirNovoAgendamento() {
        setAgendamentoEditando(null);
        setModalAgendamentoAberto(true);
    }

    function abrirEdicaoAgendamento(agendamento) {
        setAgendamentoEditando(agendamento);
        setModalAgendamentoAberto(true);
    }

    // Callback unico do ModalAgendamento pra criar OU editar (POST e PUT devolvem o mesmo
    // formato) — mesmo padrao de aoSalvarTema.
    function aoSalvarAgendamento(agendamentoSalvo) {
        setAgendamentos((atual) => {
            const existe = atual.some((a) => a.id === agendamentoSalvo.id);
            return existe ? atual.map((a) => (a.id === agendamentoSalvo.id ? agendamentoSalvo : a)) : [...atual, agendamentoSalvo];
        });
    }

    async function excluirAgendamento(id) {
        const agendamento = agendamentos.find((a) => a.id === id);
        try {
            const resposta = await fetch(`/api/agendamentos/${id}`, { method: 'DELETE' });
            if (!resposta.ok && resposta.status !== 204) throw new Error();
            setAgendamentos((atual) => atual.filter((a) => a.id !== id));
            registrarLog(`Agendamento removido: ${agendamento?.nome ?? id}`, 'alerta');
        } catch {
            registrarLog('Falha ao remover agendamento.', 'erro');
        }
    }

    // Liga/desliga um agendamento sem abrir o modal (checkbox direto na lista, ver
    // AgendamentosWidget.jsx) — PUT parcial, so manda o campo "ativo" invertido.
    async function alternarAtivoAgendamento(agendamento) {
        try {
            const resposta = await fetch(`/api/agendamentos/${agendamento.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ativo: !agendamento.ativo }),
            });
            if (!resposta.ok) throw new Error();
            const atualizado = await resposta.json();
            setAgendamentos((atual) => atual.map((a) => (a.id === atualizado.id ? atualizado : a)));
        } catch {
            registrarLog(`Falha ao ${agendamento.ativo ? 'desativar' : 'ativar'} agendamento "${agendamento.nome}".`, 'erro');
        }
    }

    function abrirNovoTimer() {
        setModalTimerAberto(true);
    }

    function aoDispararTimer(timerNovo) {
        setTimers((atual) => [...atual, timerNovo]);
    }

    async function cancelarTimer(id) {
        const timer = timers.find((t) => t.id === id);
        try {
            const resposta = await fetch(`/api/timers/${id}`, { method: 'DELETE' });
            if (!resposta.ok && resposta.status !== 204) throw new Error();
            setTimers((atual) => atual.filter((t) => t.id !== id));
            registrarLog(`Timer cancelado: ${timer?.nome ?? id}`, 'alerta');
        } catch {
            registrarLog('Falha ao cancelar timer.', 'erro');
        }
    }

    // "Retomar Agendamento" no widget (banner de Override Manual Ativo) — desativa o Tema
    // Manual ativo neste modulo (se houver) e desliga o override, disparando a
    // re-sincronizacao completa no servidor na hora (ver agendamentosController.js:retomarAgendamento).
    async function retomarAgendamento() {
        if (!moduloAtuador) return;
        try {
            const resposta = await fetch('/api/agendamentos/retomar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ moduloId: moduloAtuador.id }),
            });
            if (!resposta.ok) throw new Error();
            setEstadoAgendamentos((atual) => (atual ? { ...atual, overrideAtivo: false } : atual));
            setTemas((atual) => atual.map((t) => ({ ...t, ativo: false })));
            registrarLog('Agendamento automatico retomado — override manual desativado.', 'sucesso');
        } catch {
            registrarLog('Falha ao retomar o agendamento automatico.', 'erro');
        }
    }

    // Abre o modal em modo "criar novo" (temaEditando = null) ou "editar" (temaEditando =
    // o tema clicado) — ver PainelTemas.jsx (botão de lápis) e ModalCriarTema.jsx.
    function abrirCriarTema() {
        setTemaEditando(null);
        setModalCriarTemaAberto(true);
    }

    function abrirEdicaoTema(temaId) {
        const tema = temas.find((t) => t.id === temaId);
        if (!tema) return;
        setTemaEditando(tema);
        setModalCriarTemaAberto(true);
    }

    // Callback único do ModalCriarTema pra criar OU editar (POST e PUT devolvem o mesmo
    // formato) — se o id já existe na lista, foi uma edição; senão, é um tema novo.
    function aoSalvarTema(temaSalvo) {
        setTemas((atual) => {
            const existe = atual.some((t) => t.id === temaSalvo.id);
            return existe ? atual.map((t) => (t.id === temaSalvo.id ? temaSalvo : t)) : [...atual, temaSalvo];
        });
    }

    // "Testar ao vivo" no modal de Criar/Editar Tema (15-espc): aciona UM relé de verdade
    // (sem precisar salvar o tema antes) pra o usuário ver/ouvir o clique físico enquanto
    // monta o grupo. Mesmo núcleo de enviarArrayReles, só com origem "teste" — fica separado
    // no histórico dos acionamentos manuais de verdade.
    async function testarRelePontual(indice, estado) {
        if (!moduloAtuador) return;
        const base = estadoReles ?? Array(16).fill(0);
        const novoArray = [...base];
        novoArray[indice] = estado;
        await enviarArrayReles(novoArray, 'teste');
    }

    // Botao de panico: desliga os 16 reles de uma vez (array de zeros, nao um-a-um), sempre
    // que houver modulo cadastrado — mesmo raciocinio do enviarComandoRele acima: tentar
    // comunicar de verdade em vez de só simular localmente; se falhar, só loga — o tema
    // vermelho fica ativo de qualquer jeito, já que a intenção (parar tudo) é local e
    // imediata, não depende do ESP confirmar. Marcado "automatico" no histórico (não foi um
    // clique manual em nenhuma porta especifica).
    //
    // Também avisa o Brain (POST /api/panico) — é o Brain quem empurra o alerta pro Display
    // (ver panicoController.js no server), e é o estado que o polling acima usa pra detectar
    // quando o próprio Display normaliza remotamente (toque na tela dele).
    async function ativarModoPanico() {
        setModoPanico(true);
        registrarLog('MODO PANICO ACIONADO — desligando todos os equipamentos.', 'erro');
        fetch('/api/panico', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativo: true }),
        }).catch(() => registrarLog('Falha ao avisar o Brain sobre o modo panico (Display pode nao ser avisado).', 'erro'));

        if (moduloAtuador) {
            const resultado = await enviarArrayReles(Array(16).fill(0), 'automatico');
            if (resultado.erro) {
                registrarLog(`Panico: nao foi possivel confirmar o desligamento no modulo real (${moduloAtuador.ip}): ${resultado.motivo}`, 'erro');
            }
        }
    }

    function normalizarSistema() {
        setModoPanico(false);
        registrarLog('Sistema normalizado — modo panico desativado.', 'sucesso');
        fetch('/api/panico', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ativo: false }),
        }).catch(() => registrarLog('Falha ao avisar o Brain sobre a normalizacao (Display pode nao ser avisado).', 'erro'));
    }

    function alternarWidget(chave) {
        setVisibilidadeWidgets((atual) => {
            const novo = { ...atual, [chave]: !atual[chave] };
            localStorage.setItem(CHAVE_LOCALSTORAGE_WIDGETS, JSON.stringify(novo));
            return novo;
        });
    }

    // Modo Compacto (20-espc): so alterna um boolean persistido — quem muda de fato o
    // visual e a logica de clique-pra-expandir e o WidgetSlot.jsx.
    function alternarModoCompacto() {
        setModoCompacto((atual) => {
            const novo = !atual;
            localStorage.setItem(CHAVE_LOCALSTORAGE_MODO_COMPACTO, String(novo));
            return novo;
        });
    }

    // Layout movivel (20-espc): sensores do dnd-kit — PointerSensor cobre mouse/touch/caneta
    // (Pointer Events), com uma distancia minima de ativacao pra nao confundir um toque/
    // clique normal na alca com o inicio de um arrasto.
    const sensoresDrag = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

    function encontrarColunaDoWidget(chave) {
        return COLUNAS.find((coluna) => layoutWidgets[coluna].includes(chave));
    }

    function aoIniciarArrasto(evento) {
        setChaveArrastando(evento.active.id);
    }

    // Arrastando por CIMA de outra coluna (ainda em andamento, nao finalizado) — move o
    // widget pra la na hora, dando o feedback visual imediato de "encaixou aqui" (mesmo
    // padrao de "multiplos containers" do dnd-kit). "over.id" pode ser outro widget (solta
    // do lado dele) ou o id da propria coluna (solta numa area vazia).
    function aoArrastarSobre(evento) {
        const { active, over } = evento;
        if (!over) return;

        const colunaOrigem = encontrarColunaDoWidget(active.id);
        const colunaDestino = COLUNAS.includes(over.id) ? over.id : encontrarColunaDoWidget(over.id);
        if (!colunaOrigem || !colunaDestino || colunaOrigem === colunaDestino) return;

        setLayoutWidgets((atual) => {
            const origem = [...atual[colunaOrigem]];
            const indiceOrigem = origem.indexOf(active.id);
            if (indiceOrigem === -1) return atual;
            origem.splice(indiceOrigem, 1);

            const destino = [...atual[colunaDestino]];
            const indiceDestino = destino.indexOf(over.id);
            destino.splice(indiceDestino === -1 ? destino.length : indiceDestino, 0, active.id);

            return { ...atual, [colunaOrigem]: origem, [colunaDestino]: destino };
        });
    }

    // Solta de vez — se ainda estiver na MESMA coluna que comecou, reordena pela posicao
    // final (arrayMove); mover entre colunas ja foi resolvido ao vivo em aoArrastarSobre.
    function aoFinalizarArrasto(evento) {
        const { active, over } = evento;
        setChaveArrastando(null);
        if (!over) return;

        const coluna = encontrarColunaDoWidget(active.id);
        if (!coluna) return;

        setLayoutWidgets((atual) => {
            const chaves = atual[coluna];
            const indiceAtivo = chaves.indexOf(active.id);
            const indiceSobre = chaves.indexOf(over.id);
            if (indiceAtivo === -1 || indiceSobre === -1 || indiceAtivo === indiceSobre) return atual;
            return { ...atual, [coluna]: arrayMove(chaves, indiceAtivo, indiceSobre) };
        });
    }

    useEffect(() => {
        localStorage.setItem(CHAVE_LOCALSTORAGE_LAYOUT_NORMAL, JSON.stringify(layoutNormal));
    }, [layoutNormal]);

    useEffect(() => {
        localStorage.setItem(CHAVE_LOCALSTORAGE_LAYOUT_COMPACTO, JSON.stringify(layoutCompacto));
    }, [layoutCompacto]);

    // Central do Aquario (13/14-espc): só as portas MAPEADAS (nome preenchido) — nada de
    // mock. "filtroEquipamentos" decide se mostra as habilitadas (default, "ativos") ou as
    // desabilitadas ("bloqueados", só visibilidade — ver PainelEquipamentos.jsx). Status vem
    // de estadoReles; sem leitura real ainda (estadoReles null), aparece como inativo (nunca
    // finge um estado que não confirmamos).
    const equipamentosExibidos = portasMapeamento
        .filter((porta) => porta.nomePersonalizado?.trim() && (filtroEquipamentos === 'ativos' ? porta.habilitado : !porta.habilitado))
        .map((porta) => ({
            id: porta.posicaoIndice,
            nome: porta.nomePersonalizado,
            posicaoIndice: porta.posicaoIndice,
            bloqueado: !porta.habilitado,
            ativo: estadoReles ? estadoReles[porta.posicaoIndice] === 1 : false,
        }))
        // Ordem por prioridade de status (17-espc) — ATIVO primeiro, depois BLOQUEADO, e
        // STANDBY por último; dentro de cada grupo, alfabética. Reflete o que mais importa
        // ver de cara: o que está ligado agora, seguido do que precisa de atenção (bloqueado),
        // com o que está parado em standby no final da lista.
        .sort((a, b) => {
            const prioridade = (e) => (e.ativo ? 0 : e.bloqueado ? 1 : 2);
            const diferenca = prioridade(a) - prioridade(b);
            return diferenca !== 0 ? diferenca : a.nome.localeCompare(b.nome, 'pt-BR');
        });

    const valorAguaAtual = dados24h.agua[dados24h.agua.length - 1].valor;
    const valorAmbienteAtual = dados24h.ambiente[dados24h.ambiente.length - 1].valor;

    // Registro de Widgets (20-espc, layout movivel + Modo Compacto): CADA widget do
    // Dashboard descrito como dado (titulo/icone/resumo/render), nao mais JSX fixo — e o que
    // permite ColunaWidgets.jsx/WidgetSlot.jsx desenharem qualquer um deles de forma
    // generica (inteiro no modo normal, como cartao compacto + modal no Modo Compacto) sem
    // precisar saber nada sobre o conteudo especifico de cada um. "resumo" (opcional) e a
    // linha pequena que aparece no cartao compacto — só o suficiente pra saber o que é sem
    // abrir; widgets sem um resumo obvio simplesmente não mostram essa linha.
    const registroWidgets = {
        parametrosVitais: {
            titulo: 'Parametros Vitais',
            icone: <Gauge size={20} />,
            resumo: `${valorAguaAtual.toFixed(1)}°C · ${valorAmbienteAtual.toFixed(1)}°C`,
            render: () => <PainelParametrosVitais valorAgua={valorAguaAtual} valorAmbiente={valorAmbienteAtual} umidadeAr={umidadeAr} />,
        },
        historicoTermico: {
            titulo: 'Historico Termico',
            icone: <Thermometer size={20} />,
            render: () => <GraficoTemperatura dados24h={dados24h} dados30d={dados30d} />,
        },
        centralAquario: {
            titulo: 'Central do Aquario',
            icone: <Power size={20} />,
            resumo: `${equipamentosExibidos.filter((e) => e.ativo).length}/${equipamentosExibidos.length} ativo(s)`,
            render: () => (
                <PainelEquipamentos
                    equipamentos={equipamentosExibidos}
                    onAlternar={alternarEquipamento}
                    onConfigurarSaidas={() => setModalPortasAberto(true)}
                    moduloAtuador={moduloAtuador}
                    conectado={!!estadoReles}
                    filtro={filtroEquipamentos}
                    onAlternarFiltro={setFiltroEquipamentos}
                />
            ),
        },
        matrizReles: {
            titulo: 'Diagnostico de Reles (16CH)',
            icone: <Grid3x3 size={20} />,
            render: () => (
                <MatrizReles16CH
                    moduloAtuador={moduloAtuador}
                    estadoReles={estadoReles}
                    portas={portasMapeamento}
                    onAlternarPorta={alternarPorta}
                    onLigarTodos={() => acionarTodasAsPortas(true)}
                    onDesligarTodos={() => acionarTodasAsPortas(false)}
                />
            ),
        },
        temas: {
            titulo: 'Temas',
            icone: <Sparkles size={20} />,
            resumo: temas.find((t) => t.ativo)?.nome ?? (temas.length > 0 ? `${temas.length} tema(s)` : null),
            render: () => (
                <PainelTemas
                    moduloAtuador={moduloAtuador}
                    temas={temas}
                    onAbrirCriarTema={abrirCriarTema}
                    onEditar={abrirEdicaoTema}
                    onAplicar={aplicarTema}
                    onRemover={removerTema}
                />
            ),
        },
        agendamentos: {
            titulo: 'Agendamentos',
            icone: <CalendarClock size={20} />,
            resumo: estadoAgendamentos?.overrideAtivo ? 'Override ativo' : `${agendamentos.length} cadastrado(s)`,
            render: () => (
                <AgendamentosWidget
                    moduloAtuador={moduloAtuador}
                    agendamentos={agendamentos}
                    timers={timers}
                    estado={estadoAgendamentos}
                    onNovoAgendamento={abrirNovoAgendamento}
                    onEditarAgendamento={abrirEdicaoAgendamento}
                    onExcluirAgendamento={excluirAgendamento}
                    onAlternarAtivo={alternarAtivoAgendamento}
                    onNovoTimer={abrirNovoTimer}
                    onCancelarTimer={cancelarTimer}
                    onRetomarAgendamento={retomarAgendamento}
                />
            ),
        },
        modulosControladores: {
            titulo: 'Modulos de Controladores',
            icone: <Server size={20} />,
            resumo: `${modulos.length} modulo(s)`,
            render: () => (
                <ModulosControladores
                    modulos={modulos}
                    onCriar={criarModulo}
                    onRemover={removerModulo}
                    onAtualizarModulo={atualizarModuloLocal}
                    carregando={carregandoModulos}
                    erro={erroModulos}
                    onAbrirEsquematico={() => setModalEsquematicoAberto(true)}
                    registrarLog={registrarLog}
                />
            ),
        },
        qrcodes: {
            titulo: 'QR Codes',
            icone: <QrCode size={20} />,
            render: () => <PainelQrCodes />,
        },
        systemLog: {
            titulo: 'System Log',
            icone: <Terminal size={20} />,
            resumo: logs.length > 0 ? `${logs.length} evento(s)` : null,
            render: () => <TerminalLogs entradas={logs} />,
        },
    };

    // Central de Alertas de Conectividade (21-espc, ver AlertasConectividade.jsx) — lista
    // priorizada, nunca redundante: se a internet caiu, é o ÚNICO alerta (não faz sentido
    // dizer que o Brain/atuador/display estão inacessíveis quando a causa raiz já é essa);
    // se a internet está OK mas o Brain não responde, só esse aparece (os dados de
    // "modulos" já estariam obsoletos, então não dá pra confiar neles pra dizer se o
    // atuador/display estão mesmo offline); só quando internet E backend estão OK é que os
    // status reais de atuador/display (vindos de "modulos", atualizados de verdade) entram.
    const alertasConectividade = [];
    if (!internetOnline) {
        alertasConectividade.push({
            chave: 'internet',
            icone: <WifiOff size={16} />,
            mensagem: 'Sem conexao com a internet — verifique o roteador/provedor.',
        });
    } else if (!backendOnline) {
        alertasConectividade.push({
            chave: 'backend',
            icone: <CloudOff size={16} />,
            mensagem: 'Sem conexao com o AquaControl_Brain — servidor local inacessivel.',
        });
    } else {
        if (moduloAtuador && !moduloAtuador.online) {
            alertasConectividade.push({
                chave: 'atuador',
                icone: <ServerCrash size={16} />,
                mensagem: `Modulo Atuador (${moduloAtuador.ip}) sem resposta — comando remoto dos reles indisponivel.`,
            });
        }
        for (const disp of modulos.filter((m) => m.tipo === 'display' && !m.online)) {
            alertasConectividade.push({
                chave: `display-${disp.id}`,
                icone: <MonitorOff size={16} />,
                mensagem: `Display "${disp.nome}" (${disp.ip}) sem resposta.`,
            });
        }
    }

    // Menu de Acoes (14-espc): acesso permanente a qualquer tela de configuracao, mesmo com
    // o widget correspondente escondido em Layout/Widgets. IMPORTANTE (ver
    // 01-espc-geral/14_menu_de_acoes.md): toda nova funcionalidade/modal de configuracao
    // adicionada ao dashboard DEVE ganhar uma entrada aqui tambem.
    const itensMenu = [
        { chave: 'mapear-saidas', rotulo: 'Mapear Saidas', icone: <Settings size={16} />, onClick: () => setModalPortasAberto(true) },
        { chave: 'criar-tema', rotulo: 'Criar Tema', icone: <Sparkles size={16} />, onClick: abrirCriarTema },
        { chave: 'agendamentos', rotulo: 'Agendamentos', icone: <CalendarClock size={16} />, onClick: abrirNovoAgendamento },
        { chave: 'esquematico', rotulo: 'Esquematico Interativo', icone: <CircuitBoard size={16} />, onClick: () => setModalEsquematicoAberto(true) },
        { chave: 'layout-widgets', rotulo: 'Layout / Widgets', icone: <LayoutGrid size={16} />, onClick: () => setModalWidgetsAberto(true) },
    ];

    // Vinheta de fundo: Modo Panico (vermelho) tem prioridade absoluta — nunca mostra as
    // duas ao mesmo tempo, uma emergência de verdade não deve competir visualmente com um
    // aviso de conectividade.
    const classeVinheta = modoPanico ? 'dashboard--panico' : alertasConectividade.length > 0 ? 'dashboard--alerta-conectividade' : '';

    return (
        <div className={`dashboard hud-grid-bg ${classeVinheta}`}>
            <HeaderTatico
                backendOnline={backendOnline}
                latenciaMs={latenciaMs}
                onAbrirWidgets={() => setModalWidgetsAberto(true)}
                onAbrirMenu={() => setModalMenuAberto(true)}
                onAbrirEsquematico={() => setModalEsquematicoAberto(true)}
                onAbrirAgendamentos={abrirNovoAgendamento}
                modoPanico={modoPanico}
                onAtivarPanico={ativarModoPanico}
                onNormalizar={normalizarSistema}
                modoCompacto={modoCompacto}
                onAlternarModoCompacto={alternarModoCompacto}
            />

            <AlertasConectividade alertas={alertasConectividade} />

            {/* Layout movivel + Modo Compacto (20-espc) — as 3 colunas viram droppables/
                sortables do dnd-kit; qual widget mora em qual coluna/posicao vem de
                "layoutWidgets" (persistido), nao mais fixo no JSX. Ver ColunaWidgets.jsx e
                WidgetSlot.jsx pro que renderiza cada widget de fato. */}
            <DndContext
                sensors={sensoresDrag}
                collisionDetection={closestCenter}
                onDragStart={aoIniciarArrasto}
                onDragOver={aoArrastarSobre}
                onDragEnd={aoFinalizarArrasto}
            >
                <div className="dashboard__colunas">
                    {COLUNAS.map((coluna) => (
                        <ColunaWidgets
                            key={coluna}
                            id={coluna}
                            chaves={layoutWidgets[coluna]}
                            registro={registroWidgets}
                            visibilidade={visibilidadeWidgets}
                            modoCompacto={modoCompacto}
                        />
                    ))}
                </div>

                <DragOverlay>
                    {chaveArrastando && registroWidgets[chaveArrastando] ? (
                        <div className="widget-slot__overlay">
                            {registroWidgets[chaveArrastando].icone}
                            <span>{registroWidgets[chaveArrastando].titulo}</span>
                        </div>
                    ) : null}
                </DragOverlay>
            </DndContext>

            <ModalMapeamentoPortas
                aberto={modalPortasAberto}
                modulo={moduloAtuador}
                onFechar={() => setModalPortasAberto(false)}
                onSalvo={setPortasMapeamento}
                registrarLog={registrarLog}
            />

            <ModalWidgets
                aberto={modalWidgetsAberto}
                visibilidade={visibilidadeWidgets}
                onAlternar={alternarWidget}
                onFechar={() => setModalWidgetsAberto(false)}
            />

            <ModalCriarTema
                aberto={modalCriarTemaAberto}
                modulo={moduloAtuador}
                portas={portasMapeamento}
                temaEditando={temaEditando}
                onFechar={() => setModalCriarTemaAberto(false)}
                onSalvo={aoSalvarTema}
                onTestar={testarRelePontual}
                registrarLog={registrarLog}
            />

            <ModalMenuAcoes aberto={modalMenuAberto} itens={itensMenu} onFechar={() => setModalMenuAberto(false)} />

            <ModalAgendamento
                aberto={modalAgendamentoAberto}
                modulo={moduloAtuador}
                portas={portasMapeamento}
                temas={temas}
                agendamentoEditando={agendamentoEditando}
                onFechar={() => setModalAgendamentoAberto(false)}
                onSalvo={aoSalvarAgendamento}
                registrarLog={registrarLog}
            />

            <ModalTimer
                aberto={modalTimerAberto}
                modulo={moduloAtuador}
                portas={portasMapeamento}
                temas={temas}
                onFechar={() => setModalTimerAberto(false)}
                onDisparado={aoDispararTimer}
                registrarLog={registrarLog}
            />

            <EsquematicoInterativo
                aberto={modalEsquematicoAberto}
                onFechar={() => setModalEsquematicoAberto(false)}
                moduloAtuador={moduloAtuador}
                estadoReles={estadoReles}
                portas={portasMapeamento}
                onAlternarPorta={alternarPorta}
            />
        </div>
    );
}
