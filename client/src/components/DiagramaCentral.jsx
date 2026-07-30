import { ICONES_SENSOR, formatarValorSensor } from '../utils/sensores';

// Diagrama Central (23-espc, Central de Diagnostico) — SVG puro a mao, mesma linguagem visual
// e tecnica dos outros esquematicos do projeto (EsquematicoInterativo.jsx/EsquematicoSensores.jsx:
// nada de React Flow/Canvas — um SVG desenhado com trigonometria simples da conta pro que e
// pedido aqui sem crescer o bundle nem fugir do padrao ja estabelecido). Um aquario
// esquematico no centro, 3 aneis concentricos de "nos" ao redor (Modulos ESP32, Sensores,
// Atuadores mapeados), ligados ao aquario por trilhas retas que animam (dash scrolling) quando
// o no esta ativo — mesma tecnica de ".esquematico__fio--ligado" (esquematico.css).

const VIEWBOX_W = 1000;
const VIEWBOX_H = 860;
const CX = 500;
const CY = 430;

const RAIO_TANQUE_X = 110;
const RAIO_TANQUE_Y = 68;

const ANEL_MODULOS = 150;
const ANEL_SENSORES = 260;
const ANEL_ATUADORES = 365;

const MAX_ATUADORES_VISIVEIS = 9;

function posicaoNoAnel(indice, total, raio) {
    const angulo = (indice / total) * 2 * Math.PI - Math.PI / 2;
    return { x: CX + raio * Math.cos(angulo), y: CY + raio * Math.sin(angulo), angulo };
}

// Ponto na borda do "aquario" (elipse) na direcao de um angulo — de onde as trilhas partem,
// em vez de todas saírem do centro exato (ficaria com as linhas passando por cima do tanque).
function pontoNaBordaTanque(angulo) {
    return { x: CX + RAIO_TANQUE_X * 1.15 * Math.cos(angulo), y: CY + RAIO_TANQUE_Y * 1.15 * Math.sin(angulo) };
}

function truncar(texto, max = 16) {
    if (!texto) return '';
    return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

// Um no generico (modulo/sensor/atuador) — circulo + rotulo, cor/estado decididos por quem
// chama. "statusScan" (durante a Varredura de Diagnostico) sobrepoe um anel extra
// pending/ok/fail por cima do estado normal, sem esconder ele.
function No({ x, y, raio, cor, nome, subtitulo, statusConectado, statusScan, onClick, chave }) {
    const classeConectado = statusConectado ? 'conectado' : 'desconectado';
    const classeScan = statusScan ? `scan-${statusScan}` : '';

    return (
        <g
            key={chave}
            className={`diagrama-central__no ${classeConectado} ${classeScan}`}
            transform={`translate(${x}, ${y})`}
            onClick={onClick}
            style={{ cursor: onClick ? 'pointer' : 'default' }}
        >
            {statusScan === 'pending' && <circle className="diagrama-central__no-varredura" r={raio + 8} />}
            <circle className="diagrama-central__no-halo" r={raio + 5} style={{ stroke: cor }} />
            <circle className="diagrama-central__no-corpo" r={raio} style={{ stroke: cor }} />
            <text className="diagrama-central__no-rotulo" y={raio + 14} textAnchor="middle">
                {truncar(nome)}
            </text>
            {subtitulo && (
                <text className="diagrama-central__no-subtitulo" y={raio + 26} textAnchor="middle">
                    {subtitulo}
                </text>
            )}
            {statusScan === 'ok' && (
                <text className="diagrama-central__no-marca ok" y={4} textAnchor="middle">
                    OK
                </text>
            )}
            {statusScan === 'fail' && (
                <text className="diagrama-central__no-marca fail" y={4} textAnchor="middle">
                    ✕
                </text>
            )}
        </g>
    );
}

function Trilha({ origem, destino, ativa, alerta, chave }) {
    const classe = alerta ? 'alerta' : ativa ? 'ativa' : 'inativa';
    return <line key={chave} className={`diagrama-central__trilha ${classe}`} x1={origem.x} y1={origem.y} x2={destino.x} y2={destino.y} />;
}

const CORES_MODULO = { atuador: '#ff9800', telemetria: '#00f0ff', display: '#0077ff' };

export default function DiagramaCentral({ modulos, dadosSensores, portasMapeamento, estadoReles, statusScanPorChave, varrendo, onClickModulo, onClickSensor, onClickAtuadores }) {
    const sensores = dadosSensores?.disponivel ? dadosSensores.sensores : [];

    const atuadoresTodos = portasMapeamento
        .filter((p) => p.nomePersonalizado?.trim() && p.habilitado)
        .map((p) => ({ ...p, ativo: estadoReles ? estadoReles[p.posicaoIndice] === 1 : false }));
    const atuadoresVisiveis = atuadoresTodos.slice(0, MAX_ATUADORES_VISIVEIS);
    const atuadoresRestantes = atuadoresTodos.length - atuadoresVisiveis.length;

    // Leituras centrais do aquario: agua (media dos DS18B20 conectados), pH, inclinacao —
    // mesma convencao de "agrupar por prefixo do id" ja usada em outros lugares do projeto.
    const sensoresAgua = sensores.filter((s) => s.id.startsWith('temp_agua') && s.conectado);
    const temperaturaAgua = sensoresAgua.length > 0 ? (sensoresAgua.reduce((soma, s) => soma + s.valor, 0) / sensoresAgua.length).toFixed(1) : null;
    const sensorPh = sensores.find((s) => s.id === 'ph_agua');
    const sensorInclinacao = sensores.find((s) => s.id === 'inclinacao');
    const sensorFluxo = sensores.find((s) => s.id === 'fluxo_agua');
    const aguaFluindo = sensorFluxo?.conectado && Number(sensorFluxo.valor) > 0;

    const waterTopY = CY - RAIO_TANQUE_Y * 0.55;
    const waterBottomY = CY + RAIO_TANQUE_Y - 4;

    return (
        <svg className="diagrama-central__svg" viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`} xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="gradAgua" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--cor-primaria)" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="var(--cor-secundaria)" stopOpacity="0.15" />
                </linearGradient>
                <clipPath id="clipTanque">
                    <ellipse cx={CX} cy={CY} rx={RAIO_TANQUE_X} ry={RAIO_TANQUE_Y} />
                </clipPath>
            </defs>

            {/* ============ TRILHAS (desenhadas antes dos nos, pra ficarem por baixo) ============ */}
            {modulos.map((modulo, indice) => {
                const pos = posicaoNoAnel(indice, Math.max(modulos.length, 1), ANEL_MODULOS);
                return <Trilha key={`trilha-modulo-${modulo.id}`} origem={pontoNaBordaTanque(pos.angulo)} destino={pos} ativa={modulo.online} alerta={false} />;
            })}
            {sensores.map((sensor, indice) => {
                const pos = posicaoNoAnel(indice, Math.max(sensores.length, 1), ANEL_SENSORES);
                return <Trilha key={`trilha-sensor-${sensor.id}`} origem={pontoNaBordaTanque(pos.angulo)} destino={pos} ativa={sensor.conectado} alerta={false} />;
            })}
            {atuadoresVisiveis.map((atuador, indice) => {
                const totalAneis = atuadoresVisiveis.length + (atuadoresRestantes > 0 ? 1 : 0);
                const pos = posicaoNoAnel(indice, Math.max(totalAneis, 1), ANEL_ATUADORES);
                return (
                    <Trilha key={`trilha-atuador-${atuador.posicaoIndice}`} origem={pontoNaBordaTanque(pos.angulo)} destino={pos} ativa={atuador.ativo} alerta={false} />
                );
            })}

            {/* ============ AQUARIO CENTRAL ============ */}
            <g className="diagrama-central__tanque">
                <ellipse cx={CX} cy={CY} rx={RAIO_TANQUE_X + 6} ry={RAIO_TANQUE_Y + 6} className="diagrama-central__vidro-externo" />
                <g clipPath="url(#clipTanque)">
                    <rect x={CX - RAIO_TANQUE_X - 10} y={waterTopY} width={(RAIO_TANQUE_X + 10) * 2} height={waterBottomY - waterTopY} fill="url(#gradAgua)" />
                    {/* Onda da superficie — path senoidal duplicado (2 periodos) rolando pra
                        esquerda em loop via SMIL, clipado pela forma do tanque. */}
                    <path
                        d={`M ${CX - RAIO_TANQUE_X - 10},${waterTopY}
                            Q ${CX - RAIO_TANQUE_X + 45},${waterTopY - 7} ${CX - RAIO_TANQUE_X + 100},${waterTopY}
                            T ${CX - RAIO_TANQUE_X + 210},${waterTopY}
                            T ${CX - RAIO_TANQUE_X + 320},${waterTopY}
                            T ${CX - RAIO_TANQUE_X + 430},${waterTopY}`}
                        fill="none"
                        stroke="var(--cor-primaria)"
                        strokeWidth="2"
                        opacity="0.55"
                    >
                        <animateTransform attributeName="transform" type="translate" from="0 0" to="-220 0" dur="3.5s" repeatCount="indefinite" />
                    </path>

                    {aguaFluindo &&
                        [0, 1, 2].map((i) => (
                            <circle key={i} className="diagrama-central__bolha" cx={CX - 30 + i * 30} r={i % 2 === 0 ? 3 : 2}>
                                <animate attributeName="cy" from={waterBottomY} to={waterTopY + 4} dur={`${2 + i * 0.4}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
                                <animate attributeName="opacity" values="0;0.9;0" dur={`${2 + i * 0.4}s`} begin={`${i * 0.6}s`} repeatCount="indefinite" />
                            </circle>
                        ))}
                </g>
                <ellipse cx={CX} cy={CY} rx={RAIO_TANQUE_X} ry={RAIO_TANQUE_Y} className="diagrama-central__vidro" />

                <text className="diagrama-central__leitura leitura-temp" x={CX} y={CY - RAIO_TANQUE_Y - 14} textAnchor="middle">
                    {temperaturaAgua ? `${temperaturaAgua}°C` : '--'}
                </text>
                <text className="diagrama-central__leitura leitura-ph" x={CX - 55} y={CY + RAIO_TANQUE_Y + 22} textAnchor="middle">
                    pH {sensorPh?.conectado ? sensorPh.valor : '--'}
                </text>
                <text
                    className={`diagrama-central__leitura leitura-tilt ${sensorInclinacao?.conectado && sensorInclinacao.valor ? 'alerta' : ''}`}
                    x={CX + 55}
                    y={CY + RAIO_TANQUE_Y + 22}
                    textAnchor="middle"
                >
                    {/* 24-espc: sensor de inclinacao (SW-520D) repurposado p/ nivel de agua — rotulo segue o dado, nao mais "tombado" */}
                    {sensorInclinacao?.conectado ? (sensorInclinacao.valor ? 'NIVEL BAIXO' : 'NIVEL OK') : 'NIVEL --'}
                </text>
            </g>

            {/* ============ ANEL: MODULOS ESP32 ============ */}
            {modulos.map((modulo, indice) => {
                const pos = posicaoNoAnel(indice, Math.max(modulos.length, 1), ANEL_MODULOS);
                return (
                    <No
                        key={`modulo-${modulo.id}`}
                        chave={`modulo-${modulo.id}`}
                        x={pos.x}
                        y={pos.y}
                        raio={26}
                        cor={CORES_MODULO[modulo.tipo] ?? 'var(--cor-primaria)'}
                        nome={modulo.nome}
                        subtitulo={modulo.tipo}
                        statusConectado={modulo.online}
                        statusScan={statusScanPorChave?.[`modulo-${modulo.id}`]}
                        onClick={() => onClickModulo(modulo)}
                    />
                );
            })}

            {/* ============ ANEL: SENSORES ============ */}
            {sensores.map((sensor, indice) => {
                const pos = posicaoNoAnel(indice, Math.max(sensores.length, 1), ANEL_SENSORES);
                return (
                    <No
                        key={`sensor-${sensor.id}`}
                        chave={`sensor-${sensor.id}`}
                        x={pos.x}
                        y={pos.y}
                        raio={19}
                        cor="var(--cor-secundaria)"
                        nome={sensor.nome}
                        subtitulo={sensor.conectado ? formatarValorSensor(sensor) : null}
                        statusConectado={sensor.conectado}
                        statusScan={statusScanPorChave?.[`sensor-${sensor.id}`]}
                        onClick={() => onClickSensor(sensor)}
                    />
                );
            })}

            {/* ============ ANEL: ATUADORES MAPEADOS ============ */}
            {atuadoresVisiveis.map((atuador, indice) => {
                const totalAneis = atuadoresVisiveis.length + (atuadoresRestantes > 0 ? 1 : 0);
                const pos = posicaoNoAnel(indice, Math.max(totalAneis, 1), ANEL_ATUADORES);
                return (
                    <No
                        key={`atuador-${atuador.posicaoIndice}`}
                        chave={`atuador-${atuador.posicaoIndice}`}
                        x={pos.x}
                        y={pos.y}
                        raio={17}
                        cor="var(--cor-laranja)"
                        nome={atuador.nomePersonalizado}
                        subtitulo={atuador.ativo ? 'LIGADO' : null}
                        statusConectado={atuador.ativo}
                        statusScan={statusScanPorChave?.[`atuador-${atuador.posicaoIndice}`]}
                        onClick={onClickAtuadores}
                    />
                );
            })}
            {/* ============ VARREDURA DE RADAR (Diagnostico Automatico) ============ */}
            {varrendo && (
                <g className="diagrama-central__radar" transform={`translate(${CX}, ${CY})`}>
                    <path d={`M 0 0 L ${ANEL_ATUADORES + 30} 0 A ${ANEL_ATUADORES + 30} ${ANEL_ATUADORES + 30} 0 0 0 ${(ANEL_ATUADORES + 30) * Math.cos((-Math.PI * 34) / 180)} ${(ANEL_ATUADORES + 30) * Math.sin((-Math.PI * 34) / 180)} Z`} />
                </g>
            )}

            {atuadoresRestantes > 0 &&
                (() => {
                    const totalAneis = atuadoresVisiveis.length + 1;
                    const pos = posicaoNoAnel(atuadoresVisiveis.length, totalAneis, ANEL_ATUADORES);
                    return (
                        <No
                            chave="atuadores-mais"
                            x={pos.x}
                            y={pos.y}
                            raio={17}
                            cor="var(--cor-texto-secundario)"
                            nome={`+${atuadoresRestantes} mais`}
                            statusConectado={false}
                            onClick={onClickAtuadores}
                        />
                    );
                })()}
        </svg>
    );
}
