import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Carga credenciales locales para la prueba de integración RLS
    setupFiles: ["tests/setup-env.ts"],
  },
});
