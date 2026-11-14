import { defineConfig } from "vite";
import basicSsl from "@vitejs/plugin-basic-ssl";

// - HTTPS autofirmado: WebXR en el Quest solo funciona en contexto seguro.
// - host: true  -> escucha en 0.0.0.0 para que otros dispositivos entren por la red local.
// - proxy /api  -> el navegador solo habla con Vite (https); Vite reenvia al FastAPI local.
//   Asi no hay contenido mixto (https -> http) ni CORS, y el backend no queda expuesto a la red.
export default defineConfig({
  plugins: [basicSsl()],
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ""),
      },
    },
  },
});
