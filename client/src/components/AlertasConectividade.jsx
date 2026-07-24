import { AnimatePresence, motion } from 'framer-motion';

// Central de Alertas de Conectividade (21-espc): banner tatico em LARANJA — deliberadamente
// uma cor diferente do vermelho do Modo Panico (essa e uma falha de CONEXAO, nao uma
// emergencia dos equipamentos) — que so aparece quando ALGUMA conexao esta com problema:
// internet do navegador, o proprio AquaControl_Brain, o modulo atuador dos reles, ou um
// Display. Nunca ocupa espaco quando esta tudo ok (ver Dashboard.jsx:alertasConectividade,
// que monta essa lista com prioridade — internet > backend > atuador/display, pra nunca
// mostrar "modulo sem resposta" quando na real e so a internet que caiu).
export default function AlertasConectividade({ alertas }) {
    if (alertas.length === 0) return null;

    return (
        <div className="alertas-conectividade">
            <AnimatePresence initial={false}>
                {alertas.map((alerta) => (
                    <motion.div
                        key={alerta.chave}
                        className="alertas-conectividade__item"
                        initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginBottom: 8 }}
                        exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    >
                        <div className="alertas-conectividade__linha">
                            {alerta.icone}
                            <span>{alerta.mensagem}</span>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
}
