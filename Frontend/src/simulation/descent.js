// Descenso 2D simplificado del modulo lunar (sin red, corre a 60 fps).
export const G_MOON = 1.62;          // m/s^2
export const MAX_THRUST = 45040;     // N (motor de descenso, empuje maximo)
export const ISP = 311;              // s
const G0 = 9.80665;

export const LIMITS = { vy: 3.0, vx: 1.2, angleDeg: 12 };   // limites de aterrizaje seguro

export function createLM() {
  return {
    x: 0, y: 3000,            // m
    vx: 0, vy: -20,           // m/s
    angle: 0, omega: 0,       // rad, rad/s (0 = vertical)
    dryMass: 7000, fuel: 8200, // kg (valores aproximados, simplificados)
    status: "descending",      // descending | landed | crashed
  };
}

// controls: { throttle: 0..1, rotate: -1..1 }
export function step(lm, controls, dt, { easy = false } = {}) {
  if (lm.status !== "descending") return lm;

  const throttle = lm.fuel > 0 ? Math.min(1, Math.max(0, controls.throttle)) : 0;
  const thrust = MAX_THRUST * throttle;
  const mass = lm.dryMass + lm.fuel;
  const a = thrust / mass;

  lm.omega = easy ? controls.rotate * 0.3 : lm.omega + controls.rotate * 0.4 * dt;
  lm.angle += lm.omega * dt;

  lm.vx += a * Math.sin(lm.angle) * dt;
  lm.vy += (a * Math.cos(lm.angle) - G_MOON) * dt;
  lm.x += lm.vx * dt;
  lm.y += lm.vy * dt;
  lm.fuel = Math.max(0, lm.fuel - (thrust / (ISP * G0)) * dt);

  if (lm.y <= 0) {
    lm.y = 0;
    const ok =
      Math.abs(lm.vy) <= LIMITS.vy &&
      Math.abs(lm.vx) <= LIMITS.vx &&
      Math.abs(lm.angle) <= (LIMITS.angleDeg * Math.PI) / 180;
    lm.status = ok ? "landed" : "crashed";
  }
  return lm;
}
