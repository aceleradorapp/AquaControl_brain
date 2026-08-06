import SensorGauge from './SensorGauge';
import BarraEnergiaHud from './BarraEnergiaHud';
import BarraVazaoHud from './BarraVazaoHud';
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
// — nenhum desses sensores e obrigatorio pro resto do painel continuar funcionando exatamente
// como antes. 38-espc: o gauge de Alerta de Nivel saiu daqui — agora e o widget proprio
// WidgetAlertaNivel.jsx (registroWidgets.alertaNivel em Dashboard.jsx). 41-espc: a barra de
// percentual do Nivel de Agua (sensor ultrassonico, 39-espc) voltou pra ca a pedido do usuario
// — SEM crescer a altura fixa do card (380px, ver widgets-layout.css): os arcos de AGUA/
// AMBIENTE encolheram de 120 pra 80px (ver SensorGauge.jsx) e todos os divisores deste widget
// ficaram um pouco mais enxutos (classe "gauges-painel__divisor", ver dashboard.css) pra abrir
// espaco pro divisor extra entre Umidade e Nivel de Agua sem estourar a altura fixa.
export default function PainelParametrosVitais({
    valorAgua,
    valorAmbiente,
    umidadeAr,
    nivelAguaPercentual,
    vazao,
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
            </div>
            <hr className="hud-linha gauges-painel__divisor" />
            <BarraEnergiaHud titulo="UMIDADE DO AR" valor={umidadeAr} cor="var(--cor-secundaria)" />
            {typeof nivelAguaPercentual === 'number' && (
                <>
                    <hr className="hud-linha gauges-painel__divisor gauges-painel__divisor--nivel" />
                    <BarraEnergiaHud titulo="NIVEL DE AGUA" valor={nivelAguaPercentual} unidade="%" cor="var(--cor-primaria)" />
                </>
            )}
            {vazao && (
                <>
                    <hr className="hud-linha gauges-painel__divisor" />
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
                    <hr className="hud-linha gauges-painel__divisor" />
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
