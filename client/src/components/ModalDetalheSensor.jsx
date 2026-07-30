import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import ModalHud from './ModalHud';
import { ICONES_SENSOR, formatarValorSensor } from '../utils/sensores';

// Mini-sparkline SVG proprio (sem recharts — leve demais pra justificar, e o resto dos
// diagramas do projeto ja e SVG a mao) — desenha uma ou mais polylines (quebra em segmentos
// nos "buracos" de leitura null, em vez de interpolar por cima de um periodo desconectado).
function Sparkline({ pontos, cor }) {
    const largura = 280;
    const altura = 64;
    const valores = pontos.map((p) => p.valor).filter((v) => v !== null);
    if (valores.length < 2) {
        return <p className="hud-tag detalhe-sensor__sem-dados">Sem historico suficiente ainda pra desenhar um grafico.</p>;
    }

    const min = Math.min(...valores);
    const max = Math.max(...valores);
    const passoX = largura / Math.max(1, pontos.length - 1);
    const coordY = (v) => altura - 4 - ((v - min) / (max - min || 1)) * (altura - 8);

    const segmentos = [];
    let atual = [];
    pontos.forEach((p, i) => {
        if (p.valor === null) {
            if (atual.length > 1) segmentos.push(atual);
            atual = [];
        } else {
            atual.push(`${(i * passoX).toFixed(1)},${coordY(p.valor).toFixed(1)}`);
        }
    });
    if (atual.length > 1) segmentos.push(atual);

    return (
        <svg viewBox={`0 0 ${largura} ${altura}`} className="detalhe-sensor__sparkline" preserveAspectRatio="none">
            {segmentos.map((seg, i) => (
                <polyline key={i} points={seg.join(' ')} fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            ))}
        </svg>
    );
}

// Modal de Detalhe do Sensor (23-espc, Central de Diagnostico) — aberto ao clicar num no de
// sensor no DiagramaCentral.jsx: valor atual, mini-historico recente (sparkline, ultimas ~30
// leituras via GET /api/relatorios/sensor-historico) e os limites de calibracao/faixa segura
// vigentes pro TIPO deste sensor (GET /api/configuracoes/faixas-seguras, 19-espc) — os mesmos
// limites editaveis em Configuracoes Globais -> Sensores & Telemetria, so mostrados aqui, nao
// editados (evita encadear modal-dentro-de-modal-dentro-de-modal).
export default function ModalDetalheSensor({ aberto, onFechar, sensor }) {
    const [historico, setHistorico] = useState([]);
    const [faixa, setFaixa] = useState(null);
    const [carregando, setCarregando] = useState(false);

    useEffect(() => {
        if (!aberto || !sensor) return;
        setCarregando(true);
        Promise.all([
            fetch(`/api/relatorios/sensor-historico?sensorId=${encodeURIComponent(sensor.id)}&limite=30`).then((r) => r.json()),
            fetch('/api/configuracoes/faixas-seguras').then((r) => r.json()),
        ]).then(([dadosHistorico, dadosFaixas]) => {
            setHistorico(Array.isArray(dadosHistorico) ? dadosHistorico : []);
            setFaixa(dadosFaixas.find((f) => f.sensorTipo === sensor.tipo) ?? null);
            setCarregando(false);
        });
    }, [aberto, sensor]);

    if (!sensor) return null;

    const Icone = ICONES_SENSOR[sensor.tipo] ?? Cpu;
    const foraDaFaixa = faixa && typeof sensor.valor === 'number' && (sensor.valor < faixa.minimo || sensor.valor > faixa.maximo);

    return (
        <ModalHud aberto={aberto} titulo={sensor.nome} tag={`${sensor.id} — ${sensor.tipo}`} onFechar={onFechar}>
            <div className="detalhe-sensor">
                <div className="detalhe-sensor__cabecalho">
                    <Icone size={28} className={sensor.conectado ? 'detalhe-sensor__icone-ok' : 'detalhe-sensor__icone-off'} />
                    <div className="detalhe-sensor__valor-bloco">
                        <span className={`hud-status-dot ${sensor.conectado ? 'online' : 'offline'}`} />
                        <span className="detalhe-sensor__valor">{sensor.conectado ? formatarValorSensor(sensor) : 'Desconectado'}</span>
                    </div>
                </div>

                <div className="detalhe-sensor__secao">
                    <span className="hud-tag">HISTORICO RECENTE</span>
                    {carregando && <p className="hud-tag">Carregando...</p>}
                    {!carregando && <Sparkline pontos={historico} cor={sensor.conectado ? 'var(--cor-primaria)' : 'var(--cor-erro)'} />}
                </div>

                <div className="detalhe-sensor__secao">
                    <span className="hud-tag">LIMITES DE CALIBRACAO (FAIXA SEGURA)</span>
                    {faixa ? (
                        <div className={`detalhe-sensor__faixa ${foraDaFaixa ? 'fora' : ''}`}>
                            <span>
                                {faixa.minimo} — {faixa.maximo} {sensor.unidade}
                            </span>
                            {foraDaFaixa && <span className="hud-tag detalhe-sensor__aviso-faixa">FORA DA FAIXA AGORA</span>}
                        </div>
                    ) : (
                        <p className="hud-tag">Este tipo de sensor nao tem faixa segura configurada.</p>
                    )}
                    <p className="hud-tag detalhe-sensor__nota">Editavel em Configuracoes Globais -&gt; Sensores &amp; Telemetria.</p>
                </div>
            </div>
        </ModalHud>
    );
}
