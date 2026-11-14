# Backlog inicial

Generado junto con `scripts/crear_issues.sh`, que crea estos issues en GitHub.


## v1.0 · Apollo 11 completo

| Tarea | Etiquetas | Dónde |
|---|---|---|
| **Sonido del lanzamiento y del motor de descenso** — Rumor grave con WebAudio (ruido marrón) desde la ignición (T-8,9 s) que baja con la altitud; silbido suave del DPS en el alunizaje. Debe arrancar tras el botón INICIAR (gesto del usuario). | area:escenas-tierra, buena primera tarea | `plataforma.js, superficie.js, nuevo core/audio.js` |
| **Torre de servicio más fiel (brazos, grúa, MLP)** — Mejorar la LUT procedural o sustituirla por un GLB ligero (<5 MB). Los brazos se retiran en el despegue. | area:escenas-tierra, area:modelos-3d | `escenas/plataforma.js · _construirEntorno` |
| **Separación S-IC visible en cámara** — Al separarse la S-IC (T+2:42) la cámara debería verla alejarse unos segundos antes de seguir al cohete. Incluir los retrocohetes de separación. | area:espacio-trayectoria, buena primera tarea | `escenas/espacio.js · _colocarSueltas, _offsetAuto` |
| **Roll térmico (PTC) en el crucero** — Columbia+Eagle giraban ~3 vueltas por hora en el tránsito. Aplicarlo sin que se vea frenético con warp alto (limitar velocidad angular visible). | area:espacio-trayectoria | `escenas/espacio.js · _actitudPila` |
| **Corrección de trayectoria MCC-2 (026:44:58)** — Encendido corto del SPS visible (llama) en el evento MCC-2. | area:espacio-trayectoria | `data/apollo11.json · encendidos; modelos/nave.js` |
| **Terreno de Base Tranquilidad con datos reales (LRO)** — Sustituir los cráteres procedurales por un DEM de LROC/NAC alrededor del sitio (cráteres West y Little West reales). | area:superficie-alunizaje, area:backend-datos | `escenas/superficie.js · altura(), _construirTerreno` |
| **Modo libre de alunizaje con puntuación** — Tabla de resultados local: distancia al sitio, combustible restante, velocidad de contacto. Guardar mejores marcas en localStorage (con try/catch). | area:superficie-alunizaje | `escenas/superficie.js · _finDescenso` |
| **Astronautas y primer paso (109:24:15)** — Figura simple de Armstrong bajando la escalera en el evento 'paso', y la colocación del EASEP y el LRRR. | area:superficie-alunizaje, area:modelos-3d | `escenas/superficie.js · _construirEquipo` |
| **Rendimiento en Quest 2 (72 fps)** — Medir con chrome://inspect. Ideas: sombras 1024, menos partículas, bajar textura de luna1.glb a 2K, foveación. | area:ui-vr | `core/renderer.js, escenas/*` |
| **Menú dentro de VR** — Panel con botones apuntables (rayo del mando) para: siguiente evento, velocidad, cámara, sala de control. | area:ui-vr | `core/panelVR.js, core/input.js` |
| **Interfaz en inglés (i18n)** — Extraer textos a src/i18n/es.json y en.json; selector de idioma. | area:ui-vr, area:contenido-historia, buena primera tarea | `index.html, core/hud.js, data/apollo11.json` |
| **Revisión histórica de textos y cifras** — Comprobar cada evento y número contra NASA SP-4029 y el Apollo Flight Journal; añadir fuente en el JSON. | area:contenido-historia, buena primera tarea | `data/apollo11.json` |
| **Modelo de la Tierra real (tierra.glb)** — tierra.glb es una copia de la Luna. Crear o conseguir una Tierra con licencia libre y usarla en lugar de las texturas actuales si mejora. | area:modelos-3d, buena primera tarea | `public/models, modelos/cargador.js · crearTierra` |

## v1.1 · Apolos 15-17 y el LRV

| Tarea | Etiquetas | Dónde |
|---|---|---|
| **Cronologías de Apolo 15, 16 y 17** — JSON con la misma forma que apollo11_mission.json y endpoints /mission/apollo15 ... Servir desde routers/mission.py. | area:backend-datos, area:contenido-historia | `backend/nasa_data, routers/mission.py` |
| **Modelo del LRV (buggy lunar)** — GLB < 5 MB, escala real (3,1 m), ruedas separadas para animarlas. | area:modelos-3d | `public/models/lrv.glb` |
| **Escena: LRV estacionado y recorridos (EVA)** — Poder conducir el LRV en Hadley-Apenninus / Descartes / Taurus-Littrow y dejarlo donde quedó. | area:superficie-alunizaje | `nueva escenas/superficieApolo.js` |
| **Selector de misión en la pantalla de inicio** — Elegir Apollo 11 / 15 / 16 / 17; main.js carga la cronología correspondiente. | area:ui-vr | `main.js, index.html` |

## v1.2 · Robots en Marte

| Tarea | Etiquetas | Dónde |
|---|---|---|
| **Datos de rovers de Marte (NSSDCA)** — sites_mars.json: Sojourner, Spirit, Opportunity, Viking 1-2, Phoenix, InSight, Ingenuity (posición final, estado, historia). | area:backend-datos | `backend/nasa_data, routers/sites.py` |
| **Escena de superficie marciana** — Reutilizar superficie.js con gravedad 3,71 m/s², cielo marciano y un rover abandonado. | area:superficie-alunizaje, area:modelos-3d | `escenas/` |
