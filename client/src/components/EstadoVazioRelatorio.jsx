import { FileWarning } from 'lucide-react';

// Empty state amigavel (17-espc) — usado por qualquer aba da Central de Relatorios quando o
// modulo relevante nao esta cadastrado, ou o periodo escolhido nao tem dado nenhum registrado.
export default function EstadoVazioRelatorio({ titulo, mensagem }) {
    return (
        <div className="estado-vazio-relatorio">
            <FileWarning size={32} />
            <span className="estado-vazio-relatorio__titulo">{titulo}</span>
            <span className="hud-tag">{mensagem}</span>
        </div>
    );
}
