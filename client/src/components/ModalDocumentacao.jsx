import { Printer } from 'lucide-react';
import ModalHud from './ModalHud';
import DiagramaPinagemESP32 from './DiagramaPinagemESP32';
import { MODULOS_ESP32, ESTRUTURA_PROJETOS, PASSOS_ONBOARDING } from '../utils/documentacaoDados';
import '../styles/documentacao.css';

// Documentacao Tecnica Interativa (26-espc, ver 01-espc-geral/26_documentacao_sistema_painel_web.md)
// — pagina de referencia do ecossistema inteiro, deliberadamente FORA do tema Sci-Fi do resto
// do dashboard ("Clean/Paper Style": fundo branco, texto escuro, alto contraste) porque o
// objetivo aqui e legibilidade tecnica/impressao, nao a estetica do HUD. Segue o mesmo padrao
// "todo full-screen e um modal" do resto do projeto (sem react-router).
//
// Exportar em PDF (26-espc): window.print() + CSS @media print (ver styles/documentacao.css),
// MESMA abordagem ja usada na Central de Relatorios (17-espc) — nenhuma lib nova (jspdf/
// html2pdf) so pra isso, o navegador ja faz esse trabalho nativamente.
const SECOES = [
    { id: 'doc-visao-geral', titulo: 'Visao Geral do Ecossistema' },
    { id: 'doc-onboarding', titulo: 'Onboarding: Novo ESP32' },
    { id: 'doc-estrutura', titulo: 'Estrutura de Diretorios' },
    { id: 'doc-modulos', titulo: 'Modulos do Sistema (Pinagem)' },
    ...MODULOS_ESP32.map((m) => ({ id: `doc-modulo-${m.chave}`, titulo: m.nome, sub: true })),
    { id: 'doc-brain', titulo: 'AquaControl_Brain' },
];

function irPara(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function exportarPdf() {
    window.print();
}

export default function ModalDocumentacao({ aberto, onFechar }) {
    return (
        <ModalHud aberto={aberto} titulo="Documentacao Tecnica" tag="ECOSSISTEMA AQUACONTROL" onFechar={onFechar} largura="cheia">
            <div className="documentacao-paper" id="documentacao-para-imprimir">
                <div className="documentacao-paper__topo documentacao-paper__sem-impressao">
                    <p className="documentacao-paper__topo-texto">
                        Guia tecnico centralizado do ecossistema AquaControl — onboarding de modulos, mapeamento de codigo e
                        pinagem de cada placa.
                    </p>
                    <button className="documentacao-paper__botao-pdf" type="button" onClick={exportarPdf}>
                        <Printer size={16} />
                        Exportar em PDF
                    </button>
                </div>

                <div className="documentacao-paper__corpo">
                    <nav className="documentacao-paper__sumario documentacao-paper__sem-impressao">
                        <span className="documentacao-paper__sumario-titulo">Sumario</span>
                        {SECOES.map((s) => (
                            <button
                                key={s.id}
                                type="button"
                                className={`documentacao-paper__sumario-item ${s.sub ? 'documentacao-paper__sumario-item--sub' : ''}`}
                                onClick={() => irPara(s.id)}
                            >
                                {s.titulo}
                            </button>
                        ))}
                    </nav>

                    <div className="documentacao-paper__conteudo">
                        {/* ==================== 1. VISAO GERAL ==================== */}
                        <section id="doc-visao-geral" className="documentacao-paper__secao">
                            <h1>Documentacao Tecnica — Ecossistema AquaControl</h1>
                            <p>
                                O AquaControl e um sistema de automacao de aquario composto por <strong>4 projetos
                                independentes</strong>, cada um construido/gravado/executado separadamente: 3 firmwares de
                                ESP32 (PlatformIO/Arduino) e 1 backend+painel web (Node.js/Express + React). Nenhum ESP32
                                fala diretamente com outro — o <strong>AquaControl_Brain</strong> e sempre o intermediario.
                            </p>
                            <table className="documentacao-paper__tabela">
                                <thead>
                                    <tr>
                                        <th>Projeto</th>
                                        <th>Papel</th>
                                        <th>IP fixo</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td>AquaControl_Brain</td>
                                        <td>Backend (API + banco SQLite) e painel web React — a fonte de verdade de tudo</td>
                                        <td>IP da maquina onde roda (sem IP fixo proprio)</td>
                                    </tr>
                                    {MODULOS_ESP32.map((m) => (
                                        <tr key={m.chave}>
                                            <td>{m.nome}</td>
                                            <td>{m.apelido}</td>
                                            <td>
                                                <code>{m.ip}</code>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <p>
                                Fluxo de dados: cada ESP32 expoe uma API HTTP propria (sensores/reles/status); o Brain faz
                                polling periodico em background, guarda historico em SQLite, e repassa pro Display os dados
                                ja formatados. O Display nunca busca dado nenhum sozinho.
                            </p>
                        </section>

                        {/* ==================== 2. ONBOARDING ==================== */}
                        <section id="doc-onboarding" className="documentacao-paper__secao">
                            <h2>Onboarding: Como Cadastrar um Novo ESP32</h2>
                            <p>
                                Passo a passo pra provisionar um modulo novo do zero, na ordem em que cada etapa realmente
                                depende da anterior.
                            </p>
                            <ol className="documentacao-paper__passos">
                                {PASSOS_ONBOARDING.map((passo) => (
                                    <li key={passo.titulo}>
                                        <strong>{passo.titulo}</strong>
                                        <p>{passo.corpo}</p>
                                    </li>
                                ))}
                            </ol>
                        </section>

                        {/* ==================== 3. ESTRUTURA DE DIRETORIOS ==================== */}
                        <section id="doc-estrutura" className="documentacao-paper__secao">
                            <h2>Estrutura de Diretorios dos Projetos</h2>
                            {ESTRUTURA_PROJETOS.map((projeto) => (
                                <div key={projeto.nome} className="documentacao-paper__projeto">
                                    <h3>{projeto.nome}</h3>
                                    <p className="documentacao-paper__tipo-projeto">{projeto.tipo}</p>
                                    <p>{projeto.descricao}</p>
                                    <pre className="documentacao-paper__arvore">{projeto.arvore.join('\n')}</pre>
                                </div>
                            ))}
                        </section>

                        {/* ==================== 4. MODULOS DO SISTEMA (PINAGEM) ==================== */}
                        <section id="doc-modulos" className="documentacao-paper__secao">
                            <h2>Modulos do Sistema — Detalhamento Tecnico e Pinagem</h2>
                            <p>
                                Pinagem confirmada direto no codigo-fonte de cada firmware (nao presumida) — se um pino
                                mudar no projeto, esta tabela precisa ser atualizada manualmente, nada aqui e gerado
                                automaticamente a partir do codigo.
                            </p>
                            {MODULOS_ESP32.map((modulo) => (
                                <div key={modulo.chave} id={`doc-modulo-${modulo.chave}`} className="documentacao-paper__modulo">
                                    <h3>
                                        {modulo.nome} <span className="documentacao-paper__apelido">— {modulo.apelido}</span>
                                    </h3>
                                    <table className="documentacao-paper__tabela documentacao-paper__tabela--compacta">
                                        <tbody>
                                            <tr>
                                                <td>
                                                    <strong>IP fixo</strong>
                                                </td>
                                                <td>
                                                    <code>{modulo.ip}</code>
                                                </td>
                                                <td>
                                                    <strong>Hostname</strong>
                                                </td>
                                                <td>
                                                    <code>{modulo.hostname}</code>
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    <p>{modulo.descricao}</p>

                                    <DiagramaPinagemESP32
                                        nomePlaca="ESP32 DevKit"
                                        pinosEsquerda={modulo.pinosEsquerda}
                                        pinosDireita={modulo.pinosDireita}
                                    />

                                    <table className="documentacao-paper__tabela">
                                        <thead>
                                            <tr>
                                                <th>Pino ESP32</th>
                                                <th>Funcao / Sinal</th>
                                                <th>Sensor / Componente</th>
                                                <th>Tensao</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {[...modulo.pinosEsquerda, ...modulo.pinosDireita].map((p) => (
                                                <tr key={p.pino + p.componente}>
                                                    <td>
                                                        <code>{p.pino}</code>
                                                    </td>
                                                    <td>{p.sinal}</td>
                                                    <td>{p.componente}</td>
                                                    <td>{p.tensao}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {modulo.observacoes.length > 0 && (
                                        <>
                                            <p className="documentacao-paper__rotulo-observacoes">Observacoes</p>
                                            <ul>
                                                {modulo.observacoes.map((o) => (
                                                    <li key={o}>{o}</li>
                                                ))}
                                            </ul>
                                        </>
                                    )}

                                    <p className="documentacao-paper__caminho-codigo">
                                        Codigo: <code>{modulo.caminhoCodigo}</code>
                                    </p>
                                </div>
                            ))}
                        </section>

                        {/* ==================== 5. BRAIN ==================== */}
                        <section id="doc-brain" className="documentacao-paper__secao">
                            <h2>AquaControl_Brain — Backend e Painel Web</h2>
                            <p>
                                Nao e um ESP32, mas e o 4º projeto do ecossistema e o unico ponto de integracao entre todos
                                os outros. Roda como um processo Node.js (Express) servindo tanto a API REST quanto o
                                build de producao do painel React (arquivos estaticos).
                            </p>
                            <p className="documentacao-paper__tipo-projeto">Node.js/Express (server) + React/Vite (client)</p>
                            <ul>
                                <li>
                                    <strong>routes/</strong> — so conecta metodo+caminho HTTP a um controller, sem logica
                                    propria.
                                </li>
                                <li>
                                    <strong>controllers/</strong> — parseia a requisicao, chama services, formata a
                                    resposta HTTP.
                                </li>
                                <li>
                                    <strong>services/</strong> — a logica de verdade: polling em background dos 3 ESP32,
                                    motor de agendamento, relatorios, manutencao de historico.
                                </li>
                                <li>
                                    <strong>database/</strong> — SQLite via <code>node:sqlite</code> nativo (sem
                                    ORM/better-sqlite3); <code>migrate.js</code> roda automaticamente a cada boot.
                                </li>
                                <li>
                                    <strong>client/src/components/</strong> — <code>Dashboard.jsx</code> concentra quase
                                    todo o estado; o resto dos componentes recebe tudo via props.
                                </li>
                            </ul>
                            <p>
                                Sem <code>react-router</code>: toda tela "cheia" deste painel (Relatorios, Configuracoes,
                                Diagnostico, e esta propria pagina de Documentacao) e um modal full-screen, nao uma rota
                                separada.
                            </p>
                        </section>
                    </div>
                </div>
            </div>
        </ModalHud>
    );
}
