const express = require('express');
const { listarModulos, criarModulo, atualizarModulo, deletarModulo } = require('../controllers/modulosController');
const { buscarPortas, salvarPortas } = require('../controllers/portasMapeamentoController');
const { consultarReles, acionarReles, consultarStatusEsp } = require('../controllers/relesController');
const { listarTemas, criarTema } = require('../controllers/temasController');

const router = express.Router();

router.get('/', listarModulos);
router.post('/', criarModulo);
router.put('/:id', atualizarModulo);
router.delete('/:id', deletarModulo);

// Mapeamento das 16 portas (0-15) de um módulo de atuadores — ver
// 01-espc-geral/06_mapeamento_e_widgets_custom.md
router.get('/:id/portas', buscarPortas);
router.put('/:id/portas', salvarPortas);

// Acionamento ao vivo dos 16 relés — fala de verdade com o ESP32 a cada chamada (ver
// 01-espc-geral/07_hardware_mcp23017_handshake.md); diferente de "/portas" acima, que só
// mexe no SQLite.
router.get('/:id/reles', consultarReles);
router.post('/:id/reles', acionarReles);

// GET /api/status do proprio ESP32 (uptime/RSSI/SSID/MCP23017), usado pelo modal de
// diagnostico rapido em Modulos de Controladores.
router.get('/:id/status', consultarStatusEsp);

// Temas (14-espc): grupos nomeados de relés com estado definido, escolhidos a partir do
// Mapeamento de Portas — ver 01-espc-geral/14_menu_de_acoes.md. Deletar/aplicar um tema
// específico ficam em /api/temas/:id (ver temasRoutes.js), já que não dependem do módulo
// na URL (o tema já sabe a qual módulo pertence).
router.get('/:id/temas', listarTemas);
router.post('/:id/temas', criarTema);

module.exports = router;
