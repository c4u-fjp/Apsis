// Entrada unificada: teclado (laptop), botones tactiles (movil) y mandos Touch (Quest 2).
// poll() devuelve { throttle: 0..1, rotate: -1..1, rod: clics de velocidad de descenso, tilt: -1..1 }
// sin importar el dispositivo. Ademas emite "acciones" (siguiente evento, camara...) via onAccion().
//
// Pilotaje del LM:
//   W/S o ↑/↓  -> velocidad de descenso (ROD, como el interruptor de Armstrong en P66) / empuje en modo directo
//   A/D o ←/→  -> inclinacion (adelante/atras)
//   Espacio    -> empuje al 100 % (solo en modo directo)
export function createInput(renderer) {
  const keys = new Set();
  const touch = { thrust: false, left: false, right: false, up: false, down: false };
  let clicksROD = 0;
  const oyentes = [];
  const emitir = (a) => oyentes.forEach((f) => f(a));

  const ACCIONES = {
    KeyP: "pausa", KeyN: "siguiente", KeyB: "anterior", Period: "masRapido", Comma: "masLento",
    KeyH: "historia", KeyV: "camara", KeyC: "sala", KeyM: "modo", KeyR: "reintentar", Enter: "aceptar",
  };
  addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement) return;
    keys.add(e.code);
    if (e.code === "KeyW" || e.code === "ArrowUp") clicksROD += 1;
    if (e.code === "KeyS" || e.code === "ArrowDown") clicksROD -= 1;
    if (!e.repeat && ACCIONES[e.code]) emitir(ACCIONES[e.code]);
    if (!e.repeat && e.code === "Space") emitir("espacio");
    if (["Space", "ArrowUp", "ArrowDown"].includes(e.code)) e.preventDefault();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  // --- Botones tactiles (solo en pantallas tactiles y solo durante el alunizaje) ---
  let touchUI = null;
  if (matchMedia("(pointer: coarse)").matches) {
    touchUI = document.createElement("div");
    touchUI.id = "controles-tactiles";
    touchUI.style.cssText =
      "position:fixed;left:0;right:0;bottom:16px;display:none;justify-content:space-between;" +
      "padding:0 20px;pointer-events:none;user-select:none;-webkit-user-select:none;z-index:50";
    const mk = (label, key, alPulsar) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText =
        "width:72px;height:72px;border-radius:50%;border:2px solid #9fe;background:#0008;" +
        "color:#9fe;font-size:26px;pointer-events:auto;touch-action:none";
      const on = (v) => (e) => { e.preventDefault(); touch[key] = v; if (v) alPulsar?.(); };
      b.addEventListener("pointerdown", on(true));
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, on(false));
      return b;
    };
    const izq = document.createElement("div");
    izq.style.cssText = "display:flex;flex-direction:column;gap:10px";
    izq.append(mk("▲", "up", () => (clicksROD += 1)), mk("▼", "down", () => (clicksROD -= 1)));
    const der = document.createElement("div");
    der.style.cssText = "display:flex;gap:12px;align-items:flex-end";
    der.append(mk("⟲", "left"), mk("⟳", "right"), mk("🔥", "thrust"));
    touchUI.append(izq, der);
    document.body.append(touchUI);
  }
  let tactilVisible = false;
  renderer.xr.addEventListener("sessionstart", () => touchUI && (touchUI.style.display = "none"));
  renderer.xr.addEventListener("sessionend", () => touchUI && (touchUI.style.display = tactilVisible ? "flex" : "none"));

  const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);
  const previo = new Map(); // estado anterior de los botones del mando (para detectar pulsaciones)
  let acumROD = 0;

  return {
    onAccion(f) { oyentes.push(f); },
    mostrarTactil(v) { tactilVisible = v; if (touchUI && !renderer.xr.isPresenting) touchUI.style.display = v ? "flex" : "none"; },
    poll(dt = 1 / 60) {
      let throttle = keys.has("Space") || touch.thrust ? 1 : 0;
      if (keys.has("KeyW") || keys.has("ArrowUp")) throttle = Math.max(throttle, 0.6);
      let rotate =
        (keys.has("ArrowRight") || keys.has("KeyD") || touch.right ? 1 : 0) -
        (keys.has("ArrowLeft") || keys.has("KeyA") || touch.left ? 1 : 0);
      let tilt = rotate;

      // Quest 2: gatillo = empuje, joystick derecho X = inclinacion, joystick izquierdo Y = ROD.
      // A = cambiar modo / tomar el control, B = camara, gatillo izq. = siguiente evento.
      const session = renderer.xr.getSession?.();
      if (session) {
        for (const src of session.inputSources) {
          const gp = src.gamepad;
          if (!gp) continue;
          const lado = src.handedness;
          const x = dead(gp.axes[2] ?? 0), y = dead(gp.axes[3] ?? 0);
          if (lado === "right") {
            throttle = Math.max(throttle, gp.buttons[0]?.value ?? 0);
            if (Math.abs(x) > Math.abs(tilt)) { tilt = x; rotate = x; }
          } else if (y) {
            acumROD += -y * dt * 4;                      // ~4 clics por segundo a fondo
            while (acumROD >= 1) { clicksROD++; acumROD--; }
            while (acumROD <= -1) { clicksROD--; acumROD++; }
          }
          const pulsado = (i) => !!gp.buttons[i]?.pressed;
          const clave = (i) => `${lado}${i}`;
          const flanco = (i) => pulsado(i) && !previo.get(clave(i));
          if (lado === "right" && flanco(4)) emitir("modo");
          if (lado === "right" && flanco(5)) emitir("camara");
          if (lado === "left" && flanco(0)) emitir("siguiente");
          if (lado === "left" && flanco(4)) emitir("sala");
          for (const i of [0, 4, 5]) previo.set(clave(i), pulsado(i));
        }
      }
      const rod = clicksROD;
      clicksROD = 0;
      return { throttle, rotate, rod, tilt };
    },
  };
}
