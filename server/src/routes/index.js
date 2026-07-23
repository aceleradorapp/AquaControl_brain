const express = require('express');
const modulosRoutes = require('./modulosRoutes');
const qrcodesRoutes = require('./qrcodesRoutes');
const panicoRoutes = require('./panicoRoutes');
const configDisplayRoutes = require('./configDisplayRoutes');
const temasRoutes = require('./temasRoutes');
const agendamentosRoutes = require('./agendamentosRoutes');
const timersRoutes = require('./timersRoutes');
const { listarDispositivosAtuais } = require('../controllers/dispositivosController');
const { obterHistoricoReles } = require('../controllers/historicoRelesController');

const router = express.Router();

router.use('/modulos', modulosRoutes);
router.use('/qrcodes', qrcodesRoutes);
router.use('/panico', panicoRoutes);
router.use('/config-display', configDisplayRoutes);
router.use('/temas', temasRoutes);

// Motor de Agendamento, Timers Rapidos e Overrides (18-espc) — ver schedulerService.js
router.use('/agendamentos', agendamentosRoutes);
router.use('/timers', timersRoutes);

// Snapshot sob demanda pro boot-sync do Display (09-espc) — ver dispositivosController.js
router.get('/dispositivos-atuais', listarDispositivosAtuais);

// Historico de acionamento dos reles (13-espc) — ver historicoRelesController.js
router.get('/historico-reles', obterHistoricoReles);

module.exports = router;
