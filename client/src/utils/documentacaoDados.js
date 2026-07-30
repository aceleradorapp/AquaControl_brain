// Dados estruturados da pagina de Documentacao Tecnica (26-espc, ver
// 01-espc-geral/26_documentacao_sistema_painel_web.md) — pinagem, arvore de arquivos e passo
// a passo de onboarding, extraidos DIRETO do codigo-fonte de cada projeto (nao de memoria),
// mesma disciplina ja usada no resto do ecossistema (ex.: bibliotecas confirmadas lendo o
// arquivo instalado, nao assumidas). Mantenha isto sincronizado se um pino/IP mudar nos
// projetos ESP32 — nao ha nada que valide isso automaticamente (documentacao estatica).

export const MODULOS_ESP32 = [
    {
        chave: 'sensor',
        nome: 'AquaControl_sensor',
        apelido: 'Modulo de Telemetria',
        ip: '192.168.98.224',
        hostname: 'aquacontrol-sensor',
        caminhoCodigo: 'AquaControl_sensor/src/main.cpp',
        descricao:
            'ESP32 DevKit dedicado a leitura de 7 sensores fisicos do aquario: 3x temperatura da agua, ' +
            'temperatura/umidade do ar, fluxo de agua, pH e nivel de agua (fisicamente um sensor de ' +
            'inclinacao, reaproveitado — ver 24-espc). Todos os sensores sao tolerantes a hot-plug: se um ' +
            'sensor especifico falhar ou for desconectado, os outros 6 continuam funcionando normalmente ' +
            '(nunca trava o loop principal por causa de um sensor ausente).',
        pinosEsquerda: [
            { pino: 'GPIO 18', sinal: 'OneWire (1-Wire)', componente: '3x DS18B20 — Temp. da Agua', tensao: '3.3V' },
            { pino: 'GPIO 19', sinal: 'Digital (protocolo proprio)', componente: 'DHT11 — Temp./Umidade do Ar', tensao: '3.3V/5V' },
            { pino: 'GPIO 23', sinal: 'Interrupcao (FALLING)', componente: 'YF-S201 — Fluxo de Agua', tensao: '5V' },
        ],
        pinosDireita: [
            { pino: 'GPIO 34', sinal: 'Analogico (ADC1, so leitura)', componente: 'Modulo de pH', tensao: '3.3V' },
            { pino: 'GPIO 21', sinal: 'Interrupcao (CHANGE)', componente: 'SW-520D — Nivel da Agua', tensao: '3.3V' },
            { pino: 'GPIO 2', sinal: 'Digital (saida)', componente: 'LED azul onboard (status Wi-Fi)', tensao: '3.3V' },
        ],
        observacoes: [
            'O barramento OneWire (GPIO 18) suporta ate 3 sensores DS18B20 simultaneos — os enderecos sao descobertos por varredura automatica no boot, sem precisar configurar endereco de fabrica.',
            'O modulo de pH PRECISA de calibracao manual com solucoes tampao (buffer pH 4.0 e 7.0) — os valores de fabrica no codigo sao so um ponto de partida.',
            'O sensor de "inclinacao" (GPIO 21) e fisicamente um SW-520D — reaproveitado pra indicar nivel de agua do aquario, nao tombamento (ver 24-espc).',
        ],
    },
    {
        chave: 'hardware',
        nome: 'AquaControl_Hardware',
        apelido: 'Modulo de Reles (16 canais)',
        ip: '192.168.98.223',
        hostname: 'aquacontrol-reles',
        caminhoCodigo: 'AquaControl_Hardware/src/main.cpp',
        descricao:
            '16 saidas de rele controladas por GPIO nativo do ESP32 (sem expansor I2C — o MCP23017 usado ' +
            'numa versao anterior foi removido). Logica ACTIVE LOW: o rele liga quando o pino vai pra LOW. ' +
            'Os indices 0-7 sao o Modulo de rele fisico 1 (canais 1-8), os indices 8-15 sao o Modulo 2 ' +
            '(canais 9-16) — mesma numeracao que o Brain e o Display ja esperam no JSON de 16 posicoes.',
        pinosEsquerda: [
            { pino: 'GPIO 13', sinal: 'Digital (saida, active LOW)', componente: 'Rele 01 (Modulo 1, canal 1)', tensao: '3.3V→relé' },
            { pino: 'GPIO 14', sinal: 'Digital (saida, active LOW)', componente: 'Rele 02 (Modulo 1, canal 2)', tensao: '3.3V→relé' },
            { pino: 'GPIO 27', sinal: 'Digital (saida, active LOW)', componente: 'Rele 03 (Modulo 1, canal 3)', tensao: '3.3V→relé' },
            { pino: 'GPIO 26', sinal: 'Digital (saida, active LOW)', componente: 'Rele 04 (Modulo 1, canal 4)', tensao: '3.3V→relé' },
            { pino: 'GPIO 25', sinal: 'Digital (saida, active LOW)', componente: 'Rele 05 (Modulo 1, canal 5)', tensao: '3.3V→relé' },
            { pino: 'GPIO 33', sinal: 'Digital (saida, active LOW)', componente: 'Rele 06 (Modulo 1, canal 6)', tensao: '3.3V→relé' },
            { pino: 'GPIO 32', sinal: 'Digital (saida, active LOW)', componente: 'Rele 07 (Modulo 1, canal 7)', tensao: '3.3V→relé' },
            { pino: 'GPIO 4', sinal: 'Digital (saida, active LOW)', componente: 'Rele 08 (Modulo 1, canal 8)', tensao: '3.3V→relé' },
        ],
        pinosDireita: [
            { pino: 'GPIO 16', sinal: 'Digital (saida, active LOW)', componente: 'Rele 09 (Modulo 2, canal 1)', tensao: '3.3V→relé' },
            { pino: 'GPIO 17', sinal: 'Digital (saida, active LOW)', componente: 'Rele 10 (Modulo 2, canal 2)', tensao: '3.3V→relé' },
            { pino: 'GPIO 5', sinal: 'Digital (saida, active LOW)', componente: 'Rele 11 (Modulo 2, canal 3)', tensao: '3.3V→relé' },
            { pino: 'GPIO 18', sinal: 'Digital (saida, active LOW)', componente: 'Rele 12 (Modulo 2, canal 4)', tensao: '3.3V→relé' },
            { pino: 'GPIO 19', sinal: 'Digital (saida, active LOW)', componente: 'Rele 13 (Modulo 2, canal 5)', tensao: '3.3V→relé' },
            { pino: 'GPIO 21', sinal: 'Digital (saida, active LOW)', componente: 'Rele 14 (Modulo 2, canal 6)', tensao: '3.3V→relé' },
            { pino: 'GPIO 22', sinal: 'Digital (saida, active LOW)', componente: 'Rele 15 (Modulo 2, canal 7)', tensao: '3.3V→relé' },
            { pino: 'GPIO 23', sinal: 'Digital (saida, active LOW)', componente: 'Rele 16 (Modulo 2, canal 8)', tensao: '3.3V→relé' },
        ],
        observacoes: [
            'GPIO 2 e usado pelo LED azul onboard (status de conexao Wi-Fi) — nao disponivel pra rele.',
            'GPIO 15 fica reservado pra expansoes futuras (ex.: fita WS2812B de status).',
            'Cada saida aciona um MODULO de rele externo (bobina + optoacoplador) — o GPIO do ESP32 nunca chaveia a carga de alta tensao diretamente.',
        ],
    },
    {
        chave: 'display',
        nome: 'AquaControl_OS',
        apelido: 'Display / Painel Tatil (CYD)',
        ip: '192.168.98.222',
        hostname: 'aquacontrol-display',
        caminhoCodigo: 'AquaControl_OS/src/main.cpp + src/DisplayHUD.cpp',
        descricao:
            'Placa "CYD" (Cheap Yellow Display) — ESP32 com tela ST7789 de 320x240 e touch resistivo, ' +
            'rodando DUAS interfaces SPI simultaneas e independentes: HSPI pro video, VSPI pro touch. Nao ' +
            'fala mais direto com o Hardware/Sensor — o AquaControl_Brain e o unico intermediario (ver ' +
            '09-espc), empurrando os dados prontos via POST /api/dispositivos.',
        pinosEsquerda: [
            { pino: 'GPIO 12', sinal: 'HSPI — MISO', componente: 'Display ST7789 (video)', tensao: '3.3V' },
            { pino: 'GPIO 13', sinal: 'HSPI — MOSI', componente: 'Display ST7789 (video)', tensao: '3.3V' },
            { pino: 'GPIO 14', sinal: 'HSPI — CLK', componente: 'Display ST7789 (video)', tensao: '3.3V' },
            { pino: 'GPIO 15', sinal: 'HSPI — CS', componente: 'Display ST7789 (video)', tensao: '3.3V' },
            { pino: 'GPIO 2', sinal: 'HSPI — DC', componente: 'Display ST7789 (video)', tensao: '3.3V' },
            { pino: 'GPIO 21', sinal: 'Digital (saida)', componente: 'Backlight do display', tensao: '3.3V' },
        ],
        pinosDireita: [
            { pino: 'GPIO 32', sinal: 'VSPI — MOSI', componente: 'Touch resistivo', tensao: '3.3V' },
            { pino: 'GPIO 39', sinal: 'VSPI — MISO', componente: 'Touch resistivo', tensao: '3.3V' },
            { pino: 'GPIO 25', sinal: 'VSPI — CLK', componente: 'Touch resistivo', tensao: '3.3V' },
            { pino: 'GPIO 33', sinal: 'VSPI — CS', componente: 'Touch resistivo', tensao: '3.3V' },
            { pino: 'GPIO 36', sinal: 'Entrada (IRQ)', componente: 'Touch resistivo', tensao: '3.3V' },
            { pino: 'GPIO 26', sinal: 'LEDC (PWM, tom)', componente: 'Alto-falante piezo (beep de toque)', tensao: '3.3V' },
        ],
        observacoes: [
            'RST do display (PIN_TFT_RST) e -1 — nao usado, o reset do chip ST7789 fica amarrado no reset geral da placa.',
            'O alto-falante usa LEDC direto (ledcSetup/ledcAttachPin), NAO a funcao tone() do Arduino — tone() nao funciona nesta versao do core ESP32.',
            'Touch resistivo le comandos crus 0x90/0x0xD0 via SPI (sem biblioteca) — nao e um controlador touch capacitivo com driver dedicado.',
        ],
    },
];

// Arvore de diretorios de cada projeto — so os arquivos/pastas relevantes pra entender onde
// mexer (nao lista .git/.pio/node_modules/build caches).
export const ESTRUTURA_PROJETOS = [
    {
        nome: 'AquaControl_OS',
        tipo: 'Firmware ESP32 (PlatformIO)',
        descricao: 'Display/HUD tatil — renderiza a interface, nao guarda estado do aquario, so exibe o que o Brain manda.',
        arvore: [
            'AquaControl_OS/',
            '├── platformio.ini          # env esp32dev, upload_port/monitor_port (COM), lib_deps',
            '├── include/',
            '│   ├── Config.h            # TODOS os valores ajustaveis: pinos, timeouts, IP estatico, Wi-Fi',
            '│   ├── Dispositivo.h       # struct do modelo dinamico de dispositivo (id/tipo/nome/valor/unidade)',
            '│   └── DispositivoManager.h',
            '├── src/',
            '│   ├── main.cpp            # setup()/loop(), rotas REST, maquina de estado das telas',
            '│   ├── DisplayHUD.cpp/.h   # TUDO relacionado a desenhar na tela e ler o touch',
            '│   └── DispositivoManager.cpp  # guarda a lista de dispositivos recebida do Brain',
            '└── espc/                   # specs historicas deste projeto especifico (pre-01-espc-geral)',
        ],
    },
    {
        nome: 'AquaControl_Hardware',
        tipo: 'Firmware ESP32 (PlatformIO)',
        descricao: '16 canais de rele via GPIO direto — so executa comandos, nao decide nada sozinho.',
        arvore: [
            'AquaControl_Hardware/',
            '├── platformio.ini',
            '├── include/',
            '│   └── Segredos.h          # SSID/senha do Wi-Fi (fora do git — copiar de Segredos.h.exemplo)',
            '└── src/',
            '    └── main.cpp            # setup()/loop(), GET/POST /api/reles, GET /api/status, handshake',
        ],
    },
    {
        nome: 'AquaControl_sensor',
        tipo: 'Firmware ESP32 (PlatformIO)',
        descricao: '7 sensores reais — cada um com seu proprio estado conectado/desconectado, tolerante a hot-plug.',
        arvore: [
            'AquaControl_sensor/',
            '├── platformio.ini          # upload_port (USB) + bloco OTA comentado (espota)',
            '├── include/',
            '│   └── Segredos.h',
            '└── src/',
            '    └── main.cpp            # 1 arquivo so — uma secao "==========" por sensor + rede/OTA no fim',
        ],
    },
    {
        nome: 'AquaControl_Brain',
        tipo: 'Node.js/Express (server) + React/Vite (client)',
        descricao: 'O intermediario de tudo — nenhum ESP32 fala com outro diretamente, so com o Brain.',
        arvore: [
            'AquaControl_Brain/',
            '├── server/',
            '│   └── src/',
            '│       ├── server.js         # monta o Express, registra os services de background, serve o client/dist',
            '│       ├── config/env.js     # PORT e outras variaveis de ambiente',
            '│       ├── routes/           # so conecta metodo+caminho HTTP a um controller (fino, sem logica)',
            '│       ├── controllers/      # parseia a requisicao, chama services, formata a resposta',
            '│       ├── services/         # a logica de verdade (polling dos ESP32, agendamentos, relatorios...)',
            '│       └── database/         # migrate.js (schema) + db.js (conexao node:sqlite)',
            '└── client/',
            '    └── src/',
            '        ├── components/       # Dashboard.jsx e o "dono" do estado, o resto e mais apresentacional',
            '        ├── styles/           # 1 arquivo .css por area (dashboard/modais/relatorios/documentacao...)',
            '        └── utils/            # helpers puros e dados estruturados (sem estado React)',
        ],
    },
];

// Passo a passo de onboarding — na ordem em que um modulo novo REALMENTE precisa ser
// provisionado (mesma sequencia usada nesta sessao pra recuperar/trocar o ESP32 do sensor).
export const PASSOS_ONBOARDING = [
    {
        titulo: '1. Preparar as credenciais de Wi-Fi',
        corpo:
            'Copie include/Segredos.h.exemplo para include/Segredos.h (esse arquivo fica fora do git de ' +
            'proposito) e preencha WIFI_SSID/WIFI_SENHA com a rede local. Sem isso o firmware nem compila.',
    },
    {
        titulo: '2. Definir IP estatico e escolher a proxima faixa livre',
        corpo:
            'No topo do main.cpp do projeto (ou Config.h no caso do Display), ajuste IPAddress ' +
            'ipEstatico/ipGateway/ipSubmascara/ipDns. Convencao ja em uso: .222 = Display, .223 = Reles, ' +
            '.224 = Sensor — o proximo modulo novo deveria ganhar .225 em diante, na mesma faixa /24.',
    },
    {
        titulo: '3. Conectar o ESP32 por USB e identificar a porta COM certa',
        corpo:
            'Rode Get-PnpDevice -Class Ports (PowerShell) ANTES de gravar. Varios ESP32 desse ecossistema ' +
            'usam chips USB-serial parecidos (CH340/CP210x/CH9102) — a mesma placa fisica pode reaparecer ' +
            'numa porta diferente a cada replug. Se houver duvida sobre qual placa fisica esta em qual ' +
            'porta, confirme pelo MAC address (esptool.py --port COMx chip_id) antes de gravar — gravar o ' +
            'firmware errado na placa errada e um erro caro de desfazer.',
    },
    {
        titulo: '4. Gravar o firmware via USB',
        corpo:
            'Ajuste upload_port/monitor_port no platformio.ini pra COM certa e rode "pio run -t upload". ' +
            'NUNCA use upload_protocol=espota (Wi-Fi) na primeira gravacao — o modulo ainda nao tem ' +
            'firmware nenhum rodando, OTA so funciona em cima de um firmware ja ativo na rede.',
    },
    {
        titulo: '5. Confirmar o boot pela Serial',
        corpo:
            'Abra "pio device monitor" e confira: (a) conectou no Wi-Fi certo, (b) pegou o IP estatico ' +
            'esperado — se aparecer um IP diferente ou cair num modo de recuperacao/AP, revise o ' +
            'Segredos.h e o bloco de IP estatico antes de continuar.',
    },
    {
        titulo: '6. Cadastrar o modulo no dashboard',
        corpo:
            'No painel Web, abra "Modulos de Controladores" (Menu de Acoes ou widget) e clique no "+". ' +
            'Preencha nome, o IP estatico definido no passo 2, e o tipo certo (atuador/telemetria/display). ' +
            'O Brain valida o formato do IP, recusa duplicados, e ja tenta o handshake na hora — o log ' +
            'do sistema mostra se o modulo respondeu de verdade ou so ficou cadastrado sem confirmar.',
    },
    {
        titulo: '7. Validar o handshake (o modulo "conhece" o Brain)',
        corpo:
            'Clique no modulo cadastrado pra ver o status ao vivo — confira "Backend salvo (NVS)": deve ' +
            'mostrar o IP:porta deste AquaControl_Brain. Se estiver vazio mesmo com o modulo online, use o ' +
            'botao "Reenviar IP do Backend" (dentro de Editar Controlador, ou na Central de Diagnostico) ' +
            'pra forcar o reenvio sem precisar regravar nada.',
    },
    {
        titulo: '8. (Opcional) Habilitar upload via Wi-Fi (OTA)',
        corpo:
            'So depois do modulo estar rodando e handshake confirmado: comente o upload_port USB no ' +
            'platformio.ini, descomente upload_protocol=espota + upload_port=<IP do modulo>, e confira que ' +
            'o projeto certo esta ativo no VSCode antes de fazer upload — um OTA mirado no IP errado grava ' +
            'o firmware ERRADO na placa (o protocolo nao sabe "de qual projeto" o binario veio, so pra qual ' +
            'IP mandar os bytes).',
    },
];
