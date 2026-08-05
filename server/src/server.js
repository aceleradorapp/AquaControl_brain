const path = require('path');
const express = require('express');
const cors = require('cors');
const { Bonjour } = require('bonjour-service');
const { PORT } = require('./config/env');
const routes = require('./routes');
const { iniciarMonitoramento } = require('./services/statusModulosService');
const { iniciarMonitoramentoSensores } = require('./services/sensoresTelemetriaService');
const { iniciarEnvioParaDisplay } = require('./services/telemetriaDisplayService');
const { iniciarSchedulerEngine } = require('./services/schedulerService');
const { iniciarAutomacaoEquipamentos } = require('./services/automacaoEquipamentosService');
const { iniciarManutencao } = require('./services/manutencaoService');
const { iniciarDiagnosticoAgendado } = require('./services/diagnosticoService');
const { iniciarAgendamentoConsumoEnergia } = require('./services/energiaService');
const { iniciarMotorTempestade } = require('./services/tempestadeService');

const app = express();

app.use(cors());
// Limite padrao do express.json() e 100kb — pequeno demais desde que Gestao de Fauna passou a
// mandar a foto recortada como um data: URL JPEG dentro do corpo JSON (ModalCortarImagem.jsx,
// sem endpoint de upload/multipart dedicado). 5mb da folga generosa pra isso (o recorte sai
// bem menor, ~100-300KB tipicamente) sem deixar o limite gigante à toa.
app.use(express.json({ limit: '5mb' }));

app.use('/api', routes);

// Acesso pela rede local (24-espc): serve o BUILD DE PRODUCAO do client (client/dist), nao o
// Vite dev server — assim o dashboard fica disponivel num unico endereco/porta pra qualquer
// dispositivo na LAN, sem depender do Vite (que so aceita conexoes do proprio PC por padrao).
// Rodar `npm run build` no client sempre que o front-end mudar, pra este build atualizar.
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

// SPA fallback — sem react-router (todo "screen" e modal, ver CLAUDE.md), mas mantem
// qualquer GET fora de /api caindo no index.html (ex.: dar F5 numa URL que nao seja a raiz).
app.get(/^(?!\/api).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`AquaControl_Brain rodando em http://localhost:${PORT}`);
});

// Nome amigavel na rede local (24-espc): anuncia "aquacontrol.local" via mDNS/Bonjour — a
// maioria dos dispositivos (celular, Mac, Linux, Windows 10+) resolve isso sozinho, sem
// instalar nada, permitindo abrir http://aquacontrol.local:PORT em vez de digitar o IP.
const bonjour = new Bonjour();
bonjour.publish({ name: 'AquaControl Brain', type: 'http', port: Number(PORT), host: 'aquacontrol.local' });

function encerrarBonjour() {
    bonjour.unpublishAll(() => {
        bonjour.destroy();
        process.exit(0);
    });
}
process.on('SIGINT', encerrarBonjour);
process.on('SIGTERM', encerrarBonjour);

// Ping periódico de todos os módulos cadastrados (08-espc) — roda em background,
// independente de qualquer requisição; GET /api/modulos só lê o cache que isso mantém.
iniciarMonitoramento();

// 16-espc: le os 7 sensores reais (AquaControl_sensor) a cada poucos segundos e mantém em
// cache/histórico — INDEPENDENTE de quem está de olho no dashboard.
iniciarMonitoramentoSensores();

// 09-espc (16-espc: agora sensores reais, não mais relés/simulação): empurra o snapshot
// atual pro Display a cada poucos segundos, só quando o payload muda de verdade — o Display
// não fala mais direto com o Hardware, só recebe do Brain.
iniciarEnvioParaDisplay();

// 18-espc: Motor de Agendamento Inteligente — roda um ciclo a cada 10s + a re-sincronização
// completa de boot (self-healing pós-queda de energia). Ver schedulerService.js.
iniciarSchedulerEngine();

// 19-espc: Motor de Automacao de Equipamentos (termostatos por histerese, configurados em
// Configuracoes -> Atuadores & Automacao) — ver automacaoEquipamentosService.js.
iniciarAutomacaoEquipamentos();

// 19-espc: retencao/limpeza de historico antigo (config em Configuracoes -> Armazenamento) —
// ver manutencaoService.js.
iniciarManutencao();

// 31-espc: Diagnostico Completo agendado (1x por hora) + registro no System Log — ver
// diagnosticoService.js. O mesmo checklist tambem pode ser disparado na hora via
// POST /api/diagnostics/executar (botao na Central de Diagnostico).
iniciarDiagnosticoAgendado();

// 36-espc: fecha o dia de consumo de energia estimado (backfill + catch-up + continuacao,
// tudo na mesma rotina) no boot, e a cada 3h dai em diante — ver energiaService.js.
iniciarAgendamentoConsumoEnergia();

// 35-espc: Motor do Tema Tempestade — dispara raios aleatorios enquanto um tema
// tipo_efeito='tempestade' estiver ativo (manual/timer/agendamento) — ver tempestadeService.js.
iniciarMotorTempestade();
