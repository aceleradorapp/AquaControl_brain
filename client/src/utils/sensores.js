import { Compass, Droplets, FlaskConical, Thermometer, Waves } from 'lucide-react';

// Icone por "tipo" de sensor (16-espc, AquaControl_sensor) — reaproveitado pelo Diagrama de
// Sensores (ModalDiagnosticoCompleto.jsx) e pelo Esquematico dos Sensores
// (EsquematicoSensores.jsx). Um tipo desconhecido nao quebra a tela — ver uso com "?? Cpu".
export const ICONES_SENSOR = {
    sensor_temp: Thermometer,
    sensor_umidade: Droplets,
    sensor_fluxo: Waves,
    sensor_ph: FlaskConical,
    sensor_inclinacao: Compass,
};

export function formatarValorSensor(sensor) {
    if (sensor.valor === null || sensor.valor === undefined) return 'Sem leitura';
    if (sensor.unidade === 'bool') return sensor.valor ? 'Inclinado' : 'Normal';
    if (typeof sensor.valor === 'number') return `${sensor.valor.toFixed(1)} ${sensor.unidade}`;
    return `${sensor.valor} ${sensor.unidade}`;
}
