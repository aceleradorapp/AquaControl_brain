import { useState } from 'react';
import ModalHud from './ModalHud';
import '../styles/esquematico.css';

// Esquemático Eletrônico Interativo em Tempo Real (13/17-espc,
// 01-espc-geral/13_esquematico_interativo_tempo_real.md) — SVG puro, desenhado a partir do
// MESMO mapeamento de GPIOs do firmware real (AquaControl_Hardware/src/main.cpp:
// PINOS_RELES) — índice 0-7 = Módulo A (canais 1-8), índice 8-15 = Módulo B (canais 9-16),
// exatamente como documentado em 01-espc-geral/12_esquema_ligacao_reles.md.
//
// Layout em 3 COLUNAS fluidas (17-espc, refeito depois do primeiro layout ter ficado
// espremido/sobreposto):
//   Coluna 1 — ESP32 com os 16 GPIOs (um pino por linha, altura cheia).
//   Coluna 2 — Módulo A (canais 1-8) em cima, Módulo B (canais 9-16) embaixo, com margem
//              generosa entre eles (nunca colidem) e os pinos INx rotulados.
//   Coluna 3 — um bloco por relé, com número do canal, nome cadastrado e status.
// A ligação ESP32 -> Módulo usa roteamento ORTOGONAL (3 segmentos em ângulo reto, estilo
// trilha de PCB) porque os dois lados têm espaçamentos verticais diferentes; a ligação
// Módulo -> bloco do relé (coluna 2 -> 3) é uma linha reta curta, já que as duas colunas
// compartilham a mesma posição Y por canal.
const PINOS_RELES = [13, 14, 27, 26, 25, 33, 32, 4, 16, 17, 5, 18, 19, 21, 22, 23];
const TOTAL_CANAIS = 16;

// --- Coluna 1: ESP32 ---
const ESP32_X = 40;
const ESP32_Y = 55;
const ESP32_W = 180;
const ESP32_H = 530;
const ESP32_PIN_X = ESP32_X + ESP32_W;
const ESP32_PIN_Y_START = 118;
const ESP32_PIN_GAP = 29;
const pinYEsp32 = (indice) => ESP32_PIN_Y_START + indice * ESP32_PIN_GAP;

// --- Coluna 2: Módulos A e B (com margem >= 32px garantida entre eles) ---
const MODULO_X = 420;
const MODULO_W = 220;
const MODA_Y = 55;
const MODA_H = 270;
const MODB_Y = MODA_Y + MODA_H + 40; // 40px de folga entre os dois módulos
const MODB_H = 270;
const MOD_PIN_GAP = 25;
const MODA_PIN_Y_START = MODA_Y + 55;
const MODB_PIN_Y_START = MODB_Y + 55;
function pinYModulo(indice) {
    const noModulo = indice % 8;
    const inicioY = indice < 8 ? MODA_PIN_Y_START : MODB_PIN_Y_START;
    return inicioY + noModulo * MOD_PIN_GAP;
}
const MODULO_PIN_X_ESQUERDA = MODULO_X; // onde chega o fio vindo do ESP32
const MODULO_PIN_X_DIREITA = MODULO_X + MODULO_W; // onde sai o fio curto pro bloco do rele

// --- Coluna 3: blocos de rele (nome + status) ---
const RELAY_X = 700;
const RELAY_W = 320;
const RELAY_H = 26;

const VIEWBOX_W = 1080;
const VIEWBOX_H = 680;

function numeroCanal(indice) {
    return String(indice + 1).padStart(2, '0');
}

function truncar(texto, max = 24) {
    return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

// Caminho ORTOGONAL (3 segmentos, curvas de 90°) ligando o pino do ESP32 ao pino do
// módulo — nunca uma diagonal, pra parecer trilha de circuito impresso de verdade.
function caminhoOrtogonal(x1, y1, x2, y2) {
    const xMeio = ESP32_PIN_X + (MODULO_PIN_X_ESQUERDA - ESP32_PIN_X) / 2;
    return `M ${x1},${y1} L ${xMeio},${y1} L ${xMeio},${y2} L ${x2},${y2}`;
}

// Linhas de texto do tooltip pra cada parte interativa (pino/fio/rele) — granularidade
// pedida na especificação (hover em qualquer um dos três mostra detalhes técnicos).
function montarDica(tipo, indice, nome, ligado, bloqueado) {
    const gpio = PINOS_RELES[indice];
    const grupo = indice < 8 ? 'A' : 'B';
    const canalNoModulo = (indice % 8) + 1;
    const statusTexto = bloqueado ? 'BLOQUEADO' : ligado ? 'ATUADO' : 'INATIVO';
    const sinal = ligado ? 'LOW (0V)' : 'HIGH (3.3V)';

    if (tipo === 'pino') {
        return { titulo: `GPIO ${gpio}`, linhas: [`Sinal: ${sinal}`, `Porta: ${nome}`, `Status: ${statusTexto}`] };
    }
    if (tipo === 'fio') {
        return {
            titulo: `GPIO ${gpio} -> Modulo ${grupo} IN${canalNoModulo}`,
            linhas: [`Carga: ${nome}`, `Status: ${statusTexto}`],
        };
    }
    return { titulo: nome, linhas: [`Rele ${numeroCanal(indice)} (Modulo ${grupo}, IN${canalNoModulo})`, `Estado: ${statusTexto}`] };
}

export default function EsquematicoInterativo({ aberto, onFechar, moduloAtuador, estadoReles, portas, onAlternarPorta }) {
    const [dica, setDica] = useState(null); // { x, y, titulo, linhas }

    function mostrarDica(evento, tipo, indice, nome, ligado, bloqueado) {
        const conteudo = montarDica(tipo, indice, nome, ligado, bloqueado);
        setDica({ x: evento.clientX, y: evento.clientY, ...conteudo });
    }
    function moverDica(evento) {
        setDica((atual) => (atual ? { ...atual, x: evento.clientX, y: evento.clientY } : atual));
    }
    function esconderDica() {
        setDica(null);
    }

    function aoClicar(indice, bloqueado) {
        if (bloqueado) return;
        onAlternarPorta(indice);
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo="Esquematico Interativo"
            tag={moduloAtuador ? `MODULO ${moduloAtuador.ip} — TEMPO REAL` : 'NENHUM MODULO ATUADOR'}
            onFechar={onFechar}
            largura="cheia"
        >
            {!moduloAtuador && (
                <p className="hud-tag">Nenhum modulo do tipo "atuador" cadastrado ainda — cadastre um em Modulos de Controladores.</p>
            )}

            {moduloAtuador && (
                <div className="esquematico">
                    <div className="esquematico__legenda">
                        <div className="esquematico__legenda-item">
                            <span className="esquematico__legenda-traco esquematico__legenda-traco--ligado" />
                            <span className="hud-tag">Rele ligado</span>
                        </div>
                        <div className="esquematico__legenda-item">
                            <span className="esquematico__legenda-traco esquematico__legenda-traco--desligado" />
                            <span className="hud-tag">Rele desligado</span>
                        </div>
                        <div className="esquematico__legenda-item">
                            <span className="esquematico__legenda-traco esquematico__legenda-traco--bloqueado" />
                            <span className="hud-tag">Porta bloqueada</span>
                        </div>
                        <span className="hud-tag">Clique num pino, fio ou rele pra acionar de verdade</span>
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
                            {/* Titulo alinhado a esquerda, numa linha propria — o indicador
                                ONLINE/OFFLINE fica isolado no canto superior direito, numa linha
                                mais alta, pra nunca colidir com o texto do titulo. */}
                            <text className="esquematico__titulo-chip" x={ESP32_X + 14} y={ESP32_Y + 24} textAnchor="start">
                                ESP32
                            </text>
                            <text className="esquematico__subtitulo" x={ESP32_X + 14} y={ESP32_Y + 38} textAnchor="start">
                                16x GPIO DIRETO
                            </text>

                            {/* Pinos decorativos no lado esquerdo — só pra parecer um chip de verdade,
                                sem interatividade nenhuma. */}
                            {Array.from({ length: 14 }).map((_, i) => (
                                <rect
                                    key={`deco-${i}`}
                                    className="esquematico__pino-decorativo"
                                    x={ESP32_X - 8}
                                    y={ESP32_Y + 25 + i * 35}
                                    width="8"
                                    height="4"
                                />
                            ))}

                            {/* Status ONLINE/OFFLINE — canto superior direito, bem acima do
                                titulo, com o texto embaixo da bolinha (nunca ao lado do "ESP32"). */}
                            <circle
                                className={moduloAtuador.online ? 'esquematico__status-online' : 'esquematico__status-offline'}
                                cx={ESP32_X + ESP32_W - 18}
                                cy={ESP32_Y + 16}
                                r="5"
                            />
                            <text className="esquematico__subtitulo" x={ESP32_X + ESP32_W - 14} y={ESP32_Y + 19} textAnchor="end">
                                {moduloAtuador.online ? 'ONLINE' : 'OFFLINE'}
                            </text>

                            {/* ============ COLUNA 2 — Modulos A e B ============ */}
                            <rect className="esquematico__corpo-modulo" x={MODULO_X} y={MODA_Y} width={MODULO_W} height={MODA_H} rx="8" />
                            <text className="esquematico__rotulo-modulo" x={MODULO_X + 14} y={MODA_Y + 20}>
                                MODULO A — CANAIS 1-8
                            </text>
                            <g className="esquematico__bornes">
                                <text className="esquematico__rotulo-alimentacao" x={MODULO_X + 14} y={MODA_Y + MODA_H - 10}>
                                    VCC 5V
                                </text>
                                <text className="esquematico__rotulo-alimentacao" x={MODULO_X + MODULO_W / 2} y={MODA_Y + MODA_H - 10} textAnchor="middle">
                                    GND
                                </text>
                                <text className="esquematico__rotulo-alimentacao" x={MODULO_X + MODULO_W - 14} y={MODA_Y + MODA_H - 10} textAnchor="end">
                                    JD-VCC
                                </text>
                            </g>

                            <rect className="esquematico__corpo-modulo" x={MODULO_X} y={MODB_Y} width={MODULO_W} height={MODB_H} rx="8" />
                            <text className="esquematico__rotulo-modulo" x={MODULO_X + 14} y={MODB_Y + 20}>
                                MODULO B — CANAIS 9-16
                            </text>
                            <g className="esquematico__bornes">
                                <text className="esquematico__rotulo-alimentacao" x={MODULO_X + 14} y={MODB_Y + MODB_H - 10}>
                                    VCC 5V
                                </text>
                                <text className="esquematico__rotulo-alimentacao" x={MODULO_X + MODULO_W / 2} y={MODB_Y + MODB_H - 10} textAnchor="middle">
                                    GND
                                </text>
                                <text className="esquematico__rotulo-alimentacao" x={MODULO_X + MODULO_W - 14} y={MODB_Y + MODB_H - 10} textAnchor="end">
                                    JD-VCC
                                </text>
                            </g>

                            {/* ============ COLUNA 3 — cabecalho ============ */}
                            <text className="esquematico__rotulo-modulo" x={RELAY_X} y={ESP32_Y - 15}>
                                SAIDAS / EQUIPAMENTOS
                            </text>

                            {/* ============ 16 canais: pino + fio ortogonal + pino do modulo + fio curto + bloco do rele ============ */}
                            {Array.from({ length: TOTAL_CANAIS }).map((_, indice) => {
                                const porta = portas[indice];
                                const habilitada = porta ? porta.habilitado : true;
                                const bloqueado = !habilitada;
                                const ligado = estadoReles ? estadoReles[indice] === 1 : false;
                                const nome = porta?.nomePersonalizado?.trim() || `Porta ${numeroCanal(indice)}`;
                                const canalNoModulo = (indice % 8) + 1;

                                const yEsp = pinYEsp32(indice);
                                const yMod = pinYModulo(indice);

                                const classeSufixo = bloqueado ? 'bloqueado' : ligado ? 'ligado' : '';
                                const onClickCanal = () => aoClicar(indice, bloqueado);

                                return (
                                    <g key={indice}>
                                        {/* Fio ortogonal ESP32 -> Modulo (trilha estilo PCB, 90 graus) */}
                                        <path
                                            className={`esquematico__fio ${classeSufixo ? `esquematico__fio--${classeSufixo}` : ''}`}
                                            d={caminhoOrtogonal(ESP32_PIN_X, yEsp, MODULO_PIN_X_ESQUERDA, yMod)}
                                            onClick={onClickCanal}
                                            onMouseEnter={(e) => mostrarDica(e, 'fio', indice, nome, ligado, bloqueado)}
                                            onMouseMove={moverDica}
                                            onMouseLeave={esconderDica}
                                        />

                                        {/* Pino no ESP32 */}
                                        <circle
                                            className={`esquematico__pino ${classeSufixo ? `esquematico__pino--${classeSufixo}` : ''}`}
                                            cx={ESP32_PIN_X}
                                            cy={yEsp}
                                            r="5"
                                            onClick={onClickCanal}
                                            onMouseEnter={(e) => mostrarDica(e, 'pino', indice, nome, ligado, bloqueado)}
                                            onMouseMove={moverDica}
                                            onMouseLeave={esconderDica}
                                        />
                                        <text className="esquematico__rotulo-canal" x={ESP32_PIN_X - 10} y={yEsp - 8} textAnchor="end">
                                            GPIO{PINOS_RELES[indice]}
                                        </text>

                                        {/* Pino IN no modulo (decorativo, com rotulo INx) */}
                                        <circle
                                            className={`esquematico__pino-modulo ${classeSufixo ? `esquematico__pino-modulo--${classeSufixo}` : ''}`}
                                            cx={MODULO_PIN_X_ESQUERDA}
                                            cy={yMod}
                                            r="4"
                                        />
                                        <text className="esquematico__rotulo-canal" x={MODULO_PIN_X_ESQUERDA + 8} y={yMod - 6}>
                                            IN{canalNoModulo}
                                        </text>

                                        {/* Fio curto Modulo -> bloco do rele (coluna 2 -> coluna 3), reta */}
                                        <line
                                            className={`esquematico__fio-curto ${classeSufixo ? `esquematico__fio-curto--${classeSufixo}` : ''}`}
                                            x1={MODULO_PIN_X_DIREITA}
                                            y1={yMod}
                                            x2={RELAY_X}
                                            y2={yMod}
                                        />

                                        {/* Bloco do rele (coluna 3): numero + nome + status */}
                                        <rect
                                            className={`esquematico__rele ${classeSufixo ? `esquematico__rele--${classeSufixo}` : ''}`}
                                            x={RELAY_X}
                                            y={yMod - RELAY_H / 2}
                                            width={RELAY_W}
                                            height={RELAY_H}
                                            rx="4"
                                            onClick={onClickCanal}
                                            onMouseEnter={(e) => mostrarDica(e, 'rele', indice, nome, ligado, bloqueado)}
                                            onMouseMove={moverDica}
                                            onMouseLeave={esconderDica}
                                        />
                                        <text className="esquematico__rele-numero" x={RELAY_X + 10} y={yMod + 4}>
                                            [{numeroCanal(indice)}]
                                        </text>
                                        <text className="esquematico__rele-nome" x={RELAY_X + 48} y={yMod + 4}>
                                            {truncar(nome)}
                                        </text>
                                        <text
                                            className={`esquematico__rele-status ${classeSufixo ? `esquematico__rele-status--${classeSufixo}` : ''}`}
                                            x={RELAY_X + RELAY_W - 10}
                                            y={yMod + 4}
                                            textAnchor="end"
                                        >
                                            {bloqueado ? '⛔ BLOCKED' : ligado ? '⚡ ACTIVE' : '◯ STANDBY'}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>
                </div>
            )}

            {dica && (
                <div className="esquematico__tooltip" style={{ left: dica.x + 14, top: dica.y + 14 }}>
                    <div className="esquematico__tooltip-titulo">{dica.titulo}</div>
                    {dica.linhas.map((linha) => (
                        <div key={linha} className="esquematico__tooltip-linha">
                            {linha}
                        </div>
                    ))}
                </div>
            )}
        </ModalHud>
    );
}
