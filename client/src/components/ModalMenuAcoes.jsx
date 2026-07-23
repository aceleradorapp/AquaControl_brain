import ModalHud from './ModalHud';

// Menu de Ações (14-espc, ver 01-espc-geral/14_menu_de_acoes.md): ponto de acesso permanente
// pra abrir qualquer tela de configuração (Mapear Saidas, Criar Tema, Layout/Widgets...),
// independente de quais widgets estão visíveis no momento. Sem isso, esconder o widget
// "Central do Aquario" ou "Temas" (ver ModalWidgets) também esconderia o único jeito de
// abrir os modais que vivem dentro deles.
//
// IMPORTANTE: toda nova funcionalidade/modal de configuração adicionada ao dashboard DEVE
// ganhar uma entrada na lista "itensMenu" em Dashboard.jsx — ver a especificação acima.
export default function ModalMenuAcoes({ aberto, itens, onFechar }) {
    return (
        <ModalHud aberto={aberto} titulo="Menu de Acoes" tag="ACESSO RAPIDO" onFechar={onFechar}>
            <div className="menu-acoes__lista">
                {itens.map((item) => (
                    <button
                        key={item.chave}
                        className="menu-acoes__item"
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
        </ModalHud>
    );
}
