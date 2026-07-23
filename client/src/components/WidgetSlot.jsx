import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AnimatePresence, motion } from 'framer-motion';
import { GripVertical, X } from 'lucide-react';

// Slot generico em volta de CADA widget do Dashboard (20-espc, layout movivel + modo
// compacto) — nao muda NADA dentro dos widgets em si (PainelTemas, AgendamentosWidget etc.
// continuam 100% intactos); so adiciona por cima:
//   1. Uma alcinha de arrastar (barra fina acima do card) pra reposicionar o widget — usa
//      useSortable do @dnd-kit/sortable, ver Dashboard.jsx/ColunaWidgets.jsx pro
//      DndContext/SortableContext que envolve tudo isso.
//   2. No Modo Compacto (ver HeaderTatico.jsx): em vez do widget inteiro, mostra so um
//      "cartao" pequeno e uniforme (icone + titulo + um resumo opcional de 1 linha) — clicar
//      no cartao abre o widget INTEIRO, sem nenhuma alteracao, dentro de um modal centralizado
//      (fecha no X ou clicando fora, ESC tambem fecha).
export default function WidgetSlot({ chave, widget, modoCompacto }) {
    const [expandido, setExpandido] = useState(false);
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: chave });

    const estilo = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    useEffect(() => {
        if (!expandido) return undefined;

        function aoTeclar(evento) {
            if (evento.key === 'Escape') setExpandido(false);
        }
        document.addEventListener('keydown', aoTeclar);
        return () => document.removeEventListener('keydown', aoTeclar);
    }, [expandido]);

    return (
        <div ref={setNodeRef} style={estilo} className={`widget-slot ${isDragging ? 'widget-slot--arrastando' : ''}`}>
            <button
                className="widget-slot__grip"
                type="button"
                {...attributes}
                {...listeners}
                aria-label={`Arraste para mover: ${widget.titulo}`}
                title="Arraste para mover"
            >
                <GripVertical size={13} />
            </button>

            {!modoCompacto && widget.render()}

            {modoCompacto && (
                <button
                    className="hud-painel widget-slot__card-compacto"
                    type="button"
                    onClick={() => setExpandido(true)}
                    aria-label={`Expandir ${widget.titulo}`}
                >
                    <span className="widget-slot__card-icone">{widget.icone}</span>
                    <span className="widget-slot__card-titulo">{widget.titulo}</span>
                    {widget.resumo && <span className="widget-slot__card-resumo">{widget.resumo}</span>}
                </button>
            )}

            <AnimatePresence>
                {modoCompacto && expandido && (
                    <motion.div
                        className="widget-expandido__backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setExpandido(false)}
                    >
                        <motion.div
                            className="widget-expandido__conteudo"
                            initial={{ opacity: 0, scale: 0.95, y: 12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 12 }}
                            onClick={(evento) => evento.stopPropagation()}
                        >
                            <button
                                className="widget-expandido__fechar"
                                type="button"
                                onClick={() => setExpandido(false)}
                                aria-label="Fechar"
                                title="Fechar"
                            >
                                <X size={16} />
                            </button>
                            {widget.render()}
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
