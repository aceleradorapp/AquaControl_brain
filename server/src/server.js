const express = require('express');
const cors = require('cors');
const { PORT } = require('./config/env');
const routes = require('./routes');
const { iniciarMonitoramento } = require('./services/statusModulosService');
const { iniciarEnvioParaDisplay } = require('./services/telemetriaDisplayService');
const { iniciarSchedulerEngine } = require('./services/schedulerService');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: 'AquaControl_Brain online' });
});

app.use('/api', routes);

app.listen(PORT, () => {
    console.log(`AquaControl_Brain rodando em http://localhost:${PORT}`);
});

// Ping periódico de todos os módulos cadastrados (08-espc) — roda em background,
// independente de qualquer requisição; GET /api/modulos só lê o cache que isso mantém.
iniciarMonitoramento();

// 09-espc: agrega o estado dos relés do atuador e empurra pro Display a cada poucos
// segundos — o Display não fala mais direto com o Hardware, só recebe do Brain.
iniciarEnvioParaDisplay();

// 18-espc: Motor de Agendamento Inteligente — roda um ciclo a cada 10s + a re-sincronização
// completa de boot (self-healing pós-queda de energia). Ver schedulerService.js.
iniciarSchedulerEngine();
