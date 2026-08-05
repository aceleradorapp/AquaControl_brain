import { useEffect, useState } from 'react';
import { Cpu, Fish, KeyRound, Lock, ShieldAlert, Waves } from 'lucide-react';
import PaginaVisitanteAquario from './PaginaVisitanteAquario';
import PaginaVisitanteAutomacao from './PaginaVisitanteAutomacao';
import PaginaVisitanteEngenharia from './PaginaVisitanteEngenharia';
import PaginaVisitanteFauna from './PaginaVisitanteFauna';
import '../styles/visitante.css';

// Pagina de Visitante (33-espc, virou o "Portal do Aquario" com 4 abas no 35-espc — a
// especificacao numera como "34", ver nota de colisao de numeracao em migrate.js) — o que
// qualquer navegador SEM o token permanente (aquacontrol_master_token) ve por padrao (ver
// App.jsx). Estetica PROPRIA "Deep Blue Glassmorphism" (ver styles/visitante.css) —
// deliberadamente DIFERENTE do tema Sci-Fi/HUD ciano usado no resto do dashboard ADM, pedido
// explicito da especificacao ("sem poluicao de telas militares/HUD").
//
// Dois jeitos de chegar no formulario de Login/Cadastro Master (inalterado desde o 33-espc):
//   1. Botao "[Acesso Administrativo]", discreto no canto — SOME por completo se "Bloquear
//      Cadastro" estiver ativado (ver Configuracoes -> Seguranca e Dispositivos).
//   2. Atalho de teclado Ctrl+F12, em QUALQUER lugar desta tela — sempre disponivel, mesmo
//      com o botao bloqueado, mas exige a Master Key (padrao "718848", trocavel no painel
//      ADM) antes de liberar o formulario.
const ABAS = [
    { chave: 'aquario', rotulo: 'O Aquario', Icone: Waves, Componente: PaginaVisitanteAquario },
    { chave: 'automacao', rotulo: 'Automacao', Icone: Cpu, Componente: PaginaVisitanteAutomacao },
    { chave: 'engenharia', rotulo: 'Engenharia', Icone: Waves, Componente: PaginaVisitanteEngenharia },
    { chave: 'fauna', rotulo: 'Moradores', Icone: Fish, Componente: PaginaVisitanteFauna },
];

export default function PaginaVisitante({ onAutenticado, onSairPreview }) {
    const [abaAtiva, setAbaAtiva] = useState('aquario');

    const [bloquearCadastro, setBloquearCadastro] = useState(false);
    const [existeAdmin, setExisteAdmin] = useState(true); // otimista: nao pisca "Criar Conta" por 1 frame

    const [modalMasterKeyAberto, setModalMasterKeyAberto] = useState(false);
    const [masterKeyInput, setMasterKeyInput] = useState('');
    const [erroMasterKey, setErroMasterKey] = useState('');

    const [modalAuthAberto, setModalAuthAberto] = useState(false);
    const [usuario, setUsuario] = useState('');
    const [senha, setSenha] = useState('');
    const [confirmarSenha, setConfirmarSenha] = useState('');
    const [erroAuth, setErroAuth] = useState('');
    const [enviando, setEnviando] = useState(false);

    useEffect(() => {
        fetch('/api/auth/status')
            .then((resposta) => resposta.json())
            .then((dados) => {
                setBloquearCadastro(!!dados.bloquearCadastro);
                setExisteAdmin(!!dados.existeAdmin);
            })
            .catch(() => {});
    }, []);

    // Atalho secreto — funciona em QUALQUER lugar da tela (listener na window), mesmo com o
    // botao escondido. "e.preventDefault()" evita qualquer atalho nativo do navegador que
    // porventura use a mesma combinacao.
    useEffect(() => {
        function aoTeclar(evento) {
            if (evento.ctrlKey && evento.key === 'F12') {
                evento.preventDefault();
                setErroMasterKey('');
                setMasterKeyInput('');
                setModalMasterKeyAberto(true);
            }
        }
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, []);

    async function confirmarMasterKey(evento) {
        evento.preventDefault();
        setErroMasterKey('');
        try {
            const resposta = await fetch('/api/auth/master-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ masterKey: masterKeyInput }),
            });
            const dados = await resposta.json();
            if (!dados.valido) {
                setErroMasterKey('Master Key incorreta.');
                return;
            }
            setModalMasterKeyAberto(false);
            abrirAuth();
        } catch {
            setErroMasterKey('Falha ao validar — tente novamente.');
        }
    }

    function abrirAuth() {
        setUsuario('');
        setSenha('');
        setConfirmarSenha('');
        setErroAuth('');
        setModalAuthAberto(true);
    }

    async function enviarAuth(evento) {
        evento.preventDefault();
        setErroAuth('');

        if (!existeAdmin && senha !== confirmarSenha) {
            setErroAuth('As senhas nao coincidem.');
            return;
        }

        setEnviando(true);
        try {
            const rota = existeAdmin ? '/api/auth/login' : '/api/auth/registrar';
            const resposta = await fetch(rota, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ usuario, senha }),
            });
            const dados = await resposta.json();
            if (!resposta.ok) {
                setErroAuth(dados.erro ?? 'Falha ao autenticar.');
                return;
            }
            onAutenticado(dados.token);
        } catch {
            setErroAuth('Falha de comunicacao com o servidor.');
        } finally {
            setEnviando(false);
        }
    }

    const AbaAtivaComponente = ABAS.find((a) => a.chave === abaAtiva)?.Componente ?? PaginaVisitanteAquario;

    return (
        <div className="pagina-visitante">
            <div className="vis-canto-topo">
                {onSairPreview && (
                    <button type="button" className="vis-link-discreto" onClick={onSairPreview}>
                        Voltar ao Dashboard
                    </button>
                )}
                {!onSairPreview && !bloquearCadastro && (
                    <button type="button" className="vis-link-discreto" onClick={abrirAuth}>
                        <Lock size={12} /> Acesso Administrativo
                    </button>
                )}
            </div>

            <main className="vis-conteudo">
                <AbaAtivaComponente />
            </main>

            <nav className="vis-tabbar">
                {ABAS.map(({ chave, rotulo, Icone }) => (
                    <button
                        key={chave}
                        type="button"
                        className={`vis-tabbar__item ${abaAtiva === chave ? 'ativo' : ''}`}
                        onClick={() => setAbaAtiva(chave)}
                    >
                        <Icone size={20} />
                        <span>{rotulo}</span>
                    </button>
                ))}
            </nav>

            {modalMasterKeyAberto && (
                <div className="vis-backdrop" onClick={() => setModalMasterKeyAberto(false)}>
                    <form className="vis-cartao-vidro vis-caixa" onSubmit={confirmarMasterKey} onClick={(e) => e.stopPropagation()}>
                        <ShieldAlert size={22} className="vis-caixa__icone" />
                        <h2 className="vis-caixa__titulo">Master Key</h2>
                        <p className="vis-texto-secundario">Acesso restrito — digite o PIN do atalho.</p>
                        <input
                            className="vis-input"
                            type="password"
                            inputMode="numeric"
                            autoFocus
                            value={masterKeyInput}
                            onChange={(e) => setMasterKeyInput(e.target.value)}
                        />
                        {erroMasterKey && <p className="vis-erro">{erroMasterKey}</p>}
                        <div className="vis-caixa__acoes">
                            <button type="button" className="vis-botao vis-botao--secundario" onClick={() => setModalMasterKeyAberto(false)}>
                                Cancelar
                            </button>
                            <button type="submit" className="vis-botao">
                                Confirmar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {modalAuthAberto && (
                <div className="vis-backdrop" onClick={() => setModalAuthAberto(false)}>
                    <form className="vis-cartao-vidro vis-caixa" onSubmit={enviarAuth} onClick={(e) => e.stopPropagation()}>
                        <KeyRound size={22} className="vis-caixa__icone" />
                        <h2 className="vis-caixa__titulo">{existeAdmin ? 'Login Master' : 'Criar Conta Master'}</h2>
                        {!existeAdmin && <p className="vis-texto-secundario">Primeiro acesso — defina o usuario e a senha do administrador.</p>}

                        <label className="vis-campo">
                            <span className="vis-rotulo">Usuario</span>
                            <input className="vis-input" type="text" required autoFocus value={usuario} onChange={(e) => setUsuario(e.target.value)} />
                        </label>
                        <label className="vis-campo">
                            <span className="vis-rotulo">Senha</span>
                            <input className="vis-input" type="password" required minLength={4} value={senha} onChange={(e) => setSenha(e.target.value)} />
                        </label>
                        {!existeAdmin && (
                            <label className="vis-campo">
                                <span className="vis-rotulo">Confirmar Senha</span>
                                <input
                                    className="vis-input"
                                    type="password"
                                    required
                                    minLength={4}
                                    value={confirmarSenha}
                                    onChange={(e) => setConfirmarSenha(e.target.value)}
                                />
                            </label>
                        )}

                        {erroAuth && <p className="vis-erro">{erroAuth}</p>}

                        <div className="vis-caixa__acoes">
                            <button type="button" className="vis-botao vis-botao--secundario" onClick={() => setModalAuthAberto(false)}>
                                Cancelar
                            </button>
                            <button type="submit" className="vis-botao" disabled={enviando}>
                                {enviando ? 'Enviando...' : existeAdmin ? 'Entrar' : 'Criar Conta'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
