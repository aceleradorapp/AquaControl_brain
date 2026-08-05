import { useMemo } from 'react';

const CHARSET = '01[]x$#*';
const COLUNAS = 12;
const LINHAS = 7;

function caractereAleatorio() {
    return CHARSET[Math.floor(Math.random() * CHARSET.length)];
}

// Sorteia uma "cabeça" de chuva por coluna e monta o rastro (opacidade decrescente) atrás
// dela — mesma lógica de trilha do Matrix Core Mode real (DisplayHUD.cpp), só que como uma
// foto parada (sem animação: é só uma prévia de COR, não uma simulação completa).
function gerarGrade() {
    const grade = [];
    for (let c = 0; c < COLUNAS; c++) {
        const linhaCabeca = Math.floor(Math.random() * LINHAS);
        const coluna = [];
        for (let l = 0; l < LINHAS; l++) {
            const distancia = linhaCabeca - l;
            let opacidade = 0;
            if (distancia === 0) opacidade = 1;
            else if (distancia > 0 && distancia <= 4) opacidade = 0.5 - distancia * 0.1;
            coluna.push({ char: caractereAleatorio(), opacidade });
        }
        grade.push(coluna);
    }
    return grade;
}

// Pré-visualização em miniatura do Matrix Core Mode (protetor de tela do Display) — pra dar
// pra ver a cor escolhida ANTES de mandar de verdade pro ESP32 (pedido explícito do
// usuário). Só a chuva usa a cor configurável (corHex); a faixa de diagnóstico do rodapé
// continua fixa em ciano/laranja no firmware (ver DisplayHUD::atualizarTelaProtecao), então
// o preview reflete isso também, pra não sugerir uma mudança que não existe.
export default function PreviewTelaProtecao({ corHex }) {
    const grade = useMemo(() => gerarGrade(), []);

    return (
        <div className="preview-protecao">
            <div className="preview-protecao__tela">
                <div className="preview-protecao__chuva">
                    {grade.map((coluna, indiceColuna) => (
                        <div key={indiceColuna} className="preview-protecao__coluna">
                            {coluna.map((celula, indiceLinha) => (
                                <span key={indiceLinha} style={{ color: corHex, opacity: celula.opacidade }}>
                                    {celula.char}
                                </span>
                            ))}
                        </div>
                    ))}
                </div>
                <div className="preview-protecao__rodape">
                    <span className="preview-protecao__rotulo">AGUA</span>
                    <span className="preview-protecao__valor">24.5°C</span>
                </div>
            </div>
            <span className="hud-tag">Pre-visualizacao do Matrix Core Mode (protetor de tela do Display)</span>
        </div>
    );
}
