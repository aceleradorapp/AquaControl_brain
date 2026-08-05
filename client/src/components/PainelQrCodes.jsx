import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, QrCode, Send, Smartphone, Trash2, Wifi } from 'lucide-react';

// Mesma regra de escape que o firmware já usava (DisplayHUD::escaparParaWifiQr) — agora
// migrada pra cá, já que é o dashboard que monta o conteúdo do QR de Wi-Fi antes de
// cadastrar (09-espc: o Display só desenha o que chega pronto, não monta mais nada).
function escaparParaWifiQr(valor) {
    return valor.replace(/([\\;,:])/g, '\\$1');
}

function montarConteudoWifi(ssid, senha) {
    return `WIFI:T:WPA;S:${escaparParaWifiQr(ssid)};P:${escaparParaWifiQr(senha)};;`;
}

// Biblioteca de QR Codes (09-espc): cadastra vários (Wi-Fi ou texto/URL livre) e escolhe
// qual está "ativo" — era o único conceito antes do 04-espc, quando a tela principal do
// Display ganhou 2 botões FIXOS ("Internet"/"App") que buscam por PAPEL, não por "ativo": os
// dois precisam ter um QR sempre disponível ao mesmo tempo, e "ativo" só guarda UM QR por
// vez (era pensado pra Tela de QR Code antiga, que foi removida). "papel" é independente de
// "ativo" — um QR pode ser "ativo" (mostrado se algo ainda usar /api/qrcodes/ativo) E também
// ter um papel fixo, ou nenhum dos dois.
const ROTULO_PAPEL = { wifi: 'WI-FI DO DISPLAY', app: 'APP DO DISPLAY' };
export default function PainelQrCodes() {
    const [qrcodes, setQrcodes] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [formAberto, setFormAberto] = useState(false);
    const [tipo, setTipo] = useState('wifi');
    const [nome, setNome] = useState('');
    const [ssid, setSsid] = useState('');
    const [senha, setSenha] = useState('');
    const [conteudoLivre, setConteudoLivre] = useState('');
    const [enviando, setEnviando] = useState(false);

    async function buscarQrcodes() {
        try {
            const resposta = await fetch('/api/qrcodes');
            const dados = await resposta.json();
            setQrcodes(dados);
        } catch {
            // silencioso — lista só decorativa se o backend estiver fora no momento
        } finally {
            setCarregando(false);
        }
    }

    useEffect(() => {
        buscarQrcodes();
    }, []);

    async function handleSubmit(evento) {
        evento.preventDefault();
        const conteudo = tipo === 'wifi' ? montarConteudoWifi(ssid, senha) : conteudoLivre;
        if (!nome || !conteudo) return;

        setEnviando(true);
        try {
            await fetch('/api/qrcodes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nome, conteudo }),
            });
            await buscarQrcodes();
            setNome('');
            setSsid('');
            setSenha('');
            setConteudoLivre('');
            setFormAberto(false);
        } finally {
            setEnviando(false);
        }
    }

    async function ativar(id) {
        await fetch(`/api/qrcodes/${id}/ativar`, { method: 'PUT' });
        buscarQrcodes();
    }

    // Clicar de novo no papel já atribuído REMOVE (toggle) — mesma UX de "ativar" acima, só
    // que sem exigir trocar por outro QR pra desmarcar.
    async function definirPapel(qr, papel) {
        const novoPapel = qr.papel === papel ? null : papel;
        await fetch(`/api/qrcodes/${qr.id}/papel`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ papel: novoPapel }),
        });
        buscarQrcodes();
    }

    async function remover(id) {
        await fetch(`/api/qrcodes/${id}`, { method: 'DELETE' });
        buscarQrcodes();
    }

    return (
        <div className="hud-painel painel-qrcodes">
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">QR Codes</h2>
                <button className="botao-icone" onClick={() => setFormAberto((v) => !v)} aria-label="Cadastrar QR Code" type="button">
                    <Plus size={16} />
                </button>
            </div>

            <AnimatePresence>
                {formAberto && (
                    <motion.form
                        className="painel-qrcodes__form"
                        onSubmit={handleSubmit}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                    >
                        <input className="hud-input" placeholder="Nome (ex.: Wi-Fi Visitantes)" value={nome} onChange={(e) => setNome(e.target.value)} />
                        <select className="hud-input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                            <option value="wifi">Wi-Fi</option>
                            <option value="texto">Texto / URL</option>
                        </select>

                        {tipo === 'wifi' ? (
                            <>
                                <input className="hud-input" placeholder="SSID" value={ssid} onChange={(e) => setSsid(e.target.value)} />
                                <input className="hud-input" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
                            </>
                        ) : (
                            <input
                                className="hud-input"
                                placeholder="Conteudo (texto ou URL)"
                                value={conteudoLivre}
                                onChange={(e) => setConteudoLivre(e.target.value)}
                            />
                        )}

                        <button className="botao-primario" type="submit" disabled={enviando}>
                            {enviando ? 'Salvando...' : 'Cadastrar'}
                        </button>
                    </motion.form>
                )}
            </AnimatePresence>

            {carregando && <p className="hud-tag">Carregando...</p>}

            <ul className="painel-qrcodes__lista hud-scrollbar">
                <AnimatePresence>
                    {qrcodes.map((qr) => (
                        <motion.li
                            key={qr.id}
                            className={qr.ativo ? 'painel-qrcodes__item--ativo' : ''}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                        >
                            <QrCode size={14} />
                            <span className="painel-qrcodes__nome">{qr.nome}</span>
                            {qr.papel && <span className="hud-tag painel-qrcodes__tag-papel">{ROTULO_PAPEL[qr.papel]}</span>}
                            {qr.ativo && <span className="hud-tag painel-qrcodes__tag-ativo">NO DISPLAY</span>}
                            {!qr.ativo && (
                                <button className="botao-icone" onClick={() => ativar(qr.id)} title="Enviar este QR pro Display (tela antiga)" type="button">
                                    <Send size={14} />
                                </button>
                            )}
                            <button
                                className={`botao-icone ${qr.papel === 'wifi' ? 'botao-icone--papel-ativo' : ''}`}
                                onClick={() => definirPapel(qr, 'wifi')}
                                title={qr.papel === 'wifi' ? 'Remover do botao Internet da tela principal' : 'Usar no botao Internet (Wi-Fi) da tela principal'}
                                type="button"
                            >
                                <Wifi size={14} />
                            </button>
                            <button
                                className={`botao-icone ${qr.papel === 'app' ? 'botao-icone--papel-ativo' : ''}`}
                                onClick={() => definirPapel(qr, 'app')}
                                title={qr.papel === 'app' ? 'Remover do botao App da tela principal' : 'Usar no botao App da tela principal'}
                                type="button"
                            >
                                <Smartphone size={14} />
                            </button>
                            <button className="botao-icone botao-icone--erro" onClick={() => remover(qr.id)} title="Remover" type="button">
                                <Trash2 size={14} />
                            </button>
                        </motion.li>
                    ))}
                </AnimatePresence>
                {qrcodes.length === 0 && !carregando && <li className="hud-tag painel-qrcodes__vazio">Nenhum QR Code cadastrado.</li>}
            </ul>
        </div>
    );
}
