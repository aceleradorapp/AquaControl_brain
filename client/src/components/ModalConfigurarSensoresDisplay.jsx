import { useEffect, useState } from 'react';
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Cpu, GripVertical } from 'lucide-react';
import ModalHud from './ModalHud';
import { ICONES_SENSOR, formatarValorSensor } from '../utils/sensores';

const MAX_SENSORES = 6;
const MAX_COLUNAS = 3;
// Mesma paleta (por SLOT, nao por tipo) do grid real no firmware — ver
// AquaControl_OS/src/DisplayHUD.cpp:desenharGridSensores. Mantida em sincronia manualmente
// (nao ha como compartilhar isso com o C++ automaticamente); se a ordem de cores mudar la,
// mude aqui tambem pra o preview continuar batendo com a tela de verdade.
const CORES_SLOT = ['#07ffff', '#ffbe00', '#249fff', '#00ff7f', '#ffffff', '#03efef'];

// Os dois campos de nome (16-espc), compartilhados entre a linha "selecionado" (arrastavel)
// e a linha "disponivel" — "nome" e o nome geral (aparece em todo o dashboard), "nomeDisplay"
// e SO pro que e mandado de verdade pro Display (Config.h nao entra aqui, isso e so texto).
function CamposNome({ nome, nomeDisplay, onNomeChange, onNomeDisplayChange }) {
    return (
        <div className="config-sensores-display__campos">
            <input
                className="hud-input config-sensores-display__input"
                value={nome}
                onChange={(e) => onNomeChange(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="Nome do sensor"
            />
            <input
                className="hud-input config-sensores-display__input"
                value={nomeDisplay}
                onChange={(e) => onNomeDisplayChange(e.target.value)}
                onPointerDown={(e) => e.stopPropagation()}
                placeholder="Nome no Display"
            />
        </div>
    );
}

// Linha de um sensor JA selecionado — arrastavel (dnd-kit), com um botao proprio de "pegar"
// (GripVertical) pra nao competir com o clique/foco dos inputs de nome ou do checkbox de
// remover (useSortable's listeners so vao no grip, nao na linha inteira).
function LinhaSelecionada({ sensor, nome, nomeDisplay, onNomeChange, onNomeDisplayChange, onRemover }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: sensor.id });
    const Icone = ICONES_SENSOR[sensor.tipo] ?? Cpu;
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} className="config-sensores-display__item selecionado">
            <button type="button" className="config-sensores-display__arrasta" aria-label="Arrastar para reordenar" {...attributes} {...listeners}>
                <GripVertical size={14} />
            </button>
            <Icone size={15} />
            <CamposNome nome={nome} nomeDisplay={nomeDisplay} onNomeChange={onNomeChange} onNomeDisplayChange={onNomeDisplayChange} />
            <span className={`hud-status-dot ${sensor.conectado ? 'online' : 'offline'}`} title={sensor.conectado ? 'Conectado' : 'Nao detectado'} />
            <span className="hud-tag config-sensores-display__item-valor">{sensor.conectado ? formatarValorSensor(sensor) : '--'}</span>
            <input type="checkbox" checked readOnly onChange={onRemover} title="Remover da selecao" />
        </div>
    );
}

// Linha de um sensor ainda NAO selecionado — sem arrasto, so o checkbox pra adicionar.
function LinhaDisponivel({ sensor, nome, nomeDisplay, onNomeChange, onNomeDisplayChange, onAdicionar, desabilitado }) {
    const Icone = ICONES_SENSOR[sensor.tipo] ?? Cpu;
    return (
        <div className={`config-sensores-display__item ${desabilitado ? 'desabilitado' : ''}`}>
            <input type="checkbox" checked={false} disabled={desabilitado} onChange={onAdicionar} />
            <Icone size={15} />
            <CamposNome nome={nome} nomeDisplay={nomeDisplay} onNomeChange={onNomeChange} onNomeDisplayChange={onNomeDisplayChange} />
            <span className={`hud-status-dot ${sensor.conectado ? 'online' : 'offline'}`} title={sensor.conectado ? 'Conectado' : 'Nao detectado'} />
            <span className="hud-tag config-sensores-display__item-valor">{sensor.conectado ? formatarValorSensor(sensor) : '--'}</span>
        </div>
    );
}

// Modal "Configurar Sensores do Display" (16-espc): representa visualmente a tela principal
// do AquaControl_OS (grid de ate 6 sensores, ate 3 colunas x 2 linhas — mesma matematica de
// DisplayHUD.cpp:desenharGridSensores) do lado esquerdo; do lado direito, uma coluna com
// TODOS os sensores do modulo de telemetria, divididos em "Selecionados" (arrastavel — a
// ordem da lista = a ordem dos slots no grid) e "Disponiveis" (so pra marcar). Cada sensor
// tem dois campos de nome editaveis: o nome geral (aparece em todo o dashboard) e o nome
// "so pro Display" (o que e enviado de verdade pro ESP32, pode ser mais curto/diferente).
// Salvar manda os dois PUTs (selecao/ordem + nomes) de uma vez.
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

    function aoFinalizarArrasto(evento) {
        const { active, over } = evento;
        if (!over || active.id === over.id) return;
        setOrdem((atual) => {
            const indiceAtivo = atual.indexOf(active.id);
            const indiceSobre = atual.indexOf(over.id);
            if (indiceAtivo === -1 || indiceSobre === -1) return atual;
            return arrayMove(atual, indiceAtivo, indiceSobre);
        });
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
    const totalSlots = ordem.length;
    const colunas = totalSlots > 0 ? Math.min(totalSlots, MAX_COLUNAS) : 1;
    const linhas = totalSlots > 0 ? Math.ceil(totalSlots / colunas) : 1;

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
                <div className="config-sensores-display">
                    <div className="config-sensores-display__preview-coluna">
                        <span className="hud-tag">TELA PRINCIPAL DO DISPLAY (preview)</span>
                        <div className="config-sensores-display__tela">
                            {totalSlots === 0 && <span className="config-sensores-display__vazio">AGUARDANDO SENSORES...</span>}
                            {totalSlots > 0 && (
                                <div
                                    className="config-sensores-display__grid"
                                    style={{ gridTemplateColumns: `repeat(${colunas}, 1fr)`, gridTemplateRows: `repeat(${linhas}, 1fr)` }}
                                >
                                    {ordem.map((sensorId, indice) => {
                                        const sensor = catalogoPorId.get(sensorId);
                                        if (!sensor) return null;
                                        const nomeExibido = nomes[sensorId]?.nomeDisplay || sensor.nomeDisplay || sensor.nome;
                                        return (
                                            <div key={sensorId} className="config-sensores-display__slot" style={{ borderColor: CORES_SLOT[indice] }}>
                                                <span className="config-sensores-display__slot-nome">{nomeExibido}</span>
                                                <span className="config-sensores-display__slot-valor" style={{ color: CORES_SLOT[indice] }}>
                                                    {sensor.conectado ? formatarValorSensor(sensor) : '--'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="config-sensores-display__lista-coluna">
                        <span className="hud-tag">SELECIONADOS — arraste pra reordenar (ordem = ordem no Display)</span>
                        <DndContext sensors={sensoresDrag} collisionDetection={closestCenter} onDragEnd={aoFinalizarArrasto}>
                            <SortableContext items={ordem} strategy={verticalListSortingStrategy}>
                                <div className="config-sensores-display__lista">
                                    {ordem.length === 0 && <p className="hud-tag config-sensores-display__vazio-lista">Nenhum sensor selecionado ainda.</p>}
                                    {ordem.map((sensorId) => {
                                        const sensor = catalogoPorId.get(sensorId);
                                        if (!sensor) return null;
                                        const valores = nomes[sensorId] ?? { nome: sensor.nome, nomeDisplay: sensor.nomeDisplay || sensor.nome };
                                        return (
                                            <LinhaSelecionada
                                                key={sensorId}
                                                sensor={sensor}
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
                        </DndContext>

                        <span className="hud-tag">DISPONIVEIS — marque pra adicionar</span>
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
                            {naoSelecionados.length === 0 && <p className="hud-tag config-sensores-display__vazio-lista">Todos os sensores ja estao selecionados.</p>}
                        </div>

                        <button className="botao-primario" type="button" onClick={salvar} disabled={salvando}>
                            {salvando ? 'Salvando...' : 'Salvar'}
                        </button>
                    </div>
                </div>
            )}
        </ModalHud>
    );
}
