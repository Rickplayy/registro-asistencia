// Genera una llave AES-256 para ENCRYPTION_KEY (32 bytes, base64).
// Uso: npm run generate:key
// Guarda el resultado en .env.local (desarrollo) o en el gestor de secretos
// (Vercel env vars / Supabase Vault) para producción. NUNCA en el repo.
import { randomBytes } from "node:crypto";

console.log(randomBytes(32).toString("base64"));
