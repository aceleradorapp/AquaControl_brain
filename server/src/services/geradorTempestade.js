// Gerador de padroes de raio (35-espc, Tema Tempestade — ver
// 01-espc-geral/35_especificacao_tema_tempestade_e_efeitos_reles.md secao 3). Logica pura,
// sem I/O nenhum — recebe as lampadas ja mapeadas/habilitadas e devolve uma sequencia de
// passos pra tempestadeService.js mandar de uma vez so pro ESP32 executar localmente.
//
// Cada passo e { reles: number[16], delayMs }. "reles" usa TRES valores por posicao (nao so
// liga/desliga): 1=liga, 0=desliga, -1=NAO MEXE — um bitmask puro so representaria dois
// estados, e "nao mexe" e obrigatorio pra nunca atropelar um rele de equipamento real
// (filtro, aquecedor) que nao faz parte da tempestade. Todo "delayMs" passa pelo piso de
// protecao mecanica dos reles (2.3 da spec: 40-120ms minimo entre acionamentos).
//
// Consciencia de COR: a cor de cada uma das 8 posicoes e FIXA pela ordem fisica real da calha
// do usuario (esquerda -> direita), nao mais adivinhada pelo nome do rele escolhido (versao
// anterior tentava detectar "azul"/"vermelha"/"branca" no nome — trocado a pedido do usuario
// por ser mais confiavel: a cor da posicao nao depende de como o rele foi nomeado, so de ONDE
// ele foi encaixado no mapeamento). "CORES_POR_POSICAO[i]" e a cor da Lampada i+1 — quem
// resolve isso pra cada lampada mapeada e tempestadeService.js:lampadasUtilizaveis (anexa
// "cor" em cada objeto antes de chamar gerarEventoRaio).
const CORES_POR_POSICAO = ['azul', 'branca', 'vermelha', 'branca', 'branca', 'vermelha', 'branca', 'azul'];

// Sub-conjuntos de POSICAO (1-8) usados so pela Sequencia de Abertura (ver mais abaixo) — as
// "2 brancas do meio" sao as posicoes 4 e 5 (adjacentes ao centro da calha), "as outras
// brancas" sao 2 e 7 — derivado de CORES_POR_POSICAO acima, mas escrito explicito aqui porque
// so faz sentido pra ESTE layout fisico especifico (nao um calculo generico de "meio").
const POSICOES_BRANCA_MEIO = [4, 5];
const POSICOES_BRANCA_EXTERNA = [2, 7];
const POSICOES_VERMELHA = [3, 6];
const POSICOES_AZUL = [1, 8];

const TOTAL_PORTAS = 16;
const DELAY_MINIMO_MS = 40;

function arrayVazio() {
    return Array(TOTAL_PORTAS).fill(-1);
}

function clamp(valorMs) {
    return Math.max(Math.round(valorMs), DELAY_MINIMO_MS);
}

function entreMs(min, max) {
    return min + Math.random() * (max - min);
}

function nomeCurto(lampada) {
    return lampada.nomeRele ?? `porta ${lampada.posicaoIndiceRele}`;
}

function porPosicoes(lampadasMapeadas, posicoes) {
    return lampadasMapeadas.filter((l) => posicoes.includes(l.posicaoLampada));
}

// Duracao de cada etapa da Sequencia de Abertura — FIXA em 3s cada, pedido explicito do
// usuario (nao aleatoria como os raios normais).
const DURACAO_ETAPA_ABERTURA_MS = 3000;

// --- Sequencia de Abertura (fixa, NAO aleatoria — "sempre sera assim", pedido explicito do
// usuario) — toca so UMA VEZ, na ativacao do tema, simulando o ceu escurecendo antes da
// tempestade comecar de verdade. 4 etapas de 3s cada, sempre "espera 3s, DEPOIS muda":
//   1. Espera 3s (nada muda ainda).
//   2. Apaga as 2 brancas do meio (posicoes 4 e 5), acende as azuis (1, 8) e vermelhas (3, 6)
//      ao mesmo tempo. Espera 3s.
//   3. Apaga as outras 2 brancas (posicoes 2 e 7) — todas as brancas apagadas agora. Espera 3s.
//   4. Apaga as vermelhas — so as azuis ficam acesas (ceu nublado, sem chuva ainda). Espera 3s.
//   5. Apaga as azuis — tudo apagado, pronto pra tempestadeService.js iniciar a sequencia de
//      raios aleatorios logo em seguida (nao embutido nesta sequencia, ver iniciarSessao).
// So mexe nas lampadas MAPEADAS — outros reles (filtro, aquecedor) nunca sao tocados (-1 em
// todo o resto, mesma garantia do resto do gerador).
function gerarSequenciaAbertura(lampadasMapeadas) {
    const brancasMeio = porPosicoes(lampadasMapeadas, POSICOES_BRANCA_MEIO);
    const brancasExternas = porPosicoes(lampadasMapeadas, POSICOES_BRANCA_EXTERNA);
    const vermelhas = porPosicoes(lampadasMapeadas, POSICOES_VERMELHA);
    const azuis = porPosicoes(lampadasMapeadas, POSICOES_AZUL);

    if (brancasMeio.length + brancasExternas.length + vermelhas.length + azuis.length === 0) return null;

    const passo1 = arrayVazio(); // etapa 1: so a espera inicial, nada muda ainda

    const passo2 = arrayVazio();
    for (const l of brancasMeio) passo2[l.posicaoIndiceRele] = 0;
    for (const l of azuis) passo2[l.posicaoIndiceRele] = 1;
    for (const l of vermelhas) passo2[l.posicaoIndiceRele] = 1;

    const passo3 = arrayVazio();
    for (const l of brancasExternas) passo3[l.posicaoIndiceRele] = 0;

    const passo4 = arrayVazio();
    for (const l of vermelhas) passo4[l.posicaoIndiceRele] = 0;

    const passo5 = arrayVazio();
    for (const l of azuis) passo5[l.posicaoIndiceRele] = 0;

    return {
        passos: [
            { reles: passo1, delayMs: DURACAO_ETAPA_ABERTURA_MS },
            { reles: passo2, delayMs: DURACAO_ETAPA_ABERTURA_MS },
            { reles: passo3, delayMs: DURACAO_ETAPA_ABERTURA_MS },
            { reles: passo4, delayMs: DURACAO_ETAPA_ABERTURA_MS },
            { reles: passo5, delayMs: DELAY_MINIMO_MS },
        ],
    };
}

// --- Familia BRANCA (raio "de verdade" — os 3 padroes originais da spec) ---

// Flash Pontual: 2-4 piscadas rapidas e desiguais numa unica lampada branca sorteada.
function gerarFlashPontual(brancas) {
    const alvo = brancas[Math.floor(Math.random() * brancas.length)];
    const piscadas = 2 + Math.floor(Math.random() * 3); // 2, 3 ou 4
    const passos = [];

    for (let i = 0; i < piscadas; i++) {
        const passoLigado = arrayVazio();
        passoLigado[alvo.posicaoIndiceRele] = 1;
        passos.push({ reles: passoLigado, delayMs: clamp(entreMs(50, 150)) });

        const passoApagado = arrayVazio();
        passoApagado[alvo.posicaoIndiceRele] = 0;
        passos.push({ reles: passoApagado, delayMs: clamp(entreMs(60, 150)) });
    }

    return { tipo: 'flash_pontual', descricao: `Raio localizado — ${nomeCurto(alvo)} (${piscadas} piscada(s))`, passos };
}

// Varredura/Tronco: percorre as lampadas brancas em sequencia (esquerda->direita ou o
// inverso, sorteado) — cada uma acende e apaga antes da proxima comecar.
function gerarVarredura(brancas) {
    const ordenadas = [...brancas].sort((a, b) => a.posicaoLampada - b.posicaoLampada);
    const sequencia = Math.random() < 0.5 ? ordenadas : ordenadas.slice().reverse();
    const passos = [];

    for (const lampada of sequencia) {
        const passoLigado = arrayVazio();
        passoLigado[lampada.posicaoIndiceRele] = 1;
        passos.push({ reles: passoLigado, delayMs: clamp(entreMs(60, 120)) });

        const passoApagado = arrayVazio();
        passoApagado[lampada.posicaoIndiceRele] = 0;
        passos.push({ reles: passoApagado, delayMs: clamp(entreMs(20, 40)) });
    }

    return {
        tipo: 'varredura',
        descricao: `Raio de varredura (${sequencia.length} lampada(s), ${sequencia === ordenadas ? 'esquerda->direita' : 'direita->esquerda'})`,
        passos,
    };
}

// Clarao Global: todas as lampadas brancas ligam juntas por um pulso seco e curto, depois
// todas desligam juntas.
function gerarClaraoGlobal(brancas) {
    const passoLigado = arrayVazio();
    const passoApagado = arrayVazio();
    for (const lampada of brancas) {
        passoLigado[lampada.posicaoIndiceRele] = 1;
        passoApagado[lampada.posicaoIndiceRele] = 0;
    }

    return {
        tipo: 'clarao_global',
        descricao: `Clarao global (${brancas.length} lampada(s))`,
        passos: [
            { reles: passoLigado, delayMs: clamp(entreMs(60, 100)) },
            { reles: passoApagado, delayMs: DELAY_MINIMO_MS },
        ],
    };
}

// --- Acento de cor (pedido do usuario: "pode acender a azul com as brancas... mas nao em
// todas as sequencias, pode ser no inicio, no meio ou no fim") — NAO e um tipo de evento
// proprio, e um efeito que se INJETA dentro de um evento branco ja gerado, com chance de nao
// acontecer nenhuma vez (ver comAcentoTalvez). Usa indices DIFERENTES dos da lampada branca
// (nunca a mesma posicao), entao splicar isso no meio dos passos brancos e sempre seguro —
// cada array de passo so tem 1/-1 nos indices que o proprio acento controla, -1 no resto.
function gerarAcento(azuis, vermelhas) {
    const opcoes = [];
    if (azuis.length > 0) opcoes.push('azul');
    if (vermelhas.length > 0) opcoes.push('vermelha');
    if (azuis.length > 0 && vermelhas.length > 0) opcoes.push('ambas');
    if (opcoes.length === 0) return null;

    const escolha = opcoes[Math.floor(Math.random() * opcoes.length)];
    const passoLigado = arrayVazio();
    const passoApagado = arrayVazio();
    const nomes = [];

    if (escolha === 'azul' || escolha === 'ambas') {
        const l = azuis[Math.floor(Math.random() * azuis.length)];
        passoLigado[l.posicaoIndiceRele] = 1;
        passoApagado[l.posicaoIndiceRele] = 0;
        nomes.push(nomeCurto(l));
    }
    if (escolha === 'vermelha' || escolha === 'ambas') {
        const l = vermelhas[Math.floor(Math.random() * vermelhas.length)];
        passoLigado[l.posicaoIndiceRele] = 1;
        passoApagado[l.posicaoIndiceRele] = 0;
        nomes.push(nomeCurto(l));
    }

    return {
        rotulo: `acento ${escolha === 'ambas' ? 'azul+vermelho' : escolha} (${nomes.join(', ')})`,
        // Mais lento que o flash branco — e "fundo de nuvem", nao o raio em si.
        passos: [
            { reles: passoLigado, delayMs: clamp(entreMs(100, 220)) },
            { reles: passoApagado, delayMs: clamp(entreMs(60, 120)) },
        ],
    };
}

// ~40% de chance de injetar o acento, numa posicao aleatoria (inicio/meio/fim) dos passos do
// evento branco — "nao em todas as sequencias", exatamente como pedido.
function comAcentoTalvez(evento, azuis, vermelhas, probabilidade = 0.4) {
    if (Math.random() > probabilidade) return evento;
    const acento = gerarAcento(azuis, vermelhas);
    if (!acento) return evento;

    const posicoes = ['inicio', 'meio', 'fim'];
    const onde = posicoes[Math.floor(Math.random() * posicoes.length)];
    const passos = [...evento.passos];
    const indiceInsercao = onde === 'inicio' ? 0 : onde === 'fim' ? passos.length : Math.floor(passos.length / 2);
    passos.splice(indiceInsercao, 0, ...acento.passos);

    return { ...evento, passos, descricao: `${evento.descricao} + ${acento.rotulo} no ${onde}` };
}

// --- Familia AZUL/VERMELHA (efeitos de "fundo de tempestade", nao o raio em si) ---

// Brilho azul de fundo: 1-2 piscadas MAIS LENTAS que o flash branco (glow, nao raio) numa
// lampada azul sorteada — luz de nuvem/tempestade ao fundo, ver spec 3.1.
function gerarFlashAzulFundo(azuis) {
    const alvo = azuis[Math.floor(Math.random() * azuis.length)];
    const piscadas = 1 + Math.floor(Math.random() * 2); // 1 ou 2
    const passos = [];

    for (let i = 0; i < piscadas; i++) {
        const passoLigado = arrayVazio();
        passoLigado[alvo.posicaoIndiceRele] = 1;
        passos.push({ reles: passoLigado, delayMs: clamp(entreMs(120, 250)) });

        const passoApagado = arrayVazio();
        passoApagado[alvo.posicaoIndiceRele] = 0;
        passos.push({ reles: passoApagado, delayMs: clamp(entreMs(150, 300)) });
    }

    return { tipo: 'flash_azul_fundo', descricao: `Brilho azul de fundo — ${nomeCurto(alvo)}`, passos };
}

// Alerta vermelho: mais raro, mais lento ainda (glow/aviso, nao piscada rapida) — sozinho,
// sem acompanhar nenhum branco.
function gerarVermelhoAlerta(vermelhas) {
    const alvo = vermelhas[Math.floor(Math.random() * vermelhas.length)];
    const passoLigado = arrayVazio();
    passoLigado[alvo.posicaoIndiceRele] = 1;
    const passoApagado = arrayVazio();
    passoApagado[alvo.posicaoIndiceRele] = 0;

    return {
        tipo: 'vermelho_alerta',
        descricao: `Alerta vermelho — ${nomeCurto(alvo)}`,
        passos: [
            { reles: passoLigado, delayMs: clamp(entreMs(200, 400)) },
            { reles: passoApagado, delayMs: DELAY_MINIMO_MS },
        ],
    };
}

// Raio combinado azul+vermelho: uma lampada de cada cor juntas, pulso curto — o efeito
// "aurora"/cores misturadas pedido explicitamente.
function gerarCombinadoAzulVermelho(azuis, vermelhas) {
    const azul = azuis[Math.floor(Math.random() * azuis.length)];
    const vermelha = vermelhas[Math.floor(Math.random() * vermelhas.length)];

    const passoLigado = arrayVazio();
    passoLigado[azul.posicaoIndiceRele] = 1;
    passoLigado[vermelha.posicaoIndiceRele] = 1;
    const passoApagado = arrayVazio();
    passoApagado[azul.posicaoIndiceRele] = 0;
    passoApagado[vermelha.posicaoIndiceRele] = 0;

    return {
        tipo: 'combinado_azul_vermelho',
        descricao: `Raio combinado azul+vermelho — ${nomeCurto(azul)} e ${nomeCurto(vermelha)}`,
        passos: [
            { reles: passoLigado, delayMs: clamp(entreMs(80, 160)) },
            { reles: passoApagado, delayMs: DELAY_MINIMO_MS },
        ],
    };
}

// Raio cruzando o ceu: flash azul na lampada mais a ESQUERDA, pausa (o "tempo de travessia"),
// flash azul na mais a DIREITA — sugere o raio se deslocando ao fundo do ceu, nao no aquario
// em si. Precisa de pelo menos 2 lampadas azuis distintas (ver gerarEventoRaio).
function gerarRaioCeuAzul(azuis) {
    const ordenadas = [...azuis].sort((a, b) => a.posicaoLampada - b.posicaoLampada);
    const esquerda = ordenadas[0];
    const direita = ordenadas[ordenadas.length - 1];

    const onEsquerda = arrayVazio();
    onEsquerda[esquerda.posicaoIndiceRele] = 1;
    const offEsquerda = arrayVazio();
    offEsquerda[esquerda.posicaoIndiceRele] = 0;
    const onDireita = arrayVazio();
    onDireita[direita.posicaoIndiceRele] = 1;
    const offDireita = arrayVazio();
    offDireita[direita.posicaoIndiceRele] = 0;

    return {
        tipo: 'raio_ceu_azul',
        descricao: `Raio cruzando o ceu — ${nomeCurto(esquerda)} -> ${nomeCurto(direita)}`,
        passos: [
            { reles: onEsquerda, delayMs: clamp(entreMs(80, 150)) },
            { reles: offEsquerda, delayMs: clamp(entreMs(150, 300)) },
            { reles: onDireita, delayMs: clamp(entreMs(80, 150)) },
            { reles: offDireita, delayMs: DELAY_MINIMO_MS },
        ],
    };
}

// Sorteio ponderado — pesos maiores pros padroes brancos (o "raio de verdade", mais comum),
// menores pros efeitos de cor de fundo (mais ocasionais, ver pedido do usuario).
function escolherPonderado(opcoes) {
    const pesoTotal = opcoes.reduce((soma, o) => soma + o.peso, 0);
    let sorteio = Math.random() * pesoTotal;
    for (const opcao of opcoes) {
        if (sorteio < opcao.peso) return opcao.gerar();
        sorteio -= opcao.peso;
    }
    return opcoes[opcoes.length - 1].gerar();
}

// gerarEventoRaio: agrupa as lampadas mapeadas por "cor" (ja anexada em cada objeto por
// tempestadeService.js:lampadasUtilizaveis, a partir da posicao fisica — ver
// CORES_POR_POSICAO no topo do arquivo) e monta a lista de padroes DISPONIVEIS (so entram no
// sorteio os que tem lampada da cor que precisam), depois sorteia um ponderado.
// "lampadasMapeadas" ja deve vir filtrada (so posicoes com posicaoIndiceRele preenchido E
// porta habilitada — ver tempestadeService.js).
function gerarEventoRaio(lampadasMapeadas) {
    if (!Array.isArray(lampadasMapeadas) || lampadasMapeadas.length === 0) return null;

    const brancas = lampadasMapeadas.filter((l) => l.cor === 'branca');
    const azuis = lampadasMapeadas.filter((l) => l.cor === 'azul');
    const vermelhas = lampadasMapeadas.filter((l) => l.cor === 'vermelha');

    const opcoes = [];
    if (brancas.length > 0) {
        opcoes.push({ peso: 3, gerar: () => comAcentoTalvez(gerarFlashPontual(brancas), azuis, vermelhas) });
        opcoes.push({ peso: 2, gerar: () => comAcentoTalvez(gerarVarredura(brancas), azuis, vermelhas) });
        opcoes.push({ peso: 2, gerar: () => comAcentoTalvez(gerarClaraoGlobal(brancas), azuis, vermelhas) });
    }
    if (azuis.length > 0) {
        opcoes.push({ peso: 2, gerar: () => gerarFlashAzulFundo(azuis) });
    }
    if (vermelhas.length > 0) {
        opcoes.push({ peso: 1, gerar: () => gerarVermelhoAlerta(vermelhas) });
    }
    if (azuis.length > 0 && vermelhas.length > 0) {
        opcoes.push({ peso: 1, gerar: () => gerarCombinadoAzulVermelho(azuis, vermelhas) });
    }
    if (azuis.length >= 2) {
        opcoes.push({ peso: 1, gerar: () => gerarRaioCeuAzul(azuis) });
    }

    if (opcoes.length === 0) return null;
    return escolherPonderado(opcoes);
}

module.exports = { gerarEventoRaio, gerarSequenciaAbertura, CORES_POR_POSICAO, TOTAL_PORTAS, DELAY_MINIMO_MS };
