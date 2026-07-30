import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Cpu, Plus, X } from 'lucide-react';
import ModalHud from './ModalHud';
import { ICONES_SENSOR, formatarValorSensor } from '../utils/sensores';

const MAX_SENSORES = 6;
// Mesma paleta (por SLOT, nao por tipo) do grid real no firmware — ver
// AquaControl_OS/src/DisplayHUD.cpp:desenharGridSensores. Mantida em sincronia manualmente
// (nao ha como compartilhar isso com o C++ automaticamente); se a ordem de cores mudar la,
// mude aqui tambem pra o preview continuar batendo com a tela de verdade.
const CORES_SLOT = ['#07ffff', '#ffbe00', '#249fff', '#00ff7f', '#ffffff', '#03efef'];

// Os dois campos de nome (16-espc), compartilhados entre o card de slot preenchido e a linha
// "disponivel" — "nome" e o nome geral (aparece em todo o dashboard), "nomeDisplay" e SO pro
// que e mandado de verdade pro Display. "onPointerDown" com stopPropagation impede que o
// dnd-kit capture o clique nos campos como inicio de arrasto (os listeners de drag ficam no
// card/linha inteira, ver LinhaSelecionada/LinhaDisponivel).
function CamposNome({ nome, nomeDisplay, onNomeChange, onNomeDisplayChange }) {
    return (
        <div className="config-sensores-grid__campos" onPointerDown={(e) => e.stopPropagation()}>
            <input
                className="hud-input config-sensores-grid__input"
                value={nome}
                onChange={(e) => onNomeChange(e.target.value)}
                placeholder="Nome do sensor"
            />
            <input
                className="hud-input config-sensores-grid__input"
                value={nomeDisplay}
                onChange={(e) => onNomeDisplayChange(e.target.value)}
                placeholder="Nome no Display"
            />
        </div>
    );
}

// Card de um slot PREENCHIDO no grid interativo — arrastavel/reordenavel via dnd-kit
// (useSortable, dentro do mesmo SortableContext dos outros slots preenchidos). O card inteiro
// e a "alca" de arrasto (attributes/listeners no container), exceto os campos de nome e o
// botao de remover, que interrompem a propagacao do pointerdown pra poder ser clicados/
// digitados sem iniciar um arrasto.
function CardSlotPreenchido({ sensor, cor, nome, nomeDisplay, onNomeChange, onNomeDisplayChange, onRemover }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sensor.id });
    const Icone = ICONES_SENSOR[sensor.tipo] ?? Cpu;
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
        borderColor: cor,
    };

    return (
        <div ref={setNodeRef} style={style} className="config-sensores-grid__slot preenchido" {...attributes} {...listeners}>
            <button
                type="button"
                className="config-sensores-grid__remover"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => {
                    e.stopPropagation();
                    onRemover();
                }}
                aria-label="Remover da selecao"
            >
                <X size={12} />
            </button>
            <Icone size={16} color={cor} />
            <CamposNome nome={nome} nomeDisplay={nomeDisplay} onNomeChange={onNomeChange} onNomeDisplayChange={onNomeDisplayChange} />
            <div className="config-sensores-grid__status">
                <span className={`hud-status-dot ${sensor.conectado ? 'online' : 'offline'}`} title={sensor.conectado ? 'Conectado' : 'Nao detectado'} />
                <span className="hud-mono">{sensor.conectado ? formatarValorSensor(sensor) : '--'}</span>
            </div>
        </div>
    );
}

// Slot VAZIO — alvo de drop (useDroppable) pra receber um sensor arrastado da lista de
// Disponiveis; "sobre" (isOver) da o feedback visual de glow enquanto algo esta sendo
// arrastado por cima.
function SlotVazio({ id }) {
    const { isOver, setNodeRef } = useDroppable({ id });
    return (
        <div ref={setNodeRef} className={`config-sensores-grid__slot vazio ${isOver ? 'sobre' : ''}`}>
            <Plus size={18} />
            <span>Adicionar Sensor</span>
        </div>
    );
}

// Linha de um sensor ainda NAO selecionado — arrastavel (useDraggable, fonte "avulsa": nao
// faz parte do SortableContext do grid, so entrega o id pro onDragEnd decidir o que fazer) +
// checkbox como atalho pra adicionar sem precisar arrastar (preenche o proximo slot livre).
function LinhaDisponivel({ sensor, nome, nomeDisplay, onNomeChange, onNomeDisplayChange, onAdicionar, desabilitado }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: sensor.id, disabled: desabilitado });
    const Icone = ICONES_SENSOR[sensor.tipo] ?? Cpu;
    const style = transform
        ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: isDragging ? 200 : 'auto', opacity: isDragging ? 0.6 : 1 }
        : undefined;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`config-sensores-display__item ${desabilitado ? 'desabilitado' : ''}`}
            {...attributes}
            {...listeners}
        >
            <input
                type="checkbox"
                checked={false}
                disabled={desabilitado}
                onChange={onAdicionar}
                onPointerDown={(e) => e.stopPropagation()}
            />
            <Icone size={15} />
            <CamposNome nome={nome} nomeDisplay={nomeDisplay} onNomeChange={onNomeChange} onNomeDisplayChange={onNomeDisplayChange} />
            <span className={`hud-status-dot ${sensor.conectado ? 'online' : 'offline'}`} title={sensor.conectado ? 'Conectado' : 'Nao detectado'} />
            <span className="hud-tag config-sensores-display__item-valor">{sensor.conectado ? formatarValorSensor(sensor) : '--'}</span>
        </div>
    );
}

// Modal "Configurar Sensores do Display" (16-espc): o PRÓPRIO preview da tela principal do
// AquaControl_OS é a superfície interativa — um grid fixo de 6 slots (3 colunas x 2 linhas,
// estilo bezel/tela escura) onde os sensores selecionados podem ser arrastados pra reordenar,
// e slots vazios mostram um placeholder tracejado "+ Adicionar Sensor" que aceita um sensor
// arrastado da lista de Disponiveis. A ordem dos slots preenchidos = a ordem real dos cards no
// Display. Cada sensor (selecionado ou nao) tem dois campos de nome editaveis: "Nome do
// sensor" (nomePersonalizado, usado em todo o dashboard) e "Nome no Display" (nomeDisplay, so
// pro que aparece na tela fisica — mudar aqui NAO afeta o nome oficial do sensor). Salvar
// manda os dois PUTs de uma vez (selecao/ordem + nomes).
export default function ModalConfigurarSensoresDisplay({ aberto, onFechar, dadosSensores, selecaoAtual, onSalvo, onRenomeado }) {
    const [ordem, setOrdem] = useState([]);
    const [nomes, setNomes] = useState({}); // sensorId -> { nome, nomeDisplay }
    const [salvando, setSalvando] = useState(false);

    // Reinicia a partir do que ja esta salvo toda vez que o modal abre — descarta qualquer
    // edicao nao salva de uma abertura anterior (mesmo espirito de "cancelar" implicito).
    useEffect(() => {
        if (!aberto) return;
        setOrdem(selecaoAtual.map((item) => item.sensorId));

        const catalogo = dadosSensores?.disponivel ? dadosSensores.sensores : [];
        const iniciais = {};
        for (const sensor of catalogo) {
            iniciais[sensor.id] = { nome: sensor.nome, nomeDisplay: sensor.nomeDisplay || sensor.nome };
        }
        setNomes(iniciais);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto]);

    const catalogo = dadosSensores?.disponivel ? dadosSensores.sensores : [];
    const catalogoPorId = new Map(catalogo.map((s) => [s.id, s]));

    function atualizarNome(sensorId, campo, valor) {
        setNomes((atual) => ({ ...atual, [sensorId]: { ...atual[sensorId], [campo]: valor } }));
    }

    function adicionarSensor(sensorId) {
        setOrdem((atual) => (atual.length >= MAX_SENSORES || atual.includes(sensorId) ? atual : [...atual, sensorId]));
    }

    function removerSensor(sensorId) {
        setOrdem((atual) => atual.filter((id) => id !== sensorId));
    }

    const sensoresDrag = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

    // Slots vazios sao sempre o "final" do array (ordem e sempre compacta, sem buracos), entao
    // soltar em QUALQUER slot vazio equivale a "colocar no fim" — simplifica bastante a logica
    // de insercao, sem precisar lidar com posicoes esparsas.
    function aoFinalizarArrasto(evento) {
        const { active, over } = evento;
        if (!over) return;

        const idAtivo = active.id;
        const idAlvo = over.id;
        const jaSelecionado = ordem.includes(idAtivo);
        const alvoEhSlotVazio = String(idAlvo).startsWith('vazio-');

        if (jaSelecionado) {
            // Reordenando dentro do proprio grid
            if (idAtivo === idAlvo) return;
            if (alvoEhSlotVazio || !ordem.includes(idAlvo)) {
                setOrdem((atual) => [...atual.filter((id) => id !== idAtivo), idAtivo]);
            } else {
                setOrdem((atual) => arrayMove(atual, atual.indexOf(idAtivo), atual.indexOf(idAlvo)));
            }
            return;
        }

        // Vindo da lista de Disponiveis — adicionar, respeitando o limite de 6
        if (ordem.length >= MAX_SENSORES) return;

        if (alvoEhSlotVazio || !ordem.includes(idAlvo)) {
            setOrdem((atual) => [...atual, idAtivo]);
        } else {
            setOrdem((atual) => {
                const copia = [...atual];
                copia.splice(atual.indexOf(idAlvo), 0, idAtivo);
                return copia.slice(0, MAX_SENSORES);
            });
        }
    }

    async function salvar() {
        setSalvando(true);
        try {
            const listaNomes = Object.entries(nomes).map(([sensorId, valores]) => ({
                sensorId,
                nomePersonalizado: valores.nome,
                nomeDisplay: valores.nomeDisplay,
            }));

            const [respostaSelecao] = await Promise.all([
                fetch('/api/config-display-sensores', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ selecionados: ordem }),
                }),
                fetch('/api/sensores-personalizados', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sensores: listaNomes }),
                }),
            ]);

            const dadosSelecao = await respostaSelecao.json();
            if (respostaSelecao.ok) {
                onSalvo(dadosSelecao);
                onRenomeado(); // forca o Dashboard a rebuscar os sensores na hora, refletindo os nomes novos em todo lugar
                onFechar();
            }
        } finally {
            setSalvando(false);
        }
    }

    const naoSelecionados = catalogo.filter((s) => !ordem.includes(s.id));

    return (
        <ModalHud
            aberto={aberto}
            titulo="Configurar Sensores do Display"
            tag={`ATE ${MAX_SENSORES} SENSORES — ${ordem.length}/${MAX_SENSORES} SELECIONADOS`}
            onFechar={onFechar}
            largura="grande"
        >
            {!dadosSensores?.disponivel && (
                <p className="mensagem-erro hud-tag">Modulo de telemetria inacessivel agora — nao da pra listar os sensores.</p>
            )}

            {dadosSensores?.disponivel && (
                <DndContext sensors={sensoresDrag} collisionDetection={closestCenter} onDragEnd={aoFinalizarArrasto}>
                    <div className="config-sensores-display">
                        <div className="config-sensores-display__preview-coluna">
                            <span className="hud-tag">TELA DO DISPLAY — arraste pra reordenar, arraste um disponivel pra dentro</span>
                            <SortableContext items={ordem} strategy={rectSortingStrategy}>
                                <div className="config-sensores-grid">
                                    {Array.from({ length: MAX_SENSORES }).map((_, indice) => {
                                        const sensorId = ordem[indice];
                                        if (!sensorId) return <SlotVazio key={`vazio-${indice}`} id={`vazio-${indice}`} />;

                                        const sensor = catalogoPorId.get(sensorId);
                                        if (!sensor) return <SlotVazio key={`vazio-${indice}`} id={`vazio-${indice}`} />;

                                        const valores = nomes[sensorId] ?? { nome: sensor.nome, nomeDisplay: sensor.nomeDisplay || sensor.nome };
                                        return (
                                            <CardSlotPreenchido
                                                key={sensorId}
                                                sensor={sensor}
                                                cor={CORES_SLOT[indice]}
                                                nome={valores.nome}
                                                nomeDisplay={valores.nomeDisplay}
                                                onNomeChange={(v) => atualizarNome(sensorId, 'nome', v)}
                                                onNomeDisplayChange={(v) => atualizarNome(sensorId, 'nomeDisplay', v)}
                                                onRemover={() => removerSensor(sensorId)}
                                            />
                                        );
                                    })}
                                </div>
                            </SortableContext>
                        </div>

                        <div className="config-sensores-display__lista-coluna">
                            <span className="hud-tag">SENSORES DISPONIVEIS — arraste pra um slot ou marque a caixa</span>
                            <div className="config-sensores-display__lista hud-scrollbar">
                                {naoSelecionados.map((sensor) => {
                                    const valores = nomes[sensor.id] ?? { nome: sensor.nome, nomeDisplay: sensor.nomeDisplay || sensor.nome };
                                    return (
                                        <LinhaDisponivel
                                            key={sensor.id}
                                            sensor={sensor}
                                            nome={valores.nome}
                                            nomeDisplay={valores.nomeDisplay}
                                            onNomeChange={(v) => atualizarNome(sensor.id, 'nome', v)}
                                            onNomeDisplayChange={(v) => atualizarNome(sensor.id, 'nomeDisplay', v)}
                                            onAdicionar={() => adicionarSensor(sensor.id)}
                                            desabilitado={ordem.length >= MAX_SENSORES}
                                        />
                                    );
                                })}
                                {naoSelecionados.length === 0 && (
                                    <p className="hud-tag config-sensores-display__vazio-lista">Todos os sensores ja estao selecionados.</p>
                                )}
                            </div>

                            <button className="botao-primario" type="button" onClick={salvar} disabled={salvando}>
                                {salvando ? 'Salvando...' : 'Salvar'}
                            </button>
                        </div>
                    </div>
                </DndContext>
            )}
        </ModalHud>
    );
}
