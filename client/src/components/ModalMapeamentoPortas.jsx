import { useEffect, useState } from 'react';
import { Eraser, Save } from 'lucide-react';
import ModalHud from './ModalHud';

// Modal Sci-Fi de mapeamento das 16 saídas (0-15) de um módulo de atuadores — aberto pelo
// ícone de engrenagem no card "Central do Aquario" (ver PainelEquipamentos.jsx).
// Conectado de verdade em GET/PUT /api/modulos/:id/portas (01-espc-geral/06_...). Ainda
// não existe comunicação com o hardware real (o array [0,1,0,...] vindo do ESP32) — isso
// é só o cadastro dos nomes/status de cada porta, ver nota em
// server/src/controllers/portasMapeamentoController.js.
export default function ModalMapeamentoPortas({ aberto, modulo, onFechar, onSalvo, registrarLog }) {
    const [portas, setPortas] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [salvando, setSalvando] = useState(false);

    // IMPORTANTE: a dependência é "modulo?.id" (um número), não "modulo" (o objeto inteiro).
    // O Dashboard recria "moduloAtuador" a cada poll de /api/modulos (8s) — mesmo quando os
    // dados são idênticos, é um objeto novo (JSON.parse de uma resposta nova). Com "modulo"
    // inteiro na dependência, este efeito reexecutava a cada 8s enquanto o modal ficava
    // aberto, refazia o fetch e SOBRESCREVIA o que o usuário estava digitando com o que
    // ainda estava salvo no servidor — por isso o campo "apagava" o texto e nunca dava pra
    // salvar. Com "modulo?.id", só reexecuta quando o módulo de verdade muda (troca de ESP).
    useEffect(() => {
        if (!aberto || !modulo) return;

        setCarregando(true);
        fetch(`/api/modulos/${modulo.id}/portas`)
            .then((resposta) => resposta.json())
            .then(setPortas)
            .catch(() => registrarLog?.('Falha ao carregar mapeamento de portas.', 'erro'))
            .finally(() => setCarregando(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, modulo?.id]);

    function atualizarPorta(indice, campo, valor) {
        setPortas((atual) => atual.map((porta) => (porta.posicaoIndice === indice ? { ...porta, [campo]: valor } : porta)));
    }

    async function salvar() {
        setSalvando(true);
        try {
            const resposta = await fetch(`/api/modulos/${modulo.id}/portas`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portas }),
            });
            if (!resposta.ok) throw new Error();
            const atualizado = await resposta.json();
            setPortas(atualizado);
            onSalvo?.(atualizado); // avisa o Dashboard pra Central do Aquario/Matriz refletirem na hora
            registrarLog?.(`Mapeamento de portas salvo (${modulo.nome}).`, 'sucesso');
            onFechar();
        } catch {
            registrarLog?.('Falha ao salvar mapeamento de portas.', 'erro');
        } finally {
            setSalvando(false);
        }
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo="Mapeamento de Saidas"
            tag={modulo ? `MODULO: ${modulo.nome} (${modulo.ip})` : 'NENHUM MODULO ATUADOR'}
            onFechar={onFechar}
            largura="grande"
        >
            {!modulo && (
                <p className="hud-tag">
                    Nenhum modulo do tipo "atuador" cadastrado ainda. Cadastre um em Modulos de Controladores.
                </p>
            )}

            {modulo && carregando && <p className="hud-tag">Carregando mapeamento...</p>}

            {modulo && !carregando && (
                <>
                    <div className="mapeamento-portas__grade">
                        {portas.map((porta) => (
                            <div
                                key={porta.posicaoIndice}
                                className={`mapeamento-portas__linha ${!porta.habilitado ? 'mapeamento-portas__linha--desativada' : ''}`}
                            >
                                {/* Exibido 1-based (01, 02...) pra bater com a numeracao da
                                    Matriz de Reles 16CH — por baixo "posicaoIndice" continua
                                    0-based (0-15), inalterado no modelo/API. */}
                                <span className="mapeamento-portas__indice hud-mono">{String(porta.posicaoIndice + 1).padStart(2, '0')}</span>

                                <input
                                    className="hud-input"
                                    placeholder={`Saida ${porta.posicaoIndice + 1}`}
                                    value={porta.nomePersonalizado}
                                    onChange={(e) => atualizarPorta(porta.posicaoIndice, 'nomePersonalizado', e.target.value)}
                                />

                                <button
                                    type="button"
                                    className="botao-icone"
                                    title="Limpar rotulo"
                                    onClick={() => atualizarPorta(porta.posicaoIndice, 'nomePersonalizado', '')}
                                >
                                    <Eraser size={14} />
                                </button>

                                <button
                                    type="button"
                                    className={`mapeamento-portas__status ${porta.habilitado ? 'mapeamento-portas__status--on' : ''}`}
                                    onClick={() => atualizarPorta(porta.posicaoIndice, 'habilitado', !porta.habilitado)}
                                >
                                    {porta.habilitado ? 'Disponivel' : 'Oculta'}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="modal-hud__acoes">
                        <button className="botao-primario" onClick={salvar} disabled={salvando} type="button">
                            <Save size={14} /> {salvando ? 'Salvando...' : 'Salvar Mapeamento'}
                        </button>
                    </div>
                </>
            )}
        </ModalHud>
    );
}
