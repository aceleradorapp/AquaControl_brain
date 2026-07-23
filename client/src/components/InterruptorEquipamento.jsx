import { motion } from 'framer-motion';
import { Power } from 'lucide-react';

// Chaveador tático individual (ACTIVE/STANDBY) — puramente controlado, quem decide o
// estado é o Dashboard (ver PainelEquipamentos.jsx). Sem consumo em Watts (13-espc): era um
// valor de mock fixo, sem sensor real por trás — removido pra não mostrar um número que não
// significa nada agora que a lista vem do Mapeamento de Saidas de verdade.
//
// "bloqueado" (14-espc): porta desabilitada no Mapeamento de Saidas, mostrada só na aba
// "Bloqueados" da Central do Aquario — visual laranja, botão desabilitado (o backend
// também recusa acionar uma porta bloqueada, então nem faz sentido deixar clicar aqui).
export default function InterruptorEquipamento({ nome, ativo, bloqueado, onAlternar }) {
    return (
        <div className={`interruptor ${ativo ? 'interruptor--ativo' : ''} ${bloqueado ? 'interruptor--bloqueado' : ''}`}>
            <div className="interruptor__info">
                <span className="interruptor__nome">{nome}</span>
            </div>

            <motion.button
                className="interruptor__botao"
                onClick={onAlternar}
                whileTap={bloqueado ? undefined : { scale: 0.92 }}
                aria-pressed={ativo}
                disabled={bloqueado}
            >
                <Power size={14} />
                {bloqueado ? 'BLOCKED' : ativo ? 'ACTIVE' : 'STANDBY'}
            </motion.button>
        </div>
    );
}
