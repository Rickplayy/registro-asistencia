/**
 * Descarga los modelos de face-api a public/modelos-face para auto-hospedarlos.
 *
 * Auto-hospedar los modelos (en vez de un CDN) garantiza que el kiosko no
 * hace NINGUNA llamada externa al procesar rostros: el video y los pesos del
 * modelo viven en el mismo origen (sección 6 — minimización y control).
 *
 * Uso:  npm run models:download
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE =
  "https://raw.githubusercontent.com/vladmandic/face-api/master/model";
const DESTINO = path.join(process.cwd(), "public", "modelos-face");

// Detector ligero + landmarks (alineación) + red de reconocimiento (descriptor 128-d)
const ARCHIVOS = [
  "tiny_face_detector_model-weights_manifest.json",
  "tiny_face_detector_model.bin",
  "face_landmark_68_model-weights_manifest.json",
  "face_landmark_68_model.bin",
  "face_recognition_model-weights_manifest.json",
  "face_recognition_model.bin",
];

await mkdir(DESTINO, { recursive: true });

for (const nombre of ARCHIVOS) {
  const url = `${BASE}/${nombre}`;
  process.stdout.write(`Descargando ${nombre}… `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FALLÓ (${res.status})`);
    process.exit(1);
  }
  await writeFile(
    path.join(DESTINO, nombre),
    Buffer.from(await res.arrayBuffer()),
  );
  console.log("ok");
}

console.log(`\nModelos listos en ${DESTINO}`);
