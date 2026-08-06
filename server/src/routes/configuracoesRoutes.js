const express = require('express');
const {
    obterConfiguracoesGerais,
    salvarConfiguracoesGerais,
    calibrarOffsetNivelUltrassom,
    obterFaixasSeguras,
    salvarFaixasSeguras,
    obterCalibracaoFluxo,
    salvarCalibracaoFluxo,
    gerarBackup,
    restaurarBackup,
} = require('../controllers/configuracoesGeraisController');
const { listar, criar, atualizar, remover } = require('../controllers/equipamentosAutomacaoController');

const router = express.Router();

// Configuracoes Globais do Sistema (19-espc) — ver configuracoesGeraisController.js.
router.get('/', obterConfiguracoesGerais);
router.put('/', salvarConfiguracoesGerais);

// Calibracao do Nivel por Ultrassom (39-espc) — botao "Calibrar Nivel Maximo (Zerar)" em
// Sensores & Telemetria: le a distancia AO VIVO do sensor e salva como offset.
router.post('/calibrar-nivel-ultrassom', calibrarOffsetNivelUltrassom);

router.get('/faixas-seguras', obterFaixasSeguras);
router.put('/faixas-seguras', salvarFaixasSeguras);

// Calibracao de Vazao do fluxometro (24-espc) — ver configuracoesGeraisController.js.
router.get('/calibracao-fluxo', obterCalibracaoFluxo);
router.put('/calibracao-fluxo', salvarCalibracaoFluxo);

router.get('/backup', gerarBackup);
router.post('/restaurar', restaurarBackup);

// Equipamentos & Automacao (termostatos por histerese) — ver equipamentosAutomacaoController.js
// e automacaoEquipamentosService.js (motor que roda em background).
router.get('/equipamentos', listar);
router.post('/equipamentos', criar);
router.put('/equipamentos/:id', atualizar);
router.delete('/equipamentos/:id', remover);

module.exports = router;
