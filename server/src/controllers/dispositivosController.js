const { obterDispositivosAtuais } = require('../services/telemetriaDisplayService');

// GET /api/dispositivos-atuais — snapshot sob demanda do estado atual dos dispositivos
// (09-espc). O Display chama isso uma unica vez no boot (com timeout curto no client) pra
// nao esperar ate 3s pelo proximo ciclo do push periodico (telemetriaDisplayService.js) so
// pra pintar o HUD com dados reais na primeira tela. Sem atuador cadastrado ainda, retorna
// uma lista vazia (nunca erro) — o Display trata isso como "HUD comeca vazio", igual a
// qualquer outra falha de sincronizacao.
async function listarDispositivosAtuais(req, res) {
    const dispositivos = await obterDispositivosAtuais();
    res.json({ dispositivos });
}

module.exports = { listarDispositivosAtuais };
