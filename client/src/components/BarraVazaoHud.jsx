import { formatarComDecimal } from '../utils/formatoNumero';

// Vazao de agua (24-espc) — mesmo "gauge de energia" segmentado de BarraEnergiaHud (Umidade do
// Ar), mas colorido como uma escala fixa vermelho (minimo critico) -> verde (maximo/bomba nova),
// com um marcador na posicao da calibracao de "troca de filtro" (ver Configuracoes Globais ->
// Sensores & Telemetria -> Calibracao de Vazao). A cor de cada segmento reflete a POSICAO dele
// na escala min-max, nao o valor atual — e uma regua fixa, so o preenchimento (quantos segmentos
// acendem) que muda com a leitura.
const TOTAL_SEGMENTOS = 20;

function corDoSegmento(indice, totalSegmentos) {
    const hue = Math.round((indice / (totalSegmentos - 1)) * 120); // 0 = vermelho, 120 = verde
    return `hsl(${hue}, 85%, 55%)`;
}

export default function BarraVazaoHud({ titulo, valorLh, ativa, min, max, trocaFiltroLh }) {
    const temLeitura = typeof valorLh === 'number' && Number.isFinite(valorLh);
    const percentual = temLeitura ? Math.min(100, Math.max(0, ((valorLh - min) / (max - min)) * 100)) : 0;
    const segmentosAtivos = Math.round((percentual / 100) * TOTAL_SEGMENTOS);
    const percentualTrocaFiltro = Math.min(100, Math.max(0, ((trocaFiltroLh - min) / (max - min)) * 100));
    const corAtual = segmentosAtivos > 0 ? corDoSegmento(segmentosAtivos - 1, TOTAL_SEGMENTOS) : 'var(--cor-texto-secundario)';

    return (
        <div className="barra-energia barra-vazao">
            <div className="barra-energia__cabecalho">
                <span className="hud-tag">{titulo}</span>
                <span className="barra-energia__valor hud-mono" style={{ color: ativa ? corAtual : 'var(--cor-texto-secundario)' }}>
                    {temLeitura ? `${formatarComDecimal(valorLh)} L/h` : '--'}
                    {!ativa && <span className="barra-vazao__inativa"> · INATIVA</span>}
                </span>
            </div>
            <div className="barra-energia__trilho barra-vazao__trilho">
                {Array.from({ length: TOTAL_SEGMENTOS }).map((_, indice) => (
                    <span
                        key={indice}
                        className="barra-energia__segmento"
                        style={
                            indice < segmentosAtivos
                                ? {
                                      background: corDoSegmento(indice, TOTAL_SEGMENTOS),
                                      boxShadow: `0 0 6px ${corDoSegmento(indice, TOTAL_SEGMENTOS)}`,
                                      opacity: ativa ? 1 : 0.4,
                                  }
                                : undefined
                        }
                    />
                ))}
                <span
                    className="barra-vazao__marcador-filtro hud-tooltip"
                    style={{ left: `${percentualTrocaFiltro}%` }}
                    data-tooltip={`Troca de filtro recomendada: ~${Math.round(trocaFiltroLh)} L/h`}
                />
            </div>
        </div>
    );
}
