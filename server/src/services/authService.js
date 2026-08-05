// Autenticacao por Dispositivo (33-espc, gerenciamento multiusuario 34-espc) — "Pareamento
// Silencioso": a PRIMEIRA conta ADM nasce do cadastro publico (ver registrarAdmin,
// so funciona uma vez, enquanto nao existir NENHUM admin ainda). Dai em diante, novas contas
// so sao criadas por quem ja esta autenticado, pela lista de usuarios em Configuracoes (ver
// criarAdminAdicional/listarAdmins/editarAdmin/excluirAdmin). O token JWT emitido aqui NAO
// expira ("permanente", ver gerarToken) e NAO protege nenhuma rota da API hoje — e so um
// portao de UI (mostrar Dashboard vs Pagina de Visitante).
// Decisao explicita do usuario: "como e um sistema interno da minha rede, nao tem necessidade
// de bloquear todos os endpoints, apenas no front... assim no futuro podemos melhorar essa
// seguranca" — por isso o cadastro/hash ja fica correto no backend desde já (scrypt, nunca
// texto puro), preparado pra um middleware de verdade ser adicionado depois sem precisar
// remodelar nada disso.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../database/db');

const MASTER_KEY_PADRAO = '718848';

// O segredo de assinatura do JWT e gerado uma vez (32 bytes aleatorios) e persistido em
// configuracoes_gerais — gerar na hora certa uma vez so, sem exigir nenhuma variavel de
// ambiente nova pra configurar (mesmo espirito de "funciona sem setup manual" do resto do
// projeto). Trocar esse valor manualmente invalidaria todos os tokens ja emitidos (nenhum
// endpoint faz isso hoje).
function obterSegredoJwt() {
    const linha = db.prepare("SELECT valor FROM configuracoes_gerais WHERE chave = 'jwt_secret_interno'").get();
    if (linha) return linha.valor;

    const novoSegredo = crypto.randomBytes(32).toString('hex');
    db.prepare("INSERT INTO configuracoes_gerais (chave, valor) VALUES ('jwt_secret_interno', ?)").run(novoSegredo);
    return novoSegredo;
}

// scrypt (nativo do Node, sem dependencia nova) — "sal:hash", ambos hex. Comparacao com
// timingSafeEqual pra nao vazar timing information sobre o quanto do hash bateu.
function hashSenha(senha) {
    const sal = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(senha, sal, 64).toString('hex');
    return `${sal}:${hash}`;
}

function verificarSenha(senha, senhaHashSalva) {
    const [sal, hashSalvo] = String(senhaHashSalva).split(':');
    if (!sal || !hashSalvo) return false;
    const hashTentativa = crypto.scryptSync(senha, sal, 64);
    const bufSalvo = Buffer.from(hashSalvo, 'hex');
    return bufSalvo.length === hashTentativa.length && crypto.timingSafeEqual(bufSalvo, hashTentativa);
}

function existeAdmin() {
    return !!db.prepare('SELECT id FROM admin_conta LIMIT 1').get();
}

function usuarioExiste(usuario) {
    return !!db.prepare('SELECT id FROM admin_conta WHERE usuario = ?').get(usuario);
}

// Token SEM "expiresIn" de proposito — "permanente" (ver especificacao) significa sem data de
// expiracao mesmo, nao "expira daqui a X anos". O unico jeito de invalidar e o usuario trocar
// o token localmente (Desparear Dispositivo, so client-side) ou o segredo mudar no servidor.
function gerarToken(usuario) {
    return jwt.sign({ usuario }, obterSegredoJwt());
}

// Cadastro PUBLICO (Pagina de Visitante, Ctrl+F12 + Master Key) — so funciona enquanto NAO
// existir nenhum admin ainda (a primeira conta "reivindica" o sistema). Depois disso, sempre
// null — novas contas so pelo painel ja autenticado (ver criarAdminAdicional).
function registrarAdmin(usuario, senha) {
    if (existeAdmin()) return null;
    db.prepare('INSERT INTO admin_conta (usuario, senha_hash) VALUES (?, ?)').run(usuario, hashSenha(senha));
    return gerarToken(usuario);
}

function validarLogin(usuario, senha) {
    const linha = db.prepare('SELECT * FROM admin_conta WHERE usuario = ?').get(usuario);
    if (!linha || linha.bloqueado || !verificarSenha(senha, linha.senha_hash)) return null;
    return gerarToken(usuario);
}

// Lista pro painel de Configuracoes (34-espc) — NUNCA inclui "senha_hash".
function listarAdmins() {
    return db.prepare('SELECT id, usuario, bloqueado, criado_em FROM admin_conta ORDER BY id ASC').all();
}

function contarAdminsAtivos() {
    return db.prepare('SELECT COUNT(*) AS total FROM admin_conta WHERE bloqueado = 0').get().total;
}

// Criado por quem JA esta autenticado no painel (nao e o cadastro publico do primeiro
// acesso) — mesma validacao de usuario/senha do registro inicial, mais checagem de nome
// duplicado (o cadastro inicial nunca precisou disso, so existia 1 conta possivel).
function criarAdminAdicional(usuario, senha) {
    if (usuarioExiste(usuario)) return { erro: 'Ja existe um usuario com esse nome.' };
    const resultado = db.prepare('INSERT INTO admin_conta (usuario, senha_hash) VALUES (?, ?)').run(usuario, hashSenha(senha));
    return db.prepare('SELECT id, usuario, bloqueado, criado_em FROM admin_conta WHERE id = ?').get(resultado.lastInsertRowid);
}

// Edita usuario/senha/bloqueado (todos opcionais — so muda o que veio no corpo). Recusa
// deixar o sistema com ZERO admins ativos (ninguem conseguiria logar de novo pelo formulario
// normal — so reabrindo o cadastro publico do zero) — mesma guarda em excluirAdmin abaixo.
function editarAdmin(id, { usuario, senha, bloqueado } = {}) {
    const atual = db.prepare('SELECT * FROM admin_conta WHERE id = ?').get(id);
    if (!atual) return { erro: 'Usuario nao encontrado.' };

    if (typeof usuario === 'string' && usuario.trim() && usuario.trim() !== atual.usuario) {
        if (usuarioExiste(usuario.trim())) return { erro: 'Ja existe um usuario com esse nome.' };
        db.prepare('UPDATE admin_conta SET usuario = ? WHERE id = ?').run(usuario.trim(), id);
    }
    if (typeof senha === 'string' && senha) {
        if (senha.length < 4) return { erro: 'Senha deve ter no minimo 4 caracteres.' };
        db.prepare('UPDATE admin_conta SET senha_hash = ? WHERE id = ?').run(hashSenha(senha), id);
    }
    if (typeof bloqueado === 'boolean') {
        const ficariaSemAtivos = bloqueado && !atual.bloqueado && contarAdminsAtivos() <= 1;
        if (ficariaSemAtivos) return { erro: 'Nao e possivel bloquear o unico administrador ativo.' };
        db.prepare('UPDATE admin_conta SET bloqueado = ? WHERE id = ?').run(bloqueado ? 1 : 0, id);
    }

    return db.prepare('SELECT id, usuario, bloqueado, criado_em FROM admin_conta WHERE id = ?').get(id);
}

function excluirAdmin(id) {
    const atual = db.prepare('SELECT * FROM admin_conta WHERE id = ?').get(id);
    if (!atual) return { erro: 'Usuario nao encontrado.' };
    if (!atual.bloqueado && contarAdminsAtivos() <= 1) {
        return { erro: 'Nao e possivel excluir o unico administrador ativo.' };
    }
    db.prepare('DELETE FROM admin_conta WHERE id = ?').run(id);
    return { status: 'ok' };
}

function verificarToken(token) {
    try {
        return jwt.verify(token, obterSegredoJwt());
    } catch {
        return null;
    }
}

function obterMasterKey() {
    const linha = db.prepare("SELECT valor FROM configuracoes_gerais WHERE chave = 'master_key_atalho'").get();
    return linha?.valor || MASTER_KEY_PADRAO;
}

function definirMasterKey(novaKey) {
    db.prepare(
        `INSERT INTO configuracoes_gerais (chave, valor, atualizado_em) VALUES ('master_key_atalho', ?, CURRENT_TIMESTAMP)
         ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = CURRENT_TIMESTAMP`
    ).run(novaKey);
}

function obterBloquearCadastro() {
    const linha = db.prepare("SELECT valor FROM configuracoes_gerais WHERE chave = 'bloquear_cadastro'").get();
    return linha?.valor === 'true';
}

function definirBloquearCadastro(bloquear) {
    db.prepare(
        `INSERT INTO configuracoes_gerais (chave, valor, atualizado_em) VALUES ('bloquear_cadastro', ?, CURRENT_TIMESTAMP)
         ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = CURRENT_TIMESTAMP`
    ).run(String(!!bloquear));
}

module.exports = {
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
};
