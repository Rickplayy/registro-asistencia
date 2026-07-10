/** Carga .env.local (si existe) para las pruebas de integración. */
import { config } from "dotenv";

config({ path: ".env.local" });
config({ path: ".env" });
