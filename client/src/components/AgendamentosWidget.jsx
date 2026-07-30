import { useState } from 'react';
import { AlertTriangle, CalendarClock, ChevronDown, ChevronUp, List, Pencil, Plus, ShieldCheck, Timer, Trash2, Zap } from 'lucide-react';
import { formatarDias, formatarHorarios } from '../utils/formatoAgendamento';

// Widget Tatico de Agendamentos (18-espc, 01-espc-geral/15_engine_agendamento_timers_e_overrides.md)
// — a cara publica do Motor de Agendamento Inteligente (ver schedulerService.js no server).
// Todo estado (o que esta ligado agora, o proximo, se o override esta pausando tudo) vem
// PRONTO do servidor via GET /api/agendamentos/estado (Dashboard.jsx faz o polling e passa
// como prop "estado") — o widget nao reimplementa a logica de dia/hora, so exibe.
//
// Layout compacto em accordion (19-espc): por padrao so os cards de destaque (ativo
// agora/proximo, ver acima) ficam visiveis — a lista "CADASTRADOS" vem recolhida, o usuario
// expande clicando no cabecalho da secao (ver "cadastradosAberto" abaixo).
//
// 24-espc: editar/excluir ja existiam aqui dentro (accordion "Cadastrados"), mas esse widget
// pode ficar ESCONDIDO via Layout/Widgets — e o item "Agendamentos" no Menu de Acoes so abria
// "Novo Agendamento" direto, sem lista nenhuma. Agora o botao de lista (icone List) abre
// ModalListaAgendamentos.jsx, que tem a MESMA lista/acoes mas num modal sempre alcancavel,
// independente do widget estar visivel ou nao — ver Dashboard.jsx.
function formatarMinutos(minutos) {
    if (minutos < 60) return `${minutos}min`;
    const h = Math.floor(minutos / 60);
    const m = minutos % 60;
    return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function paraMinutosDoDia(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

// % decorrido da janela hora_inicio -> hora_fim, ate agora — suporta janela que atravessa
// a meia-noite (ex.: 22:00 -> 06:00) calculando a duracao "circular".
function calcularProgresso(horaInicio, horaFim) {
    const agora = new Date();
    const minAgora = agora.getHours() * 60 + agora.getMinutes();
    const minIni = paraMinutosDoDia(horaInicio);
    const minFim = paraMinutosDoDia(horaFim);

    const duracaoTotal = minFim > minIni ? minFim - minIni : 24 * 60 - minIni + minFim;
    const decorrido = minAgora >= minIni ? minAgora - minIni : 24 * 60 - minIni + minAgora;
    if (duracaoTotal <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((decorrido / duracaoTotal) * 100)));
}

function formatarRestanteTimer(expiraEmIso) {
    const restanteMs = new Date(expiraEmIso).getTime() - Date.now();
    return formatarMinutos(Math.max(0, Math.round(restanteMs / 60000)));
}

export default function AgendamentosWidget({
    moduloAtuador,
    agendamentos,
    timers,
    estado,
    onNovoAgendamento,
    onEditarAgendamento,
    onExcluirAgendamento,
    onAlternarAtivo,
    onNovoTimer,
    onCancelarTimer,
    onRetomarAgendamento,
    onAbrirLista,
}) {
    const [cadastradosAberto, setCadastradosAberto] = useState(false);

    const overrideAtivo = estado?.overrideAtivo ?? false;
    const ativosAgora = estado?.ativosAgora ?? [];
    const proximo = estado?.proximo ?? null;

    return (
        <div className="hud-painel agendamentos-widget">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Agendamentos</h2>
                <div className="painel-cabecalho__acoes">
                    <button className="botao-icone" onClick={onAbrirLista} aria-label="Ver todos os agendamentos" title="Ver todos / editar / excluir" type="button">
                        <List size={16} />
                    </button>
                    <button className="botao-icone" onClick={onNovoTimer} aria-label="Timer rapido" title="Timer rapido" type="button">
                        <Timer size={16} />
                    </button>
                    <button className="botao-icone" onClick={onNovoAgendamento} aria-label="Novo agendamento" title="Novo agendamento" type="button">
                        <Plus size={16} />
                    </button>
                </div>
            </div>

            {!moduloAtuador && <p className="hud-tag">Nenhum modulo do tipo "atuador" cadastrado ainda.</p>}

            {moduloAtuador && (
                <>
                    {overrideAtivo && (
                        <div className="agendamentos-widget__override">
                            <AlertTriangle size={16} />
                            <span>OVERRIDE MANUAL ATIVO — AGENDAMENTOS EM PAUSA</span>
                            <button className="agendamentos-widget__botao-retomar" onClick={onRetomarAgendamento} type="button">
                                <ShieldCheck size={13} />
                                Retomar Agendamento
                            </button>
                        </div>
                    )}

                    {ativosAgora.length > 0 && (
                        <div className="agendamentos-widget__secao">
                            {ativosAgora.map((item) => (
                                <div key={`ativo-${item.tipo}-${item.id}`} className="agendamentos-widget__card agendamentos-widget__card--ativo">
                                    <div className="agendamentos-widget__card-topo">
                                        <Zap size={14} />
                                        <span className="agendamentos-widget__card-nome">{item.nome}</span>
                                        <span className="hud-tag">
                                            {item.horaInicio} &rarr; {item.horaFim}
                                        </span>
                                    </div>
                                    <div className="agendamentos-widget__barra">
                                        <div
                                            className="agendamentos-widget__barra-preenchida"
                                            style={{ width: `${calcularProgresso(item.horaInicio, item.horaFim)}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {proximo && (
                        <div className="agendamentos-widget__secao">
                            <div className="agendamentos-widget__card agendamentos-widget__card--proximo">
                                <div className="agendamentos-widget__card-topo">
                                    <CalendarClock size={14} />
                                    <span className="agendamentos-widget__card-nome">
                                        Em {formatarMinutos(proximo.minutosRestantes)}: {proximo.nome}
                                    </span>
                                </div>
                                <span className="hud-tag">
                                    {proximo.horaInicio} &rarr; {proximo.horaFim}
                                </span>
                            </div>
                        </div>
                    )}

                    {!overrideAtivo && ativosAgora.length === 0 && !proximo && agendamentos.length > 0 && (
                        <p className="hud-tag agendamentos-widget__vazio">Nenhum agendamento previsto pras proximas horas.</p>
                    )}

                    {timers.length > 0 && (
                        <div className="agendamentos-widget__secao">
                            <span className="hud-tag agendamentos-widget__rotulo-secao">Timers Ativos</span>
                            {timers.map((timer) => (
                                <div key={timer.id} className="agendamentos-widget__timer">
                                    <Timer size={13} />
                                    <span className="agendamentos-widget__card-nome">{timer.nome}</span>
                                    <span className="hud-tag">restam {formatarRestanteTimer(timer.expiraEm)}</span>
                                    <button
                                        className="botao-icone botao-icone--erro"
                                        onClick={() => onCancelarTimer(timer.id)}
                                        aria-label={`Cancelar timer ${timer.nome}`}
                                        title="Cancelar timer"
                                        type="button"
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        className="agendamentos-widget__toggle-cadastrados"
                        onClick={() => setCadastradosAberto((v) => !v)}
                        type="button"
                        aria-expanded={cadastradosAberto}
                    >
                        <span className="hud-tag">Cadastrados ({agendamentos.length})</span>
                        {cadastradosAberto ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                    <div
                        className={`agendamentos-widget__lista hud-scrollbar ${cadastradosAberto ? 'agendamentos-widget__lista--aberto' : ''}`}
                    >
                        {agendamentos.map((ag) => (
                            <div key={ag.id} className={`agendamentos-widget__linha ${!ag.ativo ? 'agendamentos-widget__linha--inativo' : ''}`}>
                                <label className="agendamentos-widget__chave" title={ag.ativo ? 'Desativar' : 'Ativar'}>
                                    <input type="checkbox" checked={ag.ativo} onChange={() => onAlternarAtivo(ag)} />
                                </label>
                                <div className="agendamentos-widget__info">
                                    <span className="agendamentos-widget__nome">{ag.nome}</span>
                                    <span className="hud-tag">
                                        {formatarHorarios(ag.horarios)} · {formatarDias(ag.diasSemana)}
                                    </span>
                                </div>
                                <button
                                    className="botao-icone"
                                    onClick={() => onEditarAgendamento(ag)}
                                    aria-label={`Editar agendamento ${ag.nome}`}
                                    title="Editar"
                                    type="button"
                                >
                                    <Pencil size={13} />
                                </button>
                                <button
                                    className="botao-icone botao-icone--erro"
                                    onClick={() => onExcluirAgendamento(ag.id)}
                                    aria-label={`Excluir agendamento ${ag.nome}`}
                                    title="Excluir"
                                    type="button"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                        {agendamentos.length === 0 && (
                            <p className="hud-tag agendamentos-widget__vazio">Nenhum agendamento cadastrado ainda — clique no "+" acima.</p>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
