// Componentes de campo padronizados da pagina de Configuracoes Globais (19-espc) — toggle
// (switch), numero (com unidade opcional), select e uma linha/card generico que embrulha
// label + descricao + o campo em si, usados em todas as 5 categorias da pagina.

export function LinhaConfiguracao({ titulo, descricao, children }) {
    return (
        <div className="config-linha">
            <div className="config-linha__texto">
                <span className="config-linha__titulo">{titulo}</span>
                {descricao && <span className="config-linha__descricao">{descricao}</span>}
            </div>
            <div className="config-linha__campo">{children}</div>
        </div>
    );
}

export function CampoToggle({ checked, onChange, disabled }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            className={`config-toggle ${checked ? 'ativo' : ''}`}
            onClick={() => onChange(!checked)}
        >
            <span className="config-toggle__bola" />
        </button>
    );
}

export function CampoNumero({ valor, onChange, unidade, min, max, step, disabled }) {
    return (
        <div className="config-campo-numero">
            <input
                type="number"
                className="hud-input"
                value={valor}
                min={min}
                max={max}
                step={step}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
            />
            {unidade && <span className="hud-tag">{unidade}</span>}
        </div>
    );
}

export function CampoSelect({ valor, onChange, opcoes, disabled }) {
    return (
        <select className="hud-input config-select" value={valor} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
            {opcoes.map((op) => (
                <option key={op.valor} value={op.valor}>
                    {op.rotulo}
                </option>
            ))}
        </select>
    );
}

export function CartaoSecao({ titulo, acao, children }) {
    return (
        <div className="hud-painel config-cartao">
            <div className="painel-cabecalho">
                <h3 className="hud-titulo relatorio-subtitulo">{titulo}</h3>
                {acao}
            </div>
            <div className="config-cartao__corpo">{children}</div>
        </div>
    );
}
