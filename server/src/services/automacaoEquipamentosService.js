// Motor de Automacao de Equipamentos (19-espc) — termostato por histerese pra aquecedores/
// resfriadores independentes, configurados em "Configuracoes Globais -> Atuadores &
// Automacao" (ver equipamentosAutomacaoController.js). Roda em background (mesmo padrao de
// schedulerService.js: setInterval, ciclo curto), lendo a ultima leitura de sensores em cache
// (sensoresTelemetriaService.js, sem fazer fetch proprio) e aplicando os reles atraves do
// MESMO service compartilhado que o clique manual/Temas usam (relesService.js) — reaproveita
// de graca a regra de seguranca "porta desabilitada nunca liga" e o registro no historico.
const db = require('../database/db');
const { aplicarRelesNoModulo, buscarModulo } = require('./relesService');
const { obterUltimaLeitura } = require('./sensoresTelemetriaService');
const { registrarLog } = require('./logService');

const INTERVALO_MS = 10000;
const TIMEOUT_MS = 4000;

// sensor_id -> { alvo: bool, desde: epoch ms } — condicao de troca pendente aguardando
// "atraso_segundos" antes de agir de verdade (debounce contra picos passageiros de leitura).
// Chave por equipamento.id, nao por sensor, ja que 2 equipamentos podem observar o mesmo sensor.
const debouncePorEquipamento = new Map();

function registrarEvento(moduloId, equipamento, ligou, temperatura) {
    db.prepare('INSERT INTO historico_autocontrol (modulo_id, evento, origem, detalhes) VALUES (?, ?, ?, ?)').run(
        moduloId,
        ligou ? 'TERMOSTATO_LIGOU' : 'TERMOSTATO_DESLIGOU',
        'termostato',
        `${equipamento.nome} (${equipamento.tipo}): ${ligou ? 'ligado' : 'desligado'} — sensor ${equipamento.sensor_id} = ${temperatura}, faixa configurada ${equipamento.temp_min}-${equipamento.temp_max}`
    );

    // 31-espc: System Log (2.1 da especificação) — mensagem MAIS RICA que a generica de
    // historicoRelesService.js (inclui a temperatura que disparou a troca, ver exemplo na
    // especificacao: "Aquecedor LIGADO (Automatico - Temp: 20.5°C)"), por isso
    // historicoRelesService.js pula o caso origem==='automatico' de proposito — sem isso,
    // a MESMA troca de rele apareceria duas vezes no log (uma generica, uma rica).
    registrarLog(
        `${equipamento.nome} ${ligou ? 'LIGADO' : 'DESLIGADO'} (Automático - Temp: ${temperatura}°C)`,
        ligou ? 'sucesso' : 'alerta',
        'atuador',
        null,
        'automatico'
    );
}

async function obterEstadoAtualDosReles(modulo) {
    try {
        const resposta = await fetch(`http://${modulo.ip}/api/reles`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!resposta.ok) return null;
        const dados = await resposta.json();
        return Array.isArray(dados.reles) ? dados.reles : null;
    } catch {
        return null;
    }
}

async function cicloAutomacao() {
    const equipamentos = db.prepare('SELECT * FROM equipamentos_automacao WHERE ativo = 1').all();
    if (equipamentos.length === 0) return;

    const leitura = obterUltimaLeitura();
    if (!leitura?.disponivel) return; // sem leitura fresca de sensores, nao arrisca decidir as cegas
    const sensorPorId = new Map(leitura.sensores.map((s) => [s.id, s]));

    const porModulo = new Map();
    for (const equipamento of equipamentos) {
        if (!porModulo.has(equipamento.modulo_id)) porModulo.set(equipamento.modulo_id, []);
        porModulo.get(equipamento.modulo_id).push(equipamento);
    }

    for (const [moduloId, lista] of porModulo) {
        const modulo = buscarModulo(moduloId);
        if (!modulo) continue;

        const estadoAtual = await obterEstadoAtualDosReles(modulo);
        if (!estadoAtual) continue; // modulo inacessivel agora, tenta de novo no proximo ciclo

        const novoEstado = [...estadoAtual];
        let mudouAlgo = false;

        for (const equipamento of lista) {
            const sensor = sensorPorId.get(equipamento.sensor_id);
            if (!sensor || !sensor.conectado || typeof sensor.valor !== 'number') continue; // sensor offline: nao decide as cegas

            const temperatura = sensor.valor;
            const ligadoAgora = estadoAtual[equipamento.posicao_indice] === 1;

            // Histerese: "aquecedor" liga abaixo do minimo, desliga acima do maximo;
            // "resfriador" e o espelho (liga acima do maximo, desliga abaixo do minimo).
            // Entre os dois limites, mantem o estado atual de proposito.
            const deveriaLigar = equipamento.tipo === 'aquecedor' ? temperatura < equipamento.temp_min : temperatura > equipamento.temp_max;
            const deveriaDesligar = equipamento.tipo === 'aquecedor' ? temperatura > equipamento.temp_max : temperatura < equipamento.temp_min;

            let alvo = ligadoAgora;
            if (deveriaLigar) alvo = true;
            else if (deveriaDesligar) alvo = false;

            if (alvo === ligadoAgora) {
                debouncePorEquipamento.delete(equipamento.id);
                continue;
            }

            const agora = Date.now();
            const pendente = debouncePorEquipamento.get(equipamento.id);
            if (!pendente || pendente.alvo !== alvo) {
                debouncePorEquipamento.set(equipamento.id, { alvo, desde: agora });
                continue; // comeca a contar o atraso agora — so age se persistir nos proximos ciclos
            }
            if (agora - pendente.desde < equipamento.atraso_segundos * 1000) {
                continue; // ainda dentro do periodo de atraso/debounce
            }

            novoEstado[equipamento.posicao_indice] = alvo ? 1 : 0;
            mudouAlgo = true;
            debouncePorEquipamento.delete(equipamento.id);
            registrarEvento(moduloId, equipamento, alvo, temperatura);
        }

        if (mudouAlgo) {
            await aplicarRelesNoModulo(moduloId, novoEstado, 'automatico');
        }
    }
}

function iniciarAutomacaoEquipamentos() {
    cicloAutomacao();
    setInterval(cicloAutomacao, INTERVALO_MS);
}

module.exports = { iniciarAutomacaoEquipamentos };
