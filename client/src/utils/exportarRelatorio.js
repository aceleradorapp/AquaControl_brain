// Exportacao de relatorios (17-espc): CSV client-side (Blob + download, sem round-trip ao
// servidor — os dados ja estao carregados na tela) e PDF via impressao nativa do navegador
// (window.print() + folha de estilo dedicada em relatorios.css, ver "@media print") — decisao
// deliberada de NAO adicionar jsPDF/html2canvas como dependencia nova so pra isso: o
// "Salvar como PDF" do dialogo de impressao de qualquer navegador ja produz um PDF de
// verdade, com o layout que a folha de estilo de impressao definir, sem aumentar o bundle.

function escaparCampoCsv(valor) {
    const texto = valor === null || valor === undefined ? '' : String(valor);
    if (/[",\n;]/.test(texto)) {
        return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
}

// "linhas" e um array de objetos simples (mesma forma que a tabela renderizada na tela) —
// "colunas" e [{chave, rotulo}] na ordem desejada no CSV.
export function exportarCsv(nomeArquivo, colunas, linhas) {
    const cabecalho = colunas.map((c) => escaparCampoCsv(c.rotulo)).join(';');
    const corpo = linhas.map((linha) => colunas.map((c) => escaparCampoCsv(linha[c.chave])).join(';')).join('\n');
    // BOM (﻿) — sem isso o Excel no Windows abre acentos UTF-8 como caracteres errados.
    const conteudo = `﻿${cabecalho}\n${corpo}`;

    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Aciona o dialogo de impressao do navegador — a classe "relatorio-imprimivel" (ver
// relatorios.css) esconde tudo que nao deve ir pro papel/PDF (abas, botoes, filtros) e só
// deixa visível o conteúdo da aba atual quando "@media print" está ativo.
export function exportarPdf() {
    window.print();
}
