const db = require('../database/db');
const { aplicarRelesNoModulo } = require('../services/relesService');
const { obterUltimaLeitura: obterUltimaLeituraSensores } = require('../services/sensoresTelemetriaService');

// Camada de "acionamento ao vivo" (01-espc-geral/07_...): diferente de
// portasMapeamentoController.js (que só guarda nomes/status no SQLite), este controller
// FALA DE VERDADE com o ESP32 do módulo a cada chamada — consulta ou aciona os 16 relés
// via HTTP, e repassa a resposta (ou o erro) pro client. Nada aqui é persistido no banco.

const TIMEOUT_MS = 4000;

function buscarModulo(id) {
    return db.prepare('SELECT * FROM modulos WHERE id = ?').get(id);
}

// GET /api/modulos/:id/reles — consulta o estado atual dos 16 relés direto no ESP32.
//
// Responde sempre 200 (mesmo quando o ESP nao responde) com um corpo { disponivel, ... } —
// nao usa mais status HTTP 502 pra isso. Motivo: esta rota e chamada por um polling
// periodico do Dashboard (a cada poucos segundos), e o ESP pode estar desligado/fora da
// rede/com firmware desatualizado — um estado normal/esperado durante bancada, nao um erro
// de verdade — mas o navegador loga toda resposta HTTP 4xx/5xx como erro vermelho no
// console do DevTools automaticamente, so por causa do status code, mesmo com o fetch()
// sendo tratado com try/catch no client. Devolvendo 200 com "disponivel:false" o client
// decide o que fazer sem gerar esse ruido. 404 (modulo nao existe) continua sendo erro de
// verdade — isso e um bug de uso da API, nao "hardware fisico desligado/desatualizado".
// (11-espc: os 16 relés agora são GPIOs diretos do ESP32, sem MCP23017/I2C — um firmware
// atualizado nunca mais responde 503 aqui; se aparecer 503/"disponivel:false", é sinal de
// que o ESP está rodando um firmware antigo ou está inacessível na rede.)
async function consultarReles(req, res) {
    const { id } = req.params;
    const modulo = buscarModulo(id);

    if (!modulo) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    try {
        const resposta = await fetch(`http://${modulo.ip}/api/reles`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!resposta.ok) throw new Error(`ESP respondeu HTTP ${resposta.status}`);

        const dados = await resposta.json();
        res.json({ disponivel: true, reles: dados.reles });
    } catch (erro) {
        res.json({ disponivel: false, motivo: `Nao foi possivel falar com o modulo em ${modulo.ip}: ${erro.message}` });
    }
}

// origens reconhecidas pro histórico (13/15-espc): "manual" (default, clique direto/Ligar
// ou Desligar Todos), "automatico" (Modo Panico), "teste" (toggle "Testar ao vivo" no modal
// de Criar/Editar Tema — ver ModalCriarTema.jsx). "tema" também existe mas só é usado
// internamente por aplicarRelesNoModulo a partir de temasController.js, nunca vindo direto
// de uma requisição HTTP a esta rota.
const ORIGENS_RECONHECIDAS = ['automatico', 'teste'];

// POST /api/modulos/:id/reles — repassa o comando de acionamento (array de 16 posições)
// pro ESP32 de verdade. Body esperado: { "reles": [1,0,1,...], "origem": "manual"|"automatico"|"teste" }
// (16 posições; "origem" é opcional, default "manual" — usado só pro histórico). A lógica
// de verdade (bloqueio de portas desabilitadas + histórico) fica em relesService.js
// (14-espc), compartilhada com a aplicação de Temas — ver temasController.js.
async function acionarReles(req, res) {
    const { id } = req.params;
    const modulo = buscarModulo(id);

    if (!modulo) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    const relesRecebidos = req.body.reles;
    if (!Array.isArray(relesRecebidos)) {
        return res.status(400).json({ erro: 'Campo "reles" deve ser um array.' });
    }
    const origem = ORIGENS_RECONHECIDAS.includes(req.body.origem) ? req.body.origem : 'manual';

    const resultado = await aplicarRelesNoModulo(id, relesRecebidos, origem);
    if (!resultado.ok) {
        return res.json({ disponivel: false, motivo: resultado.motivo });
    }

    // Devolve o array JÁ CORRIGIDO (com as bloqueadas zeradas) — o client (Dashboard)
    // sincroniza o estado otimista com o que realmente foi enviado, sem precisar de um
    // GET extra pra descobrir se alguma porta foi zerada por estar bloqueada.
    res.json({ disponivel: true, reles: resultado.reles });
}

// GET /api/modulos/:id/status — consulta GET /api/status direto no ESP32 (uptime, RSSI,
// SSID, se o MCP23017 respondeu no I2C etc.) — usado pelo modal "Info do Modulo" quando o
// usuario clica num item de Modulos de Controladores (ver ModulosControladores.jsx). Mesmo
// padrao "sempre 200, disponivel:false em caso de falha" dos handlers de reles acima, pelo
// mesmo motivo: ESP inacessivel e um estado normal aqui (ainda em bancada, sem fiacao do
// MCP), nao um erro de programacao que mereça aparecer em vermelho no console.
async function consultarStatusEsp(req, res) {
    const { id } = req.params;
    const modulo = buscarModulo(id);

    if (!modulo) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    try {
        const resposta = await fetch(`http://${modulo.ip}/api/status`, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!resposta.ok) throw new Error(`ESP respondeu HTTP ${resposta.status}`);

        const dados = await resposta.json();
        res.json({ disponivel: true, ...dados });
    } catch (erro) {
        res.json({ disponivel: false, motivo: `Nao foi possivel falar com o modulo em ${modulo.ip}: ${erro.message}` });
    }
}

// GET /api/modulos/:id/sensores — usado pelo diagrama de sensores no modal de Diagnostico
// Completo, pelo Esquematico dos Sensores e pelo widget/modal "Sensores no Display" (16-espc).
// NAO faz mais fetch proprio no ESP (evita duplicar o polling que sensoresTelemetriaService.js
// ja faz a cada 5s em background) — devolve o mesmo cache mesclado com nomes personalizados
// (ver sensoresTelemetriaService.js:obterUltimaLeitura/aplicarNomesPersonalizados), no maximo
// ~5s desatualizado, o que e mais que suficiente pra essas telas. Mesmo padrao "sempre 200,
// disponivel:false em caso de falha" dos demais proxies acima.
async function consultarSensoresEsp(req, res) {
    const { id } = req.params;
    const modulo = buscarModulo(id);

    if (!modulo) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    const leitura = obterUltimaLeituraSensores();
    if (!leitura) {
        return res.json({ disponivel: false, motivo: `Nao foi possivel falar com o modulo em ${modulo.ip} ainda.` });
    }

    res.json({ disponivel: true, ...leitura });
}

// POST /api/modulos/:id/config-dispositivo — proxy pro POST /api/config-dispositivo do
// proprio ESP32 (12-espc, "Editar Controlador" no dashboard): body { hostname } (mesmo
// formato que o firmware espera, repassado sem alteracao). O ESP salva na NVS e reinicia
// sozinho pra aplicar de verdade (WiFi.setHostname so tem efeito completo num boot novo) —
// a resposta 200 normalmente chega ANTES do reset (o firmware da um delay(300) antes de
// reiniciar de proposito, exatamente pra isso), mas se a conexao cair um instante antes, o
// client trata como uma falha comum, ja que o efeito (reiniciar com o hostname novo)
// acontece de qualquer jeito.
async function configurarDispositivoEsp(req, res) {
    const { id } = req.params;
    const modulo = buscarModulo(id);

    if (!modulo) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    try {
        const resposta = await fetch(`http://${modulo.ip}/api/config-dispositivo`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req.body),
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        const dados = await resposta.json();
        if (!resposta.ok) {
            return res.json({ disponivel: false, motivo: dados.status || `ESP respondeu HTTP ${resposta.status}` });
        }
        res.json({ disponivel: true, ...dados });
    } catch (erro) {
        res.json({ disponivel: false, motivo: `Nao foi possivel falar com o modulo em ${modulo.ip}: ${erro.message}` });
    }
}

module.exports = { consultarReles, acionarReles, consultarStatusEsp, consultarSensoresEsp, configurarDispositivoEsp };
