import { Cpu, Settings } from 'lucide-react';
import { ICONES_SENSOR, formatarValorSensor } from '../utils/sensores';

// Widget "Sensores no Display" (16-espc): mostra só os sensores que o usuário escolheu (no
// máximo 6, ver ModalConfigurarSensoresDisplay) na mesma ordem configurada — é literalmente
// um preview de "o que está aparecendo agora na tela principal do AquaControl_OS", já que o
// Brain manda pro Display exatamente esses IDs, nessa mesma ordem (ver
// telemetriaDisplayService.js:montarDispositivosDosSensores). Sem seleção nenhuma ainda,
// mostra um aviso + o botão de configurar, em vez de uma lista vazia sem explicação.
export default function WidgetSensoresDisplay({ selecao, dadosSensores, onAbrirConfiguracao }) {
    const catalogo = dadosSensores?.disponivel ? dadosSensores.sensores : [];
    const catalogoPorId = new Map(catalogo.map((s) => [s.id, s]));
    const sensoresExibidos = selecao.map((item) => catalogoPorId.get(item.sensorId)).filter(Boolean);

    return (
        <div className="hud-painel">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Sensores no Display</h2>
                <button className="botao-icone" onClick={onAbrirConfiguracao} aria-label="Configurar sensores do display" type="button">
                    <Settings size={16} />
                </button>
            </div>

            {sensoresExibidos.length === 0 && (
                <p className="hud-tag">Nenhum sensor escolhido ainda pra tela do Display — clique no ícone acima pra configurar.</p>
            )}

            {sensoresExibidos.length > 0 && (
                <div className="diagrama-sensores">
                    {sensoresExibidos.map((sensor) => {
                        const Icone = ICONES_SENSOR[sensor.tipo] ?? Cpu;
                        return (
                            <div key={sensor.id} className={`diagrama-sensores__card ${sensor.conectado ? 'conectado' : 'desconectado'}`}>
                                <div className="diagrama-sensores__cabecalho">
                                    <Icone size={16} />
                                    <span
                                        className={`hud-status-dot ${sensor.conectado ? 'online' : 'offline'}`}
                                        title={sensor.conectado ? 'Sensor conectado' : 'Sensor nao detectado'}
                                    />
                                </div>
                                <span className="diagrama-sensores__nome">{sensor.nome}</span>
                                <span className="diagrama-sensores__valor hud-mono">
                                    {sensor.conectado ? formatarValorSensor(sensor) : 'Desconectado'}
                                </span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
