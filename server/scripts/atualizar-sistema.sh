#!/bin/bash
# Disparado por POST /api/sistema/atualizar (sistemaController.js/sistemaService.js) — roda
# destacado do processo Node (spawn com detached:true + unref, ver dispararAtualizacao em
# sistemaService.js) pra sobreviver ao "pm2 restart" que este proprio script chama no final.
#
# Log completo vai pra atualizacao.log; o resultado final (uma linha, maquina-legivel) vai pra
# atualizacao.status — os dois em server/, fora do git (ver .gitignore). E o arquivo de status
# que sobrevive ao restart do pm2 pra: (1) o front continuar sabendo quando parar o loading
# (GET /api/sistema/atualizar/status), e (2) o processo Node novo, ja de pe, registrar o
# resultado no System Log do proprio painel (ver registrarResultadoAtualizacaoPendente,
# chamado uma vez no boot em server.js).
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
LOG="$RAIZ/server/atualizacao.log"
STATUS="$RAIZ/server/atualizacao.status"
LOCK="$RAIZ/server/atualizacao.lock"

# Garante que o lock some ao final, sucesso ou erro — sem isso um erro no meio do caminho
# deixaria o botao de atualizar bloqueado pra sempre (ver tambem o timeout de lock travado em
# sistemaService.js, segunda linha de defesa caso o proprio script morra sem rodar o trap).
trap 'rm -f "$LOCK"' EXIT

cd "$RAIZ" || { echo "erro:diretorio do projeto nao encontrado" > "$STATUS"; exit 1; }
echo "em_andamento" > "$STATUS"

falhar() {
    echo "ERRO: $1" >> "$LOG"
    echo "erro:$1" > "$STATUS"
    exit 1
}

{
    echo ""
    echo "=== Atualizacao iniciada em $(date '+%Y-%m-%d %H:%M:%S') ==="

    git fetch --all || falhar "git fetch falhou"
    git pull || falhar "git pull falhou (possivel conflito de merge — resolva manualmente no servidor)"
    COMMIT_NOVO="$(git rev-parse --short HEAD)"

    echo "--- client: npm install ---"
    (cd client && npm install) || falhar "npm install do client falhou"

    echo "--- client: npm run build ---"
    (cd client && npm run build) || falhar "build do client falhou"

    echo "--- server: npm install ---"
    (cd server && npm install) || falhar "npm install do server falhou"

    echo "sucesso:$COMMIT_NOVO" > "$STATUS"
    echo "=== Atualizacao concluida em $(date '+%Y-%m-%d %H:%M:%S'), commit $COMMIT_NOVO — reiniciando pm2 ==="

    pm2 restart aquacontrol-brain
} >> "$LOG" 2>&1
