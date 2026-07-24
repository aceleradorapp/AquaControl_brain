import { useEffect, useState } from 'react';
import ModalHud from './ModalHud';

// Modal "Editar Controlador" (12-espc): edita o nome amigavel (guardado so no banco do
// Brain, PUT /api/modulos/:id) e o hostname de rede de verdade do ESP32 (WiFi.setHostname,
// persistido em NVS no proprio dispositivo — POST /api/modulos/:id/config-dispositivo,
// proxy pro firmware). So manda o que realmente mudou: trocar o hostname reinicia o modulo
// (o firmware so aplica WiFi.setHostname de verdade no proximo boot), entao nao faz sentido
// disparar isso so porque o usuario mudou o nome amigavel.
export default function ModalEditarModulo({ aberto, modulo, statusAtual, onFechar, onSalvo, registrarLog }) {
    const [nome, setNome] = useState('');
    const [hostname, setHostname] = useState('');
    const [salvando, setSalvando] = useState(false);

    const hostnameAtual = statusAtual?.disponivel ? statusAtual.hostname ?? '' : null;

    useEffect(() => {
        if (!aberto || !modulo) return;
        setNome(modulo.nome);
        setHostname(hostnameAtual ?? '');
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

            if (nome.trim() !== modulo.nome) {
                const resposta = await fetch(`/api/modulos/${modulo.id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nome: nome.trim() }),
                });
                if (!resposta.ok) throw new Error('Falha ao salvar o nome.');
                const dados = await resposta.json();
                moduloAtualizado = dados;
                onSalvo?.(dados);
                registrarLog?.(`Modulo renomeado para "${nome.trim()}".`, 'sucesso');
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

            fechar();
        } catch (erro) {
            registrarLog?.(`Falha ao editar modulo: ${erro.message}`, 'erro');
        } finally {
            setSalvando(false);
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

                <div className="modal-hud__acoes">
                    <button className="botao-primario" type="submit" disabled={salvando || !nome.trim()}>
                        {salvando ? 'Salvando...' : 'Salvar Alteracoes'}
                    </button>
                </div>
            </form>
        </ModalHud>
    );
}
