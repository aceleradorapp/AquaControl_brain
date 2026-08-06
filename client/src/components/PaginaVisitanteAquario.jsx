import { Ruler, Layers, Droplets, Waves, Mountain, TreePine } from 'lucide-react';

// Aba "O Aquario" (35-espc) — ficha tecnica estatica, sem fetch nenhum: os numeros da
// estrutura fisica nao mudam em tempo real (ao contrario da Aba "Automacao & Status", que
// tem telemetria ao vivo). Foto real do aquario ainda nao existe/nao foi fornecida — hero
// ilustrativo (gradiente + icones), sem depender de nenhuma URL de imagem externa.
const FICHA_TECNICA = [
    { chave: 'volume-aquario', Icone: Droplets, rotulo: 'Volume do Aquario', valor: '1.260 L' },
    { chave: 'volume-sump', Icone: Layers, rotulo: 'Volume do Sump', valor: '300 L' },
    { chave: 'volume-total', Icone: Waves, rotulo: 'Volume Total', valor: '1.560 L' },
    { chave: 'reposicao', Icone: Droplets, rotulo: 'Reservatorio de Reposicao', valor: '100 L' },
    { chave: 'estrutura', Icone: Ruler, rotulo: 'Estrutura', valor: 'Alvenaria com Vidro Frontal Unico' },
    {
        chave: 'decoracao',
        Icone: Mountain,
        rotulo: 'Decoracao Interior',
        valor: 'Paredes em Pedra Madeira Rosa, fundo em cascalho natural, Troncos de Aroeira e plantas ornamentais',
    },
];

export default function PaginaVisitanteAquario() {
    return (
        <div className="vis-aba">
            <div className="vis-hero">
                <div className="vis-hero__decoracao" aria-hidden="true">
                    <TreePine size={28} />
                    <Waves size={28} />
                    <Mountain size={28} />
                </div>
                <h2 className="vis-hero__titulo">Bem-vindo ao AquaControl</h2>
                <p className="vis-hero__subtitulo">
                    Um ecossistema de agua doce construido em alvenaria, com mais de 1.500 litros e monitoramento automatizado 24 horas
                    por dia.
                </p>
            </div>

            <div className="vis-grid-ficha">
                {FICHA_TECNICA.map(({ chave, Icone, rotulo, valor }) => (
                    <div key={chave} className="vis-cartao-vidro vis-ficha-item">
                        <Icone size={20} className="vis-ficha-item__icone" />
                        <span className="vis-ficha-item__rotulo">{rotulo}</span>
                        <span className="vis-ficha-item__valor">{valor}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
