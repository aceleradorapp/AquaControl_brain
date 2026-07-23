import { useDroppable } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy, verticalListSortingStrategy } from '@dnd-kit/sortable';
import WidgetSlot from './WidgetSlot';

// Uma coluna do Dashboard (20-espc, layout movivel): droppable (pra aceitar um widget solto
// numa area vazia, nao so em cima de outro widget) + SortableContext (pra reordenar dentro
// dela) — ver Dashboard.jsx pro DndContext que envolve as 3 colunas e permite mover um widget
// de uma coluna pra outra. Widgets escondidos (visibilidadeWidgets) ficam de fora da lista
// renderizada/arrastavel, mas continuam guardando o lugar deles em "chaves" (o array
// completo, nao filtrado) — reaparecem na mesma posicao se o usuario reativar em
// Layout/Widgets.
export default function ColunaWidgets({ id, chaves, registro, visibilidade, modoCompacto }) {
    const { setNodeRef } = useDroppable({ id });
    const chavesVisiveis = chaves.filter((chave) => visibilidade[chave] && registro[chave]);

    return (
        <SortableContext items={chavesVisiveis} strategy={modoCompacto ? rectSortingStrategy : verticalListSortingStrategy}>
            <section ref={setNodeRef} className={`coluna ${modoCompacto ? 'coluna--compacta' : ''}`}>
                {chavesVisiveis.map((chave) => (
                    <WidgetSlot key={chave} chave={chave} widget={registro[chave]} modoCompacto={modoCompacto} />
                ))}
            </section>
        </SortableContext>
    );
}
