import { Cpu } from 'lucide-react';
import { ICONES_SENSOR, formatarValorSensor } from '../utils/sensores';

// Widget "Sensores do Sistema" (29-espc, substitui o antigo "Sensores no Display"): a
// selecao manual de "quais sensores aparecem na tela do Display" (config_display_sensores,
// max. 6, com posicao/ordem escolhida a mao) foi removida junto com o modal de configuracao
// (ModalConfigurarSensoresDisplay.jsx) — o AquaControl_OS nao gerencia mais uma selecao
// individual de exibicao (a tela principal do Display hoje so mostra 3 arcos fixos: media de
// agua, ar, umidade, sempre calculados pelo Brain, ver telemetriaDisplayService.js). Este
// widget virou uma listagem completa e automatica de TODOS os sensores cadastrados no
// sistema — sem engrenagem, sem modal, nada pra configurar aqui.
export default function WidgetSensoresSistema({ dadosSensores, mediaAgua }) {
    const catalogo = dadosSensores?.disponivel ? dadosSensores.sensores : [];

    // Ordenacao por prioridade de status (regra 2 da especificacao): conectados primeiro,
    // desconectados depois; dentro de cada grupo, mantem a ordem que o modulo devolveu (nao
    // reordena por nome — o catalogo ja vem numa ordem estavel do firmware).
    const ordenados = [...catalogo].sort((a, b) => Number(b.conectado) - Number(a.conectado));
    const totalOnline = catalogo.filter((s) => s.conectado).length;

    return (
        <div className="hud-painel widget-sensores-sistema">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Sensores do Sistema // Live Feed</h2>
                <span className="hud-tag sensores-sistema__contagem">
                    Online: {totalOnline}/{catalogo.length}
                </span>
            </div>

            {!dadosSensores?.disponivel && (
                <p className="mensagem-erro hud-tag">Modulo de telemetria inacessivel agora — nao da pra listar os sensores.</p>
            )}

            {dadosSensores?.disponivel && catalogo.length === 0 && (
                <p className="hud-tag">Nenhum sensor cadastrado no modulo de telemetria ainda.</p>
            )}

            {dadosSensores?.disponivel && catalogo.length > 0 && (
                <>
                    {/* Metrica Consolidada (regra 3): media das temperaturas de agua ATIVAS,
                        sempre calculada pelo mesmo criterio do widget "Parametros Vitais" (ver
                        utils/sensores.js:calcularMediaTemperaturaAgua) — "mediaAgua" chega
                        pronta por prop, Dashboard.jsx e a UNICA fonte desse calculo. */}
                    <div className="sensores-sistema__media">
                        <span className="sensores-sistema__media-tag">[Calculado]</span>
                        <span className="sensores-sistema__media-titulo">Media Temp. Agua</span>
                        <span className="sensores-sistema__media-valor hud-mono">
                            {mediaAgua !== null ? `${mediaAgua.toFixed(1)} °C` : 'OFFLINE / N/A'}
                        </span>
                    </div>

                    <div className="diagrama-sensores">
                        {ordenados.map((sensor) => {
                            const Icone = ICONES_SENSOR[sensor.tipo] ?? Cpu;
                            return (
                                <div key={sensor.id} className={`diagrama-sensores__card ${sensor.conectado ? 'conectado' : 'desconectado'}`}>
                                    <div className="diagrama-sensores__cabecalho">
                                        <Icone size={13} />
                                        <span
                                            className={`hud-status-dot ${sensor.conectado ? 'online' : 'offline'}`}
                                            title={sensor.conectado ? 'Sensor conectado' : 'Sensor nao detectado'}
                                        />
                                    </div>
                                    <span className="diagrama-sensores__nome" title={sensor.nome}>
                                        {sensor.nome}
                                    </span>
                                    <span className="diagrama-sensores__valor hud-mono">
                                        {sensor.conectado ? formatarValorSensor(sensor) : 'Desconectado'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
