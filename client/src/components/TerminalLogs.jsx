import { useEffect, useRef } from 'react';
import { Maximize2 } from 'lucide-react';

// Terminal de logs com rolagem contínua — "entradas" vem do Dashboard, que registra
// eventos reais (fetch de ESPs, cadastro/remoção, falhas de conexão) mais uma linha
// inicial de boot. Não é um log fake gerado sozinho: só aparece o que realmente acontece.
//
// 31-espc: uma entrada com "diagnosticoId" (linhas de Diagnostico Completo/Manual, vindas do
// backend — ver logService.js) renderiza como link clicavel em vez de texto plano, chamando
// "onAbrirDiagnostico(id)" — quem abre a modal de detalhe e o Dashboard (ver
// ModalDetalheDiagnostico.jsx), este componente so dispara o pedido.
//
// 32-espc: "[VER TUDO]" no cabeçalho abre a pagina completa de logs (ModalLogsCompleto.jsx —
// modal full-screen, não uma rota de verdade: este projeto não usa react-router em lugar
// nenhum, toda "tela grande" aqui é um modal, ver comentário em ModalCentralDiagnostico.jsx).
export default function TerminalLogs({ entradas, onAbrirDiagnostico, onAbrirTudo }) {
    const fimRef = useRef(null);

    // CORRIGIDO (bug real em celular): "scrollIntoView" nao se limita ao container mais
    // proximo — se o elemento nao estiver visivel no VIEWPORT EXTERNO tambem (comum em
    // celular, onde este widget costuma ficar fora da tela por estar mais pra baixo na
    // pilha de 1 coluna), o navegador rola a PAGINA INTEIRA ate revelar o widget, alem de
    // rolar o container interno — parecia "a tela pula pro ultimo widget" a cada acao que
    // gera 1 linha de log (ou seja, quase qualquer clique). Setar "scrollTop" direto no
    // container (".terminal-logs__corpo", pai do ref) rola SO ali dentro, nunca a pagina.
    useEffect(() => {
        const container = fimRef.current?.parentElement;
        if (container) container.scrollTop = container.scrollHeight;
    }, [entradas]);

    return (
        <div className="hud-painel terminal-logs">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">System Log</h2>
                <div className="terminal-logs__acoes-cabecalho">
                    <span className="hud-tag">LIVE</span>
                    <button type="button" className="terminal-logs__botao-ver-tudo" onClick={onAbrirTudo}>
                        <Maximize2 size={13} />
                        [ Ver Tudo ]
                    </button>
                </div>
            </div>

            <div className="terminal-logs__corpo hud-scrollbar">
                {entradas.map((entrada) => (
                    <div key={entrada.id} className={`terminal-logs__linha terminal-logs__linha--${entrada.nivel}`}>
                        <span className="hud-tag">{entrada.hora}</span>{' '}
                        {entrada.diagnosticoId ? (
                            <button
                                type="button"
                                className="terminal-logs__link"
                                onClick={() => onAbrirDiagnostico?.(entrada.diagnosticoId)}
                            >
                                {entrada.mensagem}
                            </button>
                        ) : (
                            entrada.mensagem
                        )}
                    </div>
                ))}
                <div ref={fimRef} />
            </div>
        </div>
    );
}
