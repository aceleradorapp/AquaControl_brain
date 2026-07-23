import { Activity, CalendarClock, CircuitBoard, LayoutGrid, Maximize2, Menu, Minimize2, Siren, ShieldCheck, Wifi, WifiOff } from 'lucide-react';
import { useRelogio } from '../hooks/useRelogio';

function formatarHora(data) {
    return data.toLocaleTimeString('pt-BR', { hour12: false });
}

function formatarData(data) {
    return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Header tático (01-espc-geral/05_dashboard_futurista_react.md e 06_...): status do
// backend, relógio em tempo real, latência e o botão "Layout / Widgets" que abre o
// ModalWidgets (ver Dashboard.jsx). "backendOnline"/"latenciaMs" vêm do Dashboard, que
// mede de verdade o round-trip do fetch a /api/modulos — nada aqui é decorativo/fake.
//
// "Nucleo Ativo" (o anel girando no centro) é só um indicador visual de "o dashboard está
// rodando" — não mede nada real, é decorativo por pedido do usuário ("algo legal"). O botão
// de Pânico/Normalizar já é funcional: aciona ativarModoPanico/normalizarSistema lá do
// Dashboard, que desliga os relés de verdade e retinta o tema (ver ".dashboard--panico").
// O botão de Menu (14-espc) abre o Menu de Ações (ModalMenuAcoes.jsx) — acesso permanente a
// qualquer tela de configuração, mesmo com o widget correspondente escondido. O botão
// "Esquematico" (16-espc) abre o Esquematico Interativo — também tem entrada duplicada no
// Menu de Ações, por consistência com a convenção de 14_menu_de_acoes.md. "Agendamentos"
// (18-espc) abre o ModalAgendamento (Novo Agendamento) direto — o Widget Tatico de
// Agendamentos completo fica na tela principal, ver Dashboard.jsx.
//
// Modo Compacto (20-espc, layout movivel — so monitores/tablets): alterna TODOS os widgets
// entre o formato cheio (normal) e um cartao pequeno e uniforme que abre em modal ao
// clicar (ver WidgetSlot.jsx) — o icone/estado do botao reflete qual modo esta ativo agora
// (Maximize2 = "esta compacto, clique pra expandir todos"; Minimize2 = "esta normal,
// clique pra compactar").
export default function HeaderTatico({
    backendOnline,
    latenciaMs,
    onAbrirWidgets,
    onAbrirMenu,
    onAbrirEsquematico,
    onAbrirAgendamentos,
    modoPanico,
    onAtivarPanico,
    onNormalizar,
    modoCompacto,
    onAlternarModoCompacto,
}) {
    const agora = useRelogio();

    return (
        <header className="hud-painel header-tatico">
            <div className="header-tatico__titulo">
                <h1 className="hud-titulo">AquaControl // Core System</h1>
                <span className="hud-tag">SYS.VER 2.0 — AQUARIUM LIFE SUPPORT</span>
            </div>

            <div className="nucleo-ativo" title="Sistema em execucao">
                <span className="nucleo-ativo__anel nucleo-ativo__anel--1" />
                <span className="nucleo-ativo__anel nucleo-ativo__anel--2" />
                <span className="nucleo-ativo__ponto" />
            </div>

            <div className="header-tatico__status">
                <span className={`header-tatico__badge ${backendOnline ? 'online' : 'offline'}`}>
                    {backendOnline ? <Wifi size={14} /> : <WifiOff size={14} />}
                    SYSTEM: {backendOnline ? 'ONLINE [OK]' : 'OFFLINE'}
                </span>

                <span className="hud-tag header-tatico__latencia">
                    <Activity size={12} />
                    LATENCY {latenciaMs != null ? `${latenciaMs}ms` : '--'}
                </span>

                <div className="header-tatico__relogio">
                    <span className="header-tatico__hora">{formatarHora(agora)}</span>
                    <span className="hud-tag">{formatarData(agora)}</span>
                </div>

                {modoPanico ? (
                    <button className="botao-normalizar" onClick={onNormalizar} type="button" title="Normalizar sistema">
                        <ShieldCheck size={16} />
                        NORMALIZAR
                    </button>
                ) : (
                    <button className="botao-panico" onClick={onAtivarPanico} type="button" title="Parada de emergencia — desliga todos os reles">
                        <Siren size={16} />
                        PANICO
                    </button>
                )}

                <button className="botao-icone" onClick={onAbrirEsquematico} type="button" title="Esquematico Interativo" aria-label="Esquematico Interativo">
                    <CircuitBoard size={16} />
                </button>

                <button className="botao-icone" onClick={onAbrirAgendamentos} type="button" title="Novo Agendamento" aria-label="Novo Agendamento">
                    <CalendarClock size={16} />
                </button>

                <button className="botao-icone" onClick={onAbrirMenu} type="button" title="Menu de acoes" aria-label="Menu de acoes">
                    <Menu size={16} />
                </button>

                <button
                    className={`botao-icone botao-icone--modo-compacto ${modoCompacto ? 'ativo' : ''}`}
                    onClick={onAlternarModoCompacto}
                    type="button"
                    title={modoCompacto ? 'Modo Compacto ativo — clique para expandir todos os widgets' : 'Ativar Modo Compacto'}
                    aria-label="Alternar Modo Compacto"
                    aria-pressed={modoCompacto}
                >
                    {modoCompacto ? <Maximize2 size={16} /> : <Minimize2 size={16} />}
                </button>

                <button className="botao-icone" onClick={onAbrirWidgets} type="button" title="Personalizar tela / widgets" aria-label="Personalizar tela / widgets">
                    <LayoutGrid size={16} />
                </button>
            </div>
        </header>
    );
}
