import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CircuitBoard, Cpu, Pencil, Plus, Server, Trash2 } from 'lucide-react';
import ModalInfo from './ModalInfo';
import ModalEditarModulo from './ModalEditarModulo';
import ModalDiagnosticoCompleto from './ModalDiagnosticoCompleto';
import IndicadorSinalWifi from './IndicadorSinalWifi';

const INTERVALO_POLL_RSSI_MS = 15000;

const TIPOS = ['atuador', 'telemetria', 'display'];

// Rótulos de exibição pros campos que vêm de GET /api/modulos/:id/status (que por sua vez
// é um proxy do Brain pro GET /api/status do próprio ESP32 — ver relesController.js e
// AquaControl_Hardware/src/main.cpp:handleGetStatus). Só os campos aqui listados aparecem
// no modal rápido de status, na ordem declarada — o resto do que o ESP manda (12-espc:
// diagnostico bem mais completo) só aparece no Modal de Diagnostico Completo, ver
// ModalDiagnosticoCompleto.jsx (reaproveita a MESMA resposta, sem precisar buscar de novo).
const CAMPOS_STATUS = [
    ['ip', 'IP'],
    ['hostname', 'Hostname'],
    ['ssid', 'SSID'],
    ['rssi_dbm', 'Sinal Wi-Fi (RSSI)'],
    ['uptime_s', 'Uptime'],
    ['controle_reles', 'Controle de reles'],
    ['tela_atual', 'Tela atual (Display)'],
    ['ip_backend_salvo', 'Backend salvo (NVS)'],
];

function formatarValorStatus(chave, valor) {
    if (chave === 'rssi_dbm') return `${valor} dBm`;
    if (chave === 'uptime_s') {
        const minutos = Math.floor(valor / 60);
        const segundos = valor % 60;
        return `${minutos}min ${segundos}s`;
    }
    // 11-espc: o Hardware trocou o MCP23017 (I2C) por GPIOs diretos do ESP32 — sem "não
    // respondeu", já que não existe mais um chip externo que possa falhar ao inicializar.
    if (chave === 'controle_reles') return valor === 'gpio_direto' ? 'GPIO direto (sem I2C)' : String(valor);
    if (chave === 'ip_backend_salvo') return valor || '(nenhum ainda)';
    return String(valor);
}

// Coluna 3: CRUD real de módulos, conectado em /api/modulos (01-espc-geral/06_...) — a
// antiga tabela/rota "esps" virou "modulos", com "ativo" (habilitado/desabilitado pelo
// usuário, um campo do banco) separado de "online" (conectividade real, 08-espc: ping
// periódico em background no server — ver services/statusModulosService.js). O LED
// reflete "online", não "ativo": verde pulsante quando o módulo responde, vermelho neon
// quando não responde — "ativo" continua só como texto no título (tooltip) do LED.
export default function ModulosControladores({
    modulos,
    onCriar,
    onRemover,
    onAtualizarModulo,
    carregando,
    erro,
    onAbrirEsquematico,
    onAbrirEsquematicoSensores,
    onRenomeadoSensores,
    registrarLog,
}) {
    const [formAberto, setFormAberto] = useState(false);
    const [form, setForm] = useState({ nome: '', ip: '', tipo: TIPOS[0], ativo: true });
    const [enviando, setEnviando] = useState(false);

    // Sinal de Wi-Fi por modulo (25-espc) — "modulos" (prop, vindo do poll de 8s em
    // Dashboard.jsx) so tem online/offline (cache leve de TCP ping), sem RSSI. Busca PROPRIA
    // e mais espacada (15s, um GET /api/modulos/:id/status por modulo, mesma rota ja usada
    // pelo modal de status ao clicar) so pra manter esse numero atualizado na lista, sem
    // mexer no mecanismo de ping existente. Depende dos IDS (nao do array "modulos" em si,
    // que e uma referencia nova a cada poll) — mesmo motivo documentado em Dashboard.jsx pra
    // outros efeitos: evita re-disparar isso a cada 8s so por causa de uma referencia nova.
    const [rssiPorModulo, setRssiPorModulo] = useState({});
    const idsModulos = modulos.map((m) => m.id).join(',');

    useEffect(() => {
        if (!idsModulos) return undefined;
        let cancelado = false;

        async function atualizarRssi() {
            const resultados = await Promise.all(
                modulos.map(async (modulo) => {
                    try {
                        const resposta = await fetch(`/api/modulos/${modulo.id}/status`);
                        const dados = await resposta.json();
                        return [modulo.id, dados.disponivel ? dados.rssi_dbm ?? null : null];
                    } catch {
                        return [modulo.id, null];
                    }
                })
            );
            if (!cancelado) setRssiPorModulo(Object.fromEntries(resultados));
        }

        atualizarRssi();
        const intervalo = setInterval(atualizarRssi, INTERVALO_POLL_RSSI_MS);
        return () => {
            cancelado = true;
            clearInterval(intervalo);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [idsModulos]);

    // Modal de status ao vivo: clicar num módulo da lista chama GET /api/modulos/:id/status
    // (proxy pro GET /api/status do próprio ESP) e mostra o resultado — pensado pra validar
    // rapidamente se um módulo está de fato acessível sem precisar abrir o navegador à parte.
    const [moduloClicado, setModuloClicado] = useState(null);
    const [statusModulo, setStatusModulo] = useState(null);
    const [carregandoStatus, setCarregandoStatus] = useState(false);

    // Editar Controlador / Diagnostico Completo (12-espc) — os dois operam sobre o MESMO
    // "moduloClicado"/"statusModulo" já carregados acima; nenhum precisa buscar nada de novo.
    const [modalEditarAberto, setModalEditarAberto] = useState(false);
    const [modalDiagnosticoAberto, setModalDiagnosticoAberto] = useState(false);

    async function abrirStatusModulo(modulo) {
        setModuloClicado(modulo);
        setStatusModulo(null);
        setCarregandoStatus(true);
        try {
            const resposta = await fetch(`/api/modulos/${modulo.id}/status`);
            const dados = await resposta.json();
            setStatusModulo(dados);
        } catch {
            setStatusModulo({ disponivel: false, motivo: 'Falha ao consultar o AquaControl_Brain.' });
        } finally {
            setCarregandoStatus(false);
        }
    }

    function fecharStatusModulo() {
        setModuloClicado(null);
        setStatusModulo(null);
    }

    async function handleSubmit(evento) {
        evento.preventDefault();
        if (!form.nome || !form.ip) return;

        setEnviando(true);
        const resultado = await onCriar(form);
        setEnviando(false);

        // So limpa/fecha em caso de sucesso de verdade — antes fechava sempre, mesmo quando
        // o cadastro falhava (ex.: IP duplicado/invalido), obrigando redigitar tudo. Em caso
        // de falha o form fica aberto do jeito que estava; o motivo ja aparece no log.
        if (resultado?.sucesso) {
            setForm({ nome: '', ip: '', tipo: TIPOS[0], ativo: true });
            setFormAberto(false);
        }
    }

    function cancelarCadastro() {
        setForm({ nome: '', ip: '', tipo: TIPOS[0], ativo: true });
        setFormAberto(false);
    }

    return (
        <>
        <div className="hud-painel gestao-esps">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Modulos de Controladores</h2>
                <button className="botao-icone" onClick={() => setFormAberto((v) => !v)} aria-label="Cadastrar modulo" type="button">
                    <Plus size={16} />
                </button>
            </div>

            <AnimatePresence>
                {formAberto && (
                    <motion.form
                        className="gestao-esps__form"
                        onSubmit={handleSubmit}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        <input
                            className="hud-input"
                            placeholder="Nome (ex.: Controlador de Atuadores 01)"
                            value={form.nome}
                            onChange={(e) => setForm({ ...form, nome: e.target.value })}
                        />
                        <input
                            className="hud-input"
                            placeholder="IP (ex.: 192.168.98.210)"
                            value={form.ip}
                            onChange={(e) => setForm({ ...form, ip: e.target.value })}
                            pattern="^(\d{1,3}\.){3}\d{1,3}$"
                            title="Formato de IP invalido — use 000.000.000.000"
                        />
                        <select className="hud-input" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                            {TIPOS.map((tipo) => (
                                <option key={tipo} value={tipo}>
                                    {tipo}
                                </option>
                            ))}
                        </select>

                        <label className="gestao-esps__chave">
                            <input type="checkbox" checked={form.ativo} onChange={(e) => setForm({ ...form, ativo: e.target.checked })} />
                            <span>{form.ativo ? 'Ativo' : 'Inativo'}</span>
                        </label>

                        <div className="gestao-esps__form-acoes">
                            <button className="botao-primario" type="submit" disabled={enviando}>
                                {enviando ? 'Enviando...' : 'Cadastrar'}
                            </button>
                            <button className="botao-primario botao-primario--neutro" type="button" onClick={cancelarCadastro} disabled={enviando}>
                                Cancelar
                            </button>
                        </div>
                    </motion.form>
                )}
            </AnimatePresence>

            {erro && <p className="mensagem-erro hud-tag">{erro}</p>}
            {carregando && <p className="hud-tag">Carregando...</p>}

            <ul className="gestao-esps__lista hud-scrollbar">
                <AnimatePresence>
                    {modulos.map((modulo) => (
                        <motion.li
                            key={modulo.id}
                            className="gestao-esps__item"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            onClick={() => abrirStatusModulo(modulo)}
                            title="Ver status ao vivo do modulo"
                        >
                            <Server size={14} />
                            <div className="gestao-esps__info">
                                <span className="gestao-esps__nome">{modulo.nome}</span>
                                <span className="hud-tag">
                                    {modulo.ip} — {modulo.tipo}
                                </span>
                            </div>
                            <IndicadorSinalWifi rssiDbm={rssiPorModulo[modulo.id]} />
                            <span
                                className={`hud-status-dot ${modulo.online ? 'online' : 'offline'}`}
                                title={`${modulo.online ? 'Online' : 'Offline'} — modulo ${modulo.ativo ? 'ativo' : 'inativo'}`}
                            />
                            <button
                                className="botao-icone botao-icone--erro"
                                onClick={(evento) => {
                                    evento.stopPropagation();
                                    onRemover(modulo.id);
                                }}
                                aria-label="Remover modulo"
                                type="button"
                            >
                                <Trash2 size={14} />
                            </button>
                        </motion.li>
                    ))}
                </AnimatePresence>
                {modulos.length === 0 && !carregando && <li className="hud-tag gestao-esps__vazio">Nenhum modulo cadastrado.</li>}
            </ul>
        </div>

            {/* Fora do "hud-painel" de propósito: clip-path no card cortaria o backdrop
                fixed do modal, que precisa cobrir a tela inteira — ver ModalHud.jsx. */}
            <ModalInfo
                aberto={!!moduloClicado}
                titulo={moduloClicado?.nome ?? ''}
                tag={moduloClicado ? `${moduloClicado.ip} — GET /api/status` : ''}
                onFechar={fecharStatusModulo}
            >
                {carregandoStatus && <p className="hud-tag">Consultando o modulo...</p>}

                {!carregandoStatus && statusModulo?.disponivel && (
                    <div className="status-modulo__lista">
                        {CAMPOS_STATUS.map(([chave, rotulo]) =>
                            statusModulo[chave] !== undefined ? (
                                <div key={chave} className="status-modulo__linha">
                                    <span className="hud-tag">{rotulo}</span>
                                    <span className="status-modulo__valor hud-mono">{formatarValorStatus(chave, statusModulo[chave])}</span>
                                </div>
                            ) : null
                        )}
                    </div>
                )}

                {!carregandoStatus && statusModulo && !statusModulo.disponivel && (
                    <p className="mensagem-erro hud-tag">{statusModulo.motivo ?? 'Modulo inacessivel.'}</p>
                )}

                {/* Editar Controlador + Diagnostico Completo (12-espc) + Esquematico Interativo
                    (16-espc, so pro modulo de reles) — mesmo visual empilhado, ver
                    ".status-modulo__acoes" em dashboard.css. */}
                {moduloClicado && (
                    <div className="status-modulo__acoes">
                        <button
                            className="botao-primario status-modulo__botao-acao"
                            type="button"
                            onClick={() => setModalEditarAberto(true)}
                        >
                            <Pencil size={14} />
                            Editar Controlador
                        </button>

                        <button
                            className="botao-primario status-modulo__botao-acao"
                            type="button"
                            onClick={() => setModalDiagnosticoAberto(true)}
                            disabled={!statusModulo?.disponivel}
                        >
                            <Cpu size={14} />
                            Diagnostico Completo
                        </button>

                        {moduloClicado?.tipo === 'atuador' && (
                            <button
                                className="botao-primario status-modulo__botao-acao"
                                type="button"
                                onClick={() => {
                                    fecharStatusModulo();
                                    onAbrirEsquematico();
                                }}
                            >
                                <CircuitBoard size={14} />
                                Ver Esquematico Tatico
                            </button>
                        )}

                        {moduloClicado?.tipo === 'telemetria' && (
                            <button
                                className="botao-primario status-modulo__botao-acao"
                                type="button"
                                onClick={() => {
                                    fecharStatusModulo();
                                    onAbrirEsquematicoSensores();
                                }}
                            >
                                <CircuitBoard size={14} />
                                Ver Esquematico dos Sensores
                            </button>
                        )}
                    </div>
                )}
            </ModalInfo>

            <ModalEditarModulo
                aberto={modalEditarAberto}
                modulo={moduloClicado}
                statusAtual={statusModulo}
                onFechar={() => setModalEditarAberto(false)}
                onSalvo={onAtualizarModulo}
                onRenomeadoSensores={onRenomeadoSensores}
                registrarLog={registrarLog}
            />

            <ModalDiagnosticoCompleto
                aberto={modalDiagnosticoAberto}
                modulo={moduloClicado}
                diagnostico={statusModulo}
                onFechar={() => setModalDiagnosticoAberto(false)}
            />
        </>
    );
}
