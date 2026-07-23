// Cria/atualiza as tabelas do banco (idempotente) a partir das especificações em
// 01-espc-geral/. Chamado automaticamente por db.js sempre que o servidor sobe — não é
// preciso rodar nada manualmente antes do primeiro "npm start" — mas também pode ser
// rodado à parte via "npm run migrate" se só quiser (re)aplicar o schema.

function tabelaExiste(db, nome) {
    const linha = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(nome);
    return !!linha;
}

function colunaExiste(db, tabela, coluna) {
    const colunas = db.prepare(`PRAGMA table_info(${tabela})`).all();
    return colunas.some((c) => c.name === coluna);
}

// 06-espc: a antiga tabela "esps" virou "modulos" (+ campo "ativo", - campo "status").
// Só roda uma vez, na primeira inicialização depois do upgrade — preserva os módulos já
// cadastrados em vez de descartar tudo.
function migrarEspsParaModulos(db) {
    if (!tabelaExiste(db, 'esps') || tabelaExiste(db, 'modulos')) return;

    db.exec('ALTER TABLE esps RENAME TO modulos;');

    if (!colunaExiste(db, 'modulos', 'ativo')) {
        db.exec('ALTER TABLE modulos ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1;');
    }

    // "status" (online/offline, medido por ping) saiu do modelo novo — o campo que
    // sobrevive é "ativo" (habilitado/desabilitado pelo usuário, não conectividade).
    if (colunaExiste(db, 'modulos', 'status')) {
        try {
            db.exec('ALTER TABLE modulos DROP COLUMN status;');
        } catch (erro) {
            console.warn('[migrate] Nao foi possivel remover a coluna "status" de modulos (SQLite antigo?):', erro.message);
        }
    }

    console.log('[migrate] Tabela "esps" migrada para "modulos".');
}

function runMigrations(db) {
    migrarEspsParaModulos(db);

    db.exec(`
        CREATE TABLE IF NOT EXISTS modulos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            ip TEXT NOT NULL,
            tipo TEXT NOT NULL,
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Relacionada ao módulo cadastrado (esp_id) — mesmo modelo de dispositivo já usado no
    // firmware (id/tipo/nome/valor/opcoes, ver AquaControl_OS/include/Dispositivo.h),
    // agora persistido no lado do servidor central. "opcoes" fica como TEXT (JSON
    // serializado) já que SQLite não tem tipo array nativo. Ainda sem rotas REST próprias
    // (não faz parte de nenhuma especificação até agora).
    db.exec(`
        CREATE TABLE IF NOT EXISTS dispositivos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            esp_id INTEGER NOT NULL,
            identificador TEXT NOT NULL,
            tipo TEXT NOT NULL,
            nome TEXT NOT NULL,
            valor TEXT,
            opcoes TEXT,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (esp_id) REFERENCES modulos (id) ON DELETE CASCADE
        );
    `);

    // 06-espc: mapeamento das 16 portas (0-15) de um módulo de atuadores — nome
    // personalizado + se está liberada para uso ("habilitado"). UNIQUE(modulo_id,
    // posicao_indice) garante no máximo uma linha por porta por módulo, permitindo usar
    // "ON CONFLICT ... DO UPDATE" (upsert) ao salvar o mapeamento inteiro de uma vez.
    db.exec(`
        CREATE TABLE IF NOT EXISTS portas_mapeamento (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo_id INTEGER NOT NULL,
            posicao_indice INTEGER NOT NULL,
            nome_personalizado TEXT,
            habilitado INTEGER NOT NULL DEFAULT 1,
            descricao TEXT,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE,
            UNIQUE (modulo_id, posicao_indice)
        );
    `);

    // 09-espc (Display -> webservice): biblioteca de QR Codes cadastrados no dashboard —
    // não é só o Wi-Fi de casa, pode ser qualquer conteúdo (URL, texto). "ativo" marca qual
    // dos cadastrados é o que o Display busca/exibe agora (ver GET /api/qrcodes/ativo); só
    // uma linha pode estar ativa por vez, garantido no controller (nunca em SQL), já que
    // SQLite não tem um jeito nativo de expressar "no máximo 1 linha com X=1".
    db.exec(`
        CREATE TABLE IF NOT EXISTS qrcodes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome TEXT NOT NULL,
            conteudo TEXT NOT NULL,
            ativo INTEGER NOT NULL DEFAULT 0,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 09-espc: configurações da tela de descanso (Matrix Core Mode) do Display, hoje fixas
    // em Config.h — passam a viver aqui pra dar pra reajustar sem recompilar/reflashar o
    // firmware. Uma linha só (id fixo 1) porque só existe um Display por enquanto; os
    // valores default replicam exatamente os de Config.h de hoje.
    db.exec(`
        CREATE TABLE IF NOT EXISTS config_display (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            tempo_espera_protecao_segundos INTEGER NOT NULL DEFAULT 120,
            protecao_info_duracao_ms INTEGER NOT NULL DEFAULT 5000,
            protecao_info_pausa_ms INTEGER NOT NULL DEFAULT 2000
        );
    `);

    // 13-espc: histórico de acionamento dos relés — uma linha por PORTA que realmente mudou
    // de estado (não uma linha por comando recebido; um POST /api/reles com 16 posições só
    // gera linhas pras posições que de fato mudaram, ver relesController.js:acionarReles).
    // "origem" distingue clique manual no dashboard de acionamento automático (ex.: Modo
    // Panico desligando tudo). "nome_porta" é uma cópia do nome no momento da mudança (não
    // uma FK pra portas_mapeamento) — assim o histórico continua legível mesmo que a porta
    // seja renomeada ou desmapeada depois; é dado histórico, não deve mudar retroativamente.
    db.exec(`
        CREATE TABLE IF NOT EXISTS historico_reles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo_id INTEGER NOT NULL,
            posicao_indice INTEGER NOT NULL,
            nome_porta TEXT,
            novo_estado INTEGER NOT NULL,
            origem TEXT NOT NULL DEFAULT 'manual',
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE
        );
    `);

    // 14-espc: "tema_nome" identifica QUAL tema disparou a mudança quando origem = 'tema'
    // (NULL nos outros casos) — sem isso, um relatório não conseguiria distinguir "esse
    // relé mudou porque alguém aplicou o tema Manutenção" de um clique avulso.
    if (!colunaExiste(db, 'historico_reles', 'tema_nome')) {
        db.exec('ALTER TABLE historico_reles ADD COLUMN tema_nome TEXT;');
    }

    // 14-espc: Temas — grupos nomeados de relés com um estado (ligado/desligado) definido
    // pra cada um, escolhidos a partir do Mapeamento de Saidas (só portas com nome). Aplicar
    // um tema sobrescreve SÓ os relés que fazem parte dele — os demais ficam como estavam
    // (ver temasController.js:aplicarTema). "ON DELETE CASCADE" em temas_reles garante que
    // apagar um tema não deixa linha órfã.
    db.exec(`
        CREATE TABLE IF NOT EXISTS temas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo_id INTEGER NOT NULL,
            nome TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE
        );
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS temas_reles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tema_id INTEGER NOT NULL,
            posicao_indice INTEGER NOT NULL,
            estado INTEGER NOT NULL,
            FOREIGN KEY (tema_id) REFERENCES temas (id) ON DELETE CASCADE,
            UNIQUE (tema_id, posicao_indice)
        );
    `);
}

module.exports = { runMigrations };
