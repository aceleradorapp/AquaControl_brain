// Formatacao compartilhada entre AgendamentosWidget.jsx e ModalListaAgendamentos.jsx — extraido
// pra um util unico pra nao duplicar a mesma logica em dois lugares.
const DIAS_UTEIS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX'];
const TODOS_DIAS = ['SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB', 'DOM'];

export function formatarDias(dias) {
    if (dias.length === 7 && TODOS_DIAS.every((d) => dias.includes(d))) return 'Todos os dias';
    if (dias.length === 5 && DIAS_UTEIS.every((d) => dias.includes(d))) return 'Dias uteis';
    return dias.join(' ');
}

// 19-espc: um agendamento pode ter varios intervalos — mostra todos juntos, separados por
// virgula (ex.: "08:00→12:00, 18:00→22:00").
export function formatarHorarios(horarios) {
    return horarios.map((h) => `${h.horaInicio}→${h.horaFim}`).join(', ');
}
