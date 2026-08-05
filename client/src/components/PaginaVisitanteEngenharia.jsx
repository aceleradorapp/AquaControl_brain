import { Flame, Recycle, Sun, Waves } from 'lucide-react';

// Aba "Filtragem & Engenharia Hidraulica" (35-espc) — conteudo estatico descrevendo a
// infraestrutura fisica de encanamentos/bombas (numeros vindos da especificacao, nao ha
// sensor nenhum que meça "vazao nominal da bomba" — isso e um dado de projeto, nao telemetria).
const ESTAGIOS = [
    {
        chave: 'bomba-meia-agua',
        Icone: Waves,
        titulo: 'Bomba de Meia Agua — 3.000 L/h',
        texto: 'Dedicada a filtragem mecanica de superficie, recolhe residuos e particulas que flutuam na coluna dagua.',
    },
    {
        chave: 'bomba-fundo',
        Icone: Waves,
        titulo: 'Bomba de Fundo — 4.000 L/h',
        texto:
            'Responsavel pela filtragem mecanica pesada do fundo, alimentando por registros o Sump com midias biologicas, o ' +
            'Clarificador UV e o sistema automatizado de aquecimento a gas.',
    },
    {
        chave: 'sump',
        Icone: Recycle,
        titulo: 'Sump com Midias Biologicas',
        texto: 'Reservatorio de filtragem biologica (300 L) — abriga as colonias de bacterias responsaveis pelo ciclo do nitrogenio.',
    },
    {
        chave: 'uv',
        Icone: Sun,
        titulo: 'Clarificador UV',
        texto: 'Esterilizacao por radiacao ultravioleta — controla algas em suspensao e patogenos na agua em circulacao.',
    },
    {
        chave: 'aquecimento-gas',
        Icone: Flame,
        titulo: 'Aquecimento a Gas (Passagem)',
        texto:
            'A agua e desviada por um aquecedor de chuveiro a gas antes de retornar ao aquario — solucao de alta potencia pra ' +
            'aquecer com eficiencia um volume acima de 1.500 litros, com o acionamento controlado automaticamente pelo ' +
            'AquaControl_Brain.',
    },
    {
        chave: 'tpa',
        Icone: Recycle,
        titulo: 'Sistema de TPA & Manutencao',
        texto:
            'Encanamentos dedicados para esgotamento do aquario e Troca Parcial de Agua (TPA), integrados com o reservatorio ' +
            'de reposicao de 100 litros.',
    },
];

export default function PaginaVisitanteEngenharia() {
    return (
        <div className="vis-aba">
            <div className="vis-cartao-vidro vis-texto-institucional">
                <h2 className="vis-secao-titulo">
                    <Waves size={18} /> Engenharia Hidraulica
                </h2>
                <p>Estrutura de encanamentos embutidos que mantem a agua em circulacao continua entre filtragem, esterilizacao e aquecimento.</p>
            </div>

            <div className="vis-lista-engenharia">
                {ESTAGIOS.map(({ chave, Icone, titulo, texto }) => (
                    <div key={chave} className="vis-cartao-vidro vis-estagio">
                        <div className="vis-estagio__icone">
                            <Icone size={22} />
                        </div>
                        <div>
                            <h3 className="vis-estagio__titulo">{titulo}</h3>
                            <p className="vis-estagio__texto">{texto}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
