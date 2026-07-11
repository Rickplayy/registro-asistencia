/**
 * Driver MOCK: simula un lector de huella físico para probar el contrato de
 * integración sin hardware. Emite eventos de marcación como lo haría el SDK
 * de un ZKTeco/Suprema tras verificar la huella en la terminal.
 *
 * Interfaz de driver (la misma que implementará un driver real):
 *   iniciar(onEvento)  → comienza a escuchar el lector; por cada marcación
 *                        llama onEvento({ numeroEmpleado, eventoId }).
 *   detener()          → libera el lector.
 */
import { randomUUID } from "node:crypto";
import readline from "node:readline";

export function crearDriverMock({ interactivo = true } = {}) {
  let rl = null;

  return {
    nombre: "mock",

    iniciar(onEvento) {
      if (!interactivo) return;
      rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      console.log(
        "[mock] Lector simulado listo. Teclea un número de empleado y Enter para simular una huella verificada (Ctrl+C para salir).",
      );
      rl.on("line", (linea) => {
        const numeroEmpleado = linea.trim();
        if (!numeroEmpleado) return;
        onEvento({ numeroEmpleado, eventoId: randomUUID() });
      });
    },

    /** Emite un evento programáticamente (usado por las pruebas). */
    simularMarcacion(onEvento, numeroEmpleado) {
      onEvento({ numeroEmpleado, eventoId: randomUUID() });
    },

    detener() {
      rl?.close();
      rl = null;
    },
  };
}
