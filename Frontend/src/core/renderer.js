import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

// Renderer común a laptop, móvil y Quest 2.
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // WebXR (Quest 2). En el Quest, usa foveación para ganar rendimiento.
  renderer.xr.enabled = true;
  renderer.xr.setFoveation(1);
  // Si va justo de rendimiento en el Quest, baja a 0.8:
  renderer.xr.setFramebufferScaleFactor(1.0);

  // Muestra "ENTER VR" si hay soporte; si no (p. ej. HTTP sin certificado) el botón lo explica.
  container.appendChild(VRButton.createButton(renderer));

  return renderer;
}

export function handleResize(renderer, camera) {
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);
  return onResize;
}

// IMPORTANTE: en VR hay que usar setAnimationLoop (no requestAnimationFrame).
export function startLoop(renderer, fn) {
  renderer.setAnimationLoop(fn);
}
