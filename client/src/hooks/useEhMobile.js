import { useEffect, useState } from 'react';

// Mesmo breakpoint que dashboard.css ja usa (min-width:768px = tablet/desktop, ver "Barra
// fixa no topo + escala global dos widgets") — so o lado JS disso, pra decisoes que CSS
// sozinho nao resolve (desligar o drag-and-drop dos widgets, trocar o Menu de Acoes por um
// menu lateral, etc.). Reage a resize/rotacao de tela via matchMedia, nao só a carga inicial.
const CONSULTA_MOBILE = '(max-width: 767px)';

export function useEhMobile() {
    const [ehMobile, setEhMobile] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(CONSULTA_MOBILE).matches : false));

    useEffect(() => {
        const consulta = window.matchMedia(CONSULTA_MOBILE);
        function aoMudar(evento) {
            setEhMobile(evento.matches);
        }
        consulta.addEventListener('change', aoMudar);
        return () => consulta.removeEventListener('change', aoMudar);
    }, []);

    return ehMobile;
}
