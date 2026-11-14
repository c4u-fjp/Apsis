#!/usr/bin/env bash
# Crea etiquetas, hitos y el backlog inicial en GitHub.
# Requisitos: gh (sudo pacman -S github-cli) y  gh auth login.  Uso:  ./scripts/crear_issues.sh USUARIO/Apsis
set -euo pipefail
REPO="${1:?Uso: $0 usuario/repositorio}"

etiqueta() { gh label create "$1" --color "$2" --description "$3" --repo "$REPO" --force >/dev/null; }
etiqueta 'area:escenas-tierra' 1d76db 'Plataforma 39A y ascenso'
etiqueta 'area:espacio-trayectoria' 5319e7 'Escena del espacio y mecánica orbital'
etiqueta 'area:superficie-alunizaje' fbca04 'Alunizaje, superficie, física'
etiqueta 'area:backend-datos' 0e8a16 'FastAPI, SPICE, JSON de misiones'
etiqueta 'area:ui-vr' d93f0b 'HUD, VR, móvil, Cardboard'
etiqueta 'area:modelos-3d' c5def5 'GLB y texturas'
etiqueta 'area:contenido-historia' bfd4f2 'Textos, cifras y fuentes'
etiqueta 'buena primera tarea' 7057ff 'Ideal para empezar'
etiqueta 'tarea' ededed 'Trabajo nuevo'
etiqueta 'bug' b60205 'Algo no funciona'

hito() { gh api "repos/$REPO/milestones" -f title="$1" >/dev/null 2>&1 || true; }
hito 'v1.0 · Apollo 11 completo'
hito 'v1.1 · Apolos 15-17 y el LRV'
hito 'v1.2 · Robots en Marte'

issue() { gh issue create --repo "$REPO" --title "$1" --label "tarea,$2" --milestone "$3" --body "$4" >/dev/null && echo "✓ $1"; }
issue 'Sonido del lanzamiento y del motor de descenso' 'area:escenas-tierra,buena primera tarea' 'v1.0 · Apollo 11 completo' 'Rumor grave con WebAudio (ruido marrón) desde la ignición (T-8,9 s) que baja con la altitud; silbido suave del DPS en el alunizaje. Debe arrancar tras el botón INICIAR (gesto del usuario).

**Dónde:** `plataforma.js, superficie.js, nuevo core/audio.js`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Torre de servicio más fiel (brazos, grúa, MLP)' 'area:escenas-tierra,area:modelos-3d' 'v1.0 · Apollo 11 completo' 'Mejorar la LUT procedural o sustituirla por un GLB ligero (<5 MB). Los brazos se retiran en el despegue.

**Dónde:** `escenas/plataforma.js · _construirEntorno`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Separación S-IC visible en cámara' 'area:espacio-trayectoria,buena primera tarea' 'v1.0 · Apollo 11 completo' 'Al separarse la S-IC (T+2:42) la cámara debería verla alejarse unos segundos antes de seguir al cohete. Incluir los retrocohetes de separación.

**Dónde:** `escenas/espacio.js · _colocarSueltas, _offsetAuto`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Roll térmico (PTC) en el crucero' 'area:espacio-trayectoria' 'v1.0 · Apollo 11 completo' 'Columbia+Eagle giraban ~3 vueltas por hora en el tránsito. Aplicarlo sin que se vea frenético con warp alto (limitar velocidad angular visible).

**Dónde:** `escenas/espacio.js · _actitudPila`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Corrección de trayectoria MCC-2 (026:44:58)' 'area:espacio-trayectoria' 'v1.0 · Apollo 11 completo' 'Encendido corto del SPS visible (llama) en el evento MCC-2.

**Dónde:** `data/apollo11.json · encendidos; modelos/nave.js`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Terreno de Base Tranquilidad con datos reales (LRO)' 'area:superficie-alunizaje,area:backend-datos' 'v1.0 · Apollo 11 completo' 'Sustituir los cráteres procedurales por un DEM de LROC/NAC alrededor del sitio (cráteres West y Little West reales).

**Dónde:** `escenas/superficie.js · altura(), _construirTerreno`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Modo libre de alunizaje con puntuación' 'area:superficie-alunizaje' 'v1.0 · Apollo 11 completo' 'Tabla de resultados local: distancia al sitio, combustible restante, velocidad de contacto. Guardar mejores marcas en localStorage (con try/catch).

**Dónde:** `escenas/superficie.js · _finDescenso`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Astronautas y primer paso (109:24:15)' 'area:superficie-alunizaje,area:modelos-3d' 'v1.0 · Apollo 11 completo' 'Figura simple de Armstrong bajando la escalera en el evento '\''paso'\'', y la colocación del EASEP y el LRRR.

**Dónde:** `escenas/superficie.js · _construirEquipo`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Rendimiento en Quest 2 (72 fps)' 'area:ui-vr' 'v1.0 · Apollo 11 completo' 'Medir con chrome://inspect. Ideas: sombras 1024, menos partículas, bajar textura de luna1.glb a 2K, foveación.

**Dónde:** `core/renderer.js, escenas/*`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Menú dentro de VR' 'area:ui-vr' 'v1.0 · Apollo 11 completo' 'Panel con botones apuntables (rayo del mando) para: siguiente evento, velocidad, cámara, sala de control.

**Dónde:** `core/panelVR.js, core/input.js`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Interfaz en inglés (i18n)' 'area:ui-vr,area:contenido-historia,buena primera tarea' 'v1.0 · Apollo 11 completo' 'Extraer textos a src/i18n/es.json y en.json; selector de idioma.

**Dónde:** `index.html, core/hud.js, data/apollo11.json`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Revisión histórica de textos y cifras' 'area:contenido-historia,buena primera tarea' 'v1.0 · Apollo 11 completo' 'Comprobar cada evento y número contra NASA SP-4029 y el Apollo Flight Journal; añadir fuente en el JSON.

**Dónde:** `data/apollo11.json`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Modelo de la Tierra real (tierra.glb)' 'area:modelos-3d,buena primera tarea' 'v1.0 · Apollo 11 completo' 'tierra.glb es una copia de la Luna. Crear o conseguir una Tierra con licencia libre y usarla en lugar de las texturas actuales si mejora.

**Dónde:** `public/models, modelos/cargador.js · crearTierra`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Cronologías de Apolo 15, 16 y 17' 'area:backend-datos,area:contenido-historia' 'v1.1 · Apolos 15-17 y el LRV' 'JSON con la misma forma que apollo11_mission.json y endpoints /mission/apollo15 ... Servir desde routers/mission.py.

**Dónde:** `backend/nasa_data, routers/mission.py`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Modelo del LRV (buggy lunar)' 'area:modelos-3d' 'v1.1 · Apolos 15-17 y el LRV' 'GLB < 5 MB, escala real (3,1 m), ruedas separadas para animarlas.

**Dónde:** `public/models/lrv.glb`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Escena: LRV estacionado y recorridos (EVA)' 'area:superficie-alunizaje' 'v1.1 · Apolos 15-17 y el LRV' 'Poder conducir el LRV en Hadley-Apenninus / Descartes / Taurus-Littrow y dejarlo donde quedó.

**Dónde:** `nueva escenas/superficieApolo.js`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Selector de misión en la pantalla de inicio' 'area:ui-vr' 'v1.1 · Apolos 15-17 y el LRV' 'Elegir Apollo 11 / 15 / 16 / 17; main.js carga la cronología correspondiente.

**Dónde:** `main.js, index.html`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Datos de rovers de Marte (NSSDCA)' 'area:backend-datos' 'v1.2 · Robots en Marte' 'sites_mars.json: Sojourner, Spirit, Opportunity, Viking 1-2, Phoenix, InSight, Ingenuity (posición final, estado, historia).

**Dónde:** `backend/nasa_data, routers/sites.py`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
issue 'Escena de superficie marciana' 'area:superficie-alunizaje,area:modelos-3d' 'v1.2 · Robots en Marte' 'Reutilizar superficie.js con gravedad 3,71 m/s², cielo marciano y un rover abandonado.

**Dónde:** `escenas/`

**Hecho cuando:**
- [ ] Funciona en escritorio y móvil (y en Quest si aplica)
- [ ] CI en verde

Ver docs/ARQUITECTURA.md.'
echo "Listo. Crea un Project (Board) en GitHub y añade los issues."
