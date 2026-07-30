import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, Send, Zap } from 'lucide-react';
import ModalHud from './ModalHud';
import DiagramaCentral from './DiagramaCentral';
import ModalDetalheSensor from './ModalDetalheSensor';

function esperar(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Central de Diagnostico e Esquematico Interativo em Tempo Real (23-espc, ver
// 01-espc-geral/23_central_diagnostico.md) — modal full-screen (mesmo padrao "sem
// react-router" ja usado por Relatorios/Configuracoes: toda tela grande deste projeto e um
// modal). O DIAGRAMA em si (aquario + nos radiais) fica em DiagramaCentral.jsx; este
// componente so orquestra: (1) roteamento de clique pros modais JA EXISTENTES no resto do
// dashboard (nao duplica nenhum — reaproveita Esquematico Interativo, Esquematico dos
// Sensores, Configurar Sensores do Display, Mapeamento de Portas, todos ja construidos em
// sessoes anteriores), e (2) a Varredura de Diagnostico Automatico (varre modulos + sensores
// de verdade, loga estilo terminal, marca cada no do diagrama com OK/FALHA).
export default function ModalCentralDiagnostico({
    aberto,
    onFechar,
    modulos,
    dadosSensores,
    portasMapeamento,
    estadoReles,
    onAbrirEsquematicoReles,
    onAbrirEsquematicoSensores,
    onAbrirConfigurarSensoresDisplay,
    onAbrirMapeamentoPortas,
    onAtualizarModulo,
    registrarLog,
}) {
    const [sensorDetalhe, setSensorDetalhe] = useState(null);
    const [executando, setExecutando] = useState(false);
    const [statusScanPorChave, setStatusScanPorChave] = useState({});
    const [logTerminal, setLogTerminal] = useState([]);
    // 25-espc: modulos que RESPONDERAM a varredura (conexao Wi-Fi/IP ok) mas nao tem o IP do
    // Brain salvo na propria NVS ("ip_backend_salvo" vazio) — o handshake nunca aconteceu ou
    // se perdeu (ex.: modulo reflashado). Diferente de "offline": aqui o modulo esta vivo na
    // rede, so nao sabe pra quem mandar os dados — por isso ganha uma acao propria (reenviar
    // o host), em vez de só aparecer como FALHA sem nenhum proximo passo.
    const [modulosSemHost, setModulosSemHost] = useState([]);
    const [reenviandoId, setReenviandoId] = useState(null);

    async function reenviarHost(modulo) {
        setReenviandoId(modulo.id);
        try {
            const resposta = await fetch(`/api/modulos/${modulo.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome: modulo.nome }),
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? 'Falha ao contatar o AquaControl_Brain.');

            if (dados.handshake?.sucesso) {
                registrarLog?.(`Host do Brain reenviado com sucesso para "${modulo.nome}".`, 'sucesso');
                setModulosSemHost((atual) => atual.filter((m) => m.id !== modulo.id));
                onAtualizarModulo?.(dados);
            } else {
                registrarLog?.(`Modulo "${modulo.nome}" nao respondeu ao reenvio: ${dados.handshake?.motivo ?? 'sem detalhes.'}`, 'erro');
            }
        } catch (erro) {
            registrarLog?.(`Falha ao reenviar host: ${erro.message}`, 'erro');
        } finally {
            setReenviandoId(null);
        }
    }

    function navegarPara(acao) {
        onFechar();
        acao();
    }

    function aoClicarModulo(modulo) {
        if (modulo.tipo === 'atuador') navegarPara(onAbrirEsquematicoReles);
        else if (modulo.tipo === 'telemetria') navegarPara(onAbrirEsquematicoSensores);
        else if (modulo.tipo === 'display') navegarPara(onAbrirConfigurarSensoresDisplay);
    }

    async function iniciarDiagnostico() {
        setExecutando(true);
        setStatusScanPorChave({});
        setModulosSemHost([]);
        setLogTerminal([{ texto: '>>> INICIANDO DIAGNOSTICO DO SISTEMA <<<', tipo: 'titulo' }]);

        const passos = [];
        const semHostEncontrados = [];

        for (const modulo of modulos) {
            passos.push({
                chave: `modulo-${modulo.id}`,
                texto: `Testando conexao Wi-Fi/IP — ${modulo.nome} (${modulo.ip})`,
                executar: async () => {
                    try {
                        const resposta = await fetch(`/api/modulos/${modulo.id}/status`);
                        const dados = await resposta.json();
                        if (!dados.disponivel) return { ok: false };

                        // Modulo respondeu, mas nao tem o IP do Brain salvo — nao conta como
                        // FALHA de conexao (o modulo esta vivo), so fica marcado a parte com
                        // uma acao pra corrigir (ver "Acoes Sugeridas" abaixo do terminal).
                        if ('ip_backend_salvo' in dados && !dados.ip_backend_salvo) {
                            semHostEncontrados.push(modulo);
                            return { ok: true, semHost: true };
                        }
                        return { ok: true };
                    } catch {
                        return { ok: false };
                    }
                },
            });
        }

        const sensores = dadosSensores?.disponivel ? dadosSensores.sensores : [];
        for (const sensor of sensores) {
            passos.push({
                chave: `sensor-${sensor.id}`,
                texto: `Sensor ${sensor.nome} (${sensor.id})`,
                executar: async () => ({ ok: sensor.conectado }),
            });
        }

        const atuadoresMapeados = portasMapeamento.filter((p) => p.nomePersonalizado?.trim() && p.habilitado);
        for (const atuador of atuadoresMapeados) {
            passos.push({
                chave: `atuador-${atuador.posicaoIndice}`,
                texto: `Resposta da API do Atuador — ${atuador.nomePersonalizado}`,
                executar: async () => ({ ok: modulos.find((m) => m.tipo === 'atuador')?.online ?? false }),
            });
        }

        let falhas = 0;
        for (const passo of passos) {
            setStatusScanPorChave((atual) => ({ ...atual, [passo.chave]: 'pending' }));
            setLogTerminal((atual) => [...atual, { texto: `[CHECK] ${passo.texto}...`, tipo: 'check' }]);
            await esperar(260);

            const { ok, semHost } = await passo.executar();
            setStatusScanPorChave((atual) => ({ ...atual, [passo.chave]: ok ? 'ok' : 'fail' }));
            setLogTerminal((atual) => [...atual, { texto: ok ? '        [ OK ]' : '        [ FALHA ]', tipo: ok ? 'ok' : 'fail' }]);
            if (semHost) {
                setLogTerminal((atual) => [...atual, { texto: '        [ HOST DO BRAIN NAO ENCONTRADO NA NVS ]', tipo: 'alerta' }]);
            }
            if (!ok) falhas++;
            await esperar(160);
        }

        setModulosSemHost(semHostEncontrados);

        setLogTerminal((atual) => [
            ...atual,
            {
                texto: `>>> DIAGNOSTICO CONCLUIDO: ${passos.length - falhas}/${passos.length} COMPONENTES OK ${falhas > 0 ? `(${falhas} FALHA(S))` : ''} <<<`,
                tipo: falhas > 0 ? 'fail' : 'ok',
            },
        ]);
        setExecutando(false);
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo="Central de Diagnostico e Esquematico Interativo"
            tag="TEMPO REAL — CLIQUE EM QUALQUER NO PRA DETALHES"
            onFechar={onFechar}
            largura="cheia"
        >
            <div className="central-diagnostico">
                <div className="central-diagnostico__diagrama hud-scrollbar">
                    <DiagramaCentral
                        modulos={modulos}
                        dadosSensores={dadosSensores}
                        portasMapeamento={portasMapeamento}
                        estadoReles={estadoReles}
                        statusScanPorChave={statusScanPorChave}
                        varrendo={executando}
                        onClickModulo={aoClicarModulo}
                        onClickSensor={setSensorDetalhe}
                        onClickAtuadores={() => navegarPara(onAbrirMapeamentoPortas)}
                    />
                </div>

                <div className="central-diagnostico__lateral">
                    <button className="botao-diagnostico" type="button" onClick={iniciarDiagnostico} disabled={executando}>
                        <Zap size={16} />
                        {executando ? 'VARREDURA EM ANDAMENTO...' : 'INICIAR DIAGNOSTICO DO SISTEMA'}
                    </button>

                    <div className="central-diagnostico__terminal hud-scrollbar">
                        {logTerminal.length === 0 && <span className="hud-tag">Aguardando inicio da varredura...</span>}
                        <AnimatePresence initial={false}>
                            {logTerminal.map((linha, indice) => (
                                <motion.div
                                    key={indice}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`central-diagnostico__linha ${linha.tipo}`}
                                >
                                    {linha.texto}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>

                    {/* Acoes Sugeridas (25-espc): so aparece depois da varredura, quando algum
                        modulo respondeu mas nao tem o host do Brain salvo — em vez de deixar
                        so um "FALHA" no log sem nenhum proximo passo, oferece o botao certo
                        pra corrigir na hora (mesma acao de ModalEditarModulo.jsx). */}
                    {!executando && modulosSemHost.length > 0 && (
                        <div className="central-diagnostico__acoes-sugeridas">
                            <span className="hud-tag central-diagnostico__acoes-titulo">
                                <AlertTriangle size={13} />
                                Host do Brain nao encontrado em {modulosSemHost.length} modulo(s)
                            </span>
                            {modulosSemHost.map((modulo) => (
                                <button
                                    key={modulo.id}
                                    className="botao-primario central-diagnostico__botao-acao"
                                    type="button"
                                    onClick={() => reenviarHost(modulo)}
                                    disabled={reenviandoId === modulo.id}
                                >
                                    <Send size={13} />
                                    {reenviandoId === modulo.id ? 'Reenviando...' : `Reenviar IP do Backend — ${modulo.nome}`}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <ModalDetalheSensor aberto={!!sensorDetalhe} onFechar={() => setSensorDetalhe(null)} sensor={sensorDetalhe} />
        </ModalHud>
    );
}
