import { useEffect, useState } from 'react';
import { Cpu, Flame } from 'lucide-react';
import { ICONES_SENSOR, formatarValorSensor } from '../utils/sensores';

// Aba "Automacao & Status" (35-espc) — texto institucional + painel de leitura AO VIVO, mas
// 100% read-only (sem nenhum botao de acionamento, ver especificacao 2.2 — diferente do
// Dashboard ADM, que controla de verdade). Usa os MESMOS endpoints publicos que o resto do
// sistema ja usa pra ler sensores/reles (GET /api/modulos, GET /api/modulos/:id/sensores,
// GET /api/modulos/:id/reles, GET /api/modulos/:id/portas) — nenhuma rota nova precisou ser
// criada so pra esta tela.
const INTERVALO_POLLING_MS = 5000;

export default function PaginaVisitanteAutomacao() {
    const [moduloAtuador, setModuloAtuador] = useState(null);
    const [moduloTelemetria, setModuloTelemetria] = useState(null);
    const [portas, setPortas] = useState([]);
    const [estadoReles, setEstadoReles] = useState(null);
    const [sensores, setSensores] = useState(null);

    useEffect(() => {
        fetch('/api/modulos')
            .then((r) => r.json())
            .then((modulos) => {
                setModuloAtuador(modulos.find((m) => m.tipo === 'atuador') ?? null);
                setModuloTelemetria(modulos.find((m) => m.tipo === 'telemetria') ?? null);
            })
            .catch(() => {});
    }, []);

    // Nomes das portas — buscado uma vez so (nao muda a cada poll, so o ESTADO liga/desliga).
    useEffect(() => {
        if (!moduloAtuador) return;
        fetch(`/api/modulos/${moduloAtuador.id}/portas`)
            .then((r) => r.json())
            .then(setPortas)
            .catch(() => {});
    }, [moduloAtuador]);

    useEffect(() => {
        if (!moduloAtuador) return undefined;
        let cancelado = false;
        function atualizar() {
            fetch(`/api/modulos/${moduloAtuador.id}/reles`)
                .then((r) => r.json())
                .then((dados) => !cancelado && setEstadoReles(dados))
                .catch(() => {});
        }
        atualizar();
        const intervalo = setInterval(atualizar, INTERVALO_POLLING_MS);
        return () => {
            cancelado = true;
            clearInterval(intervalo);
        };
    }, [moduloAtuador]);

    useEffect(() => {
        if (!moduloTelemetria) return undefined;
        let cancelado = false;
        function atualizar() {
            fetch(`/api/modulos/${moduloTelemetria.id}/sensores`)
                .then((r) => r.json())
                .then((dados) => !cancelado && setSensores(dados))
                .catch(() => {});
        }
        atualizar();
        const intervalo = setInterval(atualizar, INTERVALO_POLLING_MS);
        return () => {
            cancelado = true;
            clearInterval(intervalo);
        };
    }, [moduloTelemetria]);

    const portasHabilitadas = portas.filter((p) => p.habilitado && p.nomePersonalizado?.trim());

    return (
        <div className="vis-aba">
            <div className="vis-cartao-vidro vis-texto-institucional">
                <h2 className="vis-secao-titulo">
                    <Cpu size={18} /> AquaControl_Brain
                </h2>
                <p>
                    O <strong>AquaControl_Brain</strong> e o cerebro eletronico deste aquario: um sistema de automacao que monitora e
                    controla o ecossistema 24 horas por dia, 7 dias por semana, atraves de uma rede de microcontroladores ESP32
                    distribuidos pela estrutura.
                </p>
                <p>
                    Sensores de temperatura, pH, vazao, nivel de agua e vazamento alimentam o sistema em tempo real, enquanto um
                    conjunto de reles controla com precisao as bombas de recalque, a iluminacao e a esterilizacao UV —{' '}
                    <strong>com destaque para o acionamento automatico do aquecedor a gas de passagem</strong>, que substitui
                    resistencias eletricas tradicionais para aquecer com eficiencia um volume de mais de 1.500 litros. Cada decisao de
                    ligar/desligar segue regras de histerese configuraveis, evitando oscilacoes bruscas e protegendo equipamentos e
                    moradores.
                </p>
            </div>

            <div className="vis-cartao-vidro">
                <h3 className="vis-secao-titulo-pequeno">Sensores — Leitura ao Vivo</h3>
                {!sensores?.disponivel && <p className="vis-texto-secundario">Modulo de telemetria indisponivel no momento.</p>}
                {sensores?.disponivel && (
                    <div className="vis-lista-status">
                        {sensores.sensores.map((sensor) => {
                            const Icone = ICONES_SENSOR[sensor.tipo] ?? Cpu;
                            return (
                                <div key={sensor.id} className={`vis-linha-status ${sensor.conectado ? '' : 'vis-linha-status--offline'}`}>
                                    <Icone size={16} />
                                    <span className="vis-linha-status__nome">{sensor.nome}</span>
                                    <span className="vis-linha-status__valor">
                                        {sensor.conectado ? formatarValorSensor(sensor) : 'Offline'}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="vis-cartao-vidro">
                <h3 className="vis-secao-titulo-pequeno">Atuadores — Status Instantaneo</h3>
                {!estadoReles?.disponivel && <p className="vis-texto-secundario">Modulo de atuadores indisponivel no momento.</p>}
                {estadoReles?.disponivel && (
                    <div className="vis-lista-status">
                        {portasHabilitadas.map((porta) => {
                            const ligado = estadoReles.reles[porta.posicaoIndice] === 1;
                            const ehAquecedorGas = /aquec/i.test(porta.nomePersonalizado);
                            return (
                                <div key={porta.posicaoIndice} className={`vis-linha-status ${ligado ? 'vis-linha-status--ligado' : ''}`}>
                                    {ehAquecedorGas ? <Flame size={16} /> : <Cpu size={16} />}
                                    <span className="vis-linha-status__nome">{porta.nomePersonalizado}</span>
                                    <span className="vis-badge-status">{ligado ? 'LIGADO' : 'DESLIGADO'}</span>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
