import { useEffect, useState } from 'react';
import { Fish, MapPin, Thermometer, Utensils, X } from 'lucide-react';

// Aba "Moradores" — Feed de Fauna estilo Instagram (35-espc). GET /api/fauna e publico (ver
// faunaController.js) — a mesma lista alimenta esta tela E o painel ADM de gestao
// (ModalGestaoFauna.jsx), nao existe uma copia/cache separada.
//
// Placeholder de imagem (35-espc): nenhuma URL de foto real foi fornecida pra especie ainda
// (imagemUrl fica NULL no cadastro inicial) — em vez de inventar/adivinhar uma URL externa
// (arriscado: pode quebrar, licenca desconhecida), cada card sem foto mostra um icone de
// peixe sobre um gradiente colorido, escolhido de forma DETERMINISTICA a partir do nome da
// especie (mesmo nome = mesma cor sempre, sem aleatoriedade a cada render).
const GRADIENTES_PLACEHOLDER = [
    'linear-gradient(135deg, #0f5c73, #2dd4bf)',
    'linear-gradient(135deg, #1e293b, #0891b2)',
    'linear-gradient(135deg, #0a3d55, #5eead4)',
    'linear-gradient(135deg, #164e63, #22d3ee)',
];

function gradientePorNome(nome) {
    let hash = 0;
    for (let i = 0; i < nome.length; i++) hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
    return GRADIENTES_PLACEHOLDER[hash % GRADIENTES_PLACEHOLDER.length];
}

function CardFauna({ especie, onClick }) {
    return (
        <button type="button" className="vis-cartao-vidro vis-card-fauna" onClick={onClick}>
            <div className="vis-card-fauna__imagem" style={!especie.imagemUrl ? { background: gradientePorNome(especie.nomeComum) } : undefined}>
                {especie.imagemUrl ? <img src={especie.imagemUrl} alt={especie.nomeComum} /> : <Fish size={36} />}
                <span className="vis-card-fauna__badge">x{especie.quantidade}</span>
            </div>
            <span className="vis-card-fauna__nome">{especie.nomeComum}</span>
        </button>
    );
}

function ModalDetalheEspecie({ especie, onFechar }) {
    if (!especie) return null;
    const faixaPh = especie.phMinimo != null && especie.phMaximo != null ? `${especie.phMinimo} — ${especie.phMaximo}` : 'Nao informado';
    const faixaTemp =
        especie.temperaturaMinima != null && especie.temperaturaMaxima != null
            ? `${especie.temperaturaMinima}°C — ${especie.temperaturaMaxima}°C`
            : 'Nao informado';

    return (
        <div className="vis-backdrop" onClick={onFechar}>
            <div className="vis-cartao-vidro vis-modal-especie" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="vis-modal-especie__fechar" onClick={onFechar} aria-label="Fechar">
                    <X size={18} />
                </button>

                <div className="vis-card-fauna__imagem vis-modal-especie__imagem" style={!especie.imagemUrl ? { background: gradientePorNome(especie.nomeComum) } : undefined}>
                    {especie.imagemUrl ? <img src={especie.imagemUrl} alt={especie.nomeComum} /> : <Fish size={48} />}
                </div>

                <h2 className="vis-modal-especie__nome">{especie.nomeComum}</h2>
                {especie.nomeCientifico && <p className="vis-modal-especie__cientifico">{especie.nomeCientifico}</p>}
                <span className="vis-badge-status">{especie.quantidade} individuo(s)</span>

                <div className="vis-modal-especie__parametros">
                    <div>
                        <span className="vis-texto-secundario">pH ideal</span>
                        <strong>{faixaPh}</strong>
                    </div>
                    <div>
                        <Thermometer size={14} />
                        <span className="vis-texto-secundario">Temperatura</span>
                        <strong>{faixaTemp}</strong>
                    </div>
                </div>

                {especie.origem && (
                    <p className="vis-modal-especie__linha">
                        <MapPin size={14} /> <strong>Origem:</strong> {especie.origem}
                    </p>
                )}
                {especie.comportamento && (
                    <p className="vis-modal-especie__linha">
                        <Utensils size={14} /> <strong>Comportamento:</strong> {especie.comportamento}
                    </p>
                )}
            </div>
        </div>
    );
}

export default function PaginaVisitanteFauna() {
    const [fauna, setFauna] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [especieSelecionada, setEspecieSelecionada] = useState(null);

    useEffect(() => {
        fetch('/api/fauna')
            .then((r) => r.json())
            .then(setFauna)
            .catch(() => {})
            .finally(() => setCarregando(false));
    }, []);

    return (
        <div className="vis-aba">
            <div className="vis-cartao-vidro vis-texto-institucional">
                <h2 className="vis-secao-titulo">
                    <Fish size={18} /> Moradores do Aquario
                </h2>
                <p>Conheca as especies que habitam este ecossistema — toque num card pra ver os detalhes.</p>
            </div>

            {carregando && <p className="vis-texto-secundario">Carregando...</p>}
            {!carregando && fauna.length === 0 && <p className="vis-texto-secundario">Nenhuma especie cadastrada ainda.</p>}

            <div className="vis-grid-fauna">
                {fauna.map((especie) => (
                    <CardFauna key={especie.id} especie={especie} onClick={() => setEspecieSelecionada(especie)} />
                ))}
            </div>

            <ModalDetalheEspecie especie={especieSelecionada} onFechar={() => setEspecieSelecionada(null)} />
        </div>
    );
}
