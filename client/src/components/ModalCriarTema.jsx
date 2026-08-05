import { useEffect, useState } from 'react';
import ModalHud from './ModalHud';
import { CampoSelect } from './CamposConfiguracao';

const TOTAL_LAMPADAS = 8; // 35-espc — posicoes fisicas da calha, esquerda -> direita

// Mesma ordem fisica de geradorTempestade.js:CORES_POR_POSICAO (backend) — duplicada de
// proposito (so 1 array, os dois lados nao compartilham modulo nenhum): a cor de cada
// posicao e FIXA pela ordem real da calha, nao mais adivinhada pelo nome do rele escolhido —
// o usuario so escolhe QUAL rele cadastrado ocupa cada posicao, o combobox continua listando
// pelo nome dele.
const CORES_POR_POSICAO = ['azul', 'branca', 'vermelha', 'branca', 'branca', 'vermelha', 'branca', 'azul'];
const ROTULO_COR = { azul: 'Azul', branca: 'Branca', vermelha: 'Vermelha' };
const COR_SWATCH = { azul: '#2f8bff', vermelha: '#ff3860', branca: '#e8f4ff' };

const INTERVALO_MIN_SEGUNDOS_PADRAO = 15;
const INTERVALO_MAX_SEGUNDOS_PADRAO = 60;

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
//
// "tipoEfeito" (35-espc, Tema Tempestade): 'estatico' (comportamento de sempre, acima) ou
// 'tempestade' — um tema tempestade não tem um estado fixo ligado/desligado, então troca a
// lista de checkboxes de relés por um mapeamento de 8 "lâmpadas" (posições físicas da calha)
// -> relé real, via combobox (CampoSelect, mesmo componente usado em
// ModalEquipamentoAutomacao.jsx). Ele não tem "Testar ao vivo" da forma normal — ativar o
// tema (PainelTemas.jsx) já dispara um raio de verdade na hora, servindo como preview.
export default function ModalCriarTema({ aberto, modulo, portas, temaEditando, onFechar, onSalvo, onTestar, registrarLog }) {
    const [nome, setNome] = useState('');
    const [tipoEfeito, setTipoEfeito] = useState('estatico');
    const [selecionados, setSelecionados] = useState({}); // { [posicaoIndice]: 0 | 1 }
    const [lampadas, setLampadas] = useState({}); // { [posicaoLampada 1-8]: posicaoIndiceRele (string) | '' }
    const [intervaloMinSegundos, setIntervaloMinSegundos] = useState(INTERVALO_MIN_SEGUNDOS_PADRAO);
    const [intervaloMaxSegundos, setIntervaloMaxSegundos] = useState(INTERVALO_MAX_SEGUNDOS_PADRAO);
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
            setTipoEfeito(temaEditando.tipoEfeito ?? 'estatico');
            const mapa = {};
            for (const r of temaEditando.reles) mapa[r.posicaoIndice] = r.estado;
            setSelecionados(mapa);
            const mapaLampadas = {};
            for (const l of temaEditando.lampadas ?? []) {
                if (l.posicaoIndiceRele !== null && l.posicaoIndiceRele !== undefined) {
                    mapaLampadas[l.posicaoLampada] = String(l.posicaoIndiceRele);
                }
            }
            setLampadas(mapaLampadas);
            setIntervaloMinSegundos(temaEditando.intervaloMinSegundos ?? INTERVALO_MIN_SEGUNDOS_PADRAO);
            setIntervaloMaxSegundos(temaEditando.intervaloMaxSegundos ?? INTERVALO_MAX_SEGUNDOS_PADRAO);
        } else {
            setNome('');
            setTipoEfeito('estatico');
            setSelecionados({});
            setLampadas({});
            setIntervaloMinSegundos(INTERVALO_MIN_SEGUNDOS_PADRAO);
            setIntervaloMaxSegundos(INTERVALO_MAX_SEGUNDOS_PADRAO);
        }
        setTestarAoVivo(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, temaEditando?.id]);

    function definirLampada(posicaoLampada, valor) {
        setLampadas((atual) => ({ ...atual, [posicaoLampada]: valor }));
    }

    // Os dois sliders nunca se cruzam — arrastar o minimo acima do maximo (ou vice-versa)
    // empurra o outro junto, em vez de deixar um estado invalido (min > max) o form nao
    // pegaria sozinho ate tentar salvar.
    function alterarIntervaloMin(valor) {
        setIntervaloMinSegundos(valor);
        if (valor > intervaloMaxSegundos) setIntervaloMaxSegundos(valor);
    }
    function alterarIntervaloMax(valor) {
        setIntervaloMaxSegundos(valor);
        if (valor < intervaloMinSegundos) setIntervaloMinSegundos(valor);
    }

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
        if (!nome.trim()) return;

        let body;
        if (tipoEfeito === 'tempestade') {
            const lampadasArray = Object.entries(lampadas)
                .filter(([, valor]) => valor !== '')
                .map(([posicaoLampada, valor]) => ({ posicaoLampada: Number(posicaoLampada), posicaoIndiceRele: Number(valor) }));
            if (lampadasArray.length === 0) return; // precisa mapear pelo menos 1 lampada
            body = { nome, tipoEfeito, lampadas: lampadasArray, intervaloMinSegundos, intervaloMaxSegundos };
        } else {
            const reles = Object.entries(selecionados).map(([posicaoIndice, estado]) => ({ posicaoIndice: Number(posicaoIndice), estado }));
            if (reles.length === 0) return;
            body = { nome, tipoEfeito, reles };
        }

        setSalvando(true);
        try {
            const url = modoEdicao ? `/api/temas/${temaEditando.id}` : `/api/modulos/${modulo.id}/temas`;
            const resposta = await fetch(url, {
                method: modoEdicao ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!resposta.ok) throw new Error();
            const temaSalvo = await resposta.json();
            onSalvo?.(temaSalvo);
            registrarLog?.(modoEdicao ? `Tema "${nome}" atualizado.` : `Tema "${nome}" criado.`, 'sucesso');
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

                    <div className="modal-agendamento__tipo">
                        <button
                            type="button"
                            className={`modal-agendamento__tipo-item ${tipoEfeito === 'estatico' ? 'modal-agendamento__tipo-item--ativo' : ''}`}
                            onClick={() => setTipoEfeito('estatico')}
                        >
                            Estatico
                        </button>
                        <button
                            type="button"
                            className={`modal-agendamento__tipo-item ${tipoEfeito === 'tempestade' ? 'modal-agendamento__tipo-item--ativo' : ''}`}
                            onClick={() => setTipoEfeito('tempestade')}
                        >
                            Tempestade (Raios)
                        </button>
                    </div>

                    {tipoEfeito === 'estatico' ? (
                        <>
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
                        </>
                    ) : (
                        <>
                            <p className="hud-tag modal-temas__aviso-tempestade">
                                Tema Tempestade pisca as lampadas mapeadas aleatoriamente (raios localizados, varredura,
                                claroes globais e efeitos de cor de fundo) enquanto estiver ativo — nao tem um estado fixo
                                ligado/desligado, entao nao da pra "testar ao vivo" campo a campo: ativar o tema (no painel
                                de Temas) ja dispara um raio de verdade na hora, servindo como preview.
                                <br />
                                <strong>Cor por posicao:</strong> cada uma das 8 posicoes abaixo ja tem uma cor fixa,
                                seguindo a ordem fisica real da sua calha (azul, branca, vermelha, branca, branca,
                                vermelha, branca, azul) — voce so escolhe QUAL rele cadastrado fica em cada posicao. O
                                sistema usa isso pra criar efeitos diferentes por cor (raio branco de verdade, brilho
                                azul de fundo, alerta vermelho, combinacoes).
                            </p>

                            <div className="modal-temas__intervalo">
                                <label className="modal-temas__intervalo-campo">
                                    <span className="hud-tag">Intervalo minimo entre raios: {intervaloMinSegundos} segundos</span>
                                    <input
                                        type="range"
                                        min={3}
                                        max={120}
                                        value={intervaloMinSegundos}
                                        onChange={(e) => alterarIntervaloMin(Number(e.target.value))}
                                    />
                                </label>
                                <label className="modal-temas__intervalo-campo">
                                    <span className="hud-tag">Intervalo maximo entre raios: {intervaloMaxSegundos} segundos</span>
                                    <input
                                        type="range"
                                        min={3}
                                        max={600}
                                        value={intervaloMaxSegundos}
                                        onChange={(e) => alterarIntervaloMax(Number(e.target.value))}
                                    />
                                </label>
                            </div>

                            {portasMapeadas.length === 0 && (
                                <p className="hud-tag">Nenhuma saida mapeada ainda — cadastre nomes em "Mapear Saidas" primeiro.</p>
                            )}

                            <div className="modal-temas__lista hud-scrollbar">
                                {Array.from({ length: TOTAL_LAMPADAS }).map((_, i) => {
                                    const posicaoLampada = i + 1;
                                    const cor = CORES_POR_POSICAO[i];
                                    const rotuloPosicao =
                                        posicaoLampada === 1 ? ' (extrema esquerda)' : posicaoLampada === TOTAL_LAMPADAS ? ' (extrema direita)' : '';

                                    return (
                                        <div key={posicaoLampada} className="modal-temas__linha-lampada">
                                            <span className="hud-tag modal-temas__lampada-rotulo">
                                                <span className="modal-temas__cor-swatch" style={{ background: COR_SWATCH[cor] }} title={`Posicao ${posicaoLampada}: ${cor}`} />
                                                {ROTULO_COR[cor]}
                                                {rotuloPosicao}
                                            </span>
                                            <CampoSelect
                                                valor={lampadas[posicaoLampada] ?? ''}
                                                onChange={(valor) => definirLampada(posicaoLampada, valor)}
                                                opcoes={[
                                                    { valor: '', rotulo: '-- Nao mapeada --' },
                                                    ...portasMapeadas.map((porta) => ({ valor: String(porta.posicaoIndice), rotulo: porta.nomePersonalizado })),
                                                ]}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}

                    <div className="modal-hud__acoes">
                        <button
                            className="botao-primario"
                            type="submit"
                            disabled={
                                salvando ||
                                !nome.trim() ||
                                (tipoEfeito === 'estatico'
                                    ? Object.keys(selecionados).length === 0
                                    : Object.values(lampadas).every((valor) => valor === ''))
                            }
                        >
                            {salvando ? 'Salvando...' : modoEdicao ? 'Salvar Alteracoes' : 'Salvar Tema'}
                        </button>
                    </div>
                </form>
            )}
        </ModalHud>
    );
}
