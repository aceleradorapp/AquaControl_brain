// Garante que um numero exibido na tela SEMPRE tenha EXATAMENTE "casas" digitos depois da
// virgula — nunca "20" puro (JS descarta o ".0" ao virar string) e nunca um valor com casas
// demais (ex.: a media de 2 sensores de agua pode dar "26.875"). Usado pelos gauges/barras de
// Parametros Vitais.
//
// CORRIGIDO (bug real visto em producao): a versao anterior so forcava 1 casa quando o valor
// era um inteiro "por coincidencia" e deixava QUALQUER outro valor passar direto por
// String(numero), sem arredondar — por isso uma media tipo (26.75+27.0)/2 = 26.875 aparecia
// com 3 casas na tela em vez de 1. "toFixed" sempre, sem excecao.
export function formatarComDecimal(valor, casas = 1) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return valor;
    return numero.toFixed(casas);
}
