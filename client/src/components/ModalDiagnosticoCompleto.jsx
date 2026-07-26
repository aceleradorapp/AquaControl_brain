import { useEffect, useState } from 'react';
import { Cpu } from 'lucide-react';
import ModalInfo from './ModalInfo';
import { ICONES_SENSOR, formatarValorSensor } from '../utils/sensores';

// Modal "Diagnostico Completo" (12-espc): TODOS os dados que o firmware do ESP32 sabe
// sobre si mesmo (GET /api/status estendido, ver AquaControl_Hardware/AquaControl_OS —
// src/main.cpp:handleGetStatus), organizados em secoes — bem mais que os poucos campos do
// modal rapido de status (ver ModulosControladores.jsx). Mesmo componente serve pros dois
// tipos de modulo (atuador/display); a unica diferenca e um campo especifico de cada um no
// final (Controle de Reles vs Tela Atual).

// Nomes legiveis pro enum "Telas" do AquaControl_OS (src/main.cpp) — a ORDEM aqui precisa
// bater exatamente com a ordem do enum la, ja que "tela_atual" e so o indice numerico.
const NOMES_TELAS_DISPLAY = [
    'HUD Principal',
    'Menu de Navegacao',
    'Submenu (Iluminacao/Filtragem/Config)',
    'Temas',
    'QR Code',
    'Protecao (Matrix Core Mode)',
    'Alerta (Modo Panico)',
    'Sem Conexao (Wi-Fi perdido)',
];

function formatarBytes(bytes) {
    if (bytes === undefined || bytes === null) return '--';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatarUptime(segundos) {
    const dias = Math.floor(segundos / 86400);
    const horas = Math.floor((segundos % 86400) / 3600);
    const minutos = Math.floor((segundos % 3600) / 60);
    const seg = Math.floor(segundos % 60);
    if (dias > 0) return `${dias}d ${horas}h ${minutos}min`;
    if (horas > 0) return `${horas}h ${minutos}min`;
    return `${minutos}min ${seg}s`;
}

function Secao({ titulo, children }) {
    return (
        <div>
            <span className="hud-tag diagnostico-completo__secao-titulo">{titulo}</span>
            <div className="status-modulo__lista">{children}</div>
        </div>
    );
}

function Linha({ rotulo, valor }) {
    if (valor === undefined || valor === null || valor === '') return null;
    return (
        <div className="status-modulo__linha">
            <span className="hud-tag">{rotulo}</span>
            <span className="status-modulo__valor hud-mono">{valor}</span>
        </div>
    );
}

export default function ModalDiagnosticoCompleto({ aberto, modulo, diagnostico, onFechar }) {
    // Diagrama de Sensores busca sua propria fonte (GET /api/modulos/:id/sensores, proxy pro
    // GET /api/sensores do proprio ESP32) — dado que nao vem de "diagnostico" (esse e so o
    // GET /api/status). So dispara pra modulos "telemetria" e só enquanto o modal estiver aberto.
    const [sensores, setSensores] = useState(null);
    const [carregandoSensores, setCarregandoSensores] = useState(false);

    useEffect(() => {
        if (!aberto || modulo?.tipo !== 'telemetria') {
            setSensores(null);
            return;
        }
        setCarregandoSensores(true);
        fetch(`/api/modulos/${modulo.id}/sensores`)
            .then((resposta) => resposta.json())
            .then(setSensores)
            .catch(() => setSensores({ disponivel: false, motivo: 'Falha ao consultar o AquaControl_Brain.' }))
            .finally(() => setCarregandoSensores(false));
    }, [aberto, modulo]);

    return (
        <ModalInfo
            aberto={aberto}
            titulo="Diagnostico Completo"
            tag={modulo ? `${modulo.nome} — ${modulo.ip}` : ''}
            onFechar={onFechar}
            largura="grande"
        >
            {!diagnostico?.disponivel && <p className="mensagem-erro hud-tag">Modulo inacessivel — nao da pra ler o diagnostico agora.</p>}

            {diagnostico?.disponivel && (
                <div className="diagnostico-completo hud-scrollbar">
                    <Secao titulo="Rede">
                        <Linha rotulo="Endereco IP" valor={diagnostico.ip} />
                        <Linha rotulo="Hostname" valor={diagnostico.hostname} />
                        <Linha rotulo="SSID" valor={diagnostico.ssid} />
                        <Linha rotulo="Gateway" valor={diagnostico.gateway} />
                        <Linha rotulo="DNS" valor={diagnostico.dns} />
                        <Linha rotulo="Endereco MAC" valor={diagnostico.mac_address} />
                        <Linha rotulo="Sinal Wi-Fi (RSSI)" valor={diagnostico.rssi_dbm != null ? `${diagnostico.rssi_dbm} dBm` : null} />
                        <Linha rotulo="Backend Salvo (NVS)" valor={diagnostico.ip_backend_salvo || '(nenhum ainda)'} />
                    </Secao>

                    <Secao titulo="Chip / Sistema">
                        <Linha rotulo="Modelo do Chip" valor={diagnostico.chip_modelo} />
                        <Linha rotulo="Revisao do Chip" valor={diagnostico.chip_revisao} />
                        <Linha rotulo="Arquitetura" valor="Xtensa LX6 (ESP32)" />
                        <Linha rotulo="CPU" valor={diagnostico.chip_cores != null ? `${diagnostico.chip_cores} nucleo(s)` : null} />
                        <Linha rotulo="Frequencia da CPU" valor={diagnostico.cpu_freq_mhz != null ? `${diagnostico.cpu_freq_mhz} MHz` : null} />
                        <Linha rotulo="Uptime" valor={diagnostico.uptime_s != null ? formatarUptime(diagnostico.uptime_s) : null} />
                        <Linha rotulo="Motivo do Ultimo Boot" valor={diagnostico.motivo_reset} />
                    </Secao>

                    <Secao titulo="Memoria e Armazenamento">
                        <Linha
                            rotulo="Heap Livre"
                            valor={diagnostico.heap_livre_bytes != null ? `${formatarBytes(diagnostico.heap_livre_bytes)} / ${formatarBytes(diagnostico.heap_total_bytes)}` : null}
                        />
                        <Linha
                            rotulo="PSRAM"
                            valor={diagnostico.psram_total_bytes > 0 ? `${formatarBytes(diagnostico.psram_livre_bytes)} livre / ${formatarBytes(diagnostico.psram_total_bytes)}` : 'Nao disponivel neste chip'}
                        />
                        <Linha rotulo="Flash (chip)" valor={formatarBytes(diagnostico.flash_total_bytes)} />
                        <Linha
                            rotulo="Flash Usada (firmware)"
                            valor={diagnostico.sketch_usado_bytes != null ? `${formatarBytes(diagnostico.sketch_usado_bytes)} usados, ${formatarBytes(diagnostico.sketch_livre_bytes)} livres` : null}
                        />
                        <Linha
                            rotulo="LittleFS/SPIFFS"
                            valor={
                                diagnostico.littlefs_disponivel
                                    ? `${formatarBytes(diagnostico.littlefs_usado_bytes)} usados / ${formatarBytes(diagnostico.littlefs_total_bytes)}`
                                    : 'Nao disponivel'
                            }
                        />
                    </Secao>

                    <Secao titulo="Firmware">
                        <Linha rotulo="Versao" valor={diagnostico.firmware_versao} />
                        <Linha rotulo="Compilado em" valor={diagnostico.firmware_compilado_em} />
                    </Secao>

                    {modulo?.tipo === 'atuador' && (
                        <Secao titulo="Especifico deste Modulo">
                            <Linha rotulo="Controle de Reles" valor={diagnostico.controle_reles === 'gpio_direto' ? 'GPIO direto (sem I2C)' : diagnostico.controle_reles} />
                        </Secao>
                    )}

                    {modulo?.tipo === 'display' && (
                        <Secao titulo="Especifico deste Modulo">
                            <Linha rotulo="Tela Atual" valor={NOMES_TELAS_DISPLAY[diagnostico.tela_atual] ?? `#${diagnostico.tela_atual}`} />
                        </Secao>
                    )}

                    {modulo?.tipo === 'telemetria' && (
                        <Secao titulo="Diagrama de Sensores">
                            {carregandoSensores && <p className="hud-tag">Consultando sensores...</p>}

                            {!carregandoSensores && sensores?.disponivel && (
                                <div className="diagrama-sensores">
                                    {sensores.sensores.map((sensor) => {
                                        const Icone = ICONES_SENSOR[sensor.tipo] ?? Cpu;
                                        return (
                                            <div
                                                key={sensor.id}
                                                className={`diagrama-sensores__card ${sensor.conectado ? 'conectado' : 'desconectado'}`}
                                            >
                                                <div className="diagrama-sensores__cabecalho">
                                                    <Icone size={16} />
                                                    <span
                                                        className={`hud-status-dot ${sensor.conectado ? 'online' : 'offline'}`}
                                                        title={sensor.conectado ? 'Sensor conectado' : 'Sensor nao detectado'}
                                                    />
                                                </div>
                                                <span className="diagrama-sensores__nome">{sensor.nome}</span>
                                                <span className="diagrama-sensores__valor hud-mono">
                                                    {sensor.conectado ? formatarValorSensor(sensor) : 'Desconectado'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {!carregandoSensores && sensores && !sensores.disponivel && (
                                <p className="mensagem-erro hud-tag">{sensores.motivo ?? 'Nao foi possivel consultar os sensores.'}</p>
                            )}
                        </Secao>
                    )}
                </div>
            )}
        </ModalInfo>
    );
}
