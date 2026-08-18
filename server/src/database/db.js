const path = require('path');
const { DatabaseSync } = require('node:sqlite'); // módulo nativo do Node (>=22.5), sem build nativo/Python
const { runMigrations } = require('./migrate');

// Arquivo .sqlite fica na raiz do server/ (fora do src/), ignorado pelo .gitignore — não é
// commitado, é gerado sozinho na primeira vez que o servidor sobe.
const caminhoDoBanco = path.join(__dirname, '..', '..', 'aquacontrol_brain.sqlite');

const db = new DatabaseSync(caminhoDoBanco);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Disco mecanico lento (servidor de producao, ver conversa) + escrita constante
// (sensoresTelemetriaService grava a cada ~5s) faziam o WAL crescer ate o limiar padrao do
// SQLite (1000 paginas, ~4MB) e disparar um checkpoint automatico GRANDE no meio de qualquer
// request — travava o processo por vários segundos, sem aviso. Baixar o limiar faz o SQLite
// checkpointar mais vezes, cada uma bem menor/mais rapida, em vez de acumular um pico so.
db.exec('PRAGMA wal_autocheckpoint = 200');

runMigrations(db);

// Reforco do ajuste acima: um checkpoint PASSIVE (nunca interrompe um escritor em andamento,
// so aproveita o que da) a cada 15min, garantindo que o WAL fique pequeno mesmo em janelas de
// pouco trafego onde o limiar por volume de escrita demoraria a disparar sozinho.
const INTERVALO_CHECKPOINT_MS = 15 * 60 * 1000;
setInterval(() => {
    try {
        db.exec('PRAGMA wal_checkpoint(PASSIVE)');
    } catch (erro) {
        console.warn('[db] Checkpoint periodico do WAL falhou:', erro.message);
    }
}, INTERVALO_CHECKPOINT_MS);

module.exports = db;
