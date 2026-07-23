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

module.exports = db;
