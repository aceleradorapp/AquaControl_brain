import ModalHud from './ModalHud';

// Seletor de Esquematicos (16-espc): o botao "Esquematico" do header/Menu de Acoes antes
// abria direto o Esquematico Interativo dos reles (unico que existia) — agora que existe
// mais de um tipo de esquematico (reles, sensores, e mais no futuro), este modal intermedia:
// lista um card por modulo cadastrado que tem um esquematico proprio, com o NOME REAL
// cadastrado em Modulos de Controladores (nao um rotulo generico tipo "Atuadores"), pra
// escolher qual ver. "entradas" vem pronto de Dashboard.jsx (um item por modulo com
// esquematico disponivel — cresce sozinho conforme mais tipos de modulo ganharem o seu).
export default function ModalSelecionarEsquematico({ aberto, onFechar, entradas }) {
    return (
        <ModalHud aberto={aberto} titulo="Esquematicos" tag="SELECIONE UM MODULO" onFechar={onFechar}>
            {entradas.length === 0 && <p className="hud-tag">Nenhum modulo com esquematico disponivel cadastrado ainda.</p>}

            <div className="selecionar-esquematico__grid">
                {entradas.map((entrada) => (
                    <button
                        key={entrada.chave}
                        className="selecionar-esquematico__card"
                        type="button"
                        onClick={() => {
                            entrada.onAbrir();
                            onFechar();
                        }}
                    >
                        {entrada.icone}
                        <span className="selecionar-esquematico__nome">{entrada.titulo}</span>
                        <span className="hud-tag">{entrada.subtitulo}</span>
                    </button>
                ))}
            </div>
        </ModalHud>
    );
}
