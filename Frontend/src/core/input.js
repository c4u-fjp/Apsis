// Entrada unificada: teclado (laptop), botones tactiles (movil) y mandos Touch (Quest 2).
// poll() devuelve { throttle: 0..1, rotate: -1..1 } sin importar el dispositivo.
export function createInput(renderer) {
  const keys = new Set();
  const touch = { thrust: false, left: false, right: false };

  addEventListener("keydown", (e) => keys.add(e.code));
  addEventListener("keyup", (e) => keys.delete(e.code));

  // --- Botones tactiles (solo en pantallas tactiles) ---
  let touchUI = null;
  if (matchMedia("(pointer: coarse)").matches) {
    touchUI = document.createElement("div");
    touchUI.style.cssText =
      "position:fixed;left:0;right:0;bottom:16px;display:flex;justify-content:space-between;" +
      "padding:0 20px;pointer-events:none;user-select:none;-webkit-user-select:none";
    const mk = (label, key) => {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText =
        "width:84px;height:84px;border-radius:50%;border:2px solid #9fe;background:#0008;" +
        "color:#9fe;font-size:30px;pointer-events:auto;touch-action:none";
      const on = (v) => (e) => { e.preventDefault(); touch[key] = v; };
      b.addEventListener("pointerdown", on(true));
      for (const ev of ["pointerup", "pointercancel", "pointerleave"]) b.addEventListener(ev, on(false));
      return b;
    };
    const right = document.createElement("div");
    right.style.cssText = "display:flex;gap:16px";
    right.append(mk("⟲", "left"), mk("⟳", "right"));
    touchUI.append(mk("🔥", "thrust"), right);
    document.body.append(touchUI);
  }
  renderer.xr.addEventListener("sessionstart", () => touchUI && (touchUI.style.display = "none"));
  renderer.xr.addEventListener("sessionend", () => touchUI && (touchUI.style.display = "flex"));

  const dead = (v) => (Math.abs(v) < 0.15 ? 0 : v);

  return {
    poll() {
      let throttle = keys.has("Space") || keys.has("ArrowUp") || keys.has("KeyW") || touch.thrust ? 1 : 0;
      let rotate =
        (keys.has("ArrowRight") || keys.has("KeyD") || touch.right ? 1 : 0) -
        (keys.has("ArrowLeft") || keys.has("KeyA") || touch.left ? 1 : 0);

      // Quest 2: gatillo = empuje, joystick (axes[2]) = rotacion. axes[0..1] es el touchpad (sin uso).
      const session = renderer.xr.getSession?.();
      if (session) {
        for (const src of session.inputSources) {
          const gp = src.gamepad;
          if (!gp) continue;
          throttle = Math.max(throttle, gp.buttons[0]?.value ?? 0);
          const x = dead(gp.axes[2] ?? 0);
          if (Math.abs(x) > Math.abs(rotate)) rotate = x;
        }
      }
      return { throttle, rotate };
    },
  };
}
