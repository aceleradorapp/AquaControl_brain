import { useEffect, useRef } from 'react';

// Terminal de logs com rolagem contínua — "entradas" vem do Dashboard, que registra
// eventos reais (fetch de ESPs, cadastro/remoção, falhas de conexão) mais uma linha
// inicial de boot. Não é um log fake gerado sozinho: só aparece o que realmente acontece.
export default function TerminalLogs({ entradas }) {
    const fimRef = useRef(null);

    useEffect(() => {
        fimRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, [entradas]);

    return (
        <div className="hud-painel terminal-logs">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">System Log</h2>
                <span className="hud-tag">LIVE</span>
            </div>

            <div className="terminal-logs__corpo hud-scrollbar">
                {entradas.map((entrada) => (
                    <div key={entrada.id} className={`terminal-logs__linha terminal-logs__linha--${entrada.nivel}`}>
                        <span className="hud-tag">{entrada.hora}</span> {entrada.mensagem}
                    </div>
                ))}
                <div ref={fimRef} />
            </div>
        </div>
    );
}
