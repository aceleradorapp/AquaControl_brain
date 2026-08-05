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

// 24-espc: "faixas_seguras" tinha 1 linha por TIPO de sensor — "sensor_temp" cobria agua E ar
// juntos, sem distincao. O usuario pediu calibracao SEPARADA pra agua (controla o aquario,
// 3x DS18B20) e ar (1x DHT11) — as chaves mudam de "sensor_temp"/"sensor_ph"/"sensor_umidade"
// pra "temp_agua"/"temp_ar"/"ph_agua"/"umidade_ar". Migra as linhas antigas preservando os
// valores ja customizados (o antigo "sensor_temp" vira o novo "temp_ar" — "temp_agua" fica de
// fora de proposito, ganha o default novo pedido explicitamente pelo usuario, 22-28, aplicado
// no INSERT OR IGNORE logo depois desta funcao). So roda uma vez — se as chaves antigas nao
// existirem mais (instalacao nova, ou upgrade ja aplicado antes), nao faz nada.
function migrarFaixasSegurasParaChavesEspecificas(db) {
    if (!tabelaExiste(db, 'faixas_seguras')) return;

    const antigoTemp = db.prepare("SELECT * FROM faixas_seguras WHERE sensor_tipo = 'sensor_temp'").get();
    const antigoPh = db.prepare("SELECT * FROM faixas_seguras WHERE sensor_tipo = 'sensor_ph'").get();
    const antigoUmidade = db.prepare("SELECT * FROM faixas_seguras WHERE sensor_tipo = 'sensor_umidade'").get();
    if (!antigoTemp && !antigoPh && !antigoUmidade) return;

    const upsert = db.prepare('INSERT OR IGNORE INTO faixas_seguras (sensor_tipo, minimo, maximo) VALUES (?, ?, ?)');
    if (antigoTemp) upsert.run('temp_ar', antigoTemp.minimo, antigoTemp.maximo);
    if (antigoPh) upsert.run('ph_agua', antigoPh.minimo, antigoPh.maximo);
    if (antigoUmidade) upsert.run('umidade_ar', antigoUmidade.minimo, antigoUmidade.maximo);

    db.exec("DELETE FROM faixas_seguras WHERE sensor_tipo IN ('sensor_temp', 'sensor_ph', 'sensor_umidade')");
    console.log('[migrate] faixas_seguras migrada pra chaves especificas (temp_agua/temp_ar/ph_agua/umidade_ar).');
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

// 19-espc: Multiplos Horarios por Agendamento — um agendamento agora pode ter VARIOS
// intervalos hora_inicio/hora_fim (ex.: "liga as 08h-12h E as 18h-22h"), nao so um. As
// colunas hora_inicio/hora_fim saem de "agendamentos" e viram uma tabela filha
// (agendamentos_horarios, 1-N), mesmo padrao de temas/temas_reles — ver schedulerService.js
// e agendamentosController.js. Migra qualquer linha existente (o unico intervalo que ela
// tinha) pra a tabela nova antes de remover as colunas antigas; so roda uma vez, na
// primeira inicializacao depois do upgrade.
function migrarAgendamentosParaMultiHorarios(db) {
    if (!tabelaExiste(db, 'agendamentos') || !colunaExiste(db, 'agendamentos', 'hora_inicio')) return;

    db.exec(`
        CREATE TABLE IF NOT EXISTS agendamentos_horarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agendamento_id INTEGER NOT NULL,
            hora_inicio TEXT NOT NULL,
            hora_fim TEXT NOT NULL,
            FOREIGN KEY (agendamento_id) REFERENCES agendamentos (id) ON DELETE CASCADE
        );
    `);

    const linhas = db.prepare('SELECT id, hora_inicio, hora_fim FROM agendamentos').all();
    const inserir = db.prepare('INSERT INTO agendamentos_horarios (agendamento_id, hora_inicio, hora_fim) VALUES (?, ?, ?)');
    for (const linha of linhas) {
        inserir.run(linha.id, linha.hora_inicio, linha.hora_fim);
    }

    try {
        db.exec('ALTER TABLE agendamentos DROP COLUMN hora_inicio;');
        db.exec('ALTER TABLE agendamentos DROP COLUMN hora_fim;');
    } catch (erro) {
        console.warn('[migrate] Nao foi possivel remover hora_inicio/hora_fim de agendamentos (SQLite antigo?):', erro.message);
    }

    console.log(`[migrate] ${linhas.length} agendamento(s) migrado(s) pra multiplos horarios (agendamentos_horarios).`);
}

function runMigrations(db) {
    migrarEspsParaModulos(db);
    migrarAgendamentosParaMultiHorarios(db);

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

    // 04-espc (AquaControl_OS): a tela principal do Display ganhou 2 botões fixos
    // ("Internet" / "App") que precisam buscar um QR Code ESPECÍFICO cada um, direto — não
    // dá mais pra depender só de "ativo" (flag global única, modelo "o que estiver marcado
    // agora", ver comentário acima), já que os dois precisam estar disponíveis AO MESMO
    // TEMPO. "papel" é opcional e independente de "ativo": no máximo 1 linha com
    // papel='wifi' e no máximo 1 com papel='app' (garantido no controller, mesmo padrão já
    // usado pra "ativo"), NULL pra qualquer QR que não esteja associado a nenhum botão fixo.
    if (!colunaExiste(db, 'qrcodes', 'papel')) {
        db.exec('ALTER TABLE qrcodes ADD COLUMN papel TEXT;');
    }

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

    // Cor do Matrix Core Mode (hex "#RRGGBB", mesmo formato do <input type="color"> do
    // browser) — antes fixa em verde (SCIFI_GREEN) no firmware, agora configuravel junto do
    // tempo de espera acima. Coluna aditiva (ALTER TABLE) porque "config_display" ja existia
    // antes desta mudanca.
    if (!colunaExiste(db, 'config_display', 'cor_protecao_hex')) {
        db.exec("ALTER TABLE config_display ADD COLUMN cor_protecao_hex TEXT NOT NULL DEFAULT '#00FF41';");
    }

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

    // 35-espc (01-espc-geral/35_especificacao_tema_tempestade_e_efeitos_reles.md): Tema
    // Tempestade — em vez de uma estrutura paralela, e so mais um TEMA ("tipo_efeito" =
    // 'tempestade' em vez do 'estatico' de sempre), pra herdar de graca tudo que ja existe
    // pra tema (temas_estado/exclusao mutua, agendamentos tipo='tema', timers_ativos
    // alvo_tipo='tema', o botao ativar/desativar de PainelTemas.jsx). Um tema tempestade NAO
    // usa temas_reles (nao tem um estado fixo ligado/desligado) — o motor de fundo
    // (tempestadeService.js) gera raios aleatorios sozinho enquanto ele estiver ativo.
    if (!colunaExiste(db, 'temas', 'tipo_efeito')) {
        db.exec("ALTER TABLE temas ADD COLUMN tipo_efeito TEXT NOT NULL DEFAULT 'estatico';");
    }

    // 35-espc (pedido do usuario apos testar ao vivo — o intervalo fixo de 15-60s entre raios
    // demorava demais pra dar o primeiro flash): intervalo minimo/maximo entre raios,
    // configuravel POR TEMA tempestade (NULL em ambas = usa o padrao do sistema, 15-60s, ver
    // tempestadeService.js). So faz sentido pra tipo_efeito='tempestade', mas fica na propria
    // tabela "temas" (nao numa tabela irma) por serem só 2 numeros, sem necessidade de
    // relacionamento nenhum.
    if (!colunaExiste(db, 'temas', 'tempestade_intervalo_min_s')) {
        db.exec('ALTER TABLE temas ADD COLUMN tempestade_intervalo_min_s INTEGER;');
    }
    if (!colunaExiste(db, 'temas', 'tempestade_intervalo_max_s')) {
        db.exec('ALTER TABLE temas ADD COLUMN tempestade_intervalo_max_s INTEGER;');
    }

    // 35-espc: mapeamento das 8 posicoes fisicas da calha pro indice de rele real (0-15) —
    // "posicao_indice_rele" NULL = posicao ainda nao mapeada (fica de fora dos raios
    // gerados). Tabela IRMA de temas_reles, mas escopada por tema_id igual ela (nao por
    // modulo_id) — permite, em tese, mais de um Tema Tempestade com mapeamentos diferentes.
    db.exec(`
        CREATE TABLE IF NOT EXISTS tema_tempestade_lampadas (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tema_id INTEGER NOT NULL,
            posicao_lampada INTEGER NOT NULL,
            posicao_indice_rele INTEGER,
            FOREIGN KEY (tema_id) REFERENCES temas (id) ON DELETE CASCADE,
            UNIQUE (tema_id, posicao_lampada)
        );
    `);

    // 15-espc: qual Tema está "ativo" agora, por módulo — nunca dois ao mesmo tempo (regra
    // de negócio, não só de UI). Uma linha por módulo (PRIMARY KEY modulo_id); "ON DELETE
    // SET NULL" garante que apagar o tema ativo não deixa a linha apontando pra um id morto
    // (db.js já liga PRAGMA foreign_keys = ON, então isso é aplicado de verdade pelo SQLite).
    db.exec(`
        CREATE TABLE IF NOT EXISTS temas_estado (
            modulo_id INTEGER PRIMARY KEY,
            tema_ativo_id INTEGER,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE,
            FOREIGN KEY (tema_ativo_id) REFERENCES temas (id) ON DELETE SET NULL
        );
    `);

    // 18-espc (01-espc-geral/15_engine_agendamento_timers_e_overrides.md — numeracao colide
    // de proposito com o "15-espc" das linhas acima, que e um arquivo de especificacao
    // diferente; ver schedulerService.js): agendamentos programados por rele OU tema, com
    // janela hora_inicio/hora_fim e dias_semana (JSON array de siglas "SEG".."DOM").
    // "modulo_id" nao esta no schema literal da especificacao, mas foi adicionado aqui pelo
    // mesmo motivo de toda outra tabela que aciona hardware de verdade (temas, historico_reles)
    // — o motor precisa saber QUAL modulo/ESP acionar. "nome" e uma copia do nome do alvo no
    // momento do cadastro (mesma logica de "nome_porta" em historico_reles), pra continuar
    // legivel mesmo se a porta/tema for renomeado ou removido depois.
    db.exec(`
        CREATE TABLE IF NOT EXISTS agendamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo_id INTEGER NOT NULL,
            tipo TEXT NOT NULL CHECK (tipo IN ('rele', 'tema')),
            alvo_id INTEGER NOT NULL,
            nome TEXT,
            dias_semana TEXT NOT NULL,
            repetir INTEGER NOT NULL DEFAULT 1,
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE
        );
    `);

    // 19-espc: 1-N intervalos hora_inicio/hora_fim por agendamento (ver
    // migrarAgendamentosParaMultiHorarios acima, que ja cria esta mesma tabela pra migrar
    // instalacoes antigas — este CREATE aqui e so a garantia idempotente pra instalacao nova).
    db.exec(`
        CREATE TABLE IF NOT EXISTS agendamentos_horarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agendamento_id INTEGER NOT NULL,
            hora_inicio TEXT NOT NULL,
            hora_fim TEXT NOT NULL,
            FOREIGN KEY (agendamento_id) REFERENCES agendamentos (id) ON DELETE CASCADE
        );
    `);

    // 18-espc: Timers Rapidos (ex.: "ligar Filtragem por 30min") — enquanto uma linha aqui
    // nao expira, o alvo fica forcado ligado, sobrepondo o que o agendamento normal diria
    // (ver schedulerService.js:aplicarTimers). Ao expirar (ou ser cancelado antes), a linha
    // e removida e o motor "restaura a agenda" (reavalia o horario normal pro alvo).
    db.exec(`
        CREATE TABLE IF NOT EXISTS timers_ativos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo_id INTEGER NOT NULL,
            alvo_tipo TEXT NOT NULL CHECK (alvo_tipo IN ('rele', 'tema')),
            alvo_id INTEGER NOT NULL,
            nome TEXT,
            duracao_segundos INTEGER NOT NULL,
            disparado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            expira_em DATETIME NOT NULL,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE
        );
    `);

    // 18-espc: log de alto nivel do motor de autocontrole (override manual, timers,
    // re-sincronizacao pos-queda/pos-override) — DIFERENTE de historico_reles (que ja
    // registra CADA rele que mudou de estado, com origem='agendamento'/'tema'/etc.). Esta
    // tabela guarda os eventos "de orquestracao" (o que disparou a mudanca, nao a mudanca
    // rele-a-rele em si). "modulo_id" pode ser NULL (ex.: nao faz sentido nenhum ainda).
    db.exec(`
        CREATE TABLE IF NOT EXISTS historico_autocontrol (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo_id INTEGER,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            evento TEXT NOT NULL,
            origem TEXT NOT NULL,
            detalhes TEXT,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE
        );
    `);

    // 31-espc: resultado estruturado de UMA execucao do Diagnostico Completo (agendado de
    // hora em hora, ou manual via Central de Diagnostico) — "detalhes" guarda o JSON inteiro
    // (banco/modulos/sensores checados naquele momento, ver diagnosticoService.js), pra a
    // modal de detalhe conseguir reconstruir o checklist completo so com o ID salvo na linha
    // do System Log correspondente. Criada ANTES de system_logs (referenciada por ela).
    db.exec(`
        CREATE TABLE IF NOT EXISTS system_diagnostics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            status TEXT NOT NULL,
            detalhes TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 31-espc: System Log persistido — antes o "System Log" do dashboard era 100% em memoria
    // no navegador (useState, se perdia num refresh) e so registrava acoes clicadas pelo
    // proprio usuario. Esta tabela e a fonte de verdade nova, escrita pelo BACKEND (nao mais
    // so pelo front) — cobre eventos que acontecem sem ninguem olhando o dashboard (rele
    // automatico via termostato/agendamento, queda/retorno de conexao de um modulo, o
    // diagnostico horario). "diagnostico_id" (FK opcional) e o que torna uma linha de
    // diagnostico CLICAVEL no front (ver ModalDetalheDiagnostico.jsx) — aponta pra
    // system_diagnostics.id; NULL em qualquer outro tipo de log.
    db.exec(`
        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nivel TEXT NOT NULL,
            categoria TEXT NOT NULL,
            mensagem TEXT NOT NULL,
            diagnostico_id INTEGER,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (diagnostico_id) REFERENCES system_diagnostics (id) ON DELETE SET NULL
        );
    `);

    // 32-espc: "origem" (manual x automatico) — filtro pedido pela pagina /logs. Coluna
    // ADITIVA (a tabela já existia desde o 31-espc) — NULL em linhas antigas gravadas antes
    // desta migracao, e em qualquer categoria futura onde "manual vs automatico" nao fizer
    // sentido nenhum (o filtro so precisa tratar NULL como "nao informado", nao como erro).
    if (!colunaExiste(db, 'system_logs', 'origem')) {
        db.exec("ALTER TABLE system_logs ADD COLUMN origem TEXT;");
    }

    // 32-espc: indices pra pagina /logs continuar rapida com milhares de linhas — "criado_em"
    // pro filtro de intervalo de data (WHERE criado_em BETWEEN ?), "categoria"/"nivel" pros
    // filtros de combobox/pills. A ordenacao em si (ORDER BY id DESC) já é de graça — id é a
    // chave primaria/rowid, não precisa de índice próprio.
    db.exec('CREATE INDEX IF NOT EXISTS idx_system_logs_criado_em ON system_logs (criado_em);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_system_logs_categoria ON system_logs (categoria);');
    db.exec('CREATE INDEX IF NOT EXISTS idx_system_logs_nivel ON system_logs (nivel);');

    // 33-espc: conta(s) ADM (Pareamento Silencioso de Dispositivo) — o PRIMEIRO cadastro
    // (POST /api/auth/registrar, publico, so funciona uma vez — ver
    // authService.js:registrarAdmin/existeAdmin) cria a conta inicial; dai em diante, novas
    // contas so podem ser criadas por quem ja esta autenticado, pela lista de usuarios em
    // Configuracoes (34-espc, ver authService.js:criarAdminAdicional). "senha_hash" guarda
    // "sal:hash" (scrypt, ver authService.js) — NUNCA a senha em texto puro. Deliberadamente
    // FORA de TABELAS_BACKUP (configuracoesGeraisController.js) — um backup/restauracao de
    // configuracao nao deve carregar hash de senha junto.
    db.exec(`
        CREATE TABLE IF NOT EXISTS admin_conta (
            id INTEGER PRIMARY KEY,
            usuario TEXT NOT NULL,
            senha_hash TEXT NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 34-espc: "bloqueado" — desativa o login de UM usuario sem excluir a conta (o
    // administrador pode reverter depois). Aditiva (a tabela ja existia desde o 33-espc);
    // linhas antigas (o unico admin ja cadastrado) ganham 0 (ativo) por padrao — ninguem que
    // ja tinha acesso perde na migracao.
    if (!colunaExiste(db, 'admin_conta', 'bloqueado')) {
        db.exec('ALTER TABLE admin_conta ADD COLUMN bloqueado INTEGER NOT NULL DEFAULT 0;');
    }

    // 35-espc (numeracao real da especificacao e "34", mas esse numero ja foi usado nos
    // comentarios do modulo multiusuario ADM pedido antes desta espec formal existir — ver
    // nota em CLAUDE.md/historico da sessao): populacao de peixes/fauna exibida na Aba
    // "Moradores" da Pagina de Visitante — GET publico, POST/PUT/DELETE exigem o JWT (ver
    // middlewares/autenticacao.js) por pedido EXPLICITO desta especificacao (diferente do
    // resto da API de auth, que e so um portao de UI — aqui o proprio spec pediu protecao de
    // verdade). "imagem_url" opcional — sem ela, o front mostra um placeholder ilustrado (sem
    // depender de nenhuma URL externa fixa, ver PaginaVisitanteFauna.jsx).
    db.exec(`
        CREATE TABLE IF NOT EXISTS fauna (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nome_comum TEXT NOT NULL,
            nome_cientifico TEXT,
            quantidade INTEGER NOT NULL DEFAULT 1,
            ph_minimo REAL,
            ph_maximo REAL,
            temperatura_minima REAL,
            temperatura_maxima REAL,
            origem TEXT,
            comportamento TEXT,
            imagem_url TEXT,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // Populacao inicial (35-espc) — so semeia se a tabela estiver vazia, pra nao recriar as
    // linhas depois que o usuario editar/excluir pelo painel ADM (mesmo espirito idempotente
    // de outras semeaduras deste arquivo, ex.: migrarFaixasSegurasParaChavesEspecificas acima).
    const totalFauna = db.prepare('SELECT COUNT(*) AS total FROM fauna').get().total;
    if (totalFauna === 0) {
        const inserirFauna = db.prepare(`
            INSERT INTO fauna (nome_comum, nome_cientifico, quantidade, ph_minimo, ph_maximo, temperatura_minima, temperatura_maxima, origem, comportamento)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        inserirFauna.run(
            'Cascudo Abacaxi Negro',
            'Pterygoplichthys pardalis',
            2,
            6.5,
            7.5,
            22,
            28,
            'Bacia Amazônica e rios de água doce da América do Sul',
            'Bentônico e principalmente noturno — passa o dia abrigado entre troncos e pedras, saindo à noite para raspar algas e restos orgânicos do fundo e da decoração com a boca em ventosa. Pacífico com outras espécies, tolera bem conviver com o morfo albino da mesma espécie.'
        );
        inserirFauna.run(
            'Cascudo Abacaxi Albino',
            'Pterygoplichthys pardalis (morfo albino)',
            2,
            6.5,
            7.5,
            22,
            28,
            'Morfo albino de criação em cativeiro, a partir da mesma espécie da Bacia Amazônica',
            'Mesmo comportamento do Cascudo Abacaxi Negro (bentônico, noturno, raspador de algas) — a diferença é só a ausência de pigmentação escura, resultado de uma mutação albina fixada em criação. Sensível a luz muito intensa, aproveita bem os esconderijos entre os troncos de aroeira.'
        );
    }

    // 16-espc: historico dos 7 sensores reais (AquaControl_sensor), pra relatorios futuros —
    // uma linha por MUDANCA de valor (nao uma linha por ciclo de polling, ver
    // sensoresTelemetriaService.js), senao a tabela cresceria rapido demais sem necessidade
    // (o sensor e lido a cada poucos segundos). "valor" fica como TEXT (mesmo raciocinio do
    // "valor" em Dispositivo.h no firmware) pra caber tanto numero quanto o texto amigavel de
    // um sensor booleano (ex.: inclinacao); NULL quando o sensor estava desconectado no
    // momento (nao inventa um valor pra um sensor que nao respondeu).
    db.exec(`
        CREATE TABLE IF NOT EXISTS historico_sensores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo_id INTEGER NOT NULL,
            sensor_id TEXT NOT NULL,
            tipo TEXT NOT NULL,
            nome TEXT NOT NULL,
            valor TEXT,
            unidade TEXT,
            conectado INTEGER NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE
        );
    `);

    // 17-espc (Central de Relatorios, consumo de agua): totalizador de volume do fluxometro
    // (YF-S201), lido direto do proprio ESP a cada snapshot (nao calculado aqui) — NULL pra
    // qualquer sensor que nao seja "fluxo_agua". Precisa ser uma coluna a parte (nao dá pra
    // reaproveitar "valor", que pro fluxometro guarda a VAZAO instantanea em L/min, nao o
    // volume acumulado) porque o relatorio de consumo total no periodo soma os DELTAS
    // positivos entre snapshots consecutivos deste campo (robusto a reset do contador num
    // reboot do ESP) — ver relatoriosService.js.
    if (!colunaExiste(db, 'historico_sensores', 'volume_total_l')) {
        db.exec('ALTER TABLE historico_sensores ADD COLUMN volume_total_l REAL;');
    }

    // 16-espc: quais sensores (no maximo 6, aplicado no controller) apareciam na tela
    // principal do Display, e em que ordem/posicao (0-5, cada posicao virava um slot no grid
    // do firmware) — configuravel no extinto widget "Sensores no Display" do dashboard.
    // 29-espc: ORFAO — nenhuma rota/controller le ou escreve mais nesta tabela (a tela
    // principal do Display virou 3 arcos fixos, sem selecao manual de sensores; ver
    // telemetriaDisplayService.js). Mantida no schema (nao dropada) so pra nao quebrar um
    // restore de backup antigo que ainda tenha essa tabela — ver TABELAS_BACKUP em
    // configuracoesGeraisController.js.
    db.exec(`
        CREATE TABLE IF NOT EXISTS config_display_sensores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sensor_id TEXT NOT NULL UNIQUE,
            posicao INTEGER NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 16-espc (nomes personalizados): dois nomes por sensor, além do que o firmware manda por
    // padrão — "nome_personalizado" é o nome geral (aparece em todo lugar no dashboard: widget,
    // Diagrama de Sensores, Esquematico dos Sensores), "nome_display" é um nome DIFERENTE,
    // usado SÓ no que é enviado pro Display de verdade (telemetriaDisplayService.js) — pensado
    // pra caber melhor no card pequeno da tela física, sem precisar afetar o nome mostrado no
    // site. Ambos NULL = usa o nome que vem de fábrica do firmware do sensor. Sem modulo_id de
    // proposito, mesma simplificacao de config_display_sensores (só existe 1 módulo de
    // telemetria por enquanto).
    db.exec(`
        CREATE TABLE IF NOT EXISTS sensores_personalizados (
            sensor_id TEXT PRIMARY KEY,
            nome_personalizado TEXT,
            nome_display TEXT,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 19-espc (Configuracoes Globais do Sistema): armazem generico chave/valor pra
    // preferencias heterogeneas (aparencia, notificacoes, intervalos de polling, retencao de
    // historico etc.) — chave/valor em vez de uma tabela rigida por categoria porque a lista
    // de configuracoes vai crescer aos poucos e nem toda categoria da pagina de Configuracoes
    // tem dado real pra persistir (ver 01-espc-geral/19_configuracoes_globais.md pra quais
    // chaves existem hoje e o que cada uma controla de verdade). "valor" fica como TEXT — quem
    // le decide se interpreta como numero/bool/JSON.
    db.exec(`
        CREATE TABLE IF NOT EXISTS configuracoes_gerais (
            chave TEXT PRIMARY KEY,
            valor TEXT,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);

    // 19-espc: faixas de seguranca — usadas pra marcar anomalias/alertas na Central de
    // Relatorios (17-espc). Antes eram uma constante hardcoded em relatoriosService.js
    // (FAIXAS_SEGURAS); agora sao editaveis na pagina de Configuracoes. 24-espc: a chave
    // deixou de ser o "tipo" cru do sensor (que misturava agua e ar sob "sensor_temp") e virou
    // um grupo especifico — ver migrarFaixasSegurasParaChavesEspecificas acima.
    db.exec(`
        CREATE TABLE IF NOT EXISTS faixas_seguras (
            sensor_tipo TEXT PRIMARY KEY,
            minimo REAL NOT NULL,
            maximo REAL NOT NULL
        );
    `);

    migrarFaixasSegurasParaChavesEspecificas(db);

    // Semeia qualquer chave ainda ausente (instalacao nova, ou uma que a migracao acima nao
    // tinha o que preservar) com os defaults — "temp_agua" 22-28 e o valor pedido
    // explicitamente pelo usuario (controla a temperatura do proprio aquario).
    const inserirFaixaSeAusente = db.prepare('INSERT OR IGNORE INTO faixas_seguras (sensor_tipo, minimo, maximo) VALUES (?, ?, ?)');
    inserirFaixaSeAusente.run('temp_agua', 22, 28);
    inserirFaixaSeAusente.run('temp_ar', 22, 28);
    inserirFaixaSeAusente.run('ph_agua', 6.5, 7.5);
    inserirFaixaSeAusente.run('umidade_ar', 30, 80);

    // 19-espc: Equipamentos & Automacao — termostato por histerese (aquecedor/resfriador),
    // multiplos e independentes, cada um observando UM sensor e controlando UM rele. "tipo"
    // decide a polaridade: "aquecedor" liga quando o sensor fica ABAIXO de "temp_min" e
    // desliga quando fica ACIMA de "temp_max"; "resfriador" e o inverso (liga acima do
    // maximo, desliga abaixo do minimo). Entre os dois limites, o motor NAO MEXE no estado
    // atual (histerese classica — evita liga/desliga em sequencia rapida bem em cima do
    // limiar). "atraso_segundos" exige que a condicao de troca se mantenha por esse tempo
    // antes de agir de verdade (debounce contra picos passageiros de leitura). Ver
    // automacaoEquipamentosService.js.
    db.exec(`
        CREATE TABLE IF NOT EXISTS equipamentos_automacao (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo_id INTEGER NOT NULL,
            posicao_indice INTEGER NOT NULL,
            nome TEXT NOT NULL,
            sensor_id TEXT NOT NULL,
            tipo TEXT NOT NULL CHECK (tipo IN ('aquecedor', 'resfriador')),
            temp_min REAL NOT NULL,
            temp_max REAL NOT NULL,
            atraso_segundos INTEGER NOT NULL DEFAULT 30,
            ativo INTEGER NOT NULL DEFAULT 1,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE,
            UNIQUE (modulo_id, posicao_indice)
        );
    `);

    // 24-espc: Calibracao de Vazao (fluxometro YF-S201) — linha unica (so existe 1
    // fluxometro), valores em LITROS/HORA (nao L/min, que e a unidade nativa do sensor —
    // "litros hora" e como o usuario pensa na vazao da propria bomba, ex.: "bomba de 2000
    // L/h"; a conversao L/min -> L/h [x60] acontece em relatoriosService.js na hora de
    // comparar). "vazao_troca_filtro_lh" e o 3º limite pedido: um patamar ACIMA do minimo
    // critico que sinaliza "vazao caindo, provavelmente o filtro esta entupindo" — o usuario
    // pretende calibrar esse numero na pratica, observando o historico real de vazao ja
    // gravado (ver historico_sensores/volume_total_l, 17-espc) ao longo do tempo; o default
    // aqui e so um ponto de partida.
    db.exec(`
        CREATE TABLE IF NOT EXISTS calibracao_fluxo (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            vazao_maxima_lh REAL NOT NULL DEFAULT 2000,
            vazao_minima_lh REAL NOT NULL DEFAULT 200,
            vazao_troca_filtro_lh REAL NOT NULL DEFAULT 800,
            atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    `);
    db.exec(`
        INSERT OR IGNORE INTO calibracao_fluxo (id, vazao_maxima_lh, vazao_minima_lh, vazao_troca_filtro_lh)
        VALUES (1, 2000, 200, 800)
    `);

    // 36-espc (Consumo de Energia, estimado): potencia nominal declarada pelo usuario, NAO
    // medida por sensor nenhum — ver 01-espc-geral/36_consumo_energia_atuadores_modulos.md.
    // NULL = porta sem potencia configurada, fica de fora do calculo (nunca aparece como
    // "0W", que fingiria uma precisao que nao existe).
    if (!colunaExiste(db, 'portas_mapeamento', 'potencia_watts')) {
        db.exec('ALTER TABLE portas_mapeamento ADD COLUMN potencia_watts REAL;');
    }

    // 36-espc: consumo proprio do modulo (ESP32 sempre energizado, nao comutado por rele
    // nenhum) — mesmo raciocinio de "NULL = fora do calculo" da coluna acima.
    if (!colunaExiste(db, 'modulos', 'potencia_base_watts')) {
        db.exec('ALTER TABLE modulos ADD COLUMN potencia_base_watts REAL;');
    }

    // 36-espc: resumo diario de consumo, POR EQUIPAMENTO (posicao_indice >= 0) ou pelo
    // proprio modulo (posicao_indice = -1, sentinela — nao usamos NULL aqui porque o SQLite
    // trata cada NULL como distinto numa UNIQUE, o que deixaria multiplas linhas "do modulo"
    // coexistirem no mesmo dia sem violar a constraint). "nome"/"potencia_watts" sao um
    // snapshot do dia (sobrevive a porta ser renomeada ou ter a potencia reconfigurada
    // depois) — mesmo espirito de "nome_porta" em historico_reles. Existe pra sobreviver a
    // limpeza periodica de historico_reles (retencao_historico_dias, ver
    // manutencaoService.js) e pra nao reprocessar todo o historico bruto a cada relatorio —
    // ver energiaService.js.
    db.exec(`
        CREATE TABLE IF NOT EXISTS consumo_energia_diario (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            modulo_id INTEGER NOT NULL,
            posicao_indice INTEGER NOT NULL DEFAULT -1,
            nome TEXT NOT NULL,
            dia TEXT NOT NULL,
            potencia_watts REAL NOT NULL,
            horas_ligado REAL NOT NULL,
            kwh REAL NOT NULL,
            criado_em DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (modulo_id) REFERENCES modulos (id) ON DELETE CASCADE,
            UNIQUE (modulo_id, posicao_indice, dia)
        );
    `);
    db.exec('CREATE INDEX IF NOT EXISTS idx_consumo_energia_dia ON consumo_energia_diario (dia);');
}

module.exports = { runMigrations };
