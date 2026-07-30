// Cartao de KPI reutilizavel pelas 4 abas da Central de Relatorios (17-espc) — mesmo
// "hud-corner-marks" usado no SensorGauge/outros cartoes do dashboard, pra manter a
// linguagem visual consistente. "valor" aceita string/numero pronto; "cor" so tinge o valor.
export default function CartaoKPI({ titulo, valor, unidade, cor = 'var(--cor-primaria)' }) {
    return (
        <div className="cartao-kpi hud-corner-marks">
            <span className="hud-tag cartao-kpi__titulo">{titulo}</span>
            <span className="cartao-kpi__valor" style={{ color: cor }}>
                {valor ?? '--'}
                {valor !== null && valor !== undefined && unidade ? <span className="cartao-kpi__unidade">{unidade}</span> : null}
            </span>
        </div>
    );
}
