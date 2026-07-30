import { Pencil, Plus, Trash2 } from 'lucide-react';
import ModalHud from './ModalHud';
import { formatarDias, formatarHorarios } from '../utils/formatoAgendamento';

// Lista de Agendamentos Cadastrados (24-espc) — a mesma acao de editar/excluir/ativar-desativar
// ja existia dentro do accordion "Cadastrados" de AgendamentosWidget.jsx, mas esse widget pode
// ficar ESCONDIDO via Layout/Widgets, e o item "Agendamentos" do Menu de Acoes so abria "Novo
// Agendamento" direto — sem lista nenhuma. Este modal e um lugar SEMPRE alcancavel (Menu de
// Acoes + botao de lista no proprio widget) pra ver/editar/excluir tudo que ja foi cadastrado,
// seguindo a convencao documentada em CLAUDE.md ("qualquer modal de acao/configuracao precisa
// de entrada no Menu de Acoes, nao so no widget").
export default function ModalListaAgendamentos({ aberto, moduloAtuador, agendamentos, onFechar, onNovoAgendamento, onEditarAgendamento, onExcluirAgendamento, onAlternarAtivo }) {
    // Fecha esta lista ANTES de abrir Novo/Editar — mesmo padrao de "navegarPara" ja usado em
    // ModalCentralDiagnostico.jsx, evita dois modais empilhados ao mesmo tempo.
    function abrirNovo() {
        onFechar();
        onNovoAgendamento();
    }

    function abrirEdicao(agendamento) {
        onFechar();
        onEditarAgendamento(agendamento);
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo="Agendamentos Cadastrados"
            tag={moduloAtuador ? `MODULO: ${moduloAtuador.nome}` : 'NENHUM MODULO ATUADOR'}
            onFechar={onFechar}
            largura="grande"
        >
            {!moduloAtuador && <p className="hud-tag">Nenhum modulo do tipo "atuador" cadastrado ainda.</p>}

            {moduloAtuador && (
                <div className="modal-lista-agendamentos">
                    <button className="botao-primario modal-lista-agendamentos__botao-novo" onClick={abrirNovo} type="button">
                        <Plus size={14} />
                        Novo Agendamento
                    </button>

                    <div className="modal-lista-agendamentos__lista hud-scrollbar">
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
                                    onClick={() => abrirEdicao(ag)}
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
                            <p className="hud-tag agendamentos-widget__vazio">Nenhum agendamento cadastrado ainda — clique em "Novo Agendamento" acima.</p>
                        )}
                    </div>
                </div>
            )}
        </ModalHud>
    );
}
