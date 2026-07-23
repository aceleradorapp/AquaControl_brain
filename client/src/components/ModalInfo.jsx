import ModalHud from './ModalHud';

// Modal de informação simples: mesma casca do ModalHud (fecha com ESC/backdrop/X), só
// acrescenta um rodapé com um único botão "OK" que fecha — pedido explicitamente pelo
// usuário pro modal de status do módulo (ver ModulosControladores.jsx), mas genérico o
// bastante pra qualquer outro uso futuro que só precise mostrar informação, sem formulário.
export default function ModalInfo({ aberto, titulo, tag, onFechar, children, largura = 'media' }) {
    return (
        <ModalHud aberto={aberto} titulo={titulo} tag={tag} onFechar={onFechar} largura={largura}>
            {children}
            <div className="modal-hud__acoes">
                <button className="botao-primario" onClick={onFechar} type="button">
                    OK
                </button>
            </div>
        </ModalHud>
    );
}
