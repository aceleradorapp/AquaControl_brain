import { useEffect, useState } from 'react';
import { Fish, Pencil, Plus, Trash2, X } from 'lucide-react';
import ModalHud from './ModalHud';
import { LinhaConfiguracao } from './CamposConfiguracao';
import { CHAVE_TOKEN_MASTER } from '../App';

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
                    <input
                        className="hud-input"
                        type="text"
                        placeholder="URL da Imagem (opcional — sem isso mostra um icone ilustrativo)"
                        value={campos.imagemUrl}
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
        </ModalHud>
    );
}
