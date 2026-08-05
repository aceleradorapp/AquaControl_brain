import { useEffect, useRef, useState } from 'react';
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
    // Auto-save por linha (pedido do usuario: nao precisar clicar em "Salvar" pra cada campo) —
    // 'salvando'/'salvo'/'erro' por posicaoIndice, so pra dar feedback visual na propria linha
    // (ver mapeamento-portas__linha--* em modais.css). "salvo" se limpa sozinho depois de um
    // tempo curto (timeoutsRef guarda o timer de cada linha, pra poder cancelar se a mesma
    // porta salvar de novo antes do timeout anterior zerar).
    const [statusPorPorta, setStatusPorPorta] = useState({});
    const timeoutsRef = useRef({});

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

    useEffect(() => {
        const timeouts = timeoutsRef.current;
        return () => Object.values(timeouts).forEach(clearTimeout);
    }, []);

    function atualizarPorta(indice, campo, valor) {
        setPortas((atual) => atual.map((porta) => (porta.posicaoIndice === indice ? { ...porta, [campo]: valor } : porta)));
    }

    // Salva SO UMA porta, mandando o objeto INTEIRO da linha (nunca so o campo que mudou) —
    // o backend grava exatamente o que recebe pra cada campo (nomePersonalizado/habilitado/
    // descricao/potenciaWatts), entao mandar so um campo isolado apagaria os outros. Disparado
    // ao perder o foco dos campos de texto/numero, e direto no clique dos botoes (toggle,
    // apagar rotulo), que ja tem o valor novo em mãos sincronamente.
    async function salvarPortaIndividual(portaAtualizada) {
        const indice = portaAtualizada.posicaoIndice;
        clearTimeout(timeoutsRef.current[indice]);
        setStatusPorPorta((atual) => ({ ...atual, [indice]: 'salvando' }));

        try {
            const resposta = await fetch(`/api/modulos/${modulo.id}/portas`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portas: [portaAtualizada] }),
            });
            if (!resposta.ok) throw new Error();
            const atualizado = await resposta.json();
            setPortas(atualizado);
            onSalvo?.(atualizado); // avisa o Dashboard pra Central do Aquario/Matriz refletirem na hora
            setStatusPorPorta((atual) => ({ ...atual, [indice]: 'salvo' }));
            timeoutsRef.current[indice] = setTimeout(() => {
                setStatusPorPorta((atual) => {
                    const { [indice]: _removida, ...resto } = atual;
                    return resto;
                });
            }, 1500);
        } catch {
            setStatusPorPorta((atual) => ({ ...atual, [indice]: 'erro' }));
            registrarLog?.(`Falha ao salvar a porta ${String(indice + 1).padStart(2, '0')}.`, 'erro');
        }
    }

    function alternarHabilitado(porta) {
        const portaAtualizada = { ...porta, habilitado: !porta.habilitado };
        setPortas((atual) => atual.map((p) => (p.posicaoIndice === porta.posicaoIndice ? portaAtualizada : p)));
        salvarPortaIndividual(portaAtualizada);
    }

    function limparRotulo(porta) {
        const portaAtualizada = { ...porta, nomePersonalizado: '' };
        setPortas((atual) => atual.map((p) => (p.posicaoIndice === porta.posicaoIndice ? portaAtualizada : p)));
        salvarPortaIndividual(portaAtualizada);
    }

    function aoPerderFoco(indice) {
        const porta = portas.find((p) => p.posicaoIndice === indice);
        if (porta) salvarPortaIndividual(porta);
    }

    // Mascara do campo de potencia (36-espc): o valor exibido no input JA inclui o "W"
    // (ex.: "100 W" ou "3.5 W"), em vez de um <input type="number"> com um rotulo "W"
    // flutuando por cima — a sobreposicao do numero digitado com o "W" foi reportada como
    // feia/confusa. Digitar so aceita digitos e UM ponto decimal (","  tambem e aceito na
    // digitacao e convertido pra "." — o campo nativo de Potencia Base do Modulo, esse sim
    // um <input type="number"> puro, so aceita ponto por limitacao do proprio browser, mas
    // aqui o campo e mascarado a mao, entao da pra ser mais tolerante). Guarda como STRING
    // enquanto o usuario digita (nao converte pra Number na hora) pra nao perder um "3."
    // digitado no meio do processo — o backend aceita string ou number do mesmo jeito
    // (Number(valor) em portasMapeamentoController.js).
    function formatarPotencia(valorWatts) {
        return valorWatts === null || valorWatts === undefined || valorWatts === '' ? '' : `${valorWatts} W`;
    }

    function aoDigitarPotencia(indice, textoDigitado) {
        let limpo = '';
        let temPonto = false;
        for (const caractere of textoDigitado.replace(/,/g, '.')) {
            if (caractere >= '0' && caractere <= '9') {
                limpo += caractere;
            } else if (caractere === '.' && !temPonto) {
                limpo += caractere;
                temPonto = true;
            }
        }
        atualizarPorta(indice, 'potenciaWatts', limpo === '' || limpo === '.' ? null : limpo);
    }

    // Ainda existe como um "salvar tudo de uma vez e fechar" explicito — o auto-save por campo
    // cobre o uso normal, mas isso continua util como rede de seguranca/atalho pra fechar.
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
                                className={`mapeamento-portas__linha ${!porta.habilitado ? 'mapeamento-portas__linha--desativada' : ''} ${
                                    statusPorPorta[porta.posicaoIndice] ? `mapeamento-portas__linha--${statusPorPorta[porta.posicaoIndice]}` : ''
                                }`}
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
                                    onBlur={() => aoPerderFoco(porta.posicaoIndice)}
                                />

                                {/* 36-espc: potencia nominal (W) do equipamento ligado nesta
                                    porta — opcional, so alimenta a estimativa de consumo de
                                    energia (ver RelatorioConsumoEnergia.jsx); em branco = fica
                                    fora do calculo. Mascara em vez de <input type="number"> +
                                    sufixo flutuante (esse layout sobrepunha o numero digitado
                                    com o "W") — o valor exibido ja inclui o "W" no proprio
                                    texto (ver formatarPotencia/aoDigitarPotencia acima). */}
                                <input
                                    className="hud-input mapeamento-portas__potencia"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                    placeholder="10 W"
                                    title="Potencia nominal (W) — usada so pra estimar consumo de energia"
                                    value={formatarPotencia(porta.potenciaWatts)}
                                    onChange={(e) => aoDigitarPotencia(porta.posicaoIndice, e.target.value)}
                                    onBlur={() => aoPerderFoco(porta.posicaoIndice)}
                                />

                                <button
                                    type="button"
                                    className="botao-icone"
                                    title="Limpar rotulo"
                                    onClick={() => limparRotulo(porta)}
                                >
                                    <Eraser size={14} />
                                </button>

                                <button
                                    type="button"
                                    className={`mapeamento-portas__status ${porta.habilitado ? 'mapeamento-portas__status--on' : ''}`}
                                    onClick={() => alternarHabilitado(porta)}
                                >
                                    {porta.habilitado ? 'Disponivel' : 'Oculta'}
                                </button>
                            </div>
                        ))}
                    </div>

                    <div className="modal-hud__acoes modal-hud__acoes--espacado">
                        <span className="hud-tag mapeamento-portas__aviso-autosave">Cada campo salva sozinho ao sair dele.</span>
                        <button className="botao-primario" onClick={salvar} disabled={salvando} type="button">
                            <Save size={14} /> {salvando ? 'Salvando...' : 'Salvar Tudo e Fechar'}
                        </button>
                    </div>
                </>
            )}
        </ModalHud>
    );
}
