// 09-espc: o Display deixou de falar direto com o Hardware — agora o Brain e o
// intermediario. Este servico roda em background (mesmo padrao de statusModulosService.js:
// setInterval, cache-free, cada ciclo busca dados frescos) e faz duas coisas a cada
// INTERVALO_MS: (1) busca o estado dos 16 reles no primeiro modulo "atuador" cadastrado,
// (2) monta isso no formato "dispositivos" que o firmware do Display ja sabe interpretar
// (DispositivoManager::atualizarDeJson, inalterado) e faz POST no primeiro modulo "display"
// cadastrado.
const db = require('../database/db');

const INTERVALO_MS = 3000;
const TIMEOUT_MS = 4000;

// --- Simulacao TEMPORARIA de sensores de temperatura ---
// O Hardware atual (pos reescrita do MCP23017, 07-espc) so produz reles — nao simula mais
// temp_agua/temp_ambiente/temp_ph como o simulador antigo fazia. Isso deixava o grid de
// sensores da tela principal do Display sempre vazio (o que parecia "travado" numa
// primeira olhada, embora o Display estivesse funcionando certo, so sem dado nenhum pra
// mostrar). Enquanto nao existir um sensor real, este gerador replica o mesmo
// comportamento do simulador antigo (nudge aleatorio a cada ciclo de 3s, constrained a uma
// faixa plausivel) so pra confirmar visualmente que a comunicacao Brain -> Display esta
// viva. Remover este bloco (e a chamada de avancarSensoresSimulados/montarDispositivosSimulados
// abaixo) quando sensores reais existirem no Hardware.
const sensoresSimulados = {
    temp_agua: 24.5,
    temp_ambiente: 23.0,
    temp_ph: 7.2,
};

function nudge(valor, deltaMax, min, max) {
    const novo = valor + (Math.random() - 0.5) * 2 * deltaMax;
    return Math.min(max, Math.max(min, novo));
}

function avancarSensoresSimulados() {
    sensoresSimulados.temp_agua = nudge(sensoresSimulados.temp_agua, 2.0, 18, 32);
    sensoresSimulados.temp_ambiente = nudge(sensoresSimulados.temp_ambiente, 2.0, 16, 34);
    sensoresSimulados.temp_ph = nudge(sensoresSimulados.temp_ph, 0.3, 6.0, 8.5);
}

function montarDispositivosSimulados() {
    return [
        { id: 'temp_agua', tipo: 'sensor_temp', nome: 'Agua', valor: sensoresSimulados.temp_agua.toFixed(1) },
        { id: 'temp_ambiente', tipo: 'sensor_temp', nome: 'Ambiente', valor: sensoresSimulados.temp_ambiente.toFixed(1) },
        { id: 'temp_ph', tipo: 'sensor_temp', nome: 'PH', valor: sensoresSimulados.temp_ph.toFixed(1) },
    ];
}

function buscarPrimeiroModulo(tipo) {
    return db.prepare('SELECT * FROM modulos WHERE tipo = ? ORDER BY id LIMIT 1').get(tipo);
}

// Le o estado real dos reles no ESP32 do atuador e traduz pro formato Dispositivo
// (id/tipo/nome/valor) usando os nomes cadastrados em portas_mapeamento — portas nao
// habilitadas ficam de fora (nao aparecem no grid do Display, mesma regra ja usada no
// mapeamento). Retorna [] em qualquer falha (atuador inacessivel, resposta invalida etc.)
// — o Display so mostra o que realmente conseguimos confirmar.
//
// IMPORTANTE: o corpo aqui e a resposta CRUA do ESP32 (`GET /api/reles` direto no
// Hardware, nao atraves do proxy do Brain em relesController.js) — o ESP nunca manda um
// campo "disponivel" (isso e so o formato que o Brain sintetiza pro browser). Checar
// "dados.disponivel" aqui sempre falhava (fazia essa funcao retornar [] mesmo com o
// Hardware respondendo 200 de verdade) — ficou mascarado enquanto o MCP23017 nao estava
// wired e o ESP sempre respondia 503 de qualquer jeito (o "!resposta.ok" acima ja pegava
// antes). Com os GPIOs diretos (11-espc) o Hardware passou a responder 200 sempre, e esse
// bug teria zerado a telemetria de verdade — por isso so valida o formato do array agora.
async function montarDispositivosDoAtuador(atuador) {
    try {
        const resposta = await fetch(`http://${atuador.ip}/api/reles`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!resposta.ok) return [];
        const dados = await resposta.json();
        if (!Array.isArray(dados.reles)) return [];

        const portas = db.prepare('SELECT * FROM portas_mapeamento WHERE modulo_id = ?').all(atuador.id);
        const portaPorIndice = new Map(portas.map((p) => [p.posicao_indice, p]));

        return dados.reles
            .map((valor, indice) => {
                const porta = portaPorIndice.get(indice);
                if (porta && !porta.habilitado) return null;

                const numero = String(indice + 1).padStart(2, '0');
                return {
                    id: `rele_${numero}`,
                    tipo: 'rele',
                    nome: porta?.nome_personalizado || `Porta ${numero}`,
                    valor: valor === 1 ? 'true' : 'false',
                };
            })
            .filter(Boolean);
    } catch {
        return [];
    }
}

// POST /api/dispositivos no Display — mesmo endpoint que o Hardware chamava direto antes
// do 09-espc; so muda quem chama agora.
async function enviarParaDisplay(display, dispositivos) {
    try {
        await fetch(`http://${display.ip}/api/dispositivos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dispositivos }),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
    } catch (erro) {
        console.warn(`[telemetria->display] Falha ao enviar dispositivos pro Display (${display.ip}): ${erro.message}`);
    }
}

async function cicloTelemetria() {
    const display = buscarPrimeiroModulo('display');
    if (!display) return; // sem Display cadastrado, nao ha pra quem enviar

    avancarSensoresSimulados();
    const atuador = buscarPrimeiroModulo('atuador');
    const dispositivosReles = atuador ? await montarDispositivosDoAtuador(atuador) : [];
    const dispositivos = [...montarDispositivosSimulados(), ...dispositivosReles];
    await enviarParaDisplay(display, dispositivos);
}

function iniciarEnvioParaDisplay() {
    cicloTelemetria();
    setInterval(cicloTelemetria, INTERVALO_MS);
}

// Snapshot sob demanda do mesmo payload que o ciclo periodico acima empurra pro Display —
// usado por GET /api/dispositivos-atuais (dispositivosController.js), que o Display chama
// uma vez no boot (com timeout curto) pra pintar o HUD com dados reais desde a primeira
// tela, em vez de esperar ate 3s pelo proximo ciclo automatico.
async function obterDispositivosAtuais() {
    const atuador = buscarPrimeiroModulo('atuador');
    const dispositivosReles = atuador ? await montarDispositivosDoAtuador(atuador) : [];
    return [...montarDispositivosSimulados(), ...dispositivosReles];
}

module.exports = { iniciarEnvioParaDisplay, obterDispositivosAtuais };
