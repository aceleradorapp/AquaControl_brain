// Garante que um numero exibido na tela SEMPRE tenha algo depois da virgula (20 -> "20.0"),
// sem arredondar/truncar um valor que ja chegou com mais casas (20.22 continua "20.22") — usado
// pelos gauges/barras de Parametros Vitais, onde um valor "inteiro por coincidencia" (ex.: agua
// bateu exatamente 20.0°C) nao pode renderizar como "20" (JS descarta o ".0" ao virar string).
export function formatarComDecimal(valor, casasMinimas = 1) {
    const numero = Number(valor);
    if (!Number.isFinite(numero)) return valor;
    return Number.isInteger(numero) ? numero.toFixed(casasMinimas) : String(numero);
}
