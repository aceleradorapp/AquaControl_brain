import { ArrowDown, ArrowUp } from 'lucide-react';
import ModalHud from './ModalHud';
import { ROTULOS_WIDGETS } from './ModalWidgets';

// Configuracoes do Celular (29-espc) — o dashboard NAO usa drag-and-drop no celular (ver
// Dashboard.jsx: um toque em qualquer parte de um widget podia ser mal-interpretado como
// inicio de arrasto, alem do gesto de arrastar ser ruim no toque em geral) — esta tela e o
// jeito de reordenar/mostrar-esconder widgets especificamente pro layout mobile, com
// botoes de subir/descer em vez de arrastar. Guarda um layout/visibilidade PROPRIOS,
// independentes do layout de desktop (ver "layoutMobile"/"visibilidadeWidgetsMobile").
export default function ModalConfiguracoesCelular({ aberto, layout, visibilidade, onAlternarVisibilidade, onMover, onFechar }) {
    return (
        <ModalHud aberto={aberto} titulo="Configuracoes do Celular" tag="LAYOUT E WIDGETS (SO MOBILE)" onFechar={onFechar}>
            <p className="hud-tag config-nota">
                Escolha quais widgets aparecem no celular e a ordem entre eles. Isso e independente do layout de
                desktop/tablet (que continua se organizando por arrastar e soltar).
            </p>
            <div className="config-celular__lista">
                {layout.map((chave, indice) => {
                    const rotulo = ROTULOS_WIDGETS[chave] ?? chave;
                    return (
                        <div key={chave} className={`config-celular__item ${!visibilidade[chave] ? 'config-celular__item--oculto' : ''}`}>
                            <label className="config-celular__checkbox">
                                <input type="checkbox" checked={!!visibilidade[chave]} onChange={() => onAlternarVisibilidade(chave)} />
                                <span>{rotulo}</span>
                            </label>
                            <div className="config-celular__setas">
                                <button
                                    className="botao-icone"
                                    type="button"
                                    onClick={() => onMover(chave, -1)}
                                    disabled={indice === 0}
                                    aria-label={`Mover ${rotulo} pra cima`}
                                    title="Mover pra cima"
                                >
                                    <ArrowUp size={14} />
                                </button>
                                <button
                                    className="botao-icone"
                                    type="button"
                                    onClick={() => onMover(chave, 1)}
                                    disabled={indice === layout.length - 1}
                                    aria-label={`Mover ${rotulo} pra baixo`}
                                    title="Mover pra baixo"
                                >
                                    <ArrowDown size={14} />
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ModalHud>
    );
}
