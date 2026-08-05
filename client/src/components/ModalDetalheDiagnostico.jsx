import { useEffect, useState } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import ModalHud from './ModalHud';

// Modal de Detalhe do Diagnostico (31-espc) — aberta ao clicar numa linha de diagnostico no
// System Log (ver TerminalLogs.jsx). Carrega o relatorio SALVO no banco (GET
// /api/diagnostics/:id) referente aquele evento especifico — nao roda um novo diagnostico,
// so mostra o que ja foi gravado naquele momento (agendado ou manual, ver
// diagnosticoService.js no server).

const ROTULOS_STATUS = { pass: 'Sucesso', warning: 'Alerta', fail: 'Falha' };
const ROTULOS_TIPO = { automatico: 'Automático (CRON)', manual: 'Manual' };

function Linha({ ok, texto }) {
    const Icone = ok ? CheckCircle2 : XCircle;
    return (
        <div className={`detalhe-diagnostico__linha ${ok ? 'ok' : 'fail'}`}>
            <Icone size={14} />
            <span>{texto}</span>
        </div>
    );
}

export default function ModalDetalheDiagnostico({ aberto, diagnosticoId, onFechar }) {
    const [diagnostico, setDiagnostico] = useState(null);
    const [carregando, setCarregando] = useState(false);
    const [erro, setErro] = useState(null);

    useEffect(() => {
        if (!aberto || !diagnosticoId) {
            setDiagnostico(null);
            setErro(null);
            return;
        }

        let cancelado = false;
        setCarregando(true);
        setErro(null);
        fetch(`/api/diagnostics/${diagnosticoId}`)
            .then((resposta) => {
                if (!resposta.ok) throw new Error('Diagnostico nao encontrado.');
                return resposta.json();
            })
            .then((dados) => {
                if (!cancelado) setDiagnostico(dados);
            })
            .catch((erroFetch) => {
                if (!cancelado) setErro(erroFetch.message);
            })
            .finally(() => {
                if (!cancelado) setCarregando(false);
            });

        return () => {
            cancelado = true;
        };
    }, [aberto, diagnosticoId]);

    const detalhes = diagnostico?.detalhes;
    const dataFormatada = diagnostico ? new Date(`${diagnostico.criado_em.replace(' ', 'T')}Z`).toLocaleString('pt-BR') : '';

    return (
        <ModalHud aberto={aberto} titulo="Detalhe do Diagnostico" tag={diagnostico ? ROTULOS_STATUS[diagnostico.status] : ''} onFechar={onFechar}>
            {carregando && <p className="hud-tag">Carregando relatorio...</p>}
            {erro && <p className="mensagem-erro hud-tag">{erro}</p>}

            {diagnostico && detalhes && (
                <div className="detalhe-diagnostico">
                    <div className="detalhe-diagnostico__resumo">
                        <span className="hud-tag">Executado em</span>
                        <span className="hud-mono">{dataFormatada}</span>
                        <span className="hud-tag">Tipo</span>
                        <span className="hud-mono">{ROTULOS_TIPO[diagnostico.tipo] ?? diagnostico.tipo}</span>
                        <span className="hud-tag">Status Geral</span>
                        <span className={`detalhe-diagnostico__status detalhe-diagnostico__status--${diagnostico.status}`}>
                            {ROTULOS_STATUS[diagnostico.status] ?? diagnostico.status}
                        </span>
                    </div>

                    <div className="detalhe-diagnostico__secao">
                        <span className="hud-tag detalhe-diagnostico__secao-titulo">Backend &lt;-&gt; Banco de Dados</span>
                        <Linha ok={detalhes.banco} texto={detalhes.banco ? 'Conexao com o banco OK' : 'Falha ao consultar o banco'} />
                    </div>

                    <div className="detalhe-diagnostico__secao">
                        <span className="hud-tag detalhe-diagnostico__secao-titulo">Modulos ESP32</span>
                        {detalhes.modulos.length === 0 && <span className="hud-tag">Nenhum modulo cadastrado.</span>}
                        {detalhes.modulos.map((modulo) => (
                            <Linha key={modulo.id} ok={modulo.online} texto={`${modulo.nome} (${modulo.ip}) — ${modulo.online ? 'Online' : 'Offline'}`} />
                        ))}
                    </div>

                    <div className="detalhe-diagnostico__secao">
                        <span className="hud-tag detalhe-diagnostico__secao-titulo">Integridade dos Sensores</span>
                        {!detalhes.sensores?.disponivel && <Linha ok={false} texto="Modulo de telemetria inacessivel no momento do diagnostico." />}
                        {detalhes.sensores?.disponivel && (
                            <>
                                <Linha
                                    ok={detalhes.sensores.foraDaFaixa.length === 0}
                                    texto={`${detalhes.sensores.conectados}/${detalhes.sensores.total} sensores conectados`}
                                />
                                {detalhes.sensores.foraDaFaixa.map((s) => (
                                    <Linha key={s.id} ok={false} texto={`${s.nome} com leitura fora da faixa plausivel (${s.valor})`} />
                                ))}
                            </>
                        )}
                    </div>

                    <div className="detalhe-diagnostico__secao">
                        <span className="hud-tag detalhe-diagnostico__secao-titulo">Reles / Atuadores</span>
                        {detalhes.modulos.filter((m) => m.tipo === 'atuador').length === 0 && (
                            <span className="hud-tag">Nenhum modulo atuador cadastrado.</span>
                        )}
                        {detalhes.modulos
                            .filter((m) => m.tipo === 'atuador')
                            .map((modulo) => (
                                <Linha key={modulo.id} ok={modulo.online} texto={`${modulo.nome} — ${modulo.online ? 'Respondendo' : 'Sem resposta'}`} />
                            ))}
                    </div>
                </div>
            )}
        </ModalHud>
    );
}
