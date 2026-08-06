import { formatarComDecimal } from '../utils/formatoNumero';

// Indicador circular tipo "gauge" — SVG puro (sem lib extra) via strokeDasharray/offset
// num círculo. min/max definem a faixa mapeada pro arco (0% a 100%).
//
// 30-espc: "valor" agora pode chegar `null` (sensor real desconectado, sem fallback pra mock
// — ver Dashboard.jsx) — antes disso nunca acontecia (sempre tinha um número, real ou
// simulado), então esse caso nunca tinha sido tratado aqui: sem essa checagem, `(null - min)`
// vira `NaN`, o arco desenha um `strokeDashoffset` inválido (SVG simplesmente não desenha o
// traço, mas o texto mostraria "0.0" via formatarComDecimal, o que parece uma LEITURA real de
// zero, não "sem dado"). Arco fica vazio (offset = circunferência inteira) + texto "--".
export default function SensorGauge({ titulo, valor, unidade = '°C', min = 15, max = 35, cor = 'var(--cor-primaria)' }) {
    const raio = 46;
    const circunferencia = 2 * Math.PI * raio;
    const desconectado = valor === null || valor === undefined;
    const percentual = desconectado ? 0 : Math.min(1, Math.max(0, (valor - min) / (max - min)));
    const offset = circunferencia * (1 - percentual);
    const valorExibido = desconectado ? '--' : formatarComDecimal(valor);
    const corExibida = desconectado ? 'var(--cor-texto-secundario)' : cor;

    return (
        <div className={`sensor-gauge hud-corner-marks ${desconectado ? 'sensor-gauge--desconectado' : ''}`}>
            {/* 41-espc: 80x80 (era 120x120) — abriu espaco no widget "Parametros Vitais" pra
                caber a barra de Nivel de Agua sem crescer a altura fixa do card. viewBox
                continua 120x120 de proposito: o SVG so escala visualmente, raio/textos internos
                nao precisam ser recalculados (unico uso deste componente hoje). */}
            <svg width="80" height="80" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={raio} fill="none" stroke="var(--cor-borda)" strokeWidth="8" />
                {!desconectado && (
                    <circle
                        cx="60"
                        cy="60"
                        r={raio}
                        fill="none"
                        stroke={cor}
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={circunferencia}
                        strokeDashoffset={offset}
                        transform="rotate(-90 60 60)"
                        style={{ filter: `drop-shadow(0 0 4px ${cor})`, transition: 'stroke-dashoffset 0.6s ease' }}
                    />
                )}
                <text x="60" y="58" textAnchor="middle" className="sensor-gauge__valor" fill={corExibida}>
                    {valorExibido}
                </text>
                <text x="60" y="76" textAnchor="middle" className="sensor-gauge__unidade" fill="var(--cor-texto-secundario)">
                    {desconectado ? 'SEM SINAL' : unidade}
                </text>
            </svg>
            <span className="hud-tag">{titulo}</span>
        </div>
    );
}
