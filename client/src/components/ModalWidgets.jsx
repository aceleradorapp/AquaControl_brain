import ModalHud from './ModalHud';

// Rótulos dos widgets alternáveis — a chave precisa bater com o objeto de estado
// "visibilidadeWidgets" no Dashboard.jsx (é o que é persistido no localStorage).
export const ROTULOS_WIDGETS = {
    parametrosVitais: 'Parametros Vitais',
    alertaNivel: 'Alerta de Nivel',
    historicoTermico: 'Historico Termico',
    centralAquario: 'Central do Aquario',
    matrizReles: 'Diagnostico de Reles (16CH)',
    temas: 'Temas',
    agendamentos: 'Agendamentos',
    modulosControladores: 'Modulos de Controladores',
    qrcodes: 'QR Codes',
    systemLog: 'System Log',
    sensoresDisplay: 'Sensores do Sistema',
};

// Modal "Personalizar Tela / Widgets" aberto pelo botão no Header — marca quais cards
// aparecem no dashboard. A escolha é persistida (ver Dashboard.jsx), sobrevive a um reload.
export default function ModalWidgets({ aberto, visibilidade, onAlternar, onFechar }) {
    return (
        <ModalHud aberto={aberto} titulo="Layout / Widgets" tag="PERSONALIZE SUA TELA" onFechar={onFechar}>
            <div className="modal-widgets__lista">
                {Object.entries(ROTULOS_WIDGETS).map(([chave, rotulo]) => (
                    <label key={chave} className="modal-widgets__item">
                        <input type="checkbox" checked={visibilidade[chave]} onChange={() => onAlternar(chave)} />
                        <span>{rotulo}</span>
                    </label>
                ))}
            </div>
        </ModalHud>
    );
}
