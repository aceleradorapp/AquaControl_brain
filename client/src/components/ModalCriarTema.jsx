import { useState } from 'react';
import ModalHud from './ModalHud';

// Modal "Criar Tema" (14-espc): escolhe relés a partir do MAPEAMENTO (só portas com nome
// cadastrado em "Mapear Saidas" aparecem aqui — escolher por índice cru não faz sentido pro
// usuário), marca cada um selecionado com o estado desejado (ligado/desligado), e salva
// como um grupo nomeado (ex.: "Manutencao"). Aplicar o tema depois (ver PainelTemas.jsx)
// sobrescreve só esses relés — os outros ficam como estavam.
export default function ModalCriarTema({ aberto, modulo, portas, onFechar, onCriado, registrarLog }) {
    const [nome, setNome] = useState('');
    const [selecionados, setSelecionados] = useState({}); // { [posicaoIndice]: 0 | 1 }
    const [salvando, setSalvando] = useState(false);

    const portasMapeadas = portas.filter((porta) => porta.nomePersonalizado?.trim());

    function alternarSelecao(indice) {
        setSelecionados((atual) => {
            const copia = { ...atual };
            if (indice in copia) {
                delete copia[indice];
            } else {
                copia[indice] = 1; // default: ligado ao selecionar
            }
            return copia;
        });
    }

    function definirEstado(indice, estado) {
        setSelecionados((atual) => ({ ...atual, [indice]: estado }));
    }

    function limparEFechar() {
        setNome('');
        setSelecionados({});
        onFechar();
    }

    async function salvar(evento) {
        evento.preventDefault();
        const reles = Object.entries(selecionados).map(([posicaoIndice, estado]) => ({
            posicaoIndice: Number(posicaoIndice),
            estado,
        }));
        if (!nome.trim() || reles.length === 0) return;

        setSalvando(true);
        try {
            const resposta = await fetch(`/api/modulos/${modulo.id}/temas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, reles }),
            });
            if (!resposta.ok) throw new Error();
            const novoTema = await resposta.json();
            onCriado?.(novoTema);
            registrarLog?.(`Tema "${nome}" criado (${reles.length} rele(s)).`, 'sucesso');
            limparEFechar();
        } catch {
            registrarLog?.('Falha ao criar tema.', 'erro');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <ModalHud aberto={aberto} titulo="Criar Tema" tag={modulo ? `MODULO: ${modulo.nome}` : 'NENHUM MODULO ATUADOR'} onFechar={limparEFechar} largura="grande">
            {!modulo && <p className="hud-tag">Nenhum modulo do tipo "atuador" cadastrado ainda.</p>}

            {modulo && (
                <form onSubmit={salvar}>
                    <input
                        className="hud-input modal-temas__nome"
                        placeholder="Nome do tema (ex.: Manutencao)"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                    />

                    {portasMapeadas.length === 0 && (
                        <p className="hud-tag">Nenhuma saida mapeada ainda — cadastre nomes em "Mapear Saidas" primeiro.</p>
                    )}

                    <div className="modal-temas__lista hud-scrollbar">
                        {portasMapeadas.map((porta) => {
                            const selecionado = porta.posicaoIndice in selecionados;
                            const estado = selecionados[porta.posicaoIndice];

                            return (
                                <div key={porta.posicaoIndice} className={`modal-temas__linha ${selecionado ? 'modal-temas__linha--selecionada' : ''}`}>
                                    <label className="modal-temas__checkbox">
                                        <input
                                            type="checkbox"
                                            checked={selecionado}
                                            onChange={() => alternarSelecao(porta.posicaoIndice)}
                                        />
                                        <span>{porta.nomePersonalizado}</span>
                                    </label>

                                    {selecionado && (
                                        <div className="modal-temas__estados">
                                            <button
                                                type="button"
                                                className={`modal-temas__estado ${estado === 1 ? 'modal-temas__estado--ligado' : ''}`}
                                                onClick={() => definirEstado(porta.posicaoIndice, 1)}
                                            >
                                                Ligado
                                            </button>
                                            <button
                                                type="button"
                                                className={`modal-temas__estado ${estado === 0 ? 'modal-temas__estado--desligado' : ''}`}
                                                onClick={() => definirEstado(porta.posicaoIndice, 0)}
                                            >
                                                Desligado
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="modal-hud__acoes">
                        <button className="botao-primario" type="submit" disabled={salvando || !nome.trim() || Object.keys(selecionados).length === 0}>
                            {salvando ? 'Salvando...' : 'Salvar Tema'}
                        </button>
                    </div>
                </form>
            )}
        </ModalHud>
    );
}
