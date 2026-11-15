# Despliegue: backend en Render + frontend en Cloudflare Pages (desde GitHub)

```
 navegador / Quest ──https──► Cloudflare Pages   tu-proyecto.pages.dev   (frontend estático)
                                   │  /api/*   (Pages Function: frontend/functions/api/[[path]].js)
                                   ▼
                              Render            apsis-backend.onrender.com  (Docker: FastAPI + SPICE)
```
Los dos se vuelven a desplegar solos con cada push o merge a `main`. El navegador solo habla con Cloudflare:
sin CORS, sin contenido mixto, y todo por HTTPS (WebXR funciona en el Quest sin el aviso del certificado).

## 0. Antes de empezar (una vez)
- `luna.glb` y `tierra.glb` (54 MB cada uno, duplicados) no deben estar en el repo: Cloudflare Pages rechaza
  archivos de más de 25 MB.
  ```bash
  git rm --cached frontend/public/models/luna.glb frontend/public/models/tierra.glb
  git commit -m "chore: quitar modelos duplicados" && git push
  ```
- Los kernels SPICE no van en git: el `Dockerfile` los descarga de NAIF al construir.
- Sube `render.yaml` (raíz del repo) y `frontend/package-lock.json`.

## 1. Backend en Render (primero, para tener su URL)
1. Entra en **render.com** con tu cuenta de GitHub → **New → Blueprint**.
2. Conecta el repositorio (autoriza la app de Render en GitHub) y elige la rama `main`.
3. Render lee `render.yaml` y propone **apsis-backend** (Docker, plan free, health check `/health`).
   Deja `ALLOWED_ORIGINS` vacía y pulsa **Apply / Deploy Blueprint**.
4. Espera el primer build (descarga ~45 MB de kernels) y prueba:
   - `https://apsis-backend.onrender.com/health` → `{"ok":true,"moon_frame":"MOON_ME"}`
   - `https://apsis-backend.onrender.com/mission/apollo11`

   Si el nombre ya estaba ocupado, Render añade un sufijo: usa la URL que muestra el panel.

Sin Blueprint también vale: **New → Web Service** → repo → Language **Docker**, Root Directory `backend`,
Dockerfile Path `backend/Dockerfile`, Instance Type **Free**, Health Check Path `/health`.

> Render pone el puerto en `$PORT` y el `Dockerfile` ya lo usa. Si el build falla en `download_kernels.py`, NAIF no
> respondió: **Manual Deploy → Deploy latest commit**.

## 2. Frontend en Cloudflare Pages
1. **dash.cloudflare.com → Workers & Pages → Create → Pages → Connect to Git** → GitHub → elige el repositorio.
2. Configuración de build:
   | Campo | Valor |
   |---|---|
   | Framework preset | Vite (o None) |
   | Root directory | `frontend` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
3. Variables de entorno (Production y Preview):
   | Variable | Valor |
   |---|---|
   | `NODE_VERSION` | `22` |
   | `BACKEND_URL` | `https://apsis-backend.onrender.com` (tu URL de Render, sin `/` al final) |
4. **Save and Deploy** → `https://TU-PROYECTO.pages.dev`.
5. Comprueba `https://TU-PROYECTO.pages.dev/api/health` (misma respuesta que Render). En el panel del simulador
   debe decir **EFEMÉRIDES: SPICE en vivo (backend)**.

Si cambias `BACKEND_URL`, vuelve a desplegar en Cloudflare (Deployments → Retry deployment).

## 3. Plan gratuito de Render
El servicio gratuito se duerme si no recibe visitas y tarda en despertar (hasta ~1 minuto). Mientras tanto el
simulador usa las efemérides precalculadas (son las mismas de SPICE) y lo indica en el panel: no se rompe nada.
Antes de una presentación, abre `https://TU-PROYECTO.pages.dev/api/health` un par de minutos antes para despertarlo.

## 4. Trabajo en equipo
- Cada Pull Request genera una vista previa en Cloudflare (`https://<rama>.TU-PROYECTO.pages.dev`) para probarla en
  el móvil o el Quest antes de aceptarla (usa el backend de producción).
- Al hacer merge a `main`: GitHub Actions corre las pruebas, Cloudflare publica el frontend y Render reconstruye el
  backend (solo si cambió `backend/`).

## Desarrollo local (sin cambios)
`uvicorn main:app --reload` + `npm run dev`: Vite reenvía `/api` al backend local (vite.config.js).
La función de Cloudflare solo se usa en Pages.
