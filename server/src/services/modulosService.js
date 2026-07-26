// Comunicação HTTP de "servidor pra ESP32" (01-espc-geral/07_hardware_mcp23017_handshake.md).
// Hoje só o handshake de cadastro — o polling/acionamento de relés (GET/POST /api/reles)
// fica em relesController.js, que fala com o módulo a partir de uma requisição do client.
const os = require('os');
const { PORT } = require('../config/env');

// Descobre o endereço "ip:porta" desta máquina/Raspberry Pi (LAN) — pega o primeiro
// endereço IPv4 não-interno (ignora 127.0.0.1 e interfaces de loopback/virtuais) e anexa a
// porta que o Express está escutando de verdade (ver config/env.js). Assumindo uma única
// rede ativa, que é o cenário normal de um Raspberry Pi ligado no mesmo Wi-Fi/switch dos ESPs.
//
// IMPORTANTE: precisa incluir a porta — sem isso (09-espc), qualquer chamada que o Display
// faça de volta pro Brain usando este valor (`"http://" + ipBackend + "/api/..."`, ver
// AquaControl_OS/src/main.cpp: normalizarViaBrain/buscarQrAtivoDoBrain/sincronizarComBrain)
// caía por padrão na porta 80, onde não tem nada escutando (o Express roda na porta do
// PORT, 5000 por padrão) — a chamada falhava em silêncio, o Display voltava pro HUD local
// mesmo assim (ele sempre volta, sucesso ou não), e por isso PARECIA que "tocar na tela
// normalizava" quando na real o Brain nunca ficava sabendo. Esse foi o bug real por trás
// de "clicar na Tela de Alerta não desliga o pânico no dashboard".
function obterIpLocal() {
    const interfaces = os.networkInterfaces();
    for (const nome of Object.keys(interfaces)) {
        for (const info of interfaces[nome]) {
            if (info.family === 'IPv4' && !info.internal) {
                return `${info.address}:${PORT}`;
            }
        }
    }
    return `127.0.0.1:${PORT}`;
}

// Handshake de cadastro: avisa o ESP32 de atuadores/display qual é o IP deste backend
// (POST /api/config), pra ele guardar em NVS/Preferences. Retorna { sucesso, motivo } em
// vez de só logar — modulosController.js agora AGUARDA essa promise antes de responder ao
// client (fica alguns ms/segundos mais lento salvar um módulo, mas o cadastro já volta
// dizendo se o handshake realmente aconteceu, em vez do usuário só descobrir depois — muito
// mais fácil de diagnosticar "ESP desligado/porta errada/firmware antigo" na hora). Ainda
// assim nunca FALHA o cadastro em si — o módulo é salvo no banco de qualquer jeito mesmo se
// o ESP estiver inacessível; só o campo "handshake" na resposta reflete o que aconteceu.
async function realizarHandshake(modulo) {
    const ipBrain = obterIpLocal();

    try {
        const resposta = await fetch(`http://${modulo.ip}/api/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ server_ip: ipBrain }),
            signal: AbortSignal.timeout(4000),
        });

        if (!resposta.ok) throw new Error(`ESP respondeu HTTP ${resposta.status}`);
        const dados = await resposta.json();
        console.log(`[handshake] Modulo "${modulo.nome}" (${modulo.ip}) confirmou:`, dados);
        return { sucesso: true };
    } catch (erro) {
        const motivo = `Falha ao avisar o modulo "${modulo.nome}" (${modulo.ip}) sobre o IP do backend (${ipBrain}): ${erro.message}`;
        console.warn(`[handshake] ${motivo}`, erro.cause || erro);
        return { sucesso: false, motivo };
    }
}

module.exports = { obterIpLocal, realizarHandshake };
