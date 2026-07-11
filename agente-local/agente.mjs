#!/usr/bin/env node
/**
 * Agente local — puente entre lectores de huella físicos y la API central.
 *
 * Corre en una PC del sitio del cliente. El lector verifica la huella EN la
 * terminal (la plantilla nunca sale del hardware); el agente solo reenvía
 * "el empleado N marcó" a la API central por HTTPS (TLS 1.3) con la API key
 * del dispositivo. Ver README.md para instalación y contrato completo.
 *
 * Configuración por variables de entorno:
 *   AGENTE_API_URL   URL base de la API central (https://tu-dominio.com)
 *   AGENTE_API_KEY   Clave del dispositivo (Panel → Dispositivos → lector físico)
 *   AGENTE_DRIVER    Driver del lector: "mock" (default) | zkteco | suprema
 *   AGENTE_PERMITIR_HTTP=1   SOLO desarrollo: permite http://localhost
 */
import { enviarConReintentos, construirEvento } from "./lib/cliente-api.mjs";
import { crearDriverMock } from "./drivers/mock.mjs";

const cfg = {
  apiUrl: process.env.AGENTE_API_URL ?? "",
  apiKey: process.env.AGENTE_API_KEY ?? "",
  driver: process.env.AGENTE_DRIVER ?? "mock",
  permitirHttp: process.env.AGENTE_PERMITIR_HTTP === "1",
};

if (!cfg.apiUrl || !cfg.apiKey) {
  console.error(
    "Faltan AGENTE_API_URL y/o AGENTE_API_KEY. Ver agente-local/README.md.",
  );
  process.exit(1);
}

function crearDriver(nombre) {
  switch (nombre) {
    case "mock":
      return crearDriverMock();
    // Drivers reales: implementar la misma interfaz {iniciar, detener}
    // envolviendo el SDK del fabricante. Ver README.md § "Drivers".
    case "zkteco":
    case "suprema":
      console.error(
        `Driver "${nombre}" aún no incluido: implementa drivers/${nombre}.mjs con la interfaz del README (§ Drivers).`,
      );
      process.exit(1);
      break;
    default:
      console.error(`Driver desconocido: ${nombre}`);
      process.exit(1);
  }
}

const driver = crearDriver(cfg.driver);

async function manejarEvento({ numeroEmpleado, eventoId }) {
  try {
    const evento = construirEvento({ numeroEmpleado, eventoId });
    const res = await enviarConReintentos(cfg, evento);
    if (res.status === 200) {
      console.log(
        `[agente] ${res.body.empleadoNombre}: ${res.body.tipo} registrada a las ${res.body.hora}`,
      );
    } else {
      console.warn(`[agente] rechazado (${res.status}): ${res.body?.error}`);
    }
  } catch (e) {
    console.error(`[agente] no se pudo entregar el evento: ${e.message}`);
  }
}

console.log(
  `[agente] driver=${driver.nombre} → ${cfg.apiUrl} (TLS 1.3 requerido${cfg.permitirHttp ? "; HTTP permitido SOLO dev" : ""})`,
);
driver.iniciar(manejarEvento);

process.on("SIGINT", () => {
  driver.detener();
  process.exit(0);
});
