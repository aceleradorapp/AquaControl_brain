// Nivel de Agua do Reservatorio (27-espc) — reservatorio visual em SVG (nao uma barra
// generica), preenchimento sobe/desce com o percentual real. Cor muda de vermelho (critico)
// a ciano (cheio), mesma logica de "escala colorida por posicao" ja usada em BarraVazaoHud.
// 40-espc: proporcao PAISAGEM (mais largo que alto) e cantos quase retos — pedido explicito do
// usuario ("deixe ele retangular como o aquario"), o aquario real e uma caixa baixa e larga
// (200x80x130cm), nao um tubo alto e estreito como o desenho original.
const LARGURA = 150;
const ALTURA = 95;
const PAREDE = 4;
const MARCAS = [25, 50, 75];

function corPeloNivel(percentual) {
    if (percentual <= 15) return 'var(--cor-erro)';
    if (percentual <= 35) return 'var(--cor-alerta)';
    return 'var(--cor-primaria)';
}

export default function MedidorNivelAgua({ percentual, titulo = 'NIVEL RESERVATORIO' }) {
    const temLeitura = typeof percentual === 'number' && Number.isFinite(percentual);
    const percentualClampado = temLeitura ? Math.min(100, Math.max(0, percentual)) : 0;
    const cor = corPeloNivel(percentualClampado);

    const alturaInterna = ALTURA - PAREDE * 2;
    const alturaAgua = (percentualClampado / 100) * alturaInterna;
    const yAgua = PAREDE + (alturaInterna - alturaAgua);

    return (
        <div className="medidor-nivel-agua">
            <svg className="medidor-nivel-agua__svg" viewBox={`0 0 ${LARGURA} ${ALTURA}`} role="img" aria-label="Nivel de agua do reservatorio">
                <rect x={PAREDE / 2} y={PAREDE / 2} width={LARGURA - PAREDE} height={ALTURA - PAREDE} rx={3} className="medidor-nivel-agua__casco" />

                {temLeitura && (
                    <rect
                        x={PAREDE}
                        y={yAgua}
                        width={LARGURA - PAREDE * 2}
                        height={alturaAgua}
                        rx={1}
                        className="medidor-nivel-agua__preenchimento"
                        style={{ fill: cor, filter: `drop-shadow(0 0 4px ${cor})` }}
                    />
                )}

                {MARCAS.map((marca) => {
                    const y = PAREDE + (alturaInterna * (100 - marca)) / 100;
                    return <line key={marca} x1={PAREDE} y1={y} x2={LARGURA - PAREDE} y2={y} className="medidor-nivel-agua__marca" />;
                })}
            </svg>
            <div className="medidor-nivel-agua__legenda">
                <span className="medidor-nivel-agua__valor hud-mono" style={{ color: temLeitura ? cor : 'var(--cor-texto-secundario)' }}>
                    {temLeitura ? `${Math.round(percentualClampado)}%` : '--'}
                </span>
                <span className="hud-tag">{titulo}</span>
            </div>
        </div>
    );
}
