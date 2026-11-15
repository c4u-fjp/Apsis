# Arquitectura

```
          backend (FastAPI + SPICE)                    frontend (Vite + Three.js)
 ┌──────────────────────────────────┐   /api   ┌─────────────────────────────────────────────┐
 │ routers/mission.py  cronología,  │ ───────► │ mision/efemerides.js  (backend o respaldo)  │
 │   track SPICE, sky, estado       │          │ mision/trayectoria.js (posición del vehículo│
 │ routers/ephemeris.py, sites.py   │          │   en cualquier t: ascenso, Lambert, Luna)   │
 │ services/spice_service.py        │          │ mision/cronologia.js + reloj.js (tiempo)    │
 └──────────────────────────────────┘          │                 │                           │
                                               │            main.js (director)                │
                                               │   ┌──────────┬───┴──────┬──────────────┐     │
                                               │ plataforma  espacio   superficie   centroControl
                                               │   (m)         (km)       (m)        (sala)   │
                                               └─────────────────────────────────────────────┘
```

## Armazón y controladores
`main.js` crea lo compartido (renderer, entrada, HUD, sala de control, escena de la plataforma) y muestra el
inicio. Al elegir destino carga con `import()` un **controlador** de `src/misiones/`:

| Método | Qué hace |
|---|---|
| `crearMision(base, id)` | carga datos y modelos, configura la plataforma con su `perfil` |
| `entrar()` / `salir()` | pantalla de lanzamiento / limpieza al volver al inicio |
| `frame(dt, tReal)` | avanza su reloj, actualiza la escena activa y llama a `base.render(escena, estadoSala)` |
| `accion(nombre)` | teclado, botones y mandos (pausa, siguiente, camara, sala…) |
| `deslizador(f)` | la línea de tiempo (0–1) |

`base.vista` = `'escena'` (3D directo) o `'sala'` (la escena en la pantalla gigante del Control de Misión).
La plataforma recibe un **perfil**: `vehiculo` (adaptador de `modelos/vehiculos.js`), `altKm(t)`, `rangoKm(t)`,
`azimut`, `solLocal(t)` y opcional `astroLocal(t)`. Un cohete nuevo = un adaptador nuevo.

## Lo que quedó allí (explorador de restos)
Al llegar al destino (Luna: cuando la etapa de ascenso se va; Marte: al llegar) el controlador abre
`misiones/restos.js`, que envuelve `escenas/restos.js`:

- **Órbita**: el planeta con radio R = 10. Cada nave de `data/restos.json → orbita` se propaga con Kepler
  (período real, 1 s en pantalla = 10 min) y su radio se comprime con `radioVisual(altKm)` (logarítmico).
  Colores: naranja abandonada, rosa (discontinua) destino incierto, verde tenue en servicio.
- **Sitios**: marcadores en lat/lon (`dirLatLon`: longitud 0 en +X, este hacia −Z). Los que tienen
  `superficie: true` se pueden visitar: acercarse con la rueda a menos de 1,22 R, o el botón de la ficha.
- **Superficie**: terreno en metros (X este, Z sur) con los `objetos` del sitio; los que están lejos llevan
  `distancia` y se dibujan a una distancia comprimida. Alejarse (r > 820 m) vuelve a la órbita.

Para añadir un sitio u objeto basta con editar `restos.json` (y, si es un tipo nuevo, una función en
`modelos/restos.js`). `tests/restos.test.js` comprueba que los tipos existen.
Enlaces directos: `?destino=luna&restos`, `?destino=marte&mision=phoenix&restos`.

## El tiempo manda
Todo depende de **t = GET** (segundos desde el despegue; negativo en la cuenta regresiva).
`RelojMision` lo avanza con la aceleración del "modo historia" (`warp` en `apollo11.json`).
`main.js` elige la escena con `escenaPara(t)` y le pasa `t` cada cuadro.

## Contrato de una escena
Cualquier escena nueva (p. ej. `superficieApollo15.js`, `marte.js`) implementa:

| Miembro | Qué hace |
|---|---|
| `id` | nombre corto |
| `scene`, `camera`, `rig` | Three.js; la cámara va dentro del `rig` (en VR el visor mueve la cámara, tú mueves el rig) |
| `controls` | una `Orbita` (core/orbita.js) para arrastrar/zoom |
| `async cargar(...)` | carga modelos una vez |
| `entrar(t)` / `salir()` | al activarse / desactivarse (también al saltar en la línea de tiempo) |
| `actualizar(t, dtReal, dtSim, tiempoReal, estado)` | coloca todo para el instante t |
| `antesDeRender()` | último paso antes de dibujar (p. ej. planos de recorte) |
| `cambiarCamara()` | rota entre cámaras; devuelve el nombre |
| `relojPropio` + `avanzarReloj(dt, reloj)` | *opcional*: la escena controla el tiempo (como el alunizaje pilotable) |

Regla: `actualizar(t)` debe dar el mismo resultado llegues a `t` avanzando o saltando. El estado que no se puede
calcular desde `t` (la física del alunizaje) se reinicia en `entrar(t)`.

## Escalas y coordenadas
- **plataforma / superficie**: metros, X = este, Y = arriba, −Z = norte (igual que `/sun-direction` → `three`).
- **espacio**: km, J2000 centrado en la Tierra. Conversión `T3([x,y,z]) = (x, z, −y)`. Origen flotante: el grupo
  `mundo` se desplaza para que el vehículo esté en (0,0,0). En VR el rig se escala 1/1000.
- Profundidad logarítmica activada en el renderer: los `ShaderMaterial` propios deben incluir los chunks
  `logdepthbuf_*` (ver `modelos/efectos.js`).

## Datos
- `apollo11.json`: eventos (GET reales), fases (qué escena), `warp`, `encendidos`, tabla de ascenso, `abandonados`.
- `efemerides_apollo11.json`: copia de `/mission/apollo11/track` para trabajar sin backend. Regenerar:
  `curl -k https://localhost:5173/api/mission/apollo11/track > frontend/src/data/efemerides_apollo11.json`
- `sites.json`: sitios Apolo (lat/lon, hardware, historia, `lrv`).

## Cómo añadir otra misión (p. ej. Apolo 15)
1. `backend/nasa_data/apollo15_mission.json` con la misma forma que el de Apolo 11 + ruta en `routers/mission.py`.
2. Escena de superficie: copiar `superficie.js`, cambiar sitio (sites.json), cráteres (Hadley Rille) y añadir el LRV.
3. Selector de misión en la pantalla de inicio (`main.js`).
