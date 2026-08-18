const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // módulo nativo do Node (>=22.5), sem build nativo/Python
const { runMigrations } = require('./migrate');

// Arquivo .sqlite fica na raiz do server/ (fora do src/), ignorado pelo .gitignore — não é
// commitado, é gerado sozinho na primeira vez que o servidor sobe.
const caminhoDoBanco = path.join(__dirname, '..', '..', 'aquacontrol_brain.sqlite');

const db = new DatabaseSync(caminhoDoBanco);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

runMigrations(db);

// Disco mecanico lento (servidor de producao) + escrita constante (sensoresTelemetriaService
// grava a cada ~5s) fazem o WAL crescer ate o limiar padrao do SQLite (1000 paginas, ~4MB) e
// disparar um checkpoint automatico grande DENTRO de uma escrita qualquer — trava o processo
// por vários segundos, sem aviso, no meio de uma requisicao normal.
//
// Tentativa 1 (revertida): baixar "wal_autocheckpoint" pra checkpoints menores/mais
// frequentes. Piorou na pratica — testado ao vivo contra producao, nesse disco o custo de
// CADA checkpoint parece dominado pelo seek (fixo), nao pelo volume de dados, entao
// checkpointar 5x mais vezes gerou mais paradas no total, nao menos.
//
// Tentativa 2 (esta): mantem o limiar padrao do SQLite, e faz um checkpoint PASSIVE explicito
// de tempos em tempos (nunca interrompe um escritor em andamento, so aproveita o que da) —
// mantem o WAL de um tamanho previsivel sem competir com a escrita constante do polling.
const INTERVALO_CHECKPOINT_MS = 10 * 60 * 1000;
setInterval(() => {
    try {
        db.exec('PRAGMA wal_checkpoint(PASSIVE)');
    } catch (erro) {
        console.warn('[db] Checkpoint periodico do WAL falhou:', erro.message);
    }
}, INTERVALO_CHECKPOINT_MS);

module.exports = db;
