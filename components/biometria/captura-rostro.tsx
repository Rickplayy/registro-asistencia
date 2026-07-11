"use client";

/**
 * Captura de rostro por cámara con extracción de plantilla EN EL NAVEGADOR.
 *
 * Privacidad (sección 6 del documento maestro):
 *  - El video vive solo en el elemento <video>; NUNCA se toma un frame con
 *    canvas.toDataURL ni se sube imagen alguna al servidor.
 *  - Lo único que sale de este componente es el descriptor matemático de
 *    128 números que produce face-api.js.
 *  - Los modelos se sirven desde /modelos-face (auto-hospedados): el video
 *    tampoco sale hacia ningún proveedor externo.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import {
  DIMENSION_PLANTILLA,
  esDescriptorValido,
} from "@/lib/biometria/plantilla";
import { cn } from "@/lib/utils";

type FaceApi = typeof import("@vladmandic/face-api");
// Los .d.ts de @vladmandic/face-api no tipan bien los métodos del `tf` que
// re-exportan (existen en runtime, confirmado en pruebas manuales).
type TfBackendControl = { setBackend(name: string): Promise<boolean>; ready(): Promise<void> };

const RUTA_MODELOS = "/modelos-face";
const INTERVALO_DETECCION_MS = 700;
/** Score mínimo del detector para aceptar una captura (rostro nítido y de frente). */
const SCORE_MINIMO = 0.6;

// Los modelos se cargan una sola vez por página (kiosko los reutiliza todo el día).
let faceApiPromise: Promise<FaceApi> | null = null;
function cargarFaceApi(): Promise<FaceApi> {
  faceApiPromise ??= (async () => {
    const faceapi = await import("@vladmandic/face-api");
    // Fuerza el backend a webgl (con reserva a cpu) ANTES de cargar modelos:
    // el bundle de tfjs incluye un backend wasm cuyo .wasm no lo sirve Next.js
    // (404), y si dejamos que tfjs decida el backend "automáticamente" intenta
    // negociarlo y la carga de modelos falla. Fijar el backend explícito evita
    // esa negociación al elegir backend.
    // Nota: el bundle de face-api importa el backend wasm de forma incondicional
    // para detectar soporte SIMD; el binario .wasm no existe en el paquete npm,
    // así que esa sola petición 404 en consola es inevitable con esta librería
    // y no afecta la captura (ver tests/ y verificación manual).
    const tf = faceapi.tf as unknown as TfBackendControl;
    try {
      await tf.setBackend("webgl");
    } catch {
      await tf.setBackend("cpu");
    }
    await tf.ready();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(RUTA_MODELOS),
      faceapi.nets.faceLandmark68Net.loadFromUri(RUTA_MODELOS),
      faceapi.nets.faceRecognitionNet.loadFromUri(RUTA_MODELOS),
    ]);
    return faceapi;
  })();
  return faceApiPromise;
}

type Estado = "cargando" | "sin-camara" | "detectando" | "completado" | "error";

export function CapturaRostro({
  capturasObjetivo,
  onCapturas,
  className,
}: {
  /** Cuántos descriptores capturar antes de terminar (enrolamiento: 3, kiosko: 1). */
  capturasObjetivo: number;
  /** Recibe los descriptores (128 números c/u). Nunca recibe imágenes. */
  onCapturas: (descriptores: number[][]) => void;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const capturasRef = useRef<number[][]>([]);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [progreso, setProgreso] = useState(0);
  const [mensaje, setMensaje] = useState("Cargando modelos de reconocimiento…");
  const onCapturasRef = useRef(onCapturas);
  useEffect(() => {
    onCapturasRef.current = onCapturas;
  }, [onCapturas]);

  const detener = useCallback(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  useEffect(() => {
    let cancelado = false;
    let intervalo: ReturnType<typeof setInterval> | null = null;

    async function iniciar() {
      let faceapi: FaceApi;
      try {
        faceapi = await cargarFaceApi();
      } catch {
        if (!cancelado) {
          setEstado("error");
          setMensaje(
            "No se pudieron cargar los modelos. Verifica que /modelos-face esté publicado (npm run models:download).",
          );
        }
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: 640, height: 480 },
          audio: false,
        });
      } catch {
        if (!cancelado) {
          setEstado("sin-camara");
          setMensaje("Sin acceso a la cámara. Autorízala en el navegador.");
        }
        return;
      }

      if (cancelado || !videoRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
      setEstado("detectando");
      setMensaje("Mira de frente a la cámara");

      const opciones = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.4,
      });

      let procesando = false;
      intervalo = setInterval(async () => {
        const video = videoRef.current;
        if (procesando || cancelado || !video || video.readyState < 2) return;
        procesando = true;
        try {
          const deteccion = await faceapi
            .detectSingleFace(video, opciones)
            .withFaceLandmarks()
            .withFaceDescriptor();

          if (cancelado) return;
          if (!deteccion || deteccion.detection.score < SCORE_MINIMO) {
            setMensaje("Acércate y mira de frente a la cámara");
            return;
          }

          const descriptor = Array.from(deteccion.descriptor);
          if (
            descriptor.length !== DIMENSION_PLANTILLA ||
            !esDescriptorValido(descriptor)
          ) {
            return;
          }

          capturasRef.current.push(descriptor);
          setProgreso(capturasRef.current.length);
          setMensaje(
            capturasRef.current.length < capturasObjetivo
              ? `Captura ${capturasRef.current.length} de ${capturasObjetivo}… no te muevas`
              : "Procesando…",
          );

          if (capturasRef.current.length >= capturasObjetivo) {
            if (intervalo) clearInterval(intervalo);
            setEstado("completado");
            detener();
            onCapturasRef.current(capturasRef.current);
          }
        } finally {
          procesando = false;
        }
      }, INTERVALO_DETECCION_MS);
    }

    iniciar();
    return () => {
      cancelado = true;
      if (intervalo) clearInterval(intervalo);
      detener();
    };
  }, [capturasObjetivo, detener]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative mx-auto aspect-[4/3] w-full max-w-sm overflow-hidden rounded-xl border bg-black">
        {/* El video se espeja para que actúe como espejo; solo vista previa local. */}
        <video
          ref={videoRef}
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-cover"
        />
        {estado !== "detectando" && estado !== "completado" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60 p-4 text-center text-sm text-white">
            {mensaje}
          </div>
        )}
      </div>
      {(estado === "detectando" || estado === "completado") && (
        <div className="text-center text-sm">
          <p>{mensaje}</p>
          {capturasObjetivo > 1 && (
            <p className="mt-1 font-mono text-xs opacity-70">
              {"●".repeat(progreso)}
              {"○".repeat(Math.max(0, capturasObjetivo - progreso))}
            </p>
          )}
        </div>
      )}
      <p className="text-center text-xs opacity-60">
        La imagen no se guarda ni se envía: solo se extrae una plantilla
        matemática en este dispositivo.
      </p>
    </div>
  );
}
