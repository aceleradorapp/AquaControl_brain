import SensorGauge from './SensorGauge';
import BarraEnergiaHud from './BarraEnergiaHud';

// Extraido do JSX inline do Dashboard.jsx (20-espc, layout de widgets moviveis) — precisava
// virar um componente proprio pra poder entrar no registro de widgets (WidgetSlot.jsx),
// igual a todos os outros paineis. Conteudo/comportamento identico ao de antes, so mudou de
// arquivo.
export default function PainelParametrosVitais({ valorAgua, valorAmbiente, umidadeAr }) {
    return (
        <div className="hud-painel gauges-painel">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Parametros Vitais</h2>
                <span className="hud-tag">SENSOR.ARRAY</span>
            </div>
            <div className="gauges-painel__grid">
                <SensorGauge titulo="AGUA" valor={valorAgua} cor="var(--cor-primaria)" />
                <SensorGauge titulo="AMBIENTE" valor={valorAmbiente} cor="var(--cor-laranja)" />
            </div>
            <hr className="hud-linha" />
            <BarraEnergiaHud titulo="UMIDADE DO AR" valor={umidadeAr} cor="var(--cor-secundaria)" />
        </div>
    );
}
