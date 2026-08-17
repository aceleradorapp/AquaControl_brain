const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');
const db = require('../database/db');
const { registrarLog } = require('./logService');

// Self-Update do sistema (1 clique, painel Configuracoes -> Sistema & Plataforma) — git pull +
// npm install (client/server) + build do client + "pm2 restart", tudo disparado por
// POST /api/sistema/atualizar e executado em server/scripts/atualizar-sistema.sh.
//
// server/src/services -> subir 3 niveis chega na raiz do repo (onde ficam client/ e server/).
const RAIZ_PROJETO = path.join(__dirname, '..', '..', '..');
const SCRIPT_ATUALIZACAO = path.join(RAIZ_PROJETO, 'server', 'scripts', 'atualizar-sistema.sh');
const CAMINHO_LOG = path.join(RAIZ_PROJETO, 'server', 'atualizacao.log');
const CAMINHO_STATUS = path.join(RAIZ_PROJETO, 'server', 'atualizacao.status');
const CAMINHO_LOCK = path.join(RAIZ_PROJETO, 'server', 'atualizacao.lock');

const LINHAS_LOG_RETORNADAS = 60;
// Tempo generoso pra git pull + 2x npm install + build do client terminarem. Se o lock for
// mais velho que isso, tratamos como orfao (processo anterior morreu sem rodar o trap do
// script) em vez de travar o botao pra sempre.
const LIMITE_LOCK_TRAVADO_MS = 15 * 60 * 1000;

function atualizacaoEmAndamento() {
    if (!fs.existsSync(CAMINHO_LOCK)) return false;
    const idadeMs = Date.now() - fs.statSync(CAMINHO_LOCK).mtimeMs;
    if (idadeMs > LIMITE_LOCK_TRAVADO_MS) {
        fs.rmSync(CAMINHO_LOCK, { force: true });
        return false;
    }
    return true;
}

// POST /api/sistema/atualizar (sistemaController.js) — dispara o script em processo destacado
// (detached + unref, roda em sessao propria via setsid) e responde IMEDIATAMENTE; o restart do
// pm2no final do script mata este processo Node, mas nao o script (ja desacoplado dele).
function dispararAtualizacao(usuario) {
    if (atualizacaoEmAndamento()) {
        return { erro: 'Ja existe uma atualizacao em andamento.', emAndamento: true };
    }

    fs.writeFileSync(CAMINHO_LOCK, String(process.pid));

    const processo = spawn('bash', [SCRIPT_ATUALIZACAO], {
        cwd: RAIZ_PROJETO,
        detached: true,
        stdio: 'ignore',
    });
    processo.unref();

    registrarLog(`Atualizacao do sistema disparada manualmente por "${usuario}".`, 'alerta', 'sistema', null, 'manual');
    return { status: 'iniciado' };
}

// GET /api/sistema/atualizar/status — le do ARQUIVO (nao de uma flag em memoria), pra
// continuar valendo mesmo depois do "pm2 restart" trocar o processo Node no meio do caminho.
function obterStatusAtualizacao() {
    if (!fs.existsSync(CAMINHO_STATUS)) {
        return { status: 'nunca_executado' };
    }

    const conteudo = fs.readFileSync(CAMINHO_STATUS, 'utf8').trim();
    let log = '';
    if (fs.existsSync(CAMINHO_LOG)) {
        log = fs.readFileSync(CAMINHO_LOG, 'utf8').split('\n').slice(-LINHAS_LOG_RETORNADAS).join('\n');
    }

    if (conteudo === 'em_andamento') return { status: 'em_andamento', log };
    if (conteudo.startsWith('sucesso:')) return { status: 'sucesso', commit: conteudo.slice('sucesso:'.length), log };
    if (conteudo.startsWith('erro:')) return { status: 'erro', mensagem: conteudo.slice('erro:'.length), log };
    return { status: 'desconhecido', log };
}

// GET /api/sistema/versao-status — so checa se ha commits novos (git fetch + rev-list), sem
// aplicar nada. Duas-pontas (HEAD..origin/main) conta só o que o pull traria; nao usamos
// tres-pontos (HEAD...origin/main) porque isso somaria commits locais divergentes, que nao
// deveriam existir num checkout de producao e so confundiriam a contagem.
function verificarVersaoRemota() {
    return new Promise((resolve) => {
        execFile('git', ['fetch', '--all'], { cwd: RAIZ_PROJETO, timeout: 20000 }, (erroFetch) => {
            if (erroFetch) {
                resolve({ erro: 'Nao foi possivel contatar o repositorio remoto (git fetch falhou).' });
                return;
            }
            execFile(
                'git',
                ['rev-list', 'HEAD..origin/main', '--count'],
                { cwd: RAIZ_PROJETO, timeout: 10000 },
                (erroCount, stdout) => {
                    if (erroCount) {
                        resolve({ erro: 'Nao foi possivel comparar com o repositorio remoto.' });
                        return;
                    }
                    resolve({ commitsPendentes: Number(String(stdout).trim()) || 0 });
                }
            );
        });
    });
}

// Chamado uma vez no boot (server.js) — se este processo acabou de subir por causa do "pm2
// restart" que o proprio script de atualizacao chama no final, registra o resultado (sucesso
// ou erro) no System Log. Compara contra o ultimo resultado ja registrado (guardado em
// configuracoes_gerais, mesmo padrao de jwt_secret_interno/master_key_atalho) pra NAO duplicar
// o log em restarts normais (crash, deploy manual) que nao tem nada a ver com uma atualizacao.
function registrarResultadoAtualizacaoPendente() {
    if (!fs.existsSync(CAMINHO_STATUS)) return;
    const conteudo = fs.readFileSync(CAMINHO_STATUS, 'utf8').trim();
    if (!conteudo || conteudo === 'em_andamento') return;

    const linha = db.prepare("SELECT valor FROM configuracoes_gerais WHERE chave = 'ultima_atualizacao_registrada'").get();
    if (linha?.valor === conteudo) return;

    if (conteudo.startsWith('sucesso:')) {
        registrarLog(`Atualizacao do sistema concluida com sucesso (commit ${conteudo.slice('sucesso:'.length)}).`, 'sucesso', 'sistema', null, 'manual');
    } else if (conteudo.startsWith('erro:')) {
        registrarLog(
            `Falha na atualizacao do sistema: ${conteudo.slice('erro:'.length)}. Veja server/atualizacao.log no servidor para detalhes.`,
            'erro',
            'sistema',
            null,
            'manual'
        );
    }

    db.prepare(
        `INSERT INTO configuracoes_gerais (chave, valor, atualizado_em) VALUES ('ultima_atualizacao_registrada', ?, CURRENT_TIMESTAMP)
         ON CONFLICT (chave) DO UPDATE SET valor = excluded.valor, atualizado_em = CURRENT_TIMESTAMP`
    ).run(conteudo);
}

module.exports = {
    dispararAtualizacao,
    obterStatusAtualizacao,
    verificarVersaoRemota,
    registrarResultadoAtualizacaoPendente,
};
