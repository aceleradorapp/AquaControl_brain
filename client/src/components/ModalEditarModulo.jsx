import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import ModalHud from './ModalHud';

// Modal "Editar Controlador" (12-espc): edita o nome amigavel (guardado so no banco do
// Brain, PUT /api/modulos/:id) e o hostname de rede de verdade do ESP32 (WiFi.setHostname,
// persistido em NVS no proprio dispositivo — POST /api/modulos/:id/config-dispositivo,
// proxy pro firmware). So manda o que realmente mudou: trocar o hostname reinicia o modulo
// (o firmware so aplica WiFi.setHostname de verdade no proximo boot), entao nao faz sentido
// disparar isso so porque o usuario mudou o nome amigavel.
//
// 16-espc: pra modulos "telemetria", ganha uma secao extra — "Mapeamento e Nome dos Sensores
// do Modulo" — listando os sensores fisicos do AquaControl_sensor com o Nome Oficial editavel
// (o "nomePersonalizado" de sensores_personalizados, usado em TODO o dashboard: widget,
// Diagrama de Sensores, Esquematico). Busca o catalogo por conta propria (mesmo padrao de
// ModalDiagnosticoCompleto.jsx) em vez de depender de props vindas de Dashboard.jsx, pra nao
// precisar furar ModulosControladores.jsx com mais um prop so pra isso.
//
// 29-espc: o campo "nomeDisplay" (nome PROPRIO pra tela fisica do Display, editavel antes no
// extinto widget "Sensores no Display") continua sendo preservado ao salvar (nao apagado —
// ver "salvar" abaixo), mas nao tem mais NENHUMA interface pra edita-lo: a tela principal do
// AquaControl_OS hoje so mostra 3 arcos fixos com rotulos estaticos (nao le "nome"/"nomeDisplay"
// de nenhum dispositivo), entao esse campo ficou orfao — nao precisa de UI nova pra ele.
export default function ModalEditarModulo({ aberto, modulo, statusAtual, onFechar, onSalvo, onStatusAtualizado, onRenomeadoSensores, registrarLog }) {
    const [nome, setNome] = useState('');
    const [hostname, setHostname] = useState('');
    const [potenciaBaseWatts, setPotenciaBaseWatts] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [reenviando, setReenviando] = useState(false);
    const [sensores, setSensores] = useState([]);
    const [nomesSensores, setNomesSensores] = useState({}); // sensorId -> nome oficial editado
    const [carregandoSensores, setCarregandoSensores] = useState(false);

    const hostnameAtual = statusAtual?.disponivel ? statusAtual.hostname ?? '' : null;
    const ehTelemetria = modulo?.tipo === 'telemetria';

    useEffect(() => {
        if (!aberto || !modulo) return;
        setNome(modulo.nome);
        setHostname(hostnameAtual ?? '');
        setPotenciaBaseWatts(modulo.potencia_base_watts ?? '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, modulo?.id]);

    useEffect(() => {
        if (!aberto || !modulo || modulo.tipo !== 'telemetria') return;

        let cancelado = false;
        setCarregandoSensores(true);
        fetch(`/api/modulos/${modulo.id}/sensores`)
            .then((resposta) => resposta.json())
            .then((dados) => {
                if (cancelado) return;
                const lista = dados.disponivel ? dados.sensores : [];
                setSensores(lista);
                setNomesSensores(Object.fromEntries(lista.map((s) => [s.id, s.nome])));
            })
            .catch(() => {
                if (!cancelado) setSensores([]);
            })
            .finally(() => {
                if (!cancelado) setCarregandoSensores(false);
            });

        return () => {
            cancelado = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, modulo?.id]);

    function fechar() {
        onFechar();
    }

    async function salvar(evento) {
        evento.preventDefault();
        if (!nome.trim()) return;

        setSalvando(true);
        try {
            let moduloAtualizado = modulo;

            const potenciaBaseNormalizada = potenciaBaseWatts === '' ? null : Number(potenciaBaseWatts);
            const potenciaBaseMudou = potenciaBaseNormalizada !== (modulo.potencia_base_watts ?? null);
            const nomeMudou = nome.trim() !== modulo.nome;

            if (nomeMudou || potenciaBaseMudou) {
                const resposta = await fetch(`/api/modulos/${modulo.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome: nome.trim(), potenciaBaseWatts: potenciaBaseNormalizada }),
                });
                if (!resposta.ok) throw new Error('Falha ao salvar o modulo.');
                const dados = await resposta.json();
                moduloAtualizado = dados;
                onSalvo?.(dados);
                // Este PUT tambem reenvia o handshake pro ESP (ver realizarHandshake em
                // modulosController.js) — sem isso o "Backend salvo (NVS)" na tela de status
                // ficava com o valor antigo ate o usuario sair e voltar na tela.
                onStatusAtualizado?.();
                if (nomeMudou) registrarLog?.(`Modulo renomeado para "${nome.trim()}".`, 'sucesso');
                if (potenciaBaseMudou) registrarLog?.(`Potencia base de "${dados.nome}" ajustada para ${potenciaBaseNormalizada ?? 'nao configurada'}${potenciaBaseNormalizada !== null ? 'W' : ''}.`, 'sucesso');
            }

            if (hostnameAtual !== null && hostname.trim() !== hostnameAtual) {
                const resposta = await fetch(`/api/modulos/${modulo.id}/config-dispositivo`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hostname: hostname.trim() }),
                });
                const dados = await resposta.json();
                if (!resposta.ok || dados.disponivel === false) {
                    registrarLog?.(`Falha ao alterar o hostname: ${dados.motivo ?? dados.status ?? 'ESP nao respondeu.'}`, 'erro');
                } else {
                    registrarLog?.(`Hostname de "${moduloAtualizado.nome}" alterado para "${hostname.trim()}" — modulo reiniciando para aplicar.`, 'sucesso');
                }
            }

            // Nomes oficiais dos sensores (16-espc) — so manda os que realmente mudaram, e
            // preserva o "nomeDisplay" (Nome no Display) ja salvo de cada um, buscado junto
            // com o catalogo acima — sem isso, salvar aqui apagaria silenciosamente o Nome no
            // Display configurado no widget "Sensores no Display" (ambos os campos moram na
            // MESMA linha da tabela sensores_personalizados, ver PUT /api/sensores-personalizados).
            if (ehTelemetria && sensores.length > 0) {
                const alterados = sensores.filter((s) => (nomesSensores[s.id] ?? '').trim() !== s.nome);
                if (alterados.length > 0) {
                    const resposta = await fetch('/api/sensores-personalizados', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            sensores: alterados.map((s) => ({
                                sensorId: s.id,
                                nomePersonalizado: nomesSensores[s.id],
                                nomeDisplay: s.nomeDisplay,
                            })),
                        }),
                    });
                    if (resposta.ok) {
                        registrarLog?.(`${alterados.length} sensor(es) renomeado(s) no Modulo de Telemetria.`, 'sucesso');
                        onRenomeadoSensores?.();
                    } else {
                        registrarLog?.('Falha ao salvar os nomes dos sensores.', 'erro');
                    }
                }
            }

            fechar();
        } catch (erro) {
            registrarLog?.(`Falha ao editar modulo: ${erro.message}`, 'erro');
        } finally {
            setSalvando(false);
        }
    }

    // Reenviar IP do Backend (25-espc): atualizarModulo() no server JA reenvia o handshake
    // (POST /api/config) toda vez que um PUT acontece — mas salvar() acima so faz o PUT
    // quando o NOME muda, entao nao existia jeito de forcar o reenvio se o nome ja estivesse
    // certo (ex.: modulo perdeu o IP salvo do backend depois de um reflash, mas o cadastro no
    // Brain continua igual). Este botao manda um PUT com os MESMOS valores atuais so pra
    // acionar aquele handshake de novo.
    async function reenviarHandshake() {
        setReenviando(true);
        try {
            const resposta = await fetch(`/api/modulos/${modulo.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome: modulo.nome }),
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro ?? 'Falha ao contatar o AquaControl_Brain.');

            if (dados.handshake?.sucesso) {
                registrarLog?.(`IP do backend reenviado com sucesso para "${modulo.nome}".`, 'sucesso');
                onStatusAtualizado?.();
            } else {
                registrarLog?.(`Modulo "${modulo.nome}" nao respondeu ao reenvio: ${dados.handshake?.motivo ?? 'sem detalhes.'}`, 'erro');
            }
        } catch (erro) {
            registrarLog?.(`Falha ao reenviar IP do backend: ${erro.message}`, 'erro');
        } finally {
            setReenviando(false);
        }
    }

    if (!modulo) return null;

    return (
        <ModalHud aberto={aberto} titulo="Editar Controlador" tag={`${modulo.ip} — ${modulo.tipo}`} onFechar={fechar}>
            <form onSubmit={salvar} className="modal-editar-modulo">
                <label className="modal-editar-modulo__campo">
                    <span className="hud-tag">Nome do Controlador</span>
                    <input className="hud-input" value={nome} onChange={(e) => setNome(e.target.value)} required />
                </label>

                <label className="modal-editar-modulo__campo">
                    <span className="hud-tag">Hostname da Rede</span>
                    <input
                        className="hud-input"
                        value={hostname}
                        onChange={(e) => setHostname(e.target.value)}
                        placeholder={hostnameAtual === null ? 'Modulo offline — indisponivel agora' : 'ex.: aquacontrol-reles'}
                        disabled={hostnameAtual === null}
                        pattern="[A-Za-z0-9-]{1,32}"
                        title="Somente letras, numeros e hifen (ate 32 caracteres)"
                    />
                    <span className="hud-tag modal-editar-modulo__aviso">
                        {hostnameAtual === null
                            ? 'Precisa do modulo online pra ler/alterar o hostname atual.'
                            : 'Alterar o hostname reinicia o modulo automaticamente pra aplicar de verdade.'}
                    </span>
                </label>

                <label className="modal-editar-modulo__campo">
                    <span className="hud-tag">Potencia Base do Modulo (W)</span>
                    <input
                        className="hud-input"
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="ex.: 1.5 (consumo proprio do ESP32, sempre ligado)"
                        value={potenciaBaseWatts}
                        onChange={(e) => setPotenciaBaseWatts(e.target.value)}
                    />
                    <span className="hud-tag modal-editar-modulo__aviso">
                        Opcional — so alimenta a estimativa de consumo de energia (aba "Energia" da Central de
                        Relatorios). Em branco, este modulo fica fora do calculo.
                    </span>
                </label>

                <div className="modal-editar-modulo__campo">
                    <span className="hud-tag">IP do Backend (Handshake)</span>
                    <span className="hud-tag modal-editar-modulo__aviso">
                        Reenvia o IP deste AquaControl_Brain pro modulo (POST /api/config) — util se o modulo foi
                        reflashado/reiniciado e perdeu o endereco salvo. So funciona com o modulo online agora.
                    </span>
                    <button className="botao-primario modal-editar-modulo__botao-handshake" type="button" onClick={reenviarHandshake} disabled={reenviando}>
                        <Send size={14} />
                        {reenviando ? 'Reenviando...' : 'Reenviar IP do Backend'}
                    </button>
                </div>

                {ehTelemetria && (
                    <div className="modal-editar-modulo__secao-sensores">
                        <span className="hud-tag modal-editar-modulo__secao-titulo">Mapeamento e Nome dos Sensores do Modulo</span>
                        <span className="hud-tag modal-editar-modulo__aviso">
                            Nome usado em todo o sistema (widget, graficos, historico).
                        </span>

                        {carregandoSensores && <p className="hud-tag">Consultando sensores...</p>}

                        {!carregandoSensores && sensores.length === 0 && (
                            <p className="hud-tag">Modulo de telemetria inacessivel agora — nao da pra listar os sensores.</p>
                        )}

                        {!carregandoSensores &&
                            sensores.map((sensor) => (
                                <label key={sensor.id} className="modal-editar-modulo__campo modal-editar-modulo__campo-sensor">
                                    <span className="hud-tag modal-editar-modulo__sensor-id">
                                        <span className={`hud-status-dot ${sensor.conectado ? 'online' : 'offline'}`} />
                                        {sensor.id}
                                    </span>
                                    <input
                                        className="hud-input"
                                        value={nomesSensores[sensor.id] ?? ''}
                                        onChange={(e) => setNomesSensores((atual) => ({ ...atual, [sensor.id]: e.target.value }))}
                                    />
                                </label>
                            ))}
                    </div>
                )}

                <div className="modal-hud__acoes">
                    <button className="botao-primario" type="submit" disabled={salvando || !nome.trim()}>
                        {salvando ? 'Salvando...' : 'Salvar Alteracoes'}
                    </button>
                </div>
            </form>
        </ModalHud>
    );
}
