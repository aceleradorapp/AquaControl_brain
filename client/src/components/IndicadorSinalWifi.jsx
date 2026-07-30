import { SignalHigh, SignalLow, SignalMedium, SignalZero } from 'lucide-react';

// Sinal de Wi-Fi estilo celular (25-espc) — classifica o RSSI (dBm, sempre <= 0) nos mesmos
// "baldes" que Android/iOS usam pra decidir quantas barras mostrar, em vez de expor o numero
// cru sem contexto nenhum pro usuario. So renderiza quando ha um valor de verdade (o modulo
// respondeu no ultimo poll) — um modulo offline ja tem o ponto vermelho pra isso, um icone de
// "zero barras" ali do lado so competiria visualmente sem acrescentar informacao nova.
function classificarSinal(rssiDbm) {
    if (rssiDbm >= -60) return { Icone: SignalHigh, rotulo: 'Otimo', cor: 'var(--cor-sucesso)' };
    if (rssiDbm >= -70) return { Icone: SignalMedium, rotulo: 'Bom', cor: 'var(--cor-secundaria)' };
    if (rssiDbm >= -80) return { Icone: SignalLow, rotulo: 'Fraco', cor: 'var(--cor-alerta)' };
    return { Icone: SignalZero, rotulo: 'Muito fraco', cor: 'var(--cor-erro)' };
}

export default function IndicadorSinalWifi({ rssiDbm }) {
    if (rssiDbm === null || rssiDbm === undefined) return null;

    const { Icone, rotulo, cor } = classificarSinal(rssiDbm);
    return (
        <span
            className="indicador-sinal-wifi hud-tooltip"
            style={{ color: cor }}
            data-tooltip={`Sinal Wi-Fi: ${rotulo} (${rssiDbm} dBm)`}
        >
            <Icone size={22} strokeWidth={2.75} />
            <span className="indicador-sinal-wifi__valor hud-mono">{rssiDbm} dBm</span>
        </span>
    );
}
