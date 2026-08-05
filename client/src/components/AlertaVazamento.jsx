import { AlertTriangle } from 'lucide-react';

// Alerta de Vazamento (27-espc) — banner de destaque quando o sensor de vazamento detecta
// agua onde nao deveria. So renderiza quando "detectado" e true — nenhum "tudo normal"
// ocupando espaco a toa (mesmo principio do banner de Override Manual em
// AgendamentosWidget.jsx: um alerta que so aparece quando ha alerta de verdade).
export default function AlertaVazamento({ detectado }) {
    if (!detectado) return null;

    return (
        <div className="alerta-vazamento" role="alert">
            <AlertTriangle size={18} />
            <span className="alerta-vazamento__texto">VAZAMENTO DETECTADO — VERIFIQUE O RESERVATORIO</span>
        </div>
    );
}
