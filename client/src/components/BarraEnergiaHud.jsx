// Barra de progresso estilo "gauge de energia" Sci-Fi — segmentos discretos em vez de uma
// barra contínua, cada um chanfrado (clip-path via CSS). Usada pra Umidade do Ar em
// Parametros Vitais (01-espc-geral/06_...), ao lado dos gauges circulares de temperatura.
const TOTAL_SEGMENTOS = 20;

export default function BarraEnergiaHud({ titulo, valor, unidade = '%', min = 0, max = 100, cor = 'var(--cor-secundaria)' }) {
    const percentual = Math.min(100, Math.max(0, ((valor - min) / (max - min)) * 100));
    const segmentosAtivos = Math.round((percentual / 100) * TOTAL_SEGMENTOS);

    return (
        <div className="barra-energia">
            <div className="barra-energia__cabecalho">
                <span className="hud-tag">{titulo}</span>
                <span className="barra-energia__valor hud-mono" style={{ color: cor }}>
                    {valor}
                    {unidade}
                </span>
            </div>
            <div className="barra-energia__trilho">
                {Array.from({ length: TOTAL_SEGMENTOS }).map((_, indice) => (
                    <span
                        key={indice}
                        className="barra-energia__segmento"
                        style={indice < segmentosAtivos ? { background: cor, boxShadow: `0 0 6px ${cor}` } : undefined}
                    />
                ))}
            </div>
        </div>
    );
}
