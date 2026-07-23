import { useEffect, useState } from 'react';
import ModalHud from './ModalHud';

// Modal "Criar/Editar Tema" (14/15-espc): escolhe relés a partir do MAPEAMENTO (só portas
// com nome cadastrado em "Mapear Saidas" aparecem aqui — escolher por índice cru não faz
// sentido pro usuário), marca cada um selecionado com o estado desejado (ligado/desligado),
// e salva como um grupo nomeado (ex.: "Manutencao"). Aplicar o tema depois (ver
// PainelTemas.jsx) sobrescreve só esses relés — os outros ficam como estavam.
//
// "temaEditando" (15-espc): null = modo "criar novo"; um tema = modo edição, pré-preenche
// nome/seleção e salva via PUT em vez de POST. O mesmo componente serve pros dois casos —
// só muda o método/URL da requisição e os textos da UI.
//
// "Testar ao vivo" (15-espc): enquanto ligado, marcar/desmarcar uma porta ou trocar seu
// estado aciona o relé de VERDADE na hora (via onTestar, ver Dashboard.jsx:
// testarRelePontual) — não precisa salvar o tema antes pra ouvir o clique físico e conferir
// se é isso mesmo que você queria configurar.
export default function ModalCriarTema({ aberto, modulo, portas, temaEditando, onFechar, onSalvo, onTestar, registrarLog }) {
    const [nome, setNome] = useState('');
    const [selecionados, setSelecionados] = useState({}); // { [posicaoIndice]: 0 | 1 }
    const [testarAoVivo, setTestarAoVivo] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const modoEdicao = !!temaEditando;
    const portasMapeadas = portas.filter((porta) => porta.nomePersonalizado?.trim());

    // Pré-preenche o form quando o modal abre em modo edição (ou limpa quando abre pra
    // criar um novo) — dependência em "aberto"/"temaEditando?.id", não no objeto inteiro,
    // mesmo motivo já documentado em ModalMapeamentoPortas.jsx.
    useEffect(() => {
        if (!aberto) return;

        if (temaEditando) {
            setNome(temaEditando.nome);
            const mapa = {};
            for (const r of temaEditando.reles) mapa[r.posicaoIndice] = r.estado;
            setSelecionados(mapa);
        } else {
            setNome('');
            setSelecionados({});
        }
        setTestarAoVivo(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, temaEditando?.id]);

    function alternarSelecao(indice) {
        setSelecionados((atual) => {
            const copia = { ...atual };
            if (indice in copia) {
                delete copia[indice];
                if (testarAoVivo) onTestar?.(indice, 0);
            } else {
                copia[indice] = 1; // default: ligado ao selecionar
                if (testarAoVivo) onTestar?.(indice, 1);
            }
            return copia;
        });
    }

    function definirEstado(indice, estado) {
        setSelecionados((atual) => ({ ...atual, [indice]: estado }));
        if (testarAoVivo) onTestar?.(indice, estado);
    }

    function fechar() {
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
            const url = modoEdicao ? `/api/temas/${temaEditando.id}` : `/api/modulos/${modulo.id}/temas`;
            const resposta = await fetch(url, {
                method: modoEdicao ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, reles }),
            });
            if (!resposta.ok) throw new Error();
            const temaSalvo = await resposta.json();
            onSalvo?.(temaSalvo);
            registrarLog?.(
                modoEdicao ? `Tema "${nome}" atualizado (${reles.length} rele(s)).` : `Tema "${nome}" criado (${reles.length} rele(s)).`,
                'sucesso'
            );
            fechar();
        } catch {
            registrarLog?.(modoEdicao ? 'Falha ao atualizar tema.' : 'Falha ao criar tema.', 'erro');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo={modoEdicao ? 'Editar Tema' : 'Criar Tema'}
            tag={modulo ? `MODULO: ${modulo.nome}` : 'NENHUM MODULO ATUADOR'}
            onFechar={fechar}
            largura="grande"
        >
            {!modulo && <p className="hud-tag">Nenhum modulo do tipo "atuador" cadastrado ainda.</p>}

            {modulo && (
                <form onSubmit={salvar}>
                    <input
                        className="hud-input modal-temas__nome"
                        placeholder="Nome do tema (ex.: Manutencao)"
                        value={nome}
                        onChange={(e) => setNome(e.target.value)}
                    />

                    <label className="modal-temas__testar">
                        <input type="checkbox" checked={testarAoVivo} onChange={(e) => setTestarAoVivo(e.target.checked)} />
                        <span>Testar ao vivo — aciona os reles de verdade enquanto voce monta o tema</span>
                    </label>

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
                            {salvando ? 'Salvando...' : modoEdicao ? 'Salvar Alteracoes' : 'Salvar Tema'}
                        </button>
                    </div>
                </form>
            )}
        </ModalHud>
    );
}
