import { AlertTriangle, Compass, Droplets, FlaskConical, Gauge, Thermometer, Waves } from 'lucide-react';

// Icone por "tipo" de sensor (16-espc, AquaControl_sensor; +27-espc: nivel/vazamento) —
// reaproveitado pelo Diagrama de Sensores (ModalDiagnosticoCompleto.jsx) e pelo Esquematico
// dos Sensores (EsquematicoSensores.jsx). Um tipo desconhecido nao quebra a tela — ver uso
// com "?? Cpu".
export const ICONES_SENSOR = {
    sensor_temp: Thermometer,
    sensor_umidade: Droplets,
    sensor_fluxo: Waves,
    sensor_ph: FlaskConical,
    sensor_inclinacao: Compass,
    sensor_nivel: Gauge,
    sensor_vazamento: AlertTriangle,
};

// 27-espc: "vazamento" tambem e unidade "bool" (mesma convencao de inclinacao) mas PRECISA
// de um rotulo proprio — nao pode herdar "Inclinado/Normal" so por coincidencia de unidade,
// senao um vazamento de verdade apareceria com o texto errado em qualquer tela que use este
// formatador generico (Esquematico dos Sensores, Diagnostico Completo, Widget "Sensores no
// Display", Diagrama Central).
export function formatarValorSensor(sensor) {
    if (sensor.valor === null || sensor.valor === undefined) return 'Sem leitura';
    if (sensor.unidade === 'bool') {
        if (sensor.id === 'vazamento') return sensor.valor ? 'Vazamento detectado' : 'Normal';
        return sensor.valor ? 'Inclinado' : 'Normal';
    }
    if (typeof sensor.valor === 'number') return `${sensor.valor.toFixed(1)} ${sensor.unidade}`;
    return `${sensor.valor} ${sensor.unidade}`;
}

// Faixa plausivel pra uma leitura de temperatura da agua de aquario — usada so pra EXCLUIR
// leituras que sao claramente erro de sensor/barramento (ex.: -127°C, o codigo de erro
// classico de um DS18B20 que perdeu contato no barramento 1-Wire) do CALCULO DA MEDIA. Nao
// esconde o sensor individual (o card continua mostrando o valor bruto, conectado ou nao) —
// so evita que um erro de leitura pontual arraste a media de todo o grupo pra um numero
// absurdo (29-espc).
const TEMP_AGUA_MIN_PLAUSIVEL = -10;
const TEMP_AGUA_MAX_PLAUSIVEL = 60;

// Media de TODOS os sensores "temp_agua_*" conectados e com leitura plausivel agora — fonte
// unica desse calculo no frontend (29-espc: antes duplicado inline em Dashboard.jsx), usada
// tanto pelo widget "Parametros Vitais" quanto pelo widget "Sensores do Sistema", pra nunca
// divergir um do outro. Retorna null se nenhum sensor de agua estiver conectado (ou todos
// estiverem fora da faixa plausivel) — quem chama decide o fallback (mock/"--"/etc.).
export function calcularMediaTemperaturaAgua(sensores) {
    const validos = sensores.filter(
        (s) =>
            s.id.startsWith('temp_agua') &&
            s.conectado &&
            typeof s.valor === 'number' &&
            s.valor >= TEMP_AGUA_MIN_PLAUSIVEL &&
            s.valor <= TEMP_AGUA_MAX_PLAUSIVEL
    );
    if (validos.length === 0) return null;
    return validos.reduce((soma, s) => soma + s.valor, 0) / validos.length;
}
