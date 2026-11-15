// Descenso 2D del modulo lunar (sin red, corre a 60 fps).
// x = distancia horizontal (m, positiva hacia el oeste = sentido de vuelo de Eagle; 0 = Base Tranquilidad)
// y = altura sobre el nivel de referencia (m). El suelo real es terreno(x).
import { t as tr } from '../i18n/index.js';
export const G_MOON = 1.62;          // m/s^2
export const MAX_THRUST = 45040;     // N (motor de descenso, empuje maximo)
export const MIN_THROTTLE = 0.1;     // el DPS no baja del ~10 %
export const ISP = 311;              // s
const G0 = 9.80665;

export const LIMITS = { vy: 3.0, vx: 1.2, angleDeg: 12 };   // limites de aterrizaje seguro
export const SONDA_CONTACTO = 1.7;  // m: sondas de 1,7 m bajo las patas -> "CONTACT LIGHT"

export function createLM(opts = {}) {
  return {
    x: 0, y: 3000,            // m
    vx: 0, vy: -20,           // m/s
    angle: 0, omega: 0,       // rad, rad/s (0 = vertical; >0 empuja hacia +x)
    dryMass: 7000, fuel: 8200, // kg (valores aproximados, simplificados)
    throttle: 0,
    status: "descending",      // descending | landed | crashed
    motivo: "",
    ...opts,
  };
}

const sueloPlano = () => 0;

// controls: { throttle: 0..1, rotate: -1..1 }  (modo directo, como en la version original)
//           o { throttle, angleCmd }            (los modos guiados fijan la actitud directamente)
export function step(lm, controls, dt, { easy = false, suelo = sueloPlano, peligro = null } = {}) {
  if (lm.status !== "descending") return lm;

  let throttle = lm.fuel > 0 ? Math.min(1, Math.max(0, controls.throttle)) : 0;
  if (throttle > 0 && throttle < MIN_THROTTLE) throttle = MIN_THROTTLE;
  lm.throttle = throttle;
  const thrust = MAX_THRUST * throttle;
  const mass = lm.dryMass + lm.fuel;
  const a = thrust / mass;

  if (controls.angleCmd !== undefined) {
    const maxRate = 0.35; // rad/s (~20°/s, como los propulsores RCS)
    const d = controls.angleCmd - lm.angle;
    lm.omega = Math.max(-maxRate, Math.min(maxRate, d * 3));
  } else {
    lm.omega = easy ? controls.rotate * 0.3 : lm.omega + controls.rotate * 0.4 * dt;
  }
  lm.angle += lm.omega * dt;

  lm.vx += a * Math.sin(lm.angle) * dt;
  lm.vy += (a * Math.cos(lm.angle) - G_MOON) * dt;
  lm.x += lm.vx * dt;
  lm.y += lm.vy * dt;
  lm.fuel = Math.max(0, lm.fuel - (thrust / (ISP * G0)) * dt);

  const h0 = suelo(lm.x);
  if (lm.y <= h0) {
    lm.y = h0;
    const ok =
      Math.abs(lm.vy) <= LIMITS.vy &&
      Math.abs(lm.vx) <= LIMITS.vx &&
      Math.abs(lm.angle) <= (LIMITS.angleDeg * Math.PI) / 180;
    const riesgo = peligro?.(lm.x);
    lm.status = ok && !riesgo ? "landed" : "crashed";
    lm.motivo = !ok
      ? (Math.abs(lm.vy) > LIMITS.vy ? `${tr('velocidad vertical')} ${Math.abs(lm.vy).toFixed(1)} m/s` :
         Math.abs(lm.vx) > LIMITS.vx ? `${tr('velocidad horizontal')} ${Math.abs(lm.vx).toFixed(1)} m/s` :
         `${tr('inclinación')} ${(Math.abs(lm.angle) * 180 / Math.PI).toFixed(0)}°`)
      : riesgo ?? "";
  }
  return lm;
}

// ───────── Modos guiados (como el computador de Eagle) ─────────

// Empuje necesario (throttle y actitud) para conseguir la aceleración deseada (ax, ay)
function mando(lm, ax, ay, maxTilt = 0.75) {
  const m = lm.dryMass + lm.fuel;
  const tx = ax, ty = Math.max(0.2, ay + G_MOON);
  let ang = Math.atan2(tx, ty);
  const lim = Math.abs(ang) > maxTilt;
  if (lim) ang = Math.sign(ang) * maxTilt;
  const acc = lim ? ty / Math.cos(ang) : Math.hypot(tx, ty);   // si se limita la actitud, se prioriza la vertical
  return { throttle: Math.min(1, (acc * m) / MAX_THRUST), angleCmd: ang };
}

// P64/P65: guiado de "tiempo restante" hacia un punto objetivo (x, h) con velocidad final (0, vyf)
export function guiadoAuto(lm, objetivo, suelo = sueloPlano) {
  const hObj = suelo(objetivo.x) + objetivo.h;
  const dx = objetivo.x - lm.x, dy = hObj - lm.y;
  const radar = lm.y - suelo(lm.x);
  if (radar < 15 || (radar < objetivo.h + 8 && Math.abs(dx) < 25)) return guiadoP66(lm, radar > 8 ? -1.5 : -0.9, 0, suelo, objetivo.x);
  // tiempo restante: el que da una frenada uniforme en horizontal (o en vertical si domina)
  const tgo = Math.max(10, 2 * Math.abs(dx) / Math.max(3, Math.abs(lm.vx)), 2 * Math.abs(dy) / Math.max(1.5, Math.abs(lm.vy)));
  const vxf = 0, vyf = -1.0;
  const ax = (6 * dx) / (tgo * tgo) - (4 * lm.vx + 2 * vxf) / tgo;
  const ay = (6 * dy) / (tgo * tgo) - (4 * lm.vy + 2 * vyf) / tgo;
  return mando(lm, ax, ay);
}

// P66 (velocidad de descenso): el piloto fija la velocidad vertical (ROD) y la inclinación;
// el computador ajusta el empuje. Con xObj, además anula la deriva sobre ese punto (P66 automático).
export function guiadoP66(lm, vyCmd, tiltCmd, suelo = sueloPlano, xObj = null) {
  const m = lm.dryMass + lm.fuel;
  let ang = tiltCmd;
  if (xObj !== null) {
    const axDes = -0.6 * lm.vx + 0.04 * (xObj - lm.x);
    ang = Math.max(-0.35, Math.min(0.35, Math.atan2(axDes, G_MOON)));
  }
  const ay = 1.2 * (vyCmd - lm.vy);
  const acc = (ay + G_MOON) / Math.max(0.3, Math.cos(lm.angle));
  return { throttle: Math.max(0, Math.min(1, (acc * m) / MAX_THRUST)), angleCmd: ang };
}

// Segundos de vuelo estacionario que quedan con el combustible actual
export function segundosCombustible(lm) {
  const m = lm.dryMass + lm.fuel;
  const flujo = (m * G_MOON) / (ISP * G0);
  return lm.fuel / flujo;
}
