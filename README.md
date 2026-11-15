# Abandoned but not Forgotten

**Flujo:** la sala de Control de Misión de Houston es la pantalla de inicio → eliges **Luna** (Apollo 11,
Saturn V) o **Marte** (Sojourner, Spirit, Opportunity o Phoenix, Delta II) → pantalla de lanzamiento con el
cohete en la plataforma → **LANZAMIENTO**: cuenta regresiva, despegue y seguimiento del cohete → al llegar al
espacio (~100 km) la vista pasa a la sala de control, donde la pantalla gigante muestra la trayectoria hacia
el destino → los restos que quedaron allí.

La portada y la pantalla de lanzamiento usan el diseño del equipo (`saturno_v_lanzamiento_web`): tipografías
Barlow Condensed y Montserrat (incluidas con @fontsource, funcionan sin internet), cielo de referencia, grano de
película, cuenta regresiva grande, destello y vibración en la ignición, y sonido sintético opcional (SONIDO: ON).
El lanzamiento es nocturno y cinematográfico; con `?luzReal` se usa la hora real (Apollo 11 y Spirit despegaron
de día).

Simulador del **Apollo 11, del lanzamiento al alunizaje**: Saturn V en la plataforma 39A, separación de
etapas, órbita terrestre, inyección translunar, transposición y acople, tránsito a la Luna, órbita lunar,
descenso propulsado y un **alunizaje pilotable** (P64/P66) en Base Tranquilidad. Termina con lo que se
quedó allí: la etapa de descenso de Eagle, el sismómetro y el retrorreflector.

## Arranque (dos terminales)
```bash
# Terminal 1 - backend (solo local; Vite lo expone vía /api)
cd backend
python -m venv venv && source venv/bin/activate     # Arch no deja usar pip fuera de un venv
pip install -r requirements-dev.txt
python scripts/download_kernels.py
uvicorn main:app --reload

# Terminal 2 - frontend (HTTPS + red local)
cd frontend && npm install && npm run dev
```
Abrir `https://localhost:5173` y elegir destino. Si el backend no está encendido, el simulador
usa efemérides SPICE precalculadas (`frontend/src/data/efemerides_apollo11.json`) y lo indica en el panel.

Enlaces directos: `?destino=luna`, `?destino=marte&mision=pathfinder` (spirit, opportunity, phoenix),
`?t=102:33:05` (Apollo 11 en ese instante; GET hhh:mm:ss o segundos). Opciones: `&pausa`, `&sala`.

## Publicar en internet
Frontend en **Cloudflare Pages** y backend (Docker) en **Render** (`render.yaml`), conectados a GitHub: ver **[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)**.

## Trabajar en equipo
Lee **[CONTRIBUTING.md](CONTRIBUTING.md)** (flujo de ramas y PR, áreas, convenciones),
**[docs/ARQUITECTURA.md](docs/ARQUITECTURA.md)** (cómo encaja todo y cómo añadir escenas o misiones) y
**[docs/BACKLOG.md](docs/BACKLOG.md)** (tareas iniciales). Pruebas: `npm test` (frontend) y `pytest` (backend);
GitHub Actions las ejecuta en cada Pull Request.

## Acceso desde otros dispositivos (misma red Wi-Fi)
1. IP del PC:  `ip -4 addr | grep inet`
2. Firewall (Arch): `sudo ufw allow 5173/tcp`  (o `sudo firewall-cmd --add-port=5173/tcp`)
3. Laptop/móvil/Quest: abrir `https://IP_DEL_PC:5173` y aceptar el aviso del certificado
   (Avanzado -> Continuar). El certificado es autofirmado.
4. Quest 2: en el Navegador de Meta, abrir la misma URL y pulsar **ENTER VR**.

## Si el Quest no entra en VR
- WebXR solo funciona en HTTPS (o localhost). Con `http://IP` el botón dirá que falta WebXR.
- Alternativa sin aviso de certificado: `adb reverse tcp:5173 tcp:5173` y abrir
  `https://localhost:5173` en el Quest (requiere modo desarrollador y adb).
- Si no conecta: la red puede tener "aislamiento de clientes"; prueba otra red o un hotspot del móvil.

## Controles
| Acción | Teclado | Quest 2 | Móvil |
|---|---|---|---|
| Pausa | P (o Espacio fuera del alunizaje) | clic del joystick izq. | botón ⏸ |
| Siguiente / anterior evento | N / B | joystick izq. ↑ / ↓ (o gatillo izq.) | ⏭ / ⏮ |
| Velocidad del tiempo | `,` / `.` · H = modo historia | joystick izq. ← / → (mantener = repetir) | − / + / HISTORIA |
| Cambiar cámara | V | B o clic del joystick der. | CÁMARA |
| Girar la cámara / acercar y alejar | arrastrar / rueda | joystick der. ← → / ↑ ↓ | arrastrar / pellizco |
| Salir del modo VR (volver a la pantalla normal) | — | **Y** | — |
| Ver desde el Control de Misión | C | X | CONTROL DE MISIÓN |
| Modo de pilotaje (AUTO → P66 → DIRECTO) | M | A | — |
| P66: velocidad de descenso (±0,3 m/s por pulsación) | W / S | joystick izq. ↕ (solo pilotando) | ▲ ▼ |
| Inclinar adelante / atrás | D / A | joystick der. ↔ (solo pilotando) | ⟳ ⟲ |
| Empuje (solo modo DIRECTO) | Espacio | gatillo derecho | 🔥 |

En VR la portada (HTML) no se ve: delante aparece un **menú 3D** con la Luna y los cuatro rovers. Apunta con
cualquier mando y pulsa el gatillo, o muévete con el joystick izquierdo y confirma con **A**. En la plataforma,
**A** (o el gatillo izquierdo) lanza y el joystick izquierdo ↓ vuelve al menú.
En VR el panel bajo la vista muestra la velocidad de la simulación y esta guía de mandos. Mientras pilotas el LM
a mano (P66 o DIRECTO) los joysticks pilotan; el resto del tiempo controlan el tiempo y la cámara.
Para volver a VR después de pulsar Y, toca **ENTER VR** en la página.

En el alunizaje, **N** termina el descenso en automático. Si Eagle se estrella puedes reintentar desde la P64
o desde la P66. El computador (AUTO) aterriza en Base Tranquilidad; en P66 tienes el combustible justo para
pasar de largo el campo de rocas del cráter West, como Armstrong.

## Sonido (grabaciones de Apollo 11, `public/sonidos/`)
| Archivo | Cuándo suena |
|---|---|
| `conteo_apollo11.mp3` | Empieza en T-9,1 s: "ignition sequence start… six, five… zero" coincide con el despegue (T-0), "liftoff" en T+2,4 y "roll program" en T+13 (el real fue a T+13,2) |
| `despegue.mp3` | Rugido de motores desde la ignición (T-8,9 s en Apollo 11; T-2 s en el Delta II) |
| `en_el_espacio.mp3` | Al llegar al espacio, cuando la vista pasa a la sala de control ("EL VIAJE HA COMENZADO") |
| `aterrizaje.mp3` | En el contacto: alunizaje de Eagle o llegada a Marte |
| `eagle_has_landed.mp3` | 3,5 s después: "Tranquility Base here, the Eagle has landed" |

Las pistas del lanzamiento van atadas al reloj de la misión: se cortan al pausar, saltar o acelerar el tiempo, y
se resincronizan si el equipo va lento. En Marte no se usa la cuenta de Apollo 11 (dice "Apollo 11"): suenan pitidos.
Botón **SONIDO** en la pantalla de lanzamiento y **♪** en el panel.

## Marte
- Fechas de lanzamiento y llegada reales (NASA/JPL); posiciones de la Tierra y Marte de SPICE (DE440) vía
  `/mission/marte/{id}/track` (o `src/data/efemerides_marte.json` sin backend).
- El arco Tierra–Marte resuelve el problema de Lambert alrededor del Sol (sale un exceso hiperbólico de ~3 km/s,
  como en las misiones reales). El **perfil de ascenso del Delta II es aproximado** (modelado).
- `delta2.glb` trae 3 propulsores GEM; se clonan para tener los 9 del Delta II 7925 (6 en tierra + 3 en vuelo).

## Qué es real y qué está modelado
- **Real (NASA SP-4029 "Apollo by the Numbers")**: todos los instantes de la cronología (`apollo11_mission.json`),
  la tabla de altitud/rango del ascenso, la órbita de aparcamiento (191 km, 88,18 min), la duración de la TLI,
  las órbitas lunares (111 x 314 km, luego ~111 x 122 km; Eagle 15 x 107 km), la PDI a 15 km y 1,7 km/s.
- **Real (SPICE / DE440, backend)**: posición de la Luna y del Sol durante toda la misión, orientación de la Luna
  (marco MOON_ME) y dirección del Sol (10,7° de elevación) y de la Tierra vistas desde Base Tranquilidad.
- **Calculado**: el encendido de la TLI se integra numéricamente y el arco translunar resuelve el problema de
  Lambert hasta la Luna en el instante de la LOI (sale 10,82 km/s tras la TLI; el real fue 10,83 km/s).
- **Modelado**: la llegada a la Luna por detrás (órbita retrógrada) y el perfil de frenado de la PDI;
  la física del alunizaje es 2D (`simulation/descent.js`).

## Estructura
```
backend/
  routers/mission.py        NUEVO  /mission/apollo11 (cronología), /track (efemérides SPICE),
                                   /sky (Sol y Tierra desde el sitio), /estado (sucesor de /api/estado)
  services/spice_service.py +      mission_track(), body_direction_enu()
  nasa_data/apollo11_mission.json  NUEVO  cronología, ascenso, fases, perfil de velocidad temporal
frontend/
  src/main.js               armazón: renderer, sala de control (inicio), plataforma, bucle, acciones
  src/misiones/lunar.js     controlador Apollo 11 (reloj, escenas, línea de tiempo)
  src/misiones/marte.js     controlador Marte (Delta II + viaje interplanetario + restos)
  src/escenas/interplanetario.js  Sol, órbitas reales de la Tierra y Marte, arco de Lambert
  src/misiones/restos.js    modo "lo que quedó allí": panel lateral, HUD y VR del explorador de restos
  src/escenas/restos.js     órbita (naves abandonadas y activas, sitios) -> zoom -> superficie con los restos
  src/modelos/restos.js     modelos procedurales a escala: LRV, Surveyor, Lunokhod, Pathfinder, MER, Phoenix...
  src/data/restos.json      datos: órbitas, sitios (lat/lon), objetos, estado y fuentes
  src/i18n/                 idiomas: es (base) y en · selector en la portada · ver docs/ARQUITECTURA.md
  src/movil.css             teléfonos (≤ 800 px): vista 3D arriba y menú abajo; restos como hoja inferior
  public/models/            buggy_lunar.glb (LRV), mer.glb (Spirit/Opportunity, se despliega con sus animaciones),
                            perseverance.glb, ingenuity.glb — optimizados con gltf-transform (Draco + WebP 1024)
  public/video/apollo_60s.mp4  video de la Luna en la pantalla gigante del inicio (bucle, con sonido)
  public/video/marte_90s.mp4   video de Marte: primer 1:30 de «Mars Pathfinder – 20th Anniversary Special» (NASA/JPL)
                               con «Titan» de Scott Buckley (CC BY 4.0, desde 1:00) como audio
  src/mision/               tiempo, cronología, reloj, efemérides y trayectoria (Lambert, Kepler)
  src/escenas/plataforma.js 39A en metros: cuenta regresiva, ignición, despegue (0-75 s)
  src/escenas/espacio.js    escala real en km con origen flotante: Tierra, Luna, pila Apollo, mapa
  src/escenas/superficie.js Mar de la Tranquilidad: P64, P66, alunizaje y epílogo
  src/escenas/centroControl.js   (de nasa_space_apps) sala de Houston con la pantalla gigante
  src/modelos/              cargador (Draco), etapas del Saturn V por planos de recorte, efectos
  src/core/                 renderer, input, hud, panelVR, órbita de cámara, modoCardboard
  src/simulation/           descent.js (ampliado con guiado P64/P66), stateMachine.js
  public/texturas/          mapas de la Tierra (three.js examples)
  public/draco/             decodificador Draco (mod_lunar.glb está comprimido)
```

**Reutilizado de nasa_space_apps**: la sala de Control de Misión y su pantalla gigante (`centroControl.js`),
el modo Cardboard, el panel de telemetría y su estilo, el registro de eventos con narrativa, las partículas de
humo, el resplandor de marcador y las estrellas de `lanzamiento.js`, el patrón "cálculo local inmediato +
backend que refina" de `api.js`, y el endpoint `/api/estado` (ahora `/mission/apollo11/estado`).

## Notas sobre los modelos
- `tierra.glb` y `luna.glb` son **el mismo archivo** (los dos son la Luna). El simulador usa `luna1.glb`
  para la Luna (misma textura, malla más ligera) y texturas propias para la Tierra; `luna.glb` y `tierra.glb`
  ya no se cargan (puedes borrarlos y ahorrar 100 MB, o poner ahí una Tierra real).
- `saturnoV.glb` es una sola malla: las etapas se separan con planos de recorte (`modelos/cargador.js`, `CORTES`).
- `mod_lunar.glb` se divide automáticamente en etapa de ascenso y de descenso.

## Siguientes pasos
- Apolo 15, 16 y 17: mismas escenas de superficie con el LRV (`sites.json` ya marca `lrv: true`).
- Robots en Marte (Sojourner, Spirit, Opportunity, Viking, InSight, Ingenuity) con su propia escena de superficie.
