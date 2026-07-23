import { Plus, Sparkles, Trash2 } from 'lucide-react';

// Widget "Temas" (14-espc): cada tema é um grupo nomeado de relés com um estado definido
// (ver ModalCriarTema.jsx) — clicar num tema aplica esses estados de verdade (POST
// /api/temas/:id/aplicar, através do Brain), sem mexer nos relés que não fazem parte dele.
// O botão "+" abre o modal de criação (estado vive no Dashboard, não aqui, pra também poder
// ser aberto pelo Menu de Ações mesmo com este widget escondido — ver MenuAcoes.jsx).
export default function PainelTemas({ moduloAtuador, temas, onAbrirCriarTema, onAplicar, onRemover }) {
    return (
        <div className="hud-painel painel-temas">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Temas</h2>
                <button className="botao-icone" onClick={onAbrirCriarTema} aria-label="Criar tema" type="button" title="Criar novo tema">
                    <Plus size={16} />
                </button>
            </div>

            {!moduloAtuador && <p className="hud-tag">Nenhum modulo do tipo "atuador" cadastrado ainda.</p>}

            {moduloAtuador && (
                <div className="painel-temas__lista hud-scrollbar">
                    {temas.map((tema) => (
                        <div key={tema.id} className="painel-temas__item">
                            <button className="painel-temas__botao" type="button" onClick={() => onAplicar(tema.id)} title={`Aplicar tema "${tema.nome}"`}>
                                <Sparkles size={14} />
                                <span className="painel-temas__nome">{tema.nome}</span>
                                <span className="hud-tag">{tema.reles.length} rele(s)</span>
                            </button>
                            <button
                                className="botao-icone botao-icone--erro"
                                onClick={() => onRemover(tema.id)}
                                aria-label={`Remover tema ${tema.nome}`}
                                type="button"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {temas.length === 0 && <p className="hud-tag painel-temas__vazio">Nenhum tema criado ainda — clique no "+" acima.</p>}
                </div>
            )}
        </div>
    );
}
