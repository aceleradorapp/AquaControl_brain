const express = require('express');
const {
    listarAgendamentos,
    criarAgendamento,
    atualizarAgendamento,
    deletarAgendamento,
    obterHistoricoAutocontrol,
    obterEstadoAgendamentos,
    retomarAgendamento,
} = require('../controllers/agendamentosController');

const router = express.Router();

router.get('/', listarAgendamentos);
router.post('/', criarAgendamento);
router.put('/:id', atualizarAgendamento);
router.delete('/:id', deletarAgendamento);

// Consultas do motor (18-espc) — ver schedulerService.js.
router.get('/historico', obterHistoricoAutocontrol);
router.get('/estado', obterEstadoAgendamentos);
router.post('/retomar', retomarAgendamento);

module.exports = router;
