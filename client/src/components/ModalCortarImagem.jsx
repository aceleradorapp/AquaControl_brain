import { useEffect, useRef, useState } from 'react';
import { Check, Move, ZoomIn } from 'lucide-react';
import ModalHud from './ModalHud';

const VIEWPORT_PX = 300; // area interativa (quadrada) — o que o usuario ve e arrasta
const TAMANHO_SAIDA_PX = 640; // resolucao final do recorte (qualidade), independente da tela
const ZOOM_MAXIMO = 3;

// Modal de recorte de imagem (Gestao de Fauna) — canvas puro, sem biblioteca nova (mesmo
// espirito de QRCode on-device/PDF via window.print() ja usados neste projeto: API nativa do
// browser em vez de adicionar dependencia so pra isso). Recebe o arquivo escolhido no input de
// upload, deixa o usuario arrastar (posicionar) e usar o slider pra dar zoom — a imagem
// SEMPRE cobre o quadrado inteiro (mesma logica do object-fit:cover ja usado pra exibir a
// foto depois, ver visitante.css), nunca sobra fundo vazio. "Usar Esta Foto" gera o recorte
// em alta resolucao (TAMANHO_SAIDA_PX, independente do tamanho exibido na tela) como um
// data: URL JPEG, devolvido pronto pro campo imagemUrl salvar (sem endpoint de upload novo —
// ver ModalGestaoFauna.jsx).
export default function ModalCortarImagem({ aberto, arquivo, onFechar, onConfirmar }) {
    const canvasRef = useRef(null);
    const imagemRef = useRef(null);
    const arrastoRef = useRef(null); // { pointerId, inicioX, inicioY, deslocamentoInicial }

    const [imagemPronta, setImagemPronta] = useState(false);
    const [zoom, setZoom] = useState(1);
    const [deslocamento, setDeslocamento] = useState({ x: 0, y: 0 });
    const [erro, setErro] = useState('');

    // Carrega o arquivo escolhido como Image() assim que o modal abre com um arquivo novo.
    useEffect(() => {
        if (!aberto || !arquivo) return;

        setImagemPronta(false);
        setErro('');
        setZoom(1);

        const leitor = new FileReader();
        leitor.onload = () => {
            const img = new Image();
            img.onload = () => {
                imagemRef.current = img;
                setDeslocamento(posicaoInicial(img));
                setImagemPronta(true);
            };
            img.onerror = () => setErro('Nao foi possivel carregar essa imagem.');
            img.src = leitor.result;
        };
        leitor.onerror = () => setErro('Nao foi possivel ler o arquivo.');
        leitor.readAsDataURL(arquivo);
    }, [aberto, arquivo]);

    function escalaMinima(img) {
        return Math.max(VIEWPORT_PX / img.width, VIEWPORT_PX / img.height);
    }

    function posicaoInicial(img) {
        const escala = escalaMinima(img);
        return { x: (VIEWPORT_PX - img.width * escala) / 2, y: (VIEWPORT_PX - img.height * escala) / 2 };
    }

    function escalaAtual() {
        const img = imagemRef.current;
        return img ? escalaMinima(img) * zoom : 1;
    }

    // A imagem precisa sempre cobrir o quadrado inteiro (nunca revelar fundo vazio) — clampa
    // o deslocamento dentro dos limites validos pra "escala" dada, toda vez que zoom ou
    // posicao mudam.
    function clampar(desloc, escala) {
        const img = imagemRef.current;
        if (!img) return desloc;
        const largura = img.width * escala;
        const altura = img.height * escala;
        return {
            x: Math.min(0, Math.max(VIEWPORT_PX - largura, desloc.x)),
            y: Math.min(0, Math.max(VIEWPORT_PX - altura, desloc.y)),
        };
    }

    // Redesenha o canvas interativo sempre que zoom/posicao/imagem mudam.
    useEffect(() => {
        if (!imagemPronta) return;
        const ctx = canvasRef.current.getContext('2d');
        const escala = escalaAtual();
        const desloc = clampar(deslocamento, escala);

        ctx.clearRect(0, 0, VIEWPORT_PX, VIEWPORT_PX);
        ctx.drawImage(imagemRef.current, desloc.x, desloc.y, imagemRef.current.width * escala, imagemRef.current.height * escala);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imagemPronta, zoom, deslocamento]);

    function aoMudarZoom(novoZoom) {
        setZoom(novoZoom);
        setDeslocamento((atual) => clampar(atual, escalaMinima(imagemRef.current) * novoZoom));
    }

    function iniciarArrasto(evento) {
        if (!imagemPronta) return;
        evento.currentTarget.setPointerCapture(evento.pointerId);
        arrastoRef.current = { pointerId: evento.pointerId, inicioX: evento.clientX, inicioY: evento.clientY, deslocamentoInicial: deslocamento };
    }

    function moverArrasto(evento) {
        const arrasto = arrastoRef.current;
        if (!arrasto || arrasto.pointerId !== evento.pointerId) return;
        const proposto = {
            x: arrasto.deslocamentoInicial.x + (evento.clientX - arrasto.inicioX),
            y: arrasto.deslocamentoInicial.y + (evento.clientY - arrasto.inicioY),
        };
        setDeslocamento(clampar(proposto, escalaAtual()));
    }

    function finalizarArrasto() {
        arrastoRef.current = null;
    }

    function confirmar() {
        const img = imagemRef.current;
        if (!img) return;

        const fatorSaida = TAMANHO_SAIDA_PX / VIEWPORT_PX;
        const escala = escalaAtual() * fatorSaida;
        const desloc = clampar(deslocamento, escalaAtual());

        const canvasSaida = document.createElement('canvas');
        canvasSaida.width = TAMANHO_SAIDA_PX;
        canvasSaida.height = TAMANHO_SAIDA_PX;
        canvasSaida.getContext('2d').drawImage(img, desloc.x * fatorSaida, desloc.y * fatorSaida, img.width * escala, img.height * escala);

        onConfirmar(canvasSaida.toDataURL('image/jpeg', 0.85));
    }

    return (
        <ModalHud aberto={aberto} titulo="Recortar Imagem" tag="Gestao de Fauna" onFechar={onFechar}>
            {erro && <p className="mensagem-erro hud-tag">{erro}</p>}

            {!erro && (
                <div className="cortar-imagem">
                    <div className="cortar-imagem__area" style={{ width: VIEWPORT_PX, height: VIEWPORT_PX }}>
                        {!imagemPronta && <p className="hud-tag">Carregando imagem...</p>}
                        <canvas
                            ref={canvasRef}
                            width={VIEWPORT_PX}
                            height={VIEWPORT_PX}
                            className="cortar-imagem__canvas"
                            style={{ display: imagemPronta ? 'block' : 'none' }}
                            onPointerDown={iniciarArrasto}
                            onPointerMove={moverArrasto}
                            onPointerUp={finalizarArrasto}
                            onPointerCancel={finalizarArrasto}
                        />
                    </div>

                    {imagemPronta && (
                        <>
                            <label className="cortar-imagem__zoom">
                                <ZoomIn size={14} />
                                <input type="range" min={1} max={ZOOM_MAXIMO} step={0.01} value={zoom} onChange={(e) => aoMudarZoom(Number(e.target.value))} />
                            </label>
                            <p className="hud-tag cortar-imagem__dica">
                                <Move size={12} /> Arraste a imagem pra posicionar — o recorte e sempre quadrado (mesma
                                proporcao do card da lista de Moradores).
                            </p>
                        </>
                    )}
                </div>
            )}

            <div className="modal-hud__acoes">
                <button className="botao-primario" type="button" onClick={confirmar} disabled={!imagemPronta}>
                    <Check size={14} /> Usar Esta Foto
                </button>
            </div>
        </ModalHud>
    );
}
