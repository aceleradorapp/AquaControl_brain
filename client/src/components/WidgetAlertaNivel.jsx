import { AlertTriangle, Waves } from 'lucide-react';
import MedidorNivelAgua from './MedidorNivelAgua';
import BarraEnergiaHud from './BarraEnergiaHud';

// Widget "Alerta de Nivel" (38-espc) — antes vivia espremido dentro da grade de 3 colunas do
// widget "Parametros Vitais" (junto com AGUA/AMBIENTE); virou um widget PROPRIO. 39-espc: ganhou
// a segunda leitura que estava reservada desde o inicio — o sensor ultrassonico "Nivel de Agua"
// (distancia -> volume/porcentagem, calculado pelo Brain, ver sensoresTelemetriaService.js). Os
// dois sensores sao INDEPENDENTES e continuam coexistindo lado a lado: "Alerta de Nivel"
// (contato, 3 zonas — bom pra alarme rapido/robusto) e "Nivel de Agua" (ultrassom, continuo e
// preciso — bom pra saber exatamente quantos litros tem).
const ROTULO_ESTADO = {
    IDEAL: 'IDEAL',
    BAIXO: 'NIVEL BAIXO',
    CRITICO: 'CRITICO — COMPLETAR AGUA',
};

const COR_ESTADO = {
    IDEAL: 'var(--cor-primaria)',
    BAIXO: 'var(--cor-alerta)',
    CRITICO: 'var(--cor-erro)',
};

function numeroOuTraco(valor, casas = 0) {
    return typeof valor === 'number' ? valor.toFixed(casas) : '--';
}

function formatarLitros(valor) {
    return typeof valor === 'number' ? valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) : '--';
}

// "sensor" = objeto cru do sensor "alerta_nivel" (contato, GPIO 36); "sensorNivel" = objeto cru
// do sensor "nivel_agua" (ultrassom, 39-espc), ambos vindos de GET /api/sensores (via
// dadosSensores do Dashboard, poll de 5s) — usa os objetos direto em vez de props separadas pra
// nao perder nenhum campo novo que o firmware/Brain mandarem.
export default function WidgetAlertaNivel({ sensor, sensorNivel }) {
    const percentual = typeof sensor?.valor === 'number' ? sensor.valor : null;
    const estado = sensor?.estado ?? null;
    const temLeitura = typeof percentual === 'number';
    const cor = estado ? COR_ESTADO[estado] ?? 'var(--cor-texto-secundario)' : 'var(--cor-texto-secundario)';

    const nivelPercentual = typeof sensorNivel?.valor === 'number' ? sensorNivel.valor : null;
    const temNivelUltrassom = typeof nivelPercentual === 'number';
    const corUltrassom = nivelPercentual !== null && nivelPercentual <= 15 ? 'var(--cor-erro)' : nivelPercentual <= 35 ? 'var(--cor-alerta)' : 'var(--cor-secundaria)';

    return (
        <div className="hud-painel widget-alerta-nivel">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Alerta de Nivel</h2>
                {temLeitura && estado && (
                    <span className="hud-tag" style={{ color: cor, borderColor: cor }}>
                        {estado === 'CRITICO' && <AlertTriangle size={12} style={{ marginRight: 4, verticalAlign: '-2px' }} />}
                        {ROTULO_ESTADO[estado] ?? estado}
                    </span>
                )}
            </div>

            {!temLeitura && (
                <p className="hud-tag">Sem leitura do sensor de nivel agora — confira o modulo de telemetria (GPIO 36).</p>
            )}

            {temLeitura && (
                <>
                    <div className="widget-alerta-nivel__corpo">
                        <MedidorNivelAgua percentual={percentual} titulo="RESERVATORIO (CONTATO)" />
                    </div>

                    {/* Diagnostico ao vivo (38-espc) — mesmos campos do card de calibracao em
                        Configuracoes, so que aqui pra nao precisar sair do dashboard pra
                        acompanhar enquanto testa/move o sensor fisicamente. */}
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
                            <span className="hud-tag">CALIBRADO (BAIXO / IDEAL)</span>
                            <span className="hud-mono">
                                {numeroOuTraco(sensor.baixo_adc, 0)} / {numeroOuTraco(sensor.ideal_adc, 0)}
                            </span>
                        </div>
                    </div>
                </>
            )}

            {/* --- Nivel de Agua (Ultrassom, 39-espc) — leitura precisa em %/litros --- */}
            <hr className="hud-linha" />
            <div className="widget-alerta-nivel__ultrassom">
                <div className="widget-alerta-nivel__ultrassom-titulo">
                    <Waves size={14} />
                    <span className="hud-tag">NIVEL DE AGUA — ULTRASSOM</span>
                </div>

                {!temNivelUltrassom && (
                    <p className="hud-tag">Sensor ultrassonico sem leitura agora — confira o modulo (GPIO 21/22).</p>
                )}

                {temNivelUltrassom && (
                    <>
                        <BarraEnergiaHud titulo="NIVEL" valor={nivelPercentual} unidade="%" cor={corUltrassom} />
                        <div className="widget-alerta-nivel__ultrassom-litros">
                            <span className="widget-alerta-nivel__ultrassom-litros-atual hud-mono" style={{ color: corUltrassom }}>
                                {formatarLitros(sensorNivel.volume_litros_atual)} L
                            </span>
                            <span className="hud-tag">/ {formatarLitros(sensorNivel.volume_maximo_litros)} L</span>
                            <span className="hud-tag widget-alerta-nivel__ultrassom-distancia">
                                (distancia: {numeroOuTraco(sensorNivel.distancia_cm, 1)} cm)
                            </span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
