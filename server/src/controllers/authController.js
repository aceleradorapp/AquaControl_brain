const {
    existeAdmin,
    registrarAdmin,
    validarLogin,
    verificarToken,
    obterMasterKey,
    definirMasterKey,
    obterBloquearCadastro,
    definirBloquearCadastro,
    listarAdmins,
    criarAdminAdicional,
    editarAdmin,
    excluirAdmin,
} = require('../services/authService');
const { registrarLog } = require('../services/logService');

// GET /api/auth/status — o front consulta isso antes de decidir se a modal de autenticacao
// (aberta pelo botao do rodape ou pelo atalho Ctrl+F12) mostra "Criar Conta" (primeiro acesso,
// nenhum admin ainda) ou "Entrar" (ja existe uma conta).
function status(req, res) {
    res.json({ existeAdmin: existeAdmin(), bloquearCadastro: obterBloquearCadastro() });
}

// POST /api/auth/registrar — SO funciona uma vez (a primeira). Depois disso sempre 409, pra
// nunca dar pra um segundo dispositivo "recriar" a conta e assumir o lugar do dono original.
function registrar(req, res) {
    if (existeAdmin()) {
        return res.status(409).json({ erro: 'Ja existe uma conta administradora cadastrada.' });
    }

    const usuario = String(req.body?.usuario ?? '').trim();
    const senha = String(req.body?.senha ?? '');
    if (!usuario || senha.length < 4) {
        return res.status(400).json({ erro: 'Usuario e senha (minimo 4 caracteres) sao obrigatorios.' });
    }

    const token = registrarAdmin(usuario, senha);
    registrarLog(`Conta administradora criada ("${usuario}") — dispositivo pareado.`, 'sucesso', 'sistema', null, 'manual');
    res.status(201).json({ token });
}

function login(req, res) {
    const usuario = String(req.body?.usuario ?? '').trim();
    const senha = String(req.body?.senha ?? '');
    const token = validarLogin(usuario, senha);
    if (!token) {
        return res.status(401).json({ erro: 'Usuario ou senha invalidos.' });
    }
    registrarLog(`Novo dispositivo pareado (login: "${usuario}").`, 'sucesso', 'sistema', null, 'manual');
    res.json({ token });
}

// GET /api/auth/verificar — chamado UMA vez ao carregar o app com um token salvo no
// localStorage, so pra confirmar que ele foi realmente emitido por este servidor (assinatura
// valida) antes de confiar nele pra mostrar o Dashboard — sem isso, qualquer string colada no
// localStorage passaria pelo portao (ver comentario no topo de authService.js: isso NAO
// protege as outras rotas da API, so a decisao de qual TELA mostrar).
function verificar(req, res) {
    const cabecalho = req.headers.authorization ?? '';
    const token = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : null;
    const dados = token ? verificarToken(token) : null;
    res.json({ valido: !!dados, usuario: dados?.usuario ?? null });
}

// POST /api/auth/master-key — gate do atalho Ctrl+F12 (NAO e autenticacao de verdade, so
// libera a exibicao do formulario de login mesmo com o botao visual bloqueado — ver
// especificacao 3.2). Digitar errado nao tranca nada, so nao libera o formulario.
function validarMasterKeyRota(req, res) {
    const tentativa = String(req.body?.masterKey ?? '');
    res.json({ valido: tentativa === obterMasterKey() });
}

// GET /api/auth/configuracoes — nunca devolve a Master Key em si (so troca-se as cegas, ver
// PUT abaixo) nem a senha do admin — so o estado do toggle "Bloquear Cadastro".
function obterConfiguracoesAuth(req, res) {
    res.json({ bloquearCadastro: obterBloquearCadastro() });
}

function salvarConfiguracoesAuth(req, res) {
    if (typeof req.body?.bloquearCadastro === 'boolean') {
        definirBloquearCadastro(req.body.bloquearCadastro);
        registrarLog(
            `Bloquear Cadastro ${req.body.bloquearCadastro ? 'ATIVADO' : 'DESATIVADO'} nas configuracoes de seguranca.`,
            'alerta',
            'sistema',
            null,
            'manual'
        );
    }
    if (typeof req.body?.masterKey === 'string' && req.body.masterKey.trim()) {
        definirMasterKey(req.body.masterKey.trim());
        registrarLog('Master Key do atalho Ctrl+F12 alterada.', 'alerta', 'sistema', null, 'manual');
    }
    res.json({ bloquearCadastro: obterBloquearCadastro() });
}

// GET /api/auth/usuarios (34-espc) — lista pro painel "Seguranca e Dispositivos" em
// Configuracoes. Nunca inclui hash de senha (ver authService.js:listarAdmins).
function listarUsuarios(req, res) {
    res.json(listarAdmins());
}

// POST /api/auth/usuarios — cria um admin ADICIONAL (diferente de /api/auth/registrar: aquele
// e publico e so funciona pra a PRIMEIRA conta; este e usado de dentro do painel, por quem ja
// esta autenticado no dispositivo).
function criarUsuario(req, res) {
    const usuario = String(req.body?.usuario ?? '').trim();
    const senha = String(req.body?.senha ?? '');
    if (!usuario || senha.length < 4) {
        return res.status(400).json({ erro: 'Usuario e senha (minimo 4 caracteres) sao obrigatorios.' });
    }

    const resultado = criarAdminAdicional(usuario, senha);
    if (resultado.erro) return res.status(409).json(resultado);

    registrarLog(`Novo usuario administrador criado: "${usuario}".`, 'sucesso', 'sistema', null, 'manual');
    res.status(201).json(resultado);
}

// PUT /api/auth/usuarios/:id — edita usuario/senha/bloqueado (todos opcionais, so muda o que
// vier no corpo — ver authService.js:editarAdmin). Recusa deixar o sistema sem nenhum admin
// ativo (400 com "erro" explicando o motivo).
function editarUsuario(req, res) {
    const id = Number(req.params.id);
    const resultado = editarAdmin(id, {
        usuario: req.body?.usuario,
        senha: req.body?.senha,
        bloqueado: typeof req.body?.bloqueado === 'boolean' ? req.body.bloqueado : undefined,
    });
    if (resultado?.erro) return res.status(400).json(resultado);

    const rotulo = typeof req.body?.bloqueado === 'boolean' ? (req.body.bloqueado ? 'bloqueado' : 'desbloqueado') : 'editado';
    registrarLog(`Usuario administrador "${resultado.usuario}" ${rotulo}.`, 'alerta', 'sistema', null, 'manual');
    res.json(resultado);
}

// DELETE /api/auth/usuarios/:id — recusa excluir o unico admin ativo restante (mesma guarda
// de editarUsuario acima, ver authService.js:excluirAdmin).
function excluirUsuario(req, res) {
    const id = Number(req.params.id);
    const usuarioAntes = listarAdmins().find((u) => u.id === id);
    const resultado = excluirAdmin(id);
    if (resultado?.erro) return res.status(400).json(resultado);

    registrarLog(`Usuario administrador "${usuarioAntes?.usuario ?? id}" excluido.`, 'alerta', 'sistema', null, 'manual');
    res.json({ status: 'ok' });
}

module.exports = {
    status,
    registrar,
    login,
    verificar,
    validarMasterKeyRota,
    obterConfiguracoesAuth,
    salvarConfiguracoesAuth,
    listarUsuarios,
    criarUsuario,
    editarUsuario,
    excluirUsuario,
};
