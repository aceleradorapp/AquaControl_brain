const db = require('../database/db');

// Biblioteca de QR Codes (09-espc): o usuário cadastra vários no dashboard (Wi-Fi, URLs,
// textos — qualquer conteúdo) e marca qual está "ativo" — é esse que o Display busca
// quando abre a Tela de QR Code (ver GET /api/qrcodes/ativo, chamado direto pelo firmware).
// A geração do conteúdo em si (ex.: montar a string "WIFI:T:WPA;S:...;;") acontece no
// client (ver PainelQrCodes.jsx) — aqui só guarda/serve a string já pronta.

function formatarQrcode(qr) {
    return { ...qr, ativo: !!qr.ativo };
}

// GET /api/qrcodes — lista todos os cadastrados (pro painel de gerenciamento no dashboard)
function listarQrcodes(req, res) {
    const qrcodes = db.prepare('SELECT * FROM qrcodes ORDER BY id DESC').all();
    res.json(qrcodes.map(formatarQrcode));
}

// GET /api/qrcodes/ativo — o Display chama isso ao abrir a Tela de QR Code. 404 se nunca
// foi marcado nenhum como ativo (o Display trata isso como "nenhum QR cadastrado").
function obterQrcodeAtivo(req, res) {
    const ativo = db.prepare('SELECT * FROM qrcodes WHERE ativo = 1 LIMIT 1').get();
    if (!ativo) {
        return res.status(404).json({ erro: 'Nenhum QR Code ativo no momento.' });
    }
    res.json(formatarQrcode(ativo));
}

// POST /api/qrcodes — cadastra um novo (nome + conteudo obrigatórios). Não marca como
// ativo automaticamente — o usuário escolhe explicitamente via PUT /:id/ativar.
function criarQrcode(req, res) {
    const { nome, conteudo } = req.body;
    if (!nome || !conteudo) {
        return res.status(400).json({ erro: 'Os campos "nome" e "conteudo" sao obrigatorios.' });
    }

    const resultado = db.prepare('INSERT INTO qrcodes (nome, conteudo) VALUES (?, ?)').run(nome, conteudo);
    const novo = db.prepare('SELECT * FROM qrcodes WHERE id = ?').get(resultado.lastInsertRowid);
    res.status(201).json(formatarQrcode(novo));
}

// PUT /api/qrcodes/:id/ativar — marca este como o único ativo (desmarca qualquer outro
// antes, numa transacao — nunca pode sobrar mais de um "ativo:1" ao mesmo tempo).
function ativarQrcode(req, res) {
    const { id } = req.params;
    const qrcode = db.prepare('SELECT * FROM qrcodes WHERE id = ?').get(id);
    if (!qrcode) {
        return res.status(404).json({ erro: 'QR Code nao encontrado.' });
    }

    db.exec('BEGIN');
    try {
        db.prepare('UPDATE qrcodes SET ativo = 0 WHERE ativo = 1').run();
        db.prepare('UPDATE qrcodes SET ativo = 1 WHERE id = ?').run(id);
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    const atualizado = db.prepare('SELECT * FROM qrcodes WHERE id = ?').get(id);
    res.json(formatarQrcode(atualizado));
}

const PAPEIS_VALIDOS = ['wifi', 'app'];

// GET /api/qrcodes/papel/:papel — os botões fixos "Internet"/"App" da tela principal do
// Display (04-espc) buscam por AQUI, não por "/ativo": os dois precisam de um QR sempre
// disponível ao mesmo tempo, independente de qual está "ativo" no momento. 404 se nenhum QR
// tiver esse papel atribuído ainda — o Display trata isso como "nenhum QR cadastrado".
function obterQrcodePorPapel(req, res) {
    const { papel } = req.params;
    if (!PAPEIS_VALIDOS.includes(papel)) {
        return res.status(400).json({ erro: `Papel invalido: "${papel}". Use um de: ${PAPEIS_VALIDOS.join(', ')}.` });
    }

    const qrcode = db.prepare('SELECT * FROM qrcodes WHERE papel = ?').get(papel);
    if (!qrcode) {
        return res.status(404).json({ erro: `Nenhum QR Code com o papel "${papel}" cadastrado ainda.` });
    }
    res.json(formatarQrcode(qrcode));
}

// PUT /api/qrcodes/:id/papel — atribui (ou remove, se "papel" vier null/vazio) o papel fixo
// deste QR. Mesma exclusividade de ativarQrcode acima: no máximo 1 QR com cada papel por
// vez, então atribuir aqui desmarca automaticamente qualquer outro que já tivesse esse
// mesmo papel (numa transação, mesmo raciocínio do "ativo").
function atribuirPapelQrcode(req, res) {
    const { id } = req.params;
    const papel = req.body.papel || null;

    if (papel !== null && !PAPEIS_VALIDOS.includes(papel)) {
        return res.status(400).json({ erro: `Papel invalido: "${papel}". Use um de: ${PAPEIS_VALIDOS.join(', ')}, ou null pra remover.` });
    }

    const qrcode = db.prepare('SELECT * FROM qrcodes WHERE id = ?').get(id);
    if (!qrcode) {
        return res.status(404).json({ erro: 'QR Code nao encontrado.' });
    }

    db.exec('BEGIN');
    try {
        if (papel !== null) {
            db.prepare('UPDATE qrcodes SET papel = NULL WHERE papel = ? AND id != ?').run(papel, id);
        }
        db.prepare('UPDATE qrcodes SET papel = ? WHERE id = ?').run(papel, id);
        db.exec('COMMIT');
    } catch (erro) {
        db.exec('ROLLBACK');
        throw erro;
    }

    const atualizado = db.prepare('SELECT * FROM qrcodes WHERE id = ?').get(id);
    res.json(formatarQrcode(atualizado));
}

// DELETE /api/qrcodes/:id
function deletarQrcode(req, res) {
    const { id } = req.params;
    const resultado = db.prepare('DELETE FROM qrcodes WHERE id = ?').run(id);
    if (resultado.changes === 0) {
        return res.status(404).json({ erro: 'QR Code nao encontrado.' });
    }
    res.status(204).send();
}

module.exports = { listarQrcodes, obterQrcodeAtivo, criarQrcode, ativarQrcode, deletarQrcode, obterQrcodePorPapel, atribuirPapelQrcode };
