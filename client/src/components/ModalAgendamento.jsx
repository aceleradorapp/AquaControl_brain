import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import ModalHud from './ModalHud';

// Modal de Criacao/Edicao de Agendamentos (18-espc, Multiplos Horarios no 19-espc): agenda
// um Rele especifico OU um Tema completo pra ligar em quais dias da semana, suportando
// VARIOS intervalos hora_inicio/hora_fim pro mesmo agendamento (ex.: "08h-12h E 18h-22h" —
// botao "+" abaixo dos campos abre mais uma linha, lixeira remove). O motor de verdade
// (schedulerService.js, no server) que decide o que fazer com isso a cada ciclo de 10s —
// este modal so cadastra a intencao (POST/PUT /api/agendamentos, corpo com
// "horarios": [{horaInicio, horaFim}, ...]).
const DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];
const DIAS_UTEIS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];

let proximoIdLinha = 1;

function novaLinhaHorario() {
    return { chaveLocal: proximoIdLinha++, horaInicio: '08:00', horaFim: '18:00' };
}

export default function ModalAgendamento({ aberto, modulo, portas, temas, agendamentoEditando, onFechar, onSalvo, registrarLog }) {
    const [tipo, setTipo] = useState('rele');
    const [alvoId, setAlvoId] = useState('');
    const [horarios, setHorarios] = useState(() => [novaLinhaHorario()]);
    const [diasSemana, setDiasSemana] = useState([...DIAS_UTEIS]);
    const [repetir, setRepetir] = useState(true);
    const [salvando, setSalvando] = useState(false);

    const modoEdicao = !!agendamentoEditando;
    const portasMapeadas = portas.filter((porta) => porta.nomePersonalizado?.trim());

    // Pre-preenche em modo edicao (ou reseta pra criar um novo) — mesma convencao de
    // ModalCriarTema.jsx (dependencia em "aberto"/"...?.id", nao no objeto inteiro).
    useEffect(() => {
        if (!aberto) return;

        if (agendamentoEditando) {
            setTipo(agendamentoEditando.tipo);
            setAlvoId(String(agendamentoEditando.alvoId));
            setHorarios(
                agendamentoEditando.horarios.length > 0
                    ? agendamentoEditando.horarios.map((h) => ({ chaveLocal: proximoIdLinha++, ...h }))
                    : [novaLinhaHorario()]
            );
            setDiasSemana(agendamentoEditando.diasSemana);
            setRepetir(agendamentoEditando.repetir);
        } else {
            setTipo('rele');
            setAlvoId('');
            setHorarios([novaLinhaHorario()]);
            setDiasSemana([...DIAS_UTEIS]);
            setRepetir(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, agendamentoEditando?.id]);

    function alternarDia(dia) {
        setDiasSemana((atual) => (atual.includes(dia) ? atual.filter((d) => d !== dia) : [...atual, dia]));
    }

    function adicionarHorario() {
        setHorarios((atual) => [...atual, novaLinhaHorario()]);
    }

    function removerHorario(chaveLocal) {
        setHorarios((atual) => (atual.length > 1 ? atual.filter((h) => h.chaveLocal !== chaveLocal) : atual));
    }

    function atualizarHorario(chaveLocal, campo, valor) {
        setHorarios((atual) => atual.map((h) => (h.chaveLocal === chaveLocal ? { ...h, [campo]: valor } : h)));
    }

    function fechar() {
        onFechar();
    }

    async function salvar(evento) {
        evento.preventDefault();
        if (!alvoId || diasSemana.length === 0 || horarios.length === 0) return;

        setSalvando(true);
        const corpo = {
            moduloId: modulo.id,
            tipo,
            alvoId: Number(alvoId),
            horarios: horarios.map((h) => ({ horaInicio: h.horaInicio, horaFim: h.horaFim })),
            diasSemana,
            repetir,
        };

        try {
            const url = modoEdicao ? `/api/agendamentos/${agendamentoEditando.id}` : '/api/agendamentos';
            const resposta = await fetch(url, {
                method: modoEdicao ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corpo),
            });
            if (!resposta.ok) throw new Error();
            const agendamentoSalvo = await resposta.json();
            onSalvo?.(agendamentoSalvo);
            registrarLog?.(
                modoEdicao ? `Agendamento "${agendamentoSalvo.nome}" atualizado.` : `Agendamento "${agendamentoSalvo.nome}" criado.`,
                'sucesso'
            );
            fechar();
        } catch {
            registrarLog?.(modoEdicao ? 'Falha ao atualizar agendamento.' : 'Falha ao criar agendamento.', 'erro');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo={modoEdicao ? 'Editar Agendamento' : 'Novo Agendamento'}
            tag={modulo ? `MODULO: ${modulo.nome}` : 'NENHUM MODULO ATUADOR'}
            onFechar={fechar}
            largura="grande"
        >
            {!modulo && <p className="hud-tag">Nenhum modulo do tipo "atuador" cadastrado ainda.</p>}

            {modulo && (
                <form onSubmit={salvar} className="modal-agendamento">
                    <div className="modal-agendamento__tipo">
                        <button
                            type="button"
                            className={`modal-agendamento__tipo-item ${tipo === 'rele' ? 'modal-agendamento__tipo-item--ativo' : ''}`}
                            onClick={() => {
                                setTipo('rele');
                                setAlvoId('');
                            }}
                        >
                            Rele Especifico
                        </button>
                        <button
                            type="button"
                            className={`modal-agendamento__tipo-item ${tipo === 'tema' ? 'modal-agendamento__tipo-item--ativo' : ''}`}
                            onClick={() => {
                                setTipo('tema');
                                setAlvoId('');
                            }}
                        >
                            Tema Completo
                        </button>
                    </div>

                    {tipo === 'rele' ? (
                        <select className="hud-input" value={alvoId} onChange={(e) => setAlvoId(e.target.value)} required>
                            <option value="">Selecione o rele...</option>
                            {portasMapeadas.map((porta) => (
                                <option key={porta.posicaoIndice} value={porta.posicaoIndice}>
                                    {porta.nomePersonalizado}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <select className="hud-input" value={alvoId} onChange={(e) => setAlvoId(e.target.value)} required>
                            <option value="">Selecione o tema...</option>
                            {temas.map((tema) => (
                                <option key={tema.id} value={tema.id}>
                                    {tema.nome}
                                </option>
                            ))}
                        </select>
                    )}

                    {tipo === 'rele' && portasMapeadas.length === 0 && (
                        <p className="hud-tag">Nenhuma saida mapeada ainda — cadastre nomes em "Mapear Saidas" primeiro.</p>
                    )}
                    {tipo === 'tema' && temas.length === 0 && <p className="hud-tag">Nenhum tema criado ainda — crie um em "Temas" primeiro.</p>}

                    <div className="modal-agendamento__horarios-cabecalho">
                        <span className="hud-tag">Horarios (pode adicionar mais de um intervalo)</span>
                    </div>
                    <div className="modal-agendamento__horarios-lista">
                        {horarios.map((h) => (
                            <div key={h.chaveLocal} className="modal-agendamento__horarios">
                                <label className="modal-agendamento__campo-horario">
                                    <span className="hud-tag">Hora Inicio</span>
                                    <input
                                        className="hud-input"
                                        type="time"
                                        value={h.horaInicio}
                                        onChange={(e) => atualizarHorario(h.chaveLocal, 'horaInicio', e.target.value)}
                                        required
                                    />
                                </label>
                                <label className="modal-agendamento__campo-horario">
                                    <span className="hud-tag">Hora Fim</span>
                                    <input
                                        className="hud-input"
                                        type="time"
                                        value={h.horaFim}
                                        onChange={(e) => atualizarHorario(h.chaveLocal, 'horaFim', e.target.value)}
                                        required
                                    />
                                </label>
                                <button
                                    className="botao-icone botao-icone--erro modal-agendamento__botao-remover"
                                    type="button"
                                    onClick={() => removerHorario(h.chaveLocal)}
                                    disabled={horarios.length === 1}
                                    aria-label="Remover este intervalo de horario"
                                    title="Remover este intervalo"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <button className="modal-agendamento__botao-adicionar" type="button" onClick={adicionarHorario}>
                        <Plus size={14} />
                        Adicionar Horario
                    </button>

                    <div className="modal-agendamento__dias-cabecalho">
                        <span className="hud-tag">Dias da Semana</span>
                        <div className="modal-agendamento__atalhos">
                            <button type="button" className="modal-agendamento__atalho" onClick={() => setDiasSemana([...DIAS])}>
                                Todos
                            </button>
                            <button type="button" className="modal-agendamento__atalho" onClick={() => setDiasSemana([...DIAS_UTEIS])}>
                                Dias Uteis
                            </button>
                        </div>
                    </div>
                    <div className="modal-agendamento__dias">
                        {DIAS.map((dia) => (
                            <button
                                key={dia}
                                type="button"
                                className={`modal-agendamento__dia ${diasSemana.includes(dia) ? 'modal-agendamento__dia--ativo' : ''}`}
                                onClick={() => alternarDia(dia)}
                            >
                                {dia}
                            </button>
                        ))}
                    </div>

                    <label className="modal-agendamento__repetir">
                        <input type="checkbox" checked={repetir} onChange={(e) => setRepetir(e.target.checked)} />
                        <span>Repetir semanalmente (desmarque pra disparar uma unica vez e desativar sozinho)</span>
                    </label>

                    <div className="modal-hud__acoes">
                        <button className="botao-primario" type="submit" disabled={salvando || !alvoId || diasSemana.length === 0}>
                            {salvando ? 'Salvando...' : modoEdicao ? 'Salvar Alteracoes' : 'Criar Agendamento'}
                        </button>
                    </div>
                </form>
            )}
        </ModalHud>
    );
}
