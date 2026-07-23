import { Settings } from 'lucide-react';
import InterruptorEquipamento from './InterruptorEquipamento';

// Painel de status dos equipamentos (Coluna 2). Desde 13-espc, a lista vem 100% do
// Mapeamento de Saidas real (só portas com nome preenchido — ver Dashboard.jsx:
// equipamentosExibidos), nada de mock fixo. Os toggles disparam POST /api/modulos/:id/reles
// através do Brain (ver Dashboard.jsx: alternarEquipamento) e o estado exibido vem da
// leitura real (GET /api/modulos/:id/reles). Sem módulo cadastrado/acessível, a tag no
// cabeçalho mostra "MODO DEMO" — a lista fica vazia nesse caso (não há mapeamento real pra
// mostrar), nunca finge um estado que não confirmamos.
//
// "filtro" (14-espc) alterna entre "ativos" (default — só as habilitadas) e "bloqueados"
// (as desabilitadas/"Oculta", só pra dar visibilidade — não dá pra acionar, ver
// InterruptorEquipamento). A troca é decidida pelo Dashboard (equipamentosExibidos já vem
// filtrado), aqui só desenha as abas.
//
// O ícone de engrenagem no cabeçalho abre o Modal de Mapeamento de Portas (16 saídas do
// módulo de atuadores, ver ModalMapeamentoPortas.jsx) — fica só no cabeçalho, não no card
// inteiro, pra não brigar com o clique dos próprios interruptores.
export default function PainelEquipamentos({ equipamentos, onAlternar, onConfigurarSaidas, moduloAtuador, conectado, filtro, onAlternarFiltro }) {
    return (
        <div className="hud-painel painel-equipamentos">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Central do Aquario</h2>
                <div className="painel-cabecalho__acoes">
                    <span className={`hud-tag ${conectado ? 'painel-equipamentos__status--on' : 'painel-equipamentos__status--demo'}`}>
                        {conectado ? `MODULO ${moduloAtuador.ip}` : 'MODO DEMO'}
                    </span>
                    <button className="botao-icone" onClick={onConfigurarSaidas} aria-label="Configurar saidas" type="button" title="Mapear saidas">
                        <Settings size={14} />
                    </button>
                </div>
            </div>

            <div className="abas-periodo painel-equipamentos__abas">
                <button
                    className={`abas-periodo__item ${filtro === 'ativos' ? 'abas-periodo__item--ativo' : ''}`}
                    onClick={() => onAlternarFiltro('ativos')}
                    type="button"
                >
                    Ativos
                </button>
                <button
                    className={`abas-periodo__item ${filtro === 'bloqueados' ? 'abas-periodo__item--ativo' : ''}`}
                    onClick={() => onAlternarFiltro('bloqueados')}
                    type="button"
                >
                    Bloqueados
                </button>
            </div>

            <div className="painel-equipamentos__lista hud-scrollbar">
                {equipamentos.map((equipamento) => (
                    <InterruptorEquipamento
                        key={equipamento.id}
                        nome={equipamento.nome}
                        ativo={equipamento.ativo}
                        bloqueado={equipamento.bloqueado}
                        onAlternar={() => onAlternar(equipamento.id)}
                    />
                ))}
                {equipamentos.length === 0 && (
                    <p className="hud-tag painel-equipamentos__vazio">
                        {filtro === 'ativos'
                            ? 'Nenhuma saida mapeada e habilitada ainda — configure em "Mapear Saidas" (icone de engrenagem acima).'
                            : 'Nenhuma saida bloqueada no momento.'}
                    </p>
                )}
            </div>
        </div>
    );
}
