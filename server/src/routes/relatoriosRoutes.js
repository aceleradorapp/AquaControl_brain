const express = require('express');
const { telemetria, consumoAgua, automacao, alertas, energia, sensorHistorico } = require('../controllers/relatoriosController');

const router = express.Router();

// Central de Relatorios e Analises (17-espc) — uma rota por aba, todas aceitando
// ?inicio=<ISO>&fim=<ISO> (default: ultimos 7 dias) — ver relatoriosController.js.
router.get('/telemetria', telemetria);
router.get('/consumo-agua', consumoAgua);
router.get('/automacao', automacao);
router.get('/alertas', alertas);
router.get('/energia', energia); // 36-espc

// Historico recente de um sensor (23-espc, Central de Diagnostico) — ver
// ModalDetalheSensor.jsx.
router.get('/sensor-historico', sensorHistorico);

module.exports = router;
