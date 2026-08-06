import ModalHud from './ModalHud';
import { formatarValorSensor } from '../utils/sensores';
import '../styles/esquematico.css';

// Esquematico dos Sensores (16-espc, AquaControl_sensor; expandido em 27-espc — ver
// 01-espc-geral/AquaControl_sensor_esqumqtico.md) — mesmo espirito visual do Esquematico
// Interativo dos reles (EsquematicoInterativo.jsx: ESP32 + fios ortogonais + blocos de
// status), mas SEM interatividade de clique (sensores sao so leitura, nao tem o que
// "acionar") e SEM a coluna intermediaria de modulo (o sensor liga direto no GPIO do ESP32,
// nao existe um MCP23017/rele no meio). 9 blocos = os 9 sensores fisicos atuais (38-espc:
// removido o bloco de Inclinacao/GPIO 21, sem sensor ativo la por enquanto — o DHT11 é
// UM sensor fisico só — 2 valores, temp+umidade — por isso vira um bloco só, não dois); o
// resto do arquivo (calcularPinosGpio/ESP32_H/VIEWBOX_H) se adapta sozinho a quantos blocos
// existirem, entao adicionar um sensor novo no futuro so precisa de uma linha aqui.
const BLOCOS_SENSORES = [
    { titulo: 'Temp. Agua 1 (DS18B20)', gpio: 18, ids: ['temp_agua_1'] },
    { titulo: 'Temp. Agua 2 (DS18B20)', gpio: 18, ids: ['temp_agua_2'] },
    { titulo: 'Temp. Agua 3 (DS18B20)', gpio: 18, ids: ['temp_agua_3'] },
    { titulo: 'DHT11 (Temp./Umidade Ar)', gpio: 19, ids: ['temp_ar', 'umidade_ar'] },
    { titulo: 'Fluxo de Agua 1 (YF-S201)', gpio: 23, ids: ['fluxo_agua'] },
    // 27-espc: Fluxo 2 fica logo abaixo do Fluxo 1 (fora da ordem crescente de GPIO) — os dois
    // canais de vazao sao o mesmo tipo de sensor, faz sentido visual manter juntos.
    { titulo: 'Fluxo de Agua 2 (YF-S201)', gpio: 35, ids: ['fluxo_agua_2'] },
    { titulo: 'pH da Agua', gpio: 34, ids: ['ph_agua'] },
    { titulo: 'Alerta de Nivel (Reservatorio)', gpio: 36, ids: ['alerta_nivel'] },
    { titulo: 'Deteccao de Vazamento', gpio: 39, ids: ['vazamento'] },
];

// --- Coluna 1: ESP32 ---
const ESP32_X = 40;
const ESP32_Y = 30;
const ESP32_W = 180;

// --- Coluna 2: blocos de sensor --- (compactado pra caber sem scroll, mesmo espirito do
// Esquematico Interativo dos reles — que nao tem barra de rolagem no mesmo modal "cheia")
const BLOCO_X = 420;
const BLOCO_W = 340;
const BLOCO_H = 30;
const BLOCO_GAP = 7;
const BLOCOS_Y_START = ESP32_Y + 40;

const VIEWBOX_W = 820;

function yBloco(indice) {
    return BLOCOS_Y_START + indice * (BLOCO_H + BLOCO_GAP);
}

// Um pino do ESP32 por GPIO unico usado (nao um por bloco) — GPIO18 tem 3 blocos, os outros
// so 1 cada; o pino fica na altura MEDIA dos blocos que ele alimenta, e os fios saem dali
// pra cada bloco (o barramento OneWire de verdade tambem funciona assim: 1 fio, N sensores).
function calcularPinosGpio() {
    const porGpio = new Map();
    BLOCOS_SENSORES.forEach((bloco, indice) => {
        if (!porGpio.has(bloco.gpio)) porGpio.set(bloco.gpio, []);
        porGpio.get(bloco.gpio).push(indice);
    });

    const pinos = [];
    for (const [gpio, indices] of porGpio) {
        const yMedio = indices.reduce((soma, i) => soma + yBloco(i) + BLOCO_H / 2, 0) / indices.length;
        pinos.push({ gpio, y: yMedio });
    }
    return pinos;
}
const PINOS_GPIO = calcularPinosGpio();
const ESP32_H = Math.max(240, yBloco(BLOCOS_SENSORES.length - 1) + BLOCO_H + 20 - ESP32_Y);
const VIEWBOX_H = ESP32_H + ESP32_Y + 20;
const ESP32_PIN_X = ESP32_X + ESP32_W;

function pinoDoGpio(gpio) {
    return PINOS_GPIO.find((p) => p.gpio === gpio);
}

// Mesmo caminho ortogonal (3 segmentos, curvas de 90°) do Esquematico Interativo dos reles —
// estilo trilha de PCB, nunca uma diagonal.
function caminhoOrtogonal(x1, y1, x2, y2) {
    const xMeio = ESP32_PIN_X + (BLOCO_X - ESP32_PIN_X) / 2;
    return `M ${x1},${y1} L ${xMeio},${y1} L ${xMeio},${y2} L ${x2},${y2}`;
}

// Junta os valores de 1 ou 2 "ids" (o caso do DHT11) num unico bloco: conectado so se TODAS
// as partes estiverem conectadas, texto de valor concatenado com " / " quando ha mais de uma.
function estadoBloco(bloco, sensoresPorId) {
    const partes = bloco.ids.map((id) => sensoresPorId[id]).filter(Boolean);
    if (partes.length === 0) return { conectado: false, textoValor: 'Sem leitura' };
    const conectado = partes.every((p) => p.conectado);
    const textoValor = conectado ? partes.map(formatarValorSensor).join(' / ') : 'Desconectado';
    return { conectado, textoValor };
}

export default function EsquematicoSensores({ aberto, onFechar, moduloSensor, dadosSensores }) {
    const sensoresPorId = {};
    if (dadosSensores?.disponivel) {
        for (const sensor of dadosSensores.sensores) sensoresPorId[sensor.id] = sensor;
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo="Esquematico dos Sensores"
            tag={moduloSensor ? `MODULO ${moduloSensor.ip} — TEMPO REAL` : 'NENHUM MODULO DE TELEMETRIA'}
            onFechar={onFechar}
            largura="cheia"
        >
            {!moduloSensor && (
                <p className="hud-tag">Nenhum modulo do tipo "telemetria" cadastrado ainda — cadastre um em Modulos de Controladores.</p>
            )}

            {moduloSensor && !dadosSensores?.disponivel && (
                <p className="mensagem-erro hud-tag">
                    {dadosSensores?.motivo ?? 'Consultando o modulo de telemetria...'}
                </p>
            )}

            {moduloSensor && dadosSensores?.disponivel && (
                <div className="esquematico">
                    <div className="esquematico__legenda">
                        <div className="esquematico__legenda-item">
                            <span className="esquematico__legenda-traco esquematico__legenda-traco--ligado" />
                            <span className="hud-tag">Sensor conectado</span>
                        </div>
                        <div className="esquematico__legenda-item">
                            <span className="esquematico__legenda-traco esquematico__legenda-traco--desconectado" />
                            <span className="hud-tag">Sensor nao detectado</span>
                        </div>
                    </div>

                    <div className="esquematico__svg-wrap hud-scrollbar">
                        <svg
                            className="esquematico__svg"
                            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
                            xmlns="http://www.w3.org/2000/svg"
                            preserveAspectRatio="xMidYMin meet"
                        >
                            {/* ============ COLUNA 1 — ESP32 ============ */}
                            <rect className="esquematico__corpo-chip" x={ESP32_X} y={ESP32_Y} width={ESP32_W} height={ESP32_H} rx="10" />
                            <text className="esquematico__titulo-chip" x={ESP32_X + 14} y={ESP32_Y + 24} textAnchor="start">
                                ESP32
                            </text>
                            <text className="esquematico__subtitulo" x={ESP32_X + 14} y={ESP32_Y + 38} textAnchor="start">
                                MODULO DE TELEMETRIA
                            </text>

                            <circle
                                className={moduloSensor.online ? 'esquematico__status-online' : 'esquematico__status-offline'}
                                cx={ESP32_X + ESP32_W - 18}
                                cy={ESP32_Y + 16}
                                r="5"
                            />
                            <text className="esquematico__subtitulo" x={ESP32_X + ESP32_W - 14} y={ESP32_Y + 19} textAnchor="end">
                                {moduloSensor.online ? 'ONLINE' : 'OFFLINE'}
                            </text>

                            {/* Pinos GPIO — um por fio fisico (18/19/21/23/34), nao um por bloco */}
                            {PINOS_GPIO.map(({ gpio, y }) => (
                                <g key={gpio}>
                                    <circle className="esquematico__pino esquematico__pino--decorativo" cx={ESP32_PIN_X} cy={y} r="5" />
                                    <text className="esquematico__rotulo-canal" x={ESP32_PIN_X - 10} y={y - 8} textAnchor="end">
                                        GPIO{gpio}
                                    </text>
                                </g>
                            ))}

                            {/* ============ COLUNA 2 — cabecalho ============ */}
                            <text className="esquematico__rotulo-modulo" x={BLOCO_X} y={ESP32_Y - 12}>
                                SENSORES
                            </text>

                            {/* ============ 7 blocos: fio ortogonal + bloco de status ============ */}
                            {BLOCOS_SENSORES.map((bloco, indice) => {
                                const y = yBloco(indice) + BLOCO_H / 2;
                                const pino = pinoDoGpio(bloco.gpio);
                                const { conectado, textoValor } = estadoBloco(bloco, sensoresPorId);
                                const classeSufixo = conectado ? 'conectado' : 'desconectado';

                                return (
                                    <g key={bloco.titulo}>
                                        <path
                                            className={`esquematico__fio esquematico__fio--${classeSufixo}`}
                                            d={caminhoOrtogonal(ESP32_PIN_X, pino.y, BLOCO_X, y)}
                                        />

                                        <rect
                                            className={`esquematico__sensor esquematico__sensor--${classeSufixo}`}
                                            x={BLOCO_X}
                                            y={y - BLOCO_H / 2}
                                            width={BLOCO_W}
                                            height={BLOCO_H}
                                            rx="4"
                                        >
                                            <title>{`${bloco.titulo} — GPIO${bloco.gpio} — ${conectado ? 'Conectado' : 'Nao detectado'}`}</title>
                                        </rect>
                                        <text className="esquematico__sensor-nome" x={BLOCO_X + 14} y={y - 4}>
                                            {bloco.titulo}
                                        </text>
                                        <text
                                            className={`esquematico__sensor-status esquematico__sensor-status--${classeSufixo}`}
                                            x={BLOCO_X + 14}
                                            y={y + 10}
                                        >
                                            {conectado ? `● ${textoValor}` : '○ DESCONECTADO'}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </div>
            )}
        </ModalHud>
    );
}
