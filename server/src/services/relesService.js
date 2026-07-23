// Lógica compartilhada de "aplicar um array de 16 posições no módulo de verdade" (14-espc)
// — usada tanto pelo acionamento direto (relesController.js: clique numa porta, Ligar/
// Desligar Todos) quanto pela aplicação de um Tema (temasController.js). Ter isso num só
// lugar garante que as MESMAS regras de segurança (portas bloqueadas nunca ligam) e de
// histórico valem pra qualquer caminho que acione um relé, sem duplicar a lógica.
const db = require('../database/db');
const { registrarMudancas } = require('./historicoRelesService');

const TIMEOUT_MS = 4000;

function buscarModulo(id) {
    return db.prepare('SELECT * FROM modulos WHERE id = ?').get(id);
}

// Aplica "relesRecebidos" (array de 16 posições) no ESP32 de verdade:
// 1. Zera qualquer porta desabilitada ("Oculta" no Mapeamento de Saidas) ANTES de mandar —
//    defesa em profundidade, nunca aciona fisicamente uma porta bloqueada, não importa quem
//    chamou isso (clique direto, Ligar/Desligar Todos, ou um Tema).
// 2. Lê o estado atual do ESP (se conseguir) só pra registrar no histórico exatamente quais
//    portas mudaram de verdade.
// 3. Envia o array corrigido pro ESP e, se der certo, grava o histórico e devolve o array
//    aplicado.
// Retorna { ok: true, reles } em sucesso, ou { ok: false, motivo } em qualquer falha —
// nunca lança exceção (quem chama decide como transformar isso numa resposta HTTP).
async function aplicarRelesNoModulo(moduloId, relesRecebidos, origem = 'manual', detalhe = null) {
    const modulo = buscarModulo(moduloId);
    if (!modulo) {
        return { ok: false, motivo: 'Modulo nao encontrado.' };
    }

    const portas = db.prepare('SELECT posicao_indice, habilitado FROM portas_mapeamento WHERE modulo_id = ?').all(moduloId);
    const desabilitadas = new Set(portas.filter((p) => !p.habilitado).map((p) => p.posicao_indice));
    const reles = relesRecebidos.map((valor, indice) => (desabilitadas.has(indice) ? 0 : valor));

    let estadoAnterior = null;
    try {
        const respostaAtual = await fetch(`http://${modulo.ip}/api/reles`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (respostaAtual.ok) {
            const dadosAtuais = await respostaAtual.json();
            if (Array.isArray(dadosAtuais.reles)) estadoAnterior = dadosAtuais.reles;
        }
    } catch {
        // segue sem histórico deste acionamento se não conseguir ler o estado anterior
    }

    try {
        const resposta = await fetch(`http://${modulo.ip}/api/reles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reles }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!resposta.ok) throw new Error(`ESP respondeu HTTP ${resposta.status}`);
        await resposta.json();

        if (estadoAnterior) registrarMudancas(Number(moduloId), estadoAnterior, reles, origem, detalhe);

        return { ok: true, reles };
    } catch (erro) {
        return { ok: false, motivo: `Nao foi possivel falar com o modulo em ${modulo.ip}: ${erro.message}` };
    }
}

module.exports = { aplicarRelesNoModulo, buscarModulo };
