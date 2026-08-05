import { Pencil, Plus, Sparkles, Trash2, Zap } from 'lucide-react';

// Widget "Temas" (14/15-espc): cada tema é um grupo nomeado de relés com um estado definido
// (ver ModalCriarTema.jsx) — clicar num tema aplica esses estados de verdade (POST
// /api/temas/:id/aplicar, através do Brain), sem mexer nos relés que não fazem parte dele.
//
// Regra de exclusão mútua (15-espc): nunca dois temas ativos ao mesmo tempo — o servidor
// decide isso (ver temasController.js), aqui só destaca visualmente qual "tema.ativo" veio
// da última resposta/carregamento. Clicar no tema já ativo desativa ele (some o destaque).
//
// O botão "+" abre o modal de criação e o lápis abre o de edição — o estado de "qual modal
// está aberto / qual tema está sendo editado" vive no Dashboard, não aqui, pra também poder
// ser aberto pelo Menu de Ações mesmo com este widget escondido — ver MenuAcoes.jsx.
export default function PainelTemas({ moduloAtuador, temas, onAbrirCriarTema, onEditar, onAplicar, onRemover }) {
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
                    {temas.map((tema) => {
                        const ehTempestade = tema.tipoEfeito === 'tempestade';
                        const totalLampadas = ehTempestade ? tema.lampadas?.filter((l) => l.posicaoIndiceRele !== null).length ?? 0 : 0;
                        return (
                        <div key={tema.id} className={`painel-temas__item ${tema.ativo ? 'painel-temas__item--ativo' : ''}`}>
                            <button
                                className="painel-temas__botao"
                                type="button"
                                onClick={() => onAplicar(tema.id)}
                                title={
                                    ehTempestade
                                        ? tema.ativo
                                            ? `Parar tempestade "${tema.nome}"`
                                            : `Iniciar tempestade "${tema.nome}"`
                                        : tema.ativo
                                        ? `Desativar tema "${tema.nome}"`
                                        : `Aplicar tema "${tema.nome}"`
                                }
                            >
                                {ehTempestade ? <Zap size={14} /> : <Sparkles size={14} />}
                                <span className="painel-temas__nome">{tema.nome}</span>
                                {tema.ativo && <span className="hud-tag painel-temas__tag-ativo">{ehTempestade ? 'TEMPESTADE ATIVA' : 'ATIVO'}</span>}
                                <span className="hud-tag">{ehTempestade ? `${totalLampadas} lampada(s)` : `${tema.reles.length} rele(s)`}</span>
                            </button>
                            <button
                                className="botao-icone"
                                onClick={() => onEditar(tema.id)}
                                aria-label={`Editar tema ${tema.nome}`}
                                title="Editar tema"
                                type="button"
                            >
                                <Pencil size={14} />
                            </button>
                            <button
                                className="botao-icone botao-icone--erro"
                                onClick={() => onRemover(tema.id)}
                                aria-label={`Remover tema ${tema.nome}`}
                                title="Remover tema"
                                type="button"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                        );
                    })}
                    {temas.length === 0 && <p className="hud-tag painel-temas__vazio">Nenhum tema criado ainda — clique no "+" acima.</p>}
                </div>
            )}
        </div>
    );
}
