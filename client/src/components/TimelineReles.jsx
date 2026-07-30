import { formatarDataHora } from '../utils/formatoRelatorio';

// Timeline/Gantt de acionamentos (17-espc) — recharts nao tem um tipo de grafico Gantt
// nativo, entao isso e um componente proprio (divs posicionados por percentual dentro do
// periodo), mesmo espirito das outras visualizacoes SVG/HTML customizadas do projeto
// (EsquematicoInterativo/EsquematicoSensores). Uma linha por equipamento (relé mapeado),
// cada acionamento vira uma barra colorida na posicao/largura proporcional ao intervalo
// ligado dentro do periodo consultado.
function paraPercentual(iso, inicioMs, duracaoMs) {
    const ms = new Date(iso).getTime();
    return Math.min(100, Math.max(0, ((ms - inicioMs) / duracaoMs) * 100));
}

export default function TimelineReles({ intervalos, periodoInicio, periodoFim }) {
    const inicioMs = new Date(periodoInicio).getTime();
    const fimMs = new Date(periodoFim).getTime();
    const duracaoMs = Math.max(1, fimMs - inicioMs);

    const porNome = new Map();
    for (const intervalo of intervalos) {
        if (!porNome.has(intervalo.nome)) porNome.set(intervalo.nome, []);
        porNome.get(intervalo.nome).push(intervalo);
    }

    if (porNome.size === 0) {
        return <p className="hud-tag">Nenhum acionamento registrado no periodo.</p>;
    }

    return (
        <div className="timeline-reles hud-scrollbar">
            <div className="timeline-reles__eixo">
                <span className="hud-tag">{formatarDataHora(periodoInicio)}</span>
                <span className="hud-tag">{formatarDataHora(periodoFim)}</span>
            </div>
            {[...porNome.entries()].map(([nome, lista]) => (
                <div key={nome} className="timeline-reles__linha">
                    <span className="timeline-reles__rotulo hud-tag" title={nome}>
                        {nome}
                    </span>
                    <div className="timeline-reles__trilha">
                        {lista.map((intervalo, indice) => {
                            const esquerda = paraPercentual(intervalo.inicio, inicioMs, duracaoMs);
                            const direita = paraPercentual(intervalo.fim, inicioMs, duracaoMs);
                            const largura = Math.max(0.3, direita - esquerda);
                            return (
                                <div
                                    key={indice}
                                    className={`timeline-reles__barra ${intervalo.emAndamento ? 'em-andamento' : ''}`}
                                    style={{ left: `${esquerda}%`, width: `${largura}%` }}
                                    title={`${formatarDataHora(intervalo.inicio)} -> ${intervalo.emAndamento ? 'ainda ligado' : formatarDataHora(intervalo.fim)}`}
                                />
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
