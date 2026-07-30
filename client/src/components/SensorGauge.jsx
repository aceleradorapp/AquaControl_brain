import { formatarComDecimal } from '../utils/formatoNumero';

// Indicador circular tipo "gauge" — SVG puro (sem lib extra) via strokeDasharray/offset
// num círculo. min/max definem a faixa mapeada pro arco (0% a 100%).
export default function SensorGauge({ titulo, valor, unidade = '°C', min = 15, max = 35, cor = 'var(--cor-primaria)' }) {
    const raio = 46;
    const circunferencia = 2 * Math.PI * raio;
    const percentual = Math.min(1, Math.max(0, (valor - min) / (max - min)));
    const offset = circunferencia * (1 - percentual);
    const valorExibido = formatarComDecimal(valor);

    return (
        <div className="sensor-gauge hud-corner-marks">
            <svg width="120" height="120" viewBox="0 0 120 120">
                <circle cx="60" cy="60" r={raio} fill="none" stroke="var(--cor-borda)" strokeWidth="8" />
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
                <text x="60" y="58" textAnchor="middle" className="sensor-gauge__valor" fill={cor}>
                    {valorExibido}
                </text>
                <text x="60" y="76" textAnchor="middle" className="sensor-gauge__unidade" fill="var(--cor-texto-secundario)">
                    {unidade}
                </text>
            </svg>
            <span className="hud-tag">{titulo}</span>
        </div>
    );
}
