const express = require('express');
const modulosRoutes = require('./modulosRoutes');
const qrcodesRoutes = require('./qrcodesRoutes');
const panicoRoutes = require('./panicoRoutes');
const configDisplayRoutes = require('./configDisplayRoutes');
const { obterPersonalizacoes, salvarPersonalizacoes } = require('../controllers/sensoresPersonalizadosController');
const temasRoutes = require('./temasRoutes');
const agendamentosRoutes = require('./agendamentosRoutes');
const timersRoutes = require('./timersRoutes');
const { listarDispositivosAtuais } = require('../controllers/dispositivosController');
const { obterHistoricoReles } = require('../controllers/historicoRelesController');
const relatoriosRoutes = require('./relatoriosRoutes');
const configuracoesRoutes = require('./configuracoesRoutes');
const sistemaRoutes = require('./sistemaRoutes');
const { obterLogs } = require('../controllers/logsController');
const { obterDiagnosticoPorId, executarDiagnosticoManual } = require('../controllers/diagnosticosController');
const {
    status: statusAuth,
    registrar: registrarAuth,
    login: loginAuth,
    verificar: verificarAuth,
    validarMasterKeyRota,
    obterConfiguracoesAuth,
    salvarConfiguracoesAuth,
    listarUsuarios,
    criarUsuario,
    editarUsuario,
    excluirUsuario,
} = require('../controllers/authController');
const { listarFauna, criarFauna, editarFauna, excluirFauna } = require('../controllers/faunaController');
const { exigirAutenticacao } = require('../middlewares/autenticacao');

const router = express.Router();

router.use('/modulos', modulosRoutes);
router.use('/qrcodes', qrcodesRoutes);
router.use('/panico', panicoRoutes);
router.use('/config-display', configDisplayRoutes);

// 29-espc: a rota "/config-display-sensores" (selecao de quais sensores, no maximo 6,
// apareciam na tela do Display) foi removida — o AquaControl_OS nao gerencia mais uma
// selecao individual de exibicao (ver telemetriaDisplayService.js), e o widget do dashboard
// que a configurava virou "Sensores do Sistema", uma listagem automatica sem selecao manual.
// A tabela "config_display_sensores" continua no schema (nao foi dropada, so parou de ser
// escrita/lida por qualquer rota) — ver server/src/database/migrate.js.

// 16-espc: nomes personalizados por sensor (geral + "só pro Display") — ver
// sensoresPersonalizadosController.js.
router.get('/sensores-personalizados', obterPersonalizacoes);
router.put('/sensores-personalizados', salvarPersonalizacoes);
router.use('/temas', temasRoutes);

// Motor de Agendamento, Timers Rapidos e Overrides (18-espc) — ver schedulerService.js
router.use('/agendamentos', agendamentosRoutes);
router.use('/timers', timersRoutes);

// Snapshot sob demanda pro boot-sync do Display (09-espc) — ver dispositivosController.js
router.get('/dispositivos-atuais', listarDispositivosAtuais);

// Historico de acionamento dos reles (13-espc) — ver historicoRelesController.js
router.get('/historico-reles', obterHistoricoReles);

// Central de Relatorios e Analises (17-espc) — ver relatoriosService.js/relatoriosController.js
router.use('/relatorios', relatoriosRoutes);

// Configuracoes Globais do Sistema (19-espc) — ver configuracoesGeraisController.js/
// equipamentosAutomacaoController.js/automacaoEquipamentosService.js.
router.use('/configuracoes', configuracoesRoutes);

// Self-Update do sistema (git pull + npm install + build + pm2 restart, 1 clique) — ver
// sistemaController.js/sistemaService.js/server/scripts/atualizar-sistema.sh.
router.use('/sistema', sistemaRoutes);

// System Log persistido + Diagnostico Completo agendado/manual (31-espc) — ver
// logService.js/diagnosticoService.js. "/diagnostics/executar" precisa vir ANTES de
// "/diagnostics/:id", senao o Express tentaria casar "executar" como um :id.
router.get('/logs', obterLogs);
router.post('/diagnostics/executar', executarDiagnosticoManual);
router.get('/diagnostics/:id', obterDiagnosticoPorId);

// Autenticacao por Dispositivo / Modo Visitante (33-espc) — ver authService.js/
// authController.js. NAO protege nenhuma outra rota desta lista (decisao explicita: so
// controla qual TELA o front mostra, nao um middleware de autorizacao de verdade ainda).
router.get('/auth/status', statusAuth);
router.post('/auth/registrar', registrarAuth);
router.post('/auth/login', loginAuth);
router.get('/auth/verificar', verificarAuth);
router.post('/auth/master-key', validarMasterKeyRota);
router.get('/auth/configuracoes', obterConfiguracoesAuth);
router.put('/auth/configuracoes', salvarConfiguracoesAuth);

// Gerenciamento de usuarios ADM (34-espc) — listar/criar/editar/bloquear/excluir. MESMA
// ressalva de cima: sem middleware de autorizacao ainda, quem souber a URL consegue chamar
// direto (decisao ja tomada no 33-espc, mantida aqui por consistencia).
router.get('/auth/usuarios', listarUsuarios);
router.post('/auth/usuarios', criarUsuario);
router.put('/auth/usuarios/:id', editarUsuario);
router.delete('/auth/usuarios/:id', excluirUsuario);

// Gestao de Fauna (35-espc, especificacao numerada como "34") — GET publico (Aba "Moradores"
// da Pagina de Visitante), escrita protegida por JWT (pedido EXPLICITO desta especificacao —
// ver middlewares/autenticacao.js, a PRIMEIRA protecao de verdade deste projeto).
router.get('/fauna', listarFauna);
router.post('/fauna', exigirAutenticacao, criarFauna);
router.put('/fauna/:id', exigirAutenticacao, editarFauna);
router.delete('/fauna/:id', exigirAutenticacao, excluirFauna);

module.exports = router;
