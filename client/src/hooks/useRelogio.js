import { useEffect, useState } from 'react';

// Hook simples: retorna a hora atual e re-renderiza a cada segundo — usado pelo relógio
// em tempo real do header tático.
export function useRelogio() {
    const [agora, setAgora] = useState(new Date());

    useEffect(() => {
        const intervalo = setInterval(() => setAgora(new Date()), 1000);
        return () => clearInterval(intervalo);
    }, []);

    return agora;
}
