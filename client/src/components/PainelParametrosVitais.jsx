import SensorGauge from './SensorGauge';
import BarraEnergiaHud from './BarraEnergiaHud';
import BarraVazaoHud from './BarraVazaoHud';
import MedidorNivelAgua from './MedidorNivelAgua';
import AlertaVazamento from './AlertaVazamento';

// Extraido do JSX inline do Dashboard.jsx (20-espc, layout de widgets moviveis) — precisava
// virar um componente proprio pra poder entrar no registro de widgets (WidgetSlot.jsx),
// igual a todos os outros paineis. Conteudo/comportamento identico ao de antes, so mudou de
// arquivo.
//
// "vazao"/"vazao2" (24/27-espc, opcionais): { valorLh, ativa, min, max, trocaFiltroLh } — ver
// Dashboard.jsx pra como "ativa"/valorLh sao decididos (leitura ao vivo enquanto flui, ultima
// leitura conhecida + "INATIVA" quando a bomba/fluxo para). Sem o sensor correspondente
// cadastrado/conectado, a prop chega "undefined"/"null" e o elemento simplesmente nao aparece
// — nenhum destes 3 sensores novos (nivel, vazamento, fluxo 2) e obrigatorio pro resto do
// painel continuar funcionando exatamente como antes.
export default function PainelParametrosVitais({
    valorAgua,
    valorAmbiente,
    umidadeAr,
    vazao,
    nivelAguaPercentual,
    vazamentoDetectado,
    vazao2,
}) {
    return (
        <div className="hud-painel gauges-painel">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Parametros Vitais</h2>
                <span className="hud-tag">SENSOR.ARRAY</span>
            </div>

            <AlertaVazamento detectado={vazamentoDetectado} />

            <div className="gauges-painel__grid">
                <SensorGauge titulo="AGUA" valor={valorAgua} cor="var(--cor-primaria)" />
                <SensorGauge titulo="AMBIENTE" valor={valorAmbiente} cor="var(--cor-laranja)" />
                {typeof nivelAguaPercentual === 'number' && <MedidorNivelAgua percentual={nivelAguaPercentual} />}
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
            {vazao2 && (
                <>
                    <hr className="hud-linha" />
                    <BarraVazaoHud
                        titulo="VAZAO DE AGUA (CANAL 2)"
                        valorLh={vazao2.valorLh}
                        ativa={vazao2.ativa}
                        min={vazao2.min}
                        max={vazao2.max}
                        trocaFiltroLh={vazao2.trocaFiltroLh}
                    />
                </>
            )}
        </div>
    );
}
