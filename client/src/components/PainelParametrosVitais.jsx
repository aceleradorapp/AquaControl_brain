import SensorGauge from './SensorGauge';
import BarraEnergiaHud from './BarraEnergiaHud';
import BarraVazaoHud from './BarraVazaoHud';

// Extraido do JSX inline do Dashboard.jsx (20-espc, layout de widgets moviveis) — precisava
// virar um componente proprio pra poder entrar no registro de widgets (WidgetSlot.jsx),
// igual a todos os outros paineis. Conteudo/comportamento identico ao de antes, so mudou de
// arquivo.
//
// "vazao" (24-espc, opcional): { valorLh, ativa, min, max, trocaFiltroLh } — ver Dashboard.jsx
// pra como "ativa"/valorLh sao decididos (leitura ao vivo enquanto flui, ultima leitura
// conhecida + "INATIVA" quando a bomba/fluxo para). Sem modulo de telemetria cadastrado ainda,
// "vazao" nao chega (undefined) e a barra simplesmente nao aparece.
export default function PainelParametrosVitais({ valorAgua, valorAmbiente, umidadeAr, vazao }) {
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
            {vazao && (
                <>
                    <hr className="hud-linha" />
                    <BarraVazaoHud
                        titulo="VAZAO DE AGUA"
                        valorLh={vazao.valorLh}
                        ativa={vazao.ativa}
                        min={vazao.min}
                        max={vazao.max}
                        trocaFiltroLh={vazao.trocaFiltroLh}
                    />
                </>
            )}
        </div>
    );
}
