import { AlertTriangle, Waves } from 'lucide-react';
import MedidorNivelAgua from './MedidorNivelAgua';
import BarraEnergiaHud from './BarraEnergiaHud';

// Widget "Nivel da Agua do Aquario" (38-espc como "Alerta de Nivel", renomeado no 40-espc) —
// junta os DOIS sensores de nivel do modulo de telemetria, cada um com um papel diferente desde
// o 39-espc/40-espc:
//   - "nivel_agua" (ultrassom, GPIO 21/22): a leitura PRECISA — % continuo + volume real em
//     litros, calculado pelo Brain a partir da distancia crua (ver
//     sensoresTelemetriaService.js:aplicarCalculoNivelUltrassom). Virou a leitura PRINCIPAL do
//     widget (era so um espaco reservado no 38-espc).
//   - "alerta_nivel" (contato, GPIO 36): NAO E MAIS um alarme de nivel baixo — 40-espc inverteu
//     a logica pra virar um alarme de TRANSBORDAMENTO (nivel alto demais durante um
//     enchimento), ja que o ultrassom acima ja cobre nivel baixo/normal com precisao real.
const ROTULO_ESTADO = {
    NORMAL: 'NORMAL',
    ATENCAO: 'APROXIMANDO DO LIMITE',
    CRITICO: 'TRANSBORDANDO — LIMITE ULTRAPASSADO',
};

const COR_ESTADO = {
    NORMAL: 'var(--cor-primaria)',
    ATENCAO: 'var(--cor-alerta)',
    CRITICO: 'var(--cor-erro)',
};

function numeroOuTraco(valor, casas = 0) {
    return typeof valor === 'number' ? valor.toFixed(casas) : '--';
}

function formatarLitros(valor) {
    return typeof valor === 'number' ? valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '--';
}

// "sensor" = objeto cru do sensor "alerta_nivel" (contato, GPIO 36, agora um alarme de
// transbordamento); "sensorNivel" = objeto cru do sensor "nivel_agua" (ultrassom, leitura
// principal), ambos vindos de GET /api/sensores (via dadosSensores do Dashboard, poll de 5s).
export default function WidgetAlertaNivel({ sensor, sensorNivel }) {
    const percentualContato = typeof sensor?.valor === 'number' ? sensor.valor : null;
    const estado = sensor?.estado ?? null;
    const temLeituraContato = typeof percentualContato === 'number';
    const corEstado = estado ? COR_ESTADO[estado] ?? 'var(--cor-texto-secundario)' : 'var(--cor-texto-secundario)';

    const nivelPercentual = typeof sensorNivel?.valor === 'number' ? sensorNivel.valor : null;
    const temNivelUltrassom = typeof nivelPercentual === 'number';
    const corUltrassom = nivelPercentual !== null && nivelPercentual <= 15 ? 'var(--cor-erro)' : nivelPercentual <= 35 ? 'var(--cor-alerta)' : 'var(--cor-secundaria)';
    const litrosQueFaltam =
        typeof sensorNivel?.volume_maximo_litros === 'number' && typeof sensorNivel?.volume_litros_atual === 'number'
            ? sensorNivel.volume_maximo_litros - sensorNivel.volume_litros_atual
            : null;

    return (
        <div className="hud-painel widget-alerta-nivel">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Nivel da Agua do Aquario</h2>
                {temLeituraContato && estado && (
                    <span className="hud-tag" style={{ color: corEstado, borderColor: corEstado }}>
                        {estado === 'CRITICO' && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />}
                        {ROTULO_ESTADO[estado] ?? estado}
                    </span>
                )}
            </div>

            {/* --- Nivel de Agua (Ultrassom, 39-espc) — leitura PRINCIPAL, precisa em %/litros --- */}
            {!temNivelUltrassom && (
                <p className="hud-tag">Sensor ultrassonico sem leitura agora — confira o modulo (GPIO 21/22).</p>
            )}

            {temNivelUltrassom && (
                <>
                    <div className="widget-alerta-nivel__corpo">
                        <MedidorNivelAgua percentual={nivelPercentual} titulo="RESERVATORIO" />
                    </div>

                    <BarraEnergiaHud titulo="NIVEL" valor={nivelPercentual} unidade="%" cor={corUltrassom} />

                    <div className="widget-alerta-nivel__litros-grid">
                        <div className="widget-alerta-nivel__litros-item">
                            <span className="hud-tag">VOLUME ATUAL</span>
                            <span className="widget-alerta-nivel__litros-valor hud-mono" style={{ color: corUltrassom }}>
                                {formatarLitros(sensorNivel.volume_litros_atual)} L
                            </span>
                        </div>
                        <div className="widget-alerta-nivel__litros-item">
                            <span className="hud-tag">VOLUME MAXIMO</span>
                            <span className="widget-alerta-nivel__litros-valor hud-mono">{formatarLitros(sensorNivel.volume_maximo_litros)} L</span>
                        </div>
                        <div className="widget-alerta-nivel__litros-item">
                            <span className="hud-tag">FALTAM P/ ENCHER</span>
                            <span className="widget-alerta-nivel__litros-valor hud-mono" style={{ color: litrosQueFaltam > 0 ? 'var(--cor-alerta)' : 'var(--cor-primaria)' }}>
                                {formatarLitros(litrosQueFaltam)} L
                            </span>
                        </div>
                    </div>
                    <span className="hud-tag widget-alerta-nivel__distancia">Distancia medida: {numeroOuTraco(sensorNivel.distancia_cm, 1)} cm</span>
                </>
            )}

            {/* --- Alerta de Nivel (Contato, GPIO 36) — agora so um alarme de transbordamento --- */}
            <hr className="hud-linha" />
            <div className="widget-alerta-nivel__contato">
                <div className="widget-alerta-nivel__contato-titulo">
                    <Waves size={14} />
                    <span className="hud-tag">ALARME DE TRANSBORDAMENTO — SENSOR DE CONTATO</span>
                </div>

                {!temLeituraContato && <p className="hud-tag">Sem leitura do sensor de contato agora — confira o modulo (GPIO 36).</p>}

                {temLeituraContato && (
                    <div className="widget-alerta-nivel__diagnostico">
                        <div className="widget-alerta-nivel__diagnostico-item">
                            <span className="hud-tag">ADC BRUTO AGORA</span>
                            <span className="hud-mono">{numeroOuTraco(sensor.adc_bruto, 1)}</span>
                        </div>
                        <div className="widget-alerta-nivel__diagnostico-item">
                            <span className="hud-tag">MINIMO REGISTRADO</span>
                            <span className="hud-mono">{numeroOuTraco(sensor.adc_minimo_registrado, 1)}</span>
                        </div>
                        <div className="widget-alerta-nivel__diagnostico-item">
                            <span className="hud-tag">MAXIMO REGISTRADO</span>
                            <span className="hud-mono">{numeroOuTraco(sensor.adc_maximo_registrado, 1)}</span>
                        </div>
                        <div className="widget-alerta-nivel__diagnostico-item">
                            <span className="hud-tag">CALIBRADO (ATENCAO / CRITICO)</span>
                            <span className="hud-mono">
                                {numeroOuTraco(sensor.baixo_adc, 0)} / {numeroOuTraco(sensor.ideal_adc, 0)}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
