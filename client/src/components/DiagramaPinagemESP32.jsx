// Diagrama de pinagem estilo "datasheet" (26-espc) — SVG desenhado a mao, mesmo espirito de
// EsquematicoInterativo.jsx/DiagramaCentral.jsx (sem biblioteca de diagramas nova, ja existe
// precedente de SVG proprio no projeto pra esse tipo de coisa). Chip generico no centro,
// pinos saindo pros dois lados com um traco ate a borda e o texto do componente ligado.
const ALTURA_LINHA = 46;
const LARGURA_CHIP = 170;
const LARGURA_TRACO = 46;
const PADDING_TOPO = 30;

function Coluna({ pinos, lado, xBase }) {
    const direita = lado === 'direita';
    const xTracoInicio = direita ? xBase : xBase - LARGURA_TRACO;
    const xTracoFim = direita ? xBase + LARGURA_TRACO : xBase;
    const xTexto = direita ? xBase + LARGURA_TRACO + 8 : xBase - LARGURA_TRACO - 8;

    return pinos.map((p, indice) => {
        const y = PADDING_TOPO + indice * ALTURA_LINHA + ALTURA_LINHA / 2;
        return (
            <g key={`${lado}-${p.pino}`}>
                <line x1={xTracoInicio} y1={y} x2={xTracoFim} y2={y} className="diagrama-pinagem__traco" />
                <circle cx={xBase} cy={y} r={3.5} className="diagrama-pinagem__pad" />
                <text x={xTexto} y={y - 7} textAnchor={direita ? 'start' : 'end'} className="diagrama-pinagem__pino">
                    {p.pino}
                </text>
                <text x={xTexto} y={y + 9} textAnchor={direita ? 'start' : 'end'} className="diagrama-pinagem__componente">
                    {p.componente}
                </text>
            </g>
        );
    });
}

export default function DiagramaPinagemESP32({ nomePlaca, pinosEsquerda, pinosDireita }) {
    const totalLinhas = Math.max(pinosEsquerda.length, pinosDireita.length);
    const altura = PADDING_TOPO * 2 + totalLinhas * ALTURA_LINHA;
    const largura = 560;
    const xChip = (largura - LARGURA_CHIP) / 2;
    const xEsquerda = xChip;
    const xDireita = xChip + LARGURA_CHIP;
    const alturaChip = altura - PADDING_TOPO;

    return (
        <svg
            className="diagrama-pinagem"
            viewBox={`0 0 ${largura} ${altura}`}
            role="img"
            aria-label={`Diagrama de pinagem de ${nomePlaca}`}
        >
            <Coluna pinos={pinosEsquerda} lado="esquerda" xBase={xEsquerda} />
            <Coluna pinos={pinosDireita} lado="direita" xBase={xDireita} />

            <rect
                x={xChip}
                y={PADDING_TOPO / 2}
                width={LARGURA_CHIP}
                height={alturaChip}
                rx={6}
                className="diagrama-pinagem__chip"
            />
            {/* Entalhe do conector USB, so decorativo — ajuda a "ler" o chip como uma placa real */}
            <rect x={xChip + LARGURA_CHIP / 2 - 14} y={PADDING_TOPO / 2 - 6} width={28} height={10} className="diagrama-pinagem__usb" />
            <text x={largura / 2} y={altura / 2} textAnchor="middle" className="diagrama-pinagem__nome-chip">
                {nomePlaca}
            </text>
        </svg>
    );
}
