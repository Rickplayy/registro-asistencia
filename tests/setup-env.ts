/** Entorno hermético para las pruebas: sin servicios externos ni archivos. */
import { randomBytes } from "node:crypto";
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });

// La base local de las pruebas vive en memoria: nunca toca data/.
process.env.LOCAL_DB_PATH = ":memory:";

// Llave efímera si el entorno no trae una (crypto, PIN, QR y sesiones).
if (!process.env.ENCRYPTION_KEY) {
  process.env.ENCRYPTION_KEY = randomBytes(32).toString("base64");
}
