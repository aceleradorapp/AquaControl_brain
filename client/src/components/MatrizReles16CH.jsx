const TOTAL_PORTAS = 16;

// Widget "Diagnostico de Reles (16CH)" — 01-espc-geral/08_widget_matriz_reles_ping.md.
// Grade tática 4x4 (ou 8 colunas, ver CSS) pra teste rápido de bancada: mostra o estado
// real de cada uma das 16 portas do módulo de atuadores. "portas" (nomes + habilitado) vem
// do Dashboard (13-espc) — antes este componente buscava por conta própria; agora é a
// mesma fonte compartilhada com a Central do Aquário, pra nunca desalinhar.
//
// Porta desabilitada ("Oculta" no Mapeamento de Saidas) aparece em laranja com status
// "BLOCKED" e não é clicável — ela nunca é acionada de verdade (o backend também reforça
// isso, ver relesController.js), então nem faz sentido deixar clicar aqui.
export default function MatrizReles16CH({ moduloAtuador, estadoReles, portas, onAlternarPorta, onLigarTodos, onDesligarTodos }) {
    return (
        <div className="hud-painel matriz-reles">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Diagnostico de Reles (16CH)</h2>
                <span className="hud-tag">{moduloAtuador ? `MODULO ${moduloAtuador.ip}` : 'SEM MODULO'}</span>
            </div>

            {!moduloAtuador && (
                <p className="hud-tag">Nenhum modulo do tipo "atuador" cadastrado ainda — cadastre um em Modulos de Controladores.</p>
            )}

            {moduloAtuador && (
                <>
                    <div className="matriz-reles__acoes">
                        <button className="matriz-reles__botao-acao matriz-reles__botao-acao--ligar" type="button" onClick={onLigarTodos}>
                            Ligar Todos
                        </button>
                        <button className="matriz-reles__botao-acao matriz-reles__botao-acao--desligar" type="button" onClick={onDesligarTodos}>
                            Desligar Todos
                        </button>
                    </div>

                    <div className="matriz-reles__grade">
                        {Array.from({ length: TOTAL_PORTAS }).map((_, indice) => {
                            const porta = portas[indice];
                            const habilitada = porta ? porta.habilitado : true;
                            const nomeMapeado = porta?.nomePersonalizado?.trim();
                            const ligado = estadoReles ? estadoReles[indice] === 1 : false;
                            const numero = String(indice + 1).padStart(2, '0');

                            let classeEstado = '';
                            let statusTexto = ligado ? 'ON' : 'OFF';
                            if (!habilitada) {
                                classeEstado = 'matriz-reles__botao--bloqueado';
                                statusTexto = 'BLOCKED';
                            } else if (ligado) {
                                classeEstado = 'matriz-reles__botao--on';
                            }

                            // Tooltip customizado (CSS puro, ver dashboard.css) — só aparece
                            // se a porta tiver um nome cadastrado no Mapeamento de Saidas
                            // ("caso exista"); sem nome, nenhum tooltip é mostrado.
                            return (
                                <button
                                    key={indice}
                                    type="button"
                                    className={`matriz-reles__botao ${classeEstado} ${nomeMapeado ? 'hud-tooltip' : ''}`}
                                    onClick={() => habilitada && onAlternarPorta(indice)}
                                    disabled={!habilitada}
                                    data-tooltip={nomeMapeado || undefined}
                                    aria-label={nomeMapeado || `Porta ${numero}`}
                                >
                                    <span className="matriz-reles__numero hud-mono">{numero}</span>
                                    <span className="matriz-reles__status hud-mono">{statusTexto}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
