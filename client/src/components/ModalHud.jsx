import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import '../styles/modais.css';

// Modal genérico com a estética do HUD (painel chanfrado + glow) — fecha com ESC, clique
// no backdrop ou no X. Todo modal do dashboard (mapeamento de portas, widgets) usa este
// componente por baixo, só muda o conteúdo (children). "largura" controla o max-width
// (ver modais.css) — "media" pra formulários simples, "grande" pra grades de 16 linhas.
//
// Renderizado via createPortal direto no <body> (20.1-espc) — sem isso, um modal aberto de
// dentro de um widget ficava PRESO no stacking context daquele widget: WidgetSlot.jsx
// precisa de "position:relative + z-index" no card pra poder levantar ele por cima dos
// outros durante o arrasto (ver widgets-layout.css), mas isso significa que um
// "position:fixed" descendente (o backdrop deste modal) NÃO escapa desse contexto — ele so
// escapa do FLUXO normal do documento, não do empilhamento. Na prática, o modal ficava
// competindo em z-index só contra os outros widgets da MESMA coluna/contexto, e podia
// aparecer atrás de widgets vizinhos dependendo da ordem deles. O portal resolve isso na
// raiz: o modal passa a ser filho direto do <body>, fora de qualquer stacking context de
// widget, então sempre fica por cima de tudo, não importa de onde foi aberto.
export default function ModalHud({ aberto, titulo, tag, onFechar, children, largura = 'media' }) {
    useEffect(() => {
        if (!aberto) return undefined;

        function aoTeclar(evento) {
            if (evento.key === 'Escape') onFechar();
        }

        document.addEventListener('keydown', aoTeclar);
        return () => document.removeEventListener('keydown', aoTeclar);
    }, [aberto, onFechar]);

    return createPortal(
        <AnimatePresence>
            {aberto && (
                <motion.div
                    className="modal-hud__backdrop"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onFechar}
                >
                    <motion.div
                        className={`hud-painel modal-hud modal-hud--${largura}`}
                        initial={{ opacity: 0, scale: 0.95, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 12 }}
                        onClick={(evento) => evento.stopPropagation()}
                    >
                        <div className="modal-hud__cabecalho">
                            <div>
                                <h2 className="hud-titulo">{titulo}</h2>
                                {tag && <span className="hud-tag">{tag}</span>}
                            </div>
                            <button className="botao-icone" onClick={onFechar} aria-label="Fechar" type="button">
                                <X size={16} />
                            </button>
                        </div>

                        <div className="modal-hud__corpo hud-scrollbar">{children}</div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>,
        document.body
    );
}
