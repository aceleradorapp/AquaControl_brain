import { useEffect, useState } from 'react';
import Dashboard from './components/Dashboard';
import PaginaVisitante from './components/PaginaVisitante';

// Pareamento Silencioso de Dispositivo (33-espc): a chave do token permanente no
// localStorage — exportada pra Dashboard.jsx poder apagar (Desparear Dispositivo) sem
// duplicar a string em dois arquivos.
export const CHAVE_TOKEN_MASTER = 'aquacontrol_master_token';

// Guard de autenticacao (33-espc) — SEM react-router (este projeto nao usa em lugar nenhum,
// toda "tela grande" e um componente trocado por estado, nao uma rota de URL de verdade; ver
// o mesmo comentario em ModalCentralDiagnostico.jsx/ModalLogsCompleto.jsx). "autenticado":
// null = ainda verificando o token salvo, true/false = resultado. So depois de saber a
// resposta e que decide qual dos dois "mundos" (Dashboard tatico vs Pagina de Visitante)
// renderizar — evita um pisca de Dashboard por 1 frame pra quem nao tem token nenhum.
function App() {
    const [autenticado, setAutenticado] = useState(null);
    // Admin autenticado pode "espiar" a Pagina de Visitante sem perder a propria sessao (2.2
    // da especificacao, "[VER MODO VISITANTE]") — flag separada, nao mexe em "autenticado".
    const [modoVisitantePreview, setModoVisitantePreview] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem(CHAVE_TOKEN_MASTER);
        if (!token) {
            setAutenticado(false);
            return;
        }
        // O token so e confiado depois do backend confirmar que a ASSINATURA bate — uma
        // string qualquer colada no localStorage nao passa (ver GET /api/auth/verificar).
        fetch('/api/auth/verificar', { headers: { Authorization: `Bearer ${token}` } })
            .then((resposta) => resposta.json())
            .then((dados) => setAutenticado(!!dados.valido))
            .catch(() => setAutenticado(false));
    }, []);

    function aoAutenticar(token) {
        localStorage.setItem(CHAVE_TOKEN_MASTER, token);
        setAutenticado(true);
        setModoVisitantePreview(false);
    }

    function despareear() {
        localStorage.removeItem(CHAVE_TOKEN_MASTER);
        setAutenticado(false);
        setModoVisitantePreview(false);
    }

    if (autenticado === null) return null; // verificando o token — sem flash de tela nenhuma

    if (autenticado && !modoVisitantePreview) {
        return <Dashboard onDesparear={despareear} onVerModoVisitante={() => setModoVisitantePreview(true)} />;
    }

    return (
        <PaginaVisitante onAutenticado={aoAutenticar} onSairPreview={modoVisitantePreview ? () => setModoVisitantePreview(false) : null} />
    );
}

export default App;
