import { useEffect, useState } from 'react';
import ModalHud from './ModalHud';

// Modal de Timer Rapido (18-espc): liga um Rele ou Tema JA (POST /api/timers dispara na
// hora) por um tempo pre-definido — ao zerar, o motor (schedulerService.js) desliga e
// restaura o agendamento normal sozinho, sem precisar voltar aqui.
const PRESETS = [
    { rotulo: '10m', segundos: 10 * 60 },
    { rotulo: '30m', segundos: 30 * 60 },
    { rotulo: '1h', segundos: 60 * 60 },
];

export default function ModalTimer({ aberto, modulo, portas, temas, onFechar, onDisparado, registrarLog }) {
    const [alvoTipo, setAlvoTipo] = useState('rele');
    const [alvoId, setAlvoId] = useState('');
    const [presetSegundos, setPresetSegundos] = useState(PRESETS[0].segundos);
    const [customMinutos, setCustomMinutos] = useState('');
    const [usandoCustom, setUsandoCustom] = useState(false);
    const [disparando, setDisparando] = useState(false);

    const portasMapeadas = portas.filter((porta) => porta.nomePersonalizado?.trim());

    useEffect(() => {
        if (!aberto) return;
        setAlvoTipo('rele');
        setAlvoId('');
        setPresetSegundos(PRESETS[0].segundos);
        setCustomMinutos('');
        setUsandoCustom(false);
    }, [aberto]);

    function fechar() {
        onFechar();
    }

    async function disparar(evento) {
        evento.preventDefault();
        if (!alvoId) return;

        const duracaoSegundos = usandoCustom ? Math.max(1, Number(customMinutos) || 0) * 60 : presetSegundos;
        if (duracaoSegundos <= 0) return;

        setDisparando(true);
        try {
            const resposta = await fetch('/api/timers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ moduloId: modulo.id, alvoTipo, alvoId: Number(alvoId), duracaoSegundos }),
            });
            const dados = await resposta.json();
            if (!resposta.ok || dados.disponivel === false) {
                registrarLog?.(`Falha ao disparar timer: ${dados.motivo ?? dados.erro ?? 'ESP nao respondeu.'}`, 'erro');
                return;
            }
            onDisparado?.(dados.timer);
            registrarLog?.(`Timer "${dados.timer.nome}" disparado por ${Math.round(duracaoSegundos / 60)}min.`, 'sucesso');
            fechar();
        } catch (erro) {
            registrarLog?.(`Falha de comunicacao ao disparar timer: ${erro.message}`, 'erro');
        } finally {
            setDisparando(false);
        }
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo="Timer Rapido"
            tag={modulo ? `MODULO: ${modulo.nome}` : 'NENHUM MODULO ATUADOR'}
            onFechar={fechar}
        >
            {!modulo && <p className="hud-tag">Nenhum modulo do tipo "atuador" cadastrado ainda.</p>}

            {modulo && (
                <form onSubmit={disparar} className="modal-timer">
                    <div className="modal-agendamento__tipo">
                        <button
                            type="button"
                            className={`modal-agendamento__tipo-item ${alvoTipo === 'rele' ? 'modal-agendamento__tipo-item--ativo' : ''}`}
                            onClick={() => {
                                setAlvoTipo('rele');
                                setAlvoId('');
                            }}
                        >
                            Rele
                        </button>
                        <button
                            type="button"
                            className={`modal-agendamento__tipo-item ${alvoTipo === 'tema' ? 'modal-agendamento__tipo-item--ativo' : ''}`}
                            onClick={() => {
                                setAlvoTipo('tema');
                                setAlvoId('');
                            }}
                        >
                            Tema
                        </button>
                    </div>

                    {alvoTipo === 'rele' ? (
                        <select className="hud-input" value={alvoId} onChange={(e) => setAlvoId(e.target.value)} required>
                            <option value="">Selecione o rele...</option>
                            {portasMapeadas.map((porta) => (
                                <option key={porta.posicaoIndice} value={porta.posicaoIndice}>
                                    {porta.nomePersonalizado}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <select className="hud-input" value={alvoId} onChange={(e) => setAlvoId(e.target.value)} required>
                            <option value="">Selecione o tema...</option>
                            {temas.map((tema) => (
                                <option key={tema.id} value={tema.id}>
                                    {tema.nome}
                                </option>
                            ))}
                        </select>
                    )}

                    <span className="hud-tag">Duracao</span>
                    <div className="modal-timer__presets">
                        {PRESETS.map((preset) => (
                            <button
                                key={preset.rotulo}
                                type="button"
                                className={`modal-timer__preset ${!usandoCustom && presetSegundos === preset.segundos ? 'modal-timer__preset--ativo' : ''}`}
                                onClick={() => {
                                    setUsandoCustom(false);
                                    setPresetSegundos(preset.segundos);
                                }}
                            >
                                {preset.rotulo}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={`modal-timer__preset ${usandoCustom ? 'modal-timer__preset--ativo' : ''}`}
                            onClick={() => setUsandoCustom(true)}
                        >
                            Custom
                        </button>
                    </div>

                    {usandoCustom && (
                        <input
                            className="hud-input"
                            type="number"
                            min="1"
                            placeholder="Minutos (ex.: 45)"
                            value={customMinutos}
                            onChange={(e) => setCustomMinutos(e.target.value)}
                        />
                    )}

                    <div className="modal-hud__acoes">
                        <button className="botao-primario" type="submit" disabled={disparando || !alvoId}>
                            {disparando ? 'Disparando...' : 'Disparar Timer'}
                        </button>
                    </div>
                </form>
            )}
        </ModalHud>
    );
}
