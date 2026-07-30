import { useEffect, useState } from 'react';
import ModalHud from './ModalHud';
import { CampoSelect } from './CamposConfiguracao';

const TOTAL_PORTAS = 16;

// Modal de criar/editar um Equipamento & Automacao (19-espc, termostato por histerese) —
// aberto a partir da secao "Atuadores & Controle" em Configuracoes Globais. "aquecedor" liga
// abaixo do minimo e desliga acima do maximo; "resfriador" e o espelho disso — ver
// automacaoEquipamentosService.js pro motor que aplica isso de verdade nos reles.
export default function ModalEquipamentoAutomacao({ aberto, onFechar, equipamento, moduloAtuador, dadosSensores, onSalvo }) {
    const [nome, setNome] = useState('');
    const [posicaoIndice, setPosicaoIndice] = useState('0');
    const [sensorId, setSensorId] = useState('');
    const [tipo, setTipo] = useState('aquecedor');
    const [tempMin, setTempMin] = useState('24');
    const [tempMax, setTempMax] = useState('27');
    const [atrasoSegundos, setAtrasoSegundos] = useState('30');
    const [erro, setErro] = useState('');
    const [salvando, setSalvando] = useState(false);

    const sensoresDisponiveis = (dadosSensores?.disponivel ? dadosSensores.sensores : []).filter((s) => s.tipo === 'sensor_temp');

    useEffect(() => {
        if (!aberto) return;
        setErro('');
        if (equipamento) {
            setNome(equipamento.nome);
            setPosicaoIndice(String(equipamento.posicaoIndice));
            setSensorId(equipamento.sensorId);
            setTipo(equipamento.tipo);
            setTempMin(String(equipamento.tempMin));
            setTempMax(String(equipamento.tempMax));
            setAtrasoSegundos(String(equipamento.atrasoSegundos));
        } else {
            setNome('');
            setPosicaoIndice('0');
            setSensorId(sensoresDisponiveis[0]?.id ?? '');
            setTipo('aquecedor');
            setTempMin('24');
            setTempMax('27');
            setAtrasoSegundos('30');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aberto, equipamento]);

    async function salvar(evento) {
        evento.preventDefault();
        setErro('');

        const corpo = {
            moduloId: moduloAtuador.id,
            posicaoIndice: Number(posicaoIndice),
            nome: nome.trim(),
            sensorId,
            tipo,
            tempMin: Number(tempMin),
            tempMax: Number(tempMax),
            atrasoSegundos: Number(atrasoSegundos),
            ativo: equipamento ? equipamento.ativo : true,
        };

        setSalvando(true);
        try {
            const resposta = await fetch(equipamento ? `/api/configuracoes/equipamentos/${equipamento.id}` : '/api/configuracoes/equipamentos', {
                method: equipamento ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(corpo),
            });
            const dados = await resposta.json();
            if (!resposta.ok) {
                setErro(dados.erro ?? 'Falha ao salvar.');
                return;
            }
            onSalvo(dados);
            onFechar();
        } finally {
            setSalvando(false);
        }
    }

    if (!moduloAtuador) {
        return (
            <ModalHud aberto={aberto} titulo="Novo Equipamento" onFechar={onFechar}>
                <p className="hud-tag">Cadastre um modulo do tipo "atuador" antes de criar um equipamento automatizado.</p>
            </ModalHud>
        );
    }

    return (
        <ModalHud aberto={aberto} titulo={equipamento ? 'Editar Equipamento' : 'Novo Equipamento'} tag={moduloAtuador.nome} onFechar={onFechar}>
            <form onSubmit={salvar} className="modal-editar-modulo">
                <label className="modal-editar-modulo__campo">
                    <span className="hud-tag">Nome do Equipamento</span>
                    <input className="hud-input" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex.: Aquecedor Principal" required />
                </label>

                <label className="modal-editar-modulo__campo">
                    <span className="hud-tag">Tipo</span>
                    <CampoSelect
                        valor={tipo}
                        onChange={setTipo}
                        opcoes={[
                            { valor: 'aquecedor', rotulo: 'Aquecedor (liga abaixo do minimo, desliga acima do maximo)' },
                            { valor: 'resfriador', rotulo: 'Resfriador (liga acima do maximo, desliga abaixo do minimo)' },
                        ]}
                    />
                </label>

                <label className="modal-editar-modulo__campo">
                    <span className="hud-tag">Rele Controlado (porta)</span>
                    <CampoSelect
                        valor={posicaoIndice}
                        onChange={setPosicaoIndice}
                        opcoes={Array.from({ length: TOTAL_PORTAS }).map((_, i) => ({ valor: String(i), rotulo: `Porta ${String(i + 1).padStart(2, '0')}` }))}
                    />
                </label>

                <label className="modal-editar-modulo__campo">
                    <span className="hud-tag">Sensor Observado</span>
                    <CampoSelect
                        valor={sensorId}
                        onChange={setSensorId}
                        opcoes={
                            sensoresDisponiveis.length > 0
                                ? sensoresDisponiveis.map((s) => ({ valor: s.id, rotulo: s.nome }))
                                : [{ valor: '', rotulo: 'Nenhum sensor de temperatura disponivel' }]
                        }
                    />
                </label>

                <div className="modal-editar-modulo__campo modal-editar-modulo__campo-sensor">
                    <label className="config-linha__texto">
                        <span className="hud-tag">Temp. Minima (liga o aquecedor / desliga o resfriador)</span>
                        <input className="hud-input" type="number" step="0.1" value={tempMin} onChange={(e) => setTempMin(e.target.value)} required />
                    </label>
                    <label className="config-linha__texto">
                        <span className="hud-tag">Temp. Maxima (desliga o aquecedor / liga o resfriador)</span>
                        <input className="hud-input" type="number" step="0.1" value={tempMax} onChange={(e) => setTempMax(e.target.value)} required />
                    </label>
                </div>

                <label className="modal-editar-modulo__campo">
                    <span className="hud-tag">Atraso Antes de Agir (segundos)</span>
                    <input className="hud-input" type="number" min="0" value={atrasoSegundos} onChange={(e) => setAtrasoSegundos(e.target.value)} />
                    <span className="hud-tag modal-editar-modulo__aviso">
                        A condicao de liga/desliga precisa se manter por esse tempo antes do motor agir de verdade — evita ficar
                        ligando/desligando por causa de um pico passageiro na leitura.
                    </span>
                </label>

                {erro && <p className="mensagem-erro hud-tag">{erro}</p>}

                <div className="modal-hud__acoes">
                    <button className="botao-primario" type="submit" disabled={salvando || !nome.trim() || !sensorId}>
                        {salvando ? 'Salvando...' : 'Salvar Equipamento'}
                    </button>
                </div>
            </form>
        </ModalHud>
    );
}
