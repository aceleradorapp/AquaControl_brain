import { AlertTriangle } from 'lucide-react';
import MedidorNivelAgua from './MedidorNivelAgua';

// Widget "Alerta de Nivel" (38-espc) — antes vivia espremido dentro da grade de 3 colunas do
// widget "Parametros Vitais" (junto com AGUA/AMBIENTE); virou um widget PROPRIO a pedido do
// usuario, com espaco de sobra pra quando o sensor ultrassonico de "Nivel de Agua" (medida
// continua em litros, ver 37-espc — ainda nao implementado) for instalado: a ideia e esse
// futuro valor entrar aqui do lado do alerta atual, nao substituir/disputar espaco com ele —
// os dois sao leituras DIFERENTES do mesmo reservatorio (uma e um alerta de 3 zonas por
// contato, a outra vai ser um volume real).
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

// "sensor" e o objeto CRU vindo de GET /api/sensores (via dadosSensores do Dashboard, poll de
// 5s) — usa direto em vez de props separadas pra nao perder nenhum campo novo que o firmware
// mandar (adc_bruto/adc_minimo_registrado/adc_maximo_registrado/ideal_adc/baixo_adc), pedido
// explicito do usuario pra acompanhar ADC bruto + minimo + maximo AO VIVO no proprio widget (nao
// so na tela de Configuracoes) pra validar se o sensor fisico esta respondendo de verdade.
export default function WidgetAlertaNivel({ sensor }) {
    const percentual = typeof sensor?.valor === 'number' ? sensor.valor : null;
    const estado = sensor?.estado ?? null;
    const temLeitura = typeof percentual === 'number';
    const cor = estado ? COR_ESTADO[estado] ?? 'var(--cor-texto-secundario)' : 'var(--cor-texto-secundario)';

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
                        {/* Espaco reservado: quando o sensor ultrassonico de Nivel de Agua (litros
                            reais) existir, uma segunda leitura entra aqui — ver comentario no topo. */}
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
        </div>
    );
}
