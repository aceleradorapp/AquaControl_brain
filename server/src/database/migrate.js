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

    // 16-espc: quais sensores (no maximo 6, aplicado no controller) aparecem na tela
    // principal do Display, e em que ordem/posicao (0-5, cada posicao vira um slot no grid
    // do firmware) — configuravel no widget "Sensores no Display" do dashboard. Uma linha
    // por sensor selecionado; UNIQUE(sensor_id) porque cada sensor so pode ocupar 1 posicao.
    // Sem modulo_id de proposito — mesma simplificacao ja usada em config_display: so existe
    // um modulo de telemetria e um Display no ecossistema por enquanto.
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
}

module.exports = { runMigrations };
