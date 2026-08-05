import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';

// Menu de Acoes, versao celular (29-espc) — desliza da ESQUERDA pra direita (drawer lateral,
// ocupa a altura toda), em vez do modal centralizado do desktop (ver ModalMenuAcoes.jsx) —
// mais natural de alcancar com o polegar numa tela pequena. Mostra os MESMOS "itens" (nao
// duplica a lista do Menu de Acoes, so a apresentacao muda) — ver Dashboard.jsx, que decide
// qual dos dois renderizar com base em useEhMobile(). Fecha no X, tocando fora (backdrop) ou
// ESC (mesmo padrao dos outros modais do app).
export default function MenuLateralMobile({ aberto, itens, onFechar }) {
    return createPortal(
        <AnimatePresence>
            {aberto && (
                <motion.div
                    className="menu-lateral-mobile__backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onFechar}
                >
                    <motion.div
                        className="menu-lateral-mobile__painel"
                        initial={{ x: '-100%' }}
                        animate={{ x: 0 }}
                        exit={{ x: '-100%' }}
                        transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
                        onClick={(evento) => evento.stopPropagation()}
                    >
                        <div className="menu-lateral-mobile__cabecalho">
                            <span className="hud-titulo">Menu</span>
                            <button className="botao-icone" onClick={onFechar} aria-label="Fechar menu" type="button">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="menu-lateral-mobile__lista">
                            {itens.map((item) => (
                                <button
                                    key={item.chave}
                                    className="menu-lateral-mobile__item"
                                    type="button"
                                    onClick={() => {
                                        item.onClick();
                                        onFechar();
                                    }}
                                >
                                    {item.icone}
                                    <span>{item.rotulo}</span>
                                </button>
                            ))}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
