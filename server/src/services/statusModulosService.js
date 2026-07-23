// Monitoramento de status real dos módulos (01-espc-geral/08_widget_matriz_reles_ping.md):
// um "ping" leve (conexão TCP na porta 80, sem enviar HTTP de verdade) pra cada módulo
// cadastrado, rodando em background a cada INTERVALO_MONITORAMENTO_MS. O resultado fica
// em cache num Map em memória — GET /api/modulos só lê esse cache (rápido, nunca espera
// a rede), não faz o ping na hora da requisição.
const net = require('net');
const db = require('../database/db');

const TIMEOUT_PING_MS = 1500;
const INTERVALO_MONITORAMENTO_MS = 10000;

const statusPorModulo = new Map(); // moduloId -> boolean (online/offline)
let intervaloAtivo = null;

// Só testa se a porta 80 aceita conexão — não precisa saber qual API o módulo expõe
// (atuador, sensor, etc.), então funciona igual pra qualquer tipo de módulo.
function pingModulo(ip, porta = 80, timeoutMs = TIMEOUT_PING_MS) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        let resolvido = false;

        function finalizar(resultado) {
            if (resolvido) return;
            resolvido = true;
            socket.destroy();
            resolve(resultado);
        }

        socket.setTimeout(timeoutMs);
        socket.once('connect', () => finalizar(true));
        socket.once('timeout', () => finalizar(false));
        socket.once('error', () => finalizar(false));
        socket.connect(porta, ip);
    });
}

// Verifica um único módulo e já atualiza o cache — usado tanto pelo laço periódico
// quanto pra dar um retorno mais rápido logo após cadastrar um módulo novo (ver
// modulosController.js), em vez de esperar até 10s pelo próximo ciclo.
async function verificarModulo(modulo) {
    const online = await pingModulo(modulo.ip);
    statusPorModulo.set(modulo.id, online);
    return online;
}

async function verificarTodosOsModulos() {
    const modulos = db.prepare('SELECT id, ip FROM modulos').all();
    await Promise.all(modulos.map(verificarModulo));
}

// Status em cache — default false (offline) se este módulo ainda não foi checado nenhuma
// vez (ex.: acabou de cadastrar, o laço periódico ainda não rodou).
function estaOnline(moduloId) {
    return statusPorModulo.get(moduloId) ?? false;
}

function iniciarMonitoramento() {
    if (intervaloAtivo) return; // evita duplicar o laço se chamado mais de uma vez

    verificarTodosOsModulos(); // checagem imediata, não espera o 1º intervalo
    intervaloAtivo = setInterval(verificarTodosOsModulos, INTERVALO_MONITORAMENTO_MS);
}

module.exports = { iniciarMonitoramento, estaOnline, verificarModulo, verificarTodosOsModulos };
