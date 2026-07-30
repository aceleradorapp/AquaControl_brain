const db = require('../database/db');
const { realizarHandshake } = require('../services/modulosService');
const { estaOnline, verificarModulo } = require('../services/statusModulosService');

// SQLite não tem tipo booleano nativo (guarda 0/1) — converte pra true/false de verdade
// antes de responder, senão o front-end recebe 1/0 em vez de true/false. "online" não vem
// do banco — é o status de conectividade real, lido do cache de
// services/statusModulosService.js (ping periódico em background), distinto de "ativo"
// (se o usuário habilitou/desabilitou o módulo).
function formatarModulo(modulo) {
    return { ...modulo, ativo: !!modulo.ativo, online: estaOnline(modulo.id) };
}

// 25-espc: cadastro/edição de módulo NÃO validava formato de IP nem tipo, e não impedia
// registrar o MESMO IP duas vezes — um erro de digitação (ou um IP já usado por outro
// módulo) só era descoberto depois, quando o handshake falhava silenciosamente ou dois
// módulos "brigavam" pelo mesmo endereço. Validado aqui pra pegar isso na hora do cadastro,
// não depois.
const TIPOS_VALIDOS = ['atuador', 'telemetria', 'display'];

function ipValido(ip) {
    const partes = String(ip).split('.');
    if (partes.length !== 4) return false;
    return partes.every((parte) => /^\d{1,3}$/.test(parte) && Number(parte) >= 0 && Number(parte) <= 255);
}

// GET /api/modulos — lista todos os módulos cadastrados
function listarModulos(req, res) {
    const modulos = db.prepare('SELECT * FROM modulos ORDER BY id').all();
    res.json(modulos.map(formatarModulo));
}

// POST /api/modulos — cadastra um novo módulo (nome, ip, tipo obrigatórios; "ativo" é
// opcional, default true)
async function criarModulo(req, res) {
    const { nome, ip, tipo } = req.body;
    const ativo = req.body.ativo ?? true;

    if (!nome || !ip || !tipo) {
        return res.status(400).json({ erro: 'Os campos "nome", "ip" e "tipo" sao obrigatorios.' });
    }
    if (!ipValido(ip)) {
        return res.status(400).json({ erro: `IP invalido: "${ip}". Use o formato 000.000.000.000.` });
    }
    if (!TIPOS_VALIDOS.includes(tipo)) {
        return res.status(400).json({ erro: `Tipo invalido: "${tipo}". Use um de: ${TIPOS_VALIDOS.join(', ')}.` });
    }
    const jaExiste = db.prepare('SELECT nome FROM modulos WHERE ip = ?').get(ip);
    if (jaExiste) {
        return res.status(409).json({ erro: `Esse IP ja esta cadastrado no modulo "${jaExiste.nome}".` });
    }

    const resultado = db
        .prepare('INSERT INTO modulos (nome, ip, tipo, ativo) VALUES (?, ?, ?, ?)')
        .run(nome, ip, tipo, ativo ? 1 : 0);

    const novoModulo = db.prepare('SELECT * FROM modulos WHERE id = ?').get(resultado.lastInsertRowid);

    // Ping imediato (08-espc): sem isso, o módulo apareceria "offline" por até 10s (o
    // intervalo do laço periódico) mesmo se já estiver ligado e acessível.
    // AGUARDADO (16-espc): o ping abre e derruba (destroy(), que manda RST em vez de FIN) uma
    // conexao TCP crua na porta 80 do proprio modulo — se isso ficasse em voo ao mesmo tempo
    // que o handshake abaixo abre OUTRA conexao pro mesmo ESP32, o WebServer do Arduino (só
    // atende um cliente por vez) reseta a segunda conexao (ECONNRESET). Esperar o ping
    // terminar antes do handshake elimina essa corrida.
    await verificarModulo(novoModulo);

    // Handshake (07-espc, 16-espc: também vale pra "telemetria"): avisa o ESP32 de
    // atuadores/display/sensores qual é o IP deste backend.
    // AGORA AGUARDADO (antes era fogo-e-esquece) — o cadastro em si nunca falha por causa
    // disso (o módulo já foi salvo no banco acima de qualquer jeito), mas a resposta ao
    // client inclui o resultado real do handshake, em vez do usuário só descobrir depois
    // no modal de status que "ip_backend_salvo" nunca chegou a ser preenchido.
    let handshake = null;
    if (novoModulo.tipo === 'atuador' || novoModulo.tipo === 'display' || novoModulo.tipo === 'telemetria') {
        handshake = await realizarHandshake(novoModulo);
    }

    res.status(201).json({ ...formatarModulo(novoModulo), handshake });
}

// PUT /api/modulos/:id — atualiza um módulo existente. Aceita atualização parcial.
async function atualizarModulo(req, res) {
    const { id } = req.params;
    const moduloExistente = db.prepare('SELECT * FROM modulos WHERE id = ?').get(id);

    if (!moduloExistente) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    const nome = req.body.nome ?? moduloExistente.nome;
    const ip = req.body.ip ?? moduloExistente.ip;
    const tipo = req.body.tipo ?? moduloExistente.tipo;
    const ativo = req.body.ativo ?? !!moduloExistente.ativo;

    if (!ipValido(ip)) {
        return res.status(400).json({ erro: `IP invalido: "${ip}". Use o formato 000.000.000.000.` });
    }
    if (!TIPOS_VALIDOS.includes(tipo)) {
        return res.status(400).json({ erro: `Tipo invalido: "${tipo}". Use um de: ${TIPOS_VALIDOS.join(', ')}.` });
    }
    const jaExiste = db.prepare('SELECT nome FROM modulos WHERE ip = ? AND id != ?').get(ip, id);
    if (jaExiste) {
        return res.status(409).json({ erro: `Esse IP ja esta cadastrado no modulo "${jaExiste.nome}".` });
    }

    db.prepare('UPDATE modulos SET nome = ?, ip = ?, tipo = ?, ativo = ? WHERE id = ?').run(
        nome,
        ip,
        tipo,
        ativo ? 1 : 0,
        id
    );

    const moduloAtualizado = db.prepare('SELECT * FROM modulos WHERE id = ?').get(id);

    // Reping imediato — o IP pode ter mudado nesta edição. AGUARDADO pelo mesmo motivo do
    // criarModulo acima (evita corrida de conexao TCP com o handshake logo abaixo).
    await verificarModulo(moduloAtualizado);

    // Mesmo handshake do cadastro (agora aguardado — ver criarModulo acima) — dispara de
    // novo na edição também (o IP pode ter mudado, ou o tipo pode ter virado "atuador" agora).
    let handshake = null;
    if (moduloAtualizado.tipo === 'atuador' || moduloAtualizado.tipo === 'display' || moduloAtualizado.tipo === 'telemetria') {
        handshake = await realizarHandshake(moduloAtualizado);
    }

    res.json({ ...formatarModulo(moduloAtualizado), handshake });
}

// DELETE /api/modulos/:id — remove um módulo (e, em cascata, seus dispositivos/portas
// relacionados — ver FOREIGN KEY ... ON DELETE CASCADE em migrate.js)
function deletarModulo(req, res) {
    const { id } = req.params;
    const resultado = db.prepare('DELETE FROM modulos WHERE id = ?').run(id);

    if (resultado.changes === 0) {
        return res.status(404).json({ erro: 'Modulo nao encontrado.' });
    }

    res.status(204).send();
}

module.exports = { listarModulos, criarModulo, atualizarModulo, deletarModulo };
