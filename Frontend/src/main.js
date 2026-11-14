import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";
import { createInput } from "./core/input.js";
import { createLM, step } from "./simulation/descent.js";
import { getSunDirection } from "./api/client.js";

// --- Renderer (laptop, movil y Quest) ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); // ahorra GPU en moviles
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType("local-floor");
document.body.appendChild(renderer.domElement);
// VRButton muestra "ENTER VR" o explica por que WebXR no esta disponible (p. ej. falta HTTPS).
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 30000);
// "Rig": en VR la camara la controla el visor, asi que movemos el grupo que la contiene.
const rig = new THREE.Group();
rig.add(camera);
scene.add(rig);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// --- Luz: direccion real del Sol desde SPICE; si el backend no responde, una luz fija ---
const sun = new THREE.DirectionalLight(0xffffff, 3);
sun.position.set(300, 200, -100);
scene.add(sun, new THREE.AmbientLight(0x222233));
getSunDirection(0.6741, 23.473, "1969-07-20T20:17:40")
  .then(({ three }) => sun.position.set(three[0] * 1000, three[1] * 1000, three[2] * 1000))
  .catch((e) => console.warn("Sin backend, luz por defecto:", e.message));

// --- Escena placeholder: suelo + LM (sustituir por los .glb) ---
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40000, 40000),
  new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const lmMesh = new THREE.Mesh(
  new THREE.BoxGeometry(4, 4, 4),
  new THREE.MeshStandardMaterial({ color: 0xd4af37 })
);
scene.add(lmMesh);

// --- Simulacion ---
const lm = createLM();
const input = createInput(renderer);
const hud = document.getElementById("hud");
const clock = new THREE.Clock();

renderer.setAnimationLoop(() => { // obligatorio para WebXR (no usar requestAnimationFrame)
  const dt = Math.min(clock.getDelta(), 0.05);
  step(lm, input.poll(), dt, { easy: true });

  lmMesh.position.set(lm.x, lm.y + 2, 0);
  lmMesh.rotation.z = -lm.angle;
  rig.position.set(lm.x, lm.y + 6, 25);

  hud.textContent =
    `Altura  ${lm.y.toFixed(0)} m\nVert.   ${lm.vy.toFixed(1)} m/s\n` +
    `Horiz.  ${lm.vx.toFixed(1)} m/s\nComb.   ${lm.fuel.toFixed(0)} kg\nEstado  ${lm.status}`;

  renderer.render(scene, camera);
});
