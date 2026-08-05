import { useEffect, useRef, useState } from 'react';
import { Fish, ImagePlus, Pencil, Plus, Trash2, X } from 'lucide-react';
import ModalHud from './ModalHud';
import ModalCortarImagem from './ModalCortarImagem';
import { LinhaConfiguracao } from './CamposConfiguracao';
import { CHAVE_TOKEN_MASTER } from '../App';

const TAMANHO_MAXIMO_ARQUIVO_BYTES = 15 * 1024 * 1024; // 15MB — generoso, a foto e comprimida no recorte de qualquer jeito

// Modulo de Gestao de Fauna (35-espc, especificacao numerada "34") — CRUD completo da tabela
// "fauna" (ver faunaController.js), aberto pelo Menu de Acoes ("Gestao de Fauna"). Escrita
// (criar/editar/excluir) exige o token JWT no header Authorization — a PRIMEIRA rota deste
// projeto protegida de verdade (pedido explicito da especificacao, ver
// middlewares/autenticacao.js) — por isso este e o UNICO componente do dashboard que anexa
// esse header nos fetches; o resto do sistema continua sem precisar disso.
const CAMPO_VAZIO = {
    nomeComum: '',
    nomeCientifico: '',
    quantidade: '1',
    phMinimo: '',
    phMaximo: '',
    temperaturaMinima: '',
    temperaturaMaxima: '',
    origem: '',
    comportamento: '',
    imagemUrl: '',
};

function cabecalhoAuth() {
    const token = localStorage.getItem(CHAVE_TOKEN_MASTER);
    return token ? { Authorization: `Bearer ${token}` } : {};
}

export default function ModalGestaoFauna({ aberto, onFechar, registrarLog }) {
    const [fauna, setFauna] = useState([]);
    const [carregando, setCarregando] = useState(false);
    const [formAberto, setFormAberto] = useState(false);
    const [editandoId, setEditandoId] = useState(null);
    const [campos, setCampos] = useState(CAMPO_VAZIO);
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);
    const [arquivoParaCortar, setArquivoParaCortar] = useState(null);
    const [modalCortarAberto, setModalCortarAberto] = useState(false);
    const inputArquivoRef = useRef(null);

    useEffect(() => {
        if (!aberto) return;
        recarregar();
    }, [aberto]);

    function recarregar() {
        setCarregando(true);
        fetch('/api/fauna')
            .then((r) => r.json())
            .then(setFauna)
            .catch(() => {})
            .finally(() => setCarregando(false));
    }

    function abrirNovo() {
        setEditandoId(null);
        setCampos(CAMPO_VAZIO);
        setErro('');
        setFormAberto(true);
    }

    function abrirEdicao(especie) {
        setEditandoId(especie.id);
        setCampos({
            nomeComum: especie.nomeComum ?? '',
            nomeCientifico: especie.nomeCientifico ?? '',
            quantidade: String(especie.quantidade ?? 1),
            phMinimo: especie.phMinimo ?? '',
            phMaximo: especie.phMaximo ?? '',
            temperaturaMinima: especie.temperaturaMinima ?? '',
            temperaturaMaxima: especie.temperaturaMaxima ?? '',
            origem: especie.origem ?? '',
            comportamento: especie.comportamento ?? '',
            imagemUrl: especie.imagemUrl ?? '',
        });
        setErro('');
        setFormAberto(true);
    }

    function atualizarCampo(campo, valor) {
        setCampos((atual) => ({ ...atual, [campo]: valor }));
    }

    // Upload + recorte da foto: nao existe endpoint de upload nenhum neste projeto ainda —
    // em vez de criar infraestrutura nova (multer, pasta de uploads, rota estatica), o
    // recorte (ModalCortarImagem.jsx) ja devolve a imagem PRONTA como um data: URL JPEG
    // comprimido, que vai direto no MESMO campo "imagemUrl" que ja aceitava URL colada —
    // zero mudanca no backend, `<img src>` aceita data: URL igual a qualquer outra.
    function aoEscolherArquivo(evento) {
        const arquivo = evento.target.files?.[0];
        evento.target.value = ''; // permite escolher o MESMO arquivo de novo depois (senao o onChange nao dispara)
        if (!arquivo) return;

        if (!arquivo.type.startsWith('image/')) {
            setErro('Escolha um arquivo de imagem.');
            return;
        }
        if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO_BYTES) {
            setErro('Imagem muito grande (maximo 15MB).');
            return;
        }

        setErro('');
        setArquivoParaCortar(arquivo);
        setModalCortarAberto(true);
    }

    function aoConfirmarCorte(dataUrlRecortado) {
        atualizarCampo('imagemUrl', dataUrlRecortado);
        setModalCortarAberto(false);
        setArquivoParaCortar(null);
    }

    async function salvar() {
        setErro('');
        if (!campos.nomeComum.trim()) {
            setErro('Nome Comum e obrigatorio.');
            return;
        }
        setSalvando(true);
        try {
            const rota = editandoId ? `/api/fauna/${editandoId}` : '/api/fauna';
            const resposta = await fetch(rota, {
                method: editandoId ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', ...cabecalhoAuth() },
                body: JSON.stringify(campos),
            });
            const dados = await resposta.json();
            if (!resposta.ok) {
                setErro(dados.erro ?? 'Falha ao salvar.');
                return;
            }
            registrarLog?.(`Fauna: "${dados.nomeComum}" ${editandoId ? 'editado' : 'adicionado'}.`, 'sucesso');
            setFormAberto(false);
            recarregar();
        } catch {
            setErro('Falha de comunicacao com o servidor.');
        } finally {
            setSalvando(false);
        }
    }

    async function excluir(especie) {
        if (!window.confirm(`Remover "${especie.nomeComum}" da lista de moradores?`)) return;
        try {
            const resposta = await fetch(`/api/fauna/${especie.id}`, { method: 'DELETE', headers: cabecalhoAuth() });
            const dados = await resposta.json();
            if (!resposta.ok) {
                registrarLog?.(dados.erro ?? 'Falha ao remover.', 'erro');
                return;
            }
            registrarLog?.(`Fauna: "${especie.nomeComum}" removido.`, 'alerta');
            recarregar();
        } catch {
            registrarLog?.('Falha de comunicacao com o servidor.', 'erro');
        }
    }

    return (
        <ModalHud
            aberto={aberto}
            titulo="Gestao de Fauna"
            tag={`${fauna.length} especie(s) cadastrada(s)`}
            onFechar={onFechar}
            largura="grande"
        >
            <div className="painel-cabecalho">
                <h2 className="hud-titulo">Moradores do Aquario</h2>
                <button className="botao-icone" type="button" aria-label={formAberto ? 'Fechar formulario' : 'Adicionar especie'} onClick={formAberto ? () => setFormAberto(false) : abrirNovo}>
                    {formAberto ? <X size={16} /> : <Plus size={16} />}
                </button>
            </div>

            {formAberto && (
                <div className="config-novo-usuario">
                    <input className="hud-input" type="text" placeholder="Nome Comum *" value={campos.nomeComum} onChange={(e) => atualizarCampo('nomeComum', e.target.value)} />
                    <input
                        className="hud-input"
                        type="text"
                        placeholder="Nome Cientifico"
                        value={campos.nomeCientifico}
                        onChange={(e) => atualizarCampo('nomeCientifico', e.target.value)}
                    />
                    <input
                        className="hud-input"
                        type="number"
                        min="0"
                        placeholder="Quantidade de Individuos"
                        value={campos.quantidade}
                        onChange={(e) => atualizarCampo('quantidade', e.target.value)}
                    />
                    <div className="config-campo-numero">
                        <input className="hud-input" type="number" step="0.1" placeholder="pH minimo" value={campos.phMinimo} onChange={(e) => atualizarCampo('phMinimo', e.target.value)} />
                        <span className="hud-tag">ate</span>
                        <input className="hud-input" type="number" step="0.1" placeholder="pH maximo" value={campos.phMaximo} onChange={(e) => atualizarCampo('phMaximo', e.target.value)} />
                    </div>
                    <div className="config-campo-numero">
                        <input
                            className="hud-input"
                            type="number"
                            step="0.5"
                            placeholder="Temp. minima (°C)"
                            value={campos.temperaturaMinima}
                            onChange={(e) => atualizarCampo('temperaturaMinima', e.target.value)}
                        />
                        <span className="hud-tag">ate</span>
                        <input
                            className="hud-input"
                            type="number"
                            step="0.5"
                            placeholder="Temp. maxima (°C)"
                            value={campos.temperaturaMaxima}
                            onChange={(e) => atualizarCampo('temperaturaMaxima', e.target.value)}
                        />
                    </div>
                    <input className="hud-input" type="text" placeholder="Origem / Regiao" value={campos.origem} onChange={(e) => atualizarCampo('origem', e.target.value)} />
                    <textarea
                        className="hud-input"
                        rows={3}
                        placeholder="Comportamento / Dieta"
                        value={campos.comportamento}
                        onChange={(e) => atualizarCampo('comportamento', e.target.value)}
                    />
                    <div className="fauna-foto">
                        {campos.imagemUrl ? (
                            <img src={campos.imagemUrl} alt="Previa da foto" className="fauna-foto__previa" />
                        ) : (
                            <div className="fauna-foto__placeholder">
                                <Fish size={22} />
                            </div>
                        )}
                        <div className="fauna-foto__acoes">
                            <input
                                ref={inputArquivoRef}
                                type="file"
                                accept="image/*"
                                onChange={aoEscolherArquivo}
                                style={{ display: 'none' }}
                            />
                            <button className="botao-primario" type="button" onClick={() => inputArquivoRef.current?.click()}>
                                <ImagePlus size={14} /> {campos.imagemUrl ? 'Trocar Foto' : 'Enviar Foto'}
                            </button>
                            {campos.imagemUrl && (
                                <button className="botao-icone botao-icone--erro" type="button" aria-label="Remover foto" onClick={() => atualizarCampo('imagemUrl', '')}>
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    </div>
                    <input
                        className="hud-input"
                        type="text"
                        placeholder="...ou cole a URL de uma imagem (opcional — sem nada mostra um icone ilustrativo)"
                        value={campos.imagemUrl.startsWith('data:') ? '' : campos.imagemUrl}
                        onChange={(e) => atualizarCampo('imagemUrl', e.target.value)}
                    />
                    {erro && <p className="mensagem-erro hud-tag">{erro}</p>}
                    <button className="botao-primario" type="button" onClick={salvar} disabled={salvando}>
                        {salvando ? 'Salvando...' : editandoId ? 'Salvar Alteracoes' : 'Adicionar Especie'}
                    </button>
                </div>
            )}

            {carregando && <p className="hud-tag">Carregando...</p>}
            {!carregando && fauna.length === 0 && <p className="hud-tag">Nenhuma especie cadastrada ainda.</p>}

            {fauna.map((especie) => (
                <LinhaConfiguracao
                    key={especie.id}
                    titulo={`${especie.nomeComum} — x${especie.quantidade}`}
                    descricao={especie.nomeCientifico || 'Nome cientifico nao informado'}
                >
                    <button className="botao-icone" type="button" aria-label="Editar" onClick={() => abrirEdicao(especie)}>
                        <Pencil size={14} />
                    </button>
                    <button className="botao-icone botao-icone--erro" type="button" aria-label="Excluir" onClick={() => excluir(especie)}>
                        <Trash2 size={14} />
                    </button>
                </LinhaConfiguracao>
            ))}

            {!carregando && fauna.length === 0 && (
                <p className="hud-tag" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Fish size={14} /> A lista aparece na Aba "Moradores" da Pagina de Visitante assim que houver especies aqui.
                </p>
            )}

            <ModalCortarImagem
                aberto={modalCortarAberto}
                arquivo={arquivoParaCortar}
                onFechar={() => setModalCortarAberto(false)}
                onConfirmar={aoConfirmarCorte}
            />
        </ModalHud>
    );
}
