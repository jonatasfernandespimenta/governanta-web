"use client";

// 08 Escanear NFC-e: câmera lendo o QR Code (BarcodeDetector ou jsQR), chave de acesso digitada,
// "Compra encontrada" e os estados de erro (nota ilegível, câmera indisponível).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type ImportError, type ReceiptSummary } from "@/lib/api";
import { capitalize, clock, daysUntil, localIso, longDate, money } from "@/lib/format";
import { BackButton, Eyebrow, Icon, ResultState } from "../ui";

type Step =
  | { s: "camera" }
  | { s: "key" }
  | { s: "importing" }
  | { s: "found"; receipt: ReceiptSummary }
  | { s: "invalid"; code: ImportError | "offline" }
  | { s: "cameraoff" };

const DEV = process.env.NODE_ENV !== "production";
const SCAN_EVERY_MS = 250;

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

/** Lê QR de um <video>: BarcodeDetector quando o navegador tem, senão jsQR num canvas. */
async function makeReader(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  const BD = (globalThis as unknown as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
  if (BD && (await BD.getSupportedFormats?.())?.includes("qr_code")) {
    const det = new BD({ formats: ["qr_code"] });
    return async (video) => (await det.detect(video))[0]?.rawValue ?? null;
  }
  const jsQR = (await import("jsqr")).default;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!ctx || !video.videoWidth) return null;
    const scale = Math.min(1, 720 / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

function errorCode(err: unknown): ImportError | "offline" {
  if (err instanceof ApiError) return (err.code as ImportError) ?? (err.status >= 500 ? "sefaz_unavailable" : "invalid_key");
  return "offline";
}

const INVALID: Record<ImportError | "offline", { icon: string; title: string; text: string }> = {
  invalid_key: {
    icon: "qr_code_2",
    title: "Não consegui ler essa nota.",
    text: "Tente aproximar de novo o QR Code, com a nota esticada e bem iluminada. Se for uma nota antiga ou de outro estado, digite a chave de acesso.",
  },
  parse_failed: {
    icon: "qr_code_2",
    title: "Não consegui ler essa nota.",
    text: "Tente aproximar de novo o QR Code, com a nota esticada e bem iluminada. Se for uma nota antiga ou de outro estado, digite a chave de acesso.",
  },
  captcha: {
    icon: "qr_code_2",
    title: "Não consegui ler essa nota.",
    text: "A Sefaz pediu uma verificação extra. Tente de novo em alguns minutos ou digite a chave de acesso.",
  },
  not_found: {
    icon: "qr_code_2",
    title: "A Sefaz ainda não tem essa nota.",
    text: "Notas muito recentes podem levar alguns minutos para aparecer. Tente de novo daqui a pouco.",
  },
  unsupported_uf: {
    icon: "qr_code_2",
    title: "Ainda não leio notas desse estado.",
    text: "Por enquanto a Governanta entende as notas de São Paulo.",
  },
  sefaz_unavailable: {
    icon: "cloud_off",
    title: "A Sefaz não respondeu agora.",
    text: "É do lado deles. Tente de novo em alguns minutos — a nota continua valendo.",
  },
  offline: {
    icon: "wifi_off",
    title: "Sem conexão com a casa.",
    text: "Verifique a internet do tablet e tente de novo.",
  },
};

export function EscanearView() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ s: "camera" });
  const [key, setKey] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  const importWith = useCallback(async (input: Parameters<typeof api.importReceipt>[0]) => {
    setStep({ s: "importing" });
    try {
      setStep({ s: "found", receipt: await api.importReceipt(input) });
    } catch (err) {
      setStep({ s: "invalid", code: errorCode(err) });
    }
  }, []);

  // Câmera + leitura contínua enquanto a etapa é "camera".
  const scanning = step.s === "camera";
  useEffect(() => {
    if (!scanning) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1280 } }, audio: false });
      } catch {
        if (!stopped) setStep({ s: "cameraoff" });
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => {});
      const read = await makeReader();
      const loop = async () => {
        if (stopped) return;
        const text = await read(video).catch(() => null);
        if (stopped) return;
        if (text) {
          const digits = text.replace(/\D/g, "");
          void importWith(/^\d{44}$/.test(digits) && !/^https?:/i.test(text) ? { accessKey: digits } : { qrUrl: text });
          return;
        }
        timer = setTimeout(loop, SCAN_EVERY_MS);
      };
      void loop();
    })();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [scanning, importWith]);

  const keyDigits = key.replace(/\D/g, "").slice(0, 44);

  return (
    <div className="page">
      <div className="page-head page-head-start">
        <BackButton fallback="/" />
        <h1 className="page-title page-title-detail head-grow">Registrar compra</h1>
        <div className="head-note">Nota fiscal (NFC-e)</div>
      </div>

      {(step.s === "camera" || step.s === "key" || step.s === "importing") && (
        <div className="page-body scan-grid">
          <div className="scan-preview">
            {step.s === "camera" && <video ref={videoRef} className="scan-video" muted playsInline />}
            <div className="scan-caption">pré-visualização da câmera</div>
            <div className="scan-frame">
              <i className="c tl" />
              <i className="c tr" />
              <i className="c bl" />
              <i className="c br" />
              {step.s === "camera" && <i className="scan-line" />}
            </div>
          </div>

          <div className="scan-side">
            {step.s === "key" ? (
              <form
                className="key-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (keyDigits.length === 44) void importWith({ accessKey: keyDigits });
                }}
              >
                <div className="scan-title">Digite a chave de acesso</div>
                <div className="scan-text">São os 44 números logo acima do QR Code, no rodapé da nota.</div>
                <input
                  className="key-input num"
                  inputMode="numeric"
                  autoComplete="off"
                  aria-label="Chave de acesso"
                  placeholder="0000 0000 0000 …"
                  value={keyDigits.replace(/(\d{4})(?=\d)/g, "$1 ")}
                  onChange={(e) => setKey(e.target.value)}
                  autoFocus
                />
                <div className="key-count num">{keyDigits.length} de 44 números</div>
                <div className="row-gap">
                  <button type="button" className="btn btn-outline btn-md" onClick={() => setStep({ s: "camera" })}>
                    Usar a câmera
                  </button>
                  <button type="submit" className="btn btn-primary btn-md" disabled={keyDigits.length !== 44}>
                    Buscar nota
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="scan-title">{step.s === "importing" ? "Buscando a nota…" : "Escaneie o QR Code da nota"}</div>
                <div className="scan-text">
                  {step.s === "importing" ? "Consultando a Sefaz. Leva alguns segundos." : "Aponte para o QR Code no rodapé da nota, a uns 15–20 cm. A leitura é automática."}
                </div>
                <div className="scan-status">
                  <span className="live-dot" />
                  {step.s === "importing" ? "Nota lida · buscando…" : "Câmera ativa · procurando…"}
                </div>
                <div className="row-gap scan-actions">
                  <button type="button" className="btn btn-outline btn-md" disabled={step.s === "importing"} onClick={() => setStep({ s: "key" })}>
                    Digitar chave de acesso
                  </button>
                </div>
                {DEV && step.s === "camera" && (
                  <div className="proto">
                    <span className="mono">protótipo:</span>
                    <button type="button" onClick={() => void importWith({ fixture: "synthetic" })}>
                      ler agora
                    </button>
                    <button type="button" onClick={() => void importWith({ accessKey: "0".repeat(44) })}>
                      nota inválida
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {step.s === "found" && (
        <div className="center-body">
          <div className="found-card">
            <div className="found-ok">
              <Icon name="check_circle" size={28} />
              {step.receipt.status === "confirmed" ? "Esta compra já foi registrada" : "Compra encontrada"}
            </div>
            <div className="found-merchant">{step.receipt.merchantName ?? "Compra sem nome do mercado"}</div>
            <div className="found-when">{receiptWhen(step.receipt.issuedAt)}</div>
            <div className="found-stats">
              <div>
                <Eyebrow>Itens</Eyebrow>
                <div className="found-num num">{step.receipt.itemCount}</div>
              </div>
              <div>
                <Eyebrow>Total</Eyebrow>
                <div className="found-num num">{money(step.receipt.totalCents)}</div>
              </div>
            </div>
            <div className="found-actions">
              <button type="button" className="btn btn-outline btn-lg" onClick={() => setStep({ s: "camera" })}>
                Não é esta
              </button>
              {step.receipt.status === "confirmed" ? (
                <Link href={`/compras/${step.receipt.id}`} className="btn btn-primary btn-lg">
                  Ver compra
                </Link>
              ) : (
                <button type="button" className="btn btn-primary btn-lg" onClick={() => router.push(`/compras/${step.receipt.id}/revisar`)}>
                  Revisar compra
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {step.s === "invalid" && (
        <ResultState
          icon={INVALID[step.code].icon}
          tone="bad"
          title={INVALID[step.code].title}
          actions={
            <>
              <button type="button" className="btn btn-outline btn-lg" onClick={() => setStep({ s: "key" })}>
                Digitar chave
              </button>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep({ s: "camera" })}>
                Tentar de novo
              </button>
            </>
          }
        >
          {INVALID[step.code].text}
        </ResultState>
      )}

      {step.s === "cameraoff" && (
        <ResultState
          icon="no_photography"
          tone="muted"
          title="A câmera não está disponível"
          actions={
            <>
              <button type="button" className="btn btn-outline btn-lg" onClick={() => setStep({ s: "key" })}>
                Digitar chave
              </button>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep({ s: "camera" })}>
                Abrir permissões
              </button>
            </>
          }
        >
          Permita o acesso à câmera nas configurações do tablet, ou escaneie a nota pelo celular — ela aparece aqui em seguida.
        </ResultState>
      )}
    </div>
  );
}

/** "Hoje, 22 de setembro · 08:14" */
export function receiptWhen(issuedAt: string): string {
  const d = new Date(issuedAt);
  const n = daysUntil(localIso(d));
  const day = n === 0 ? `Hoje, ${longDate(d).split(", ")[1]}` : n === -1 ? `Ontem, ${longDate(d).split(", ")[1]}` : capitalize(longDate(d));
  return `${day} · ${clock(d)}`;
}
