import ModalHud from './ModalHud';

// Menu de Ações (14-espc, ver 01-espc-geral/arquivo/14_menu_de_acoes.md): ponto de acesso
// permanente pra abrir qualquer tela de configuração (Mapear Saidas, Criar Tema, Layout/
// Widgets...), independente de quais widgets estão visíveis no momento. Sem isso, esconder o
// widget "Central do Aquario" ou "Temas" (ver ModalWidgets) também esconderia o único jeito de
// abrir os modais que vivem dentro deles.
//
// 42-espc: virou uma lista AGRUPADA por categoria (Hardware & Diagnostico, Automacao & Cenas,
// Dados & Documentacao, Sistema & Personalizacao, Visitante & Conteudo) — antes era uma lista
// única de 13 itens sem organização nenhuma, difícil de escanear rápido. O agrupamento em si
// (campo "grupo" de cada item) é decidido em Dashboard.jsx, ali é a fonte da verdade — este
// componente só recebe "grupos" já pronto e desenha.
//
// IMPORTANTE: toda nova funcionalidade/modal de configuração adicionada ao dashboard DEVE
// ganhar uma entrada em "itensMenu" (com um "grupo") em Dashboard.jsx.
export default function ModalMenuAcoes({ aberto, grupos, onFechar }) {
    return (
        <ModalHud aberto={aberto} titulo="Menu de Acoes" tag="ACESSO RAPIDO" onFechar={onFechar}>
            <div className="menu-acoes__grupos">
                {grupos.map((grupo) => (
                    <div key={grupo.titulo} className="menu-acoes__grupo">
                        <span className="hud-tag menu-acoes__grupo-titulo">{grupo.titulo}</span>
                        <div className="menu-acoes__lista">
                            {grupo.itens.map((item) => (
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
                    </div>
                ))}
            </div>
        </ModalHud>
    );
}
