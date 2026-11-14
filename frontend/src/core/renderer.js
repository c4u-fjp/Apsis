import * as THREE from "three";
import { VRButton } from "three/addons/webxr/VRButton.js";

// Renderer común a laptop, móvil y Quest 2.
// - logarithmicDepthBuffer: la escena del espacio va de centímetros (el LM) a 400 000 km (la Luna).
// - localClippingEnabled: las etapas del Saturn V se separan con planos de recorte.
export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", logarithmicDepthBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const { w, h } = medidas(container);
  renderer.setSize(w, h);
  renderer.localClippingEnabled = true;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // WebXR (Quest 2). En el Quest, usa foveación para ganar rendimiento.
  renderer.xr.enabled = true;
  renderer.xr.setFoveation(1);
  renderer.xr.setReferenceSpaceType("local");
  // Si va justo de rendimiento en el Quest, baja a 0.8:
  renderer.xr.setFramebufferScaleFactor(1.0);

  // Muestra "ENTER VR" si hay soporte; si no (p. ej. HTTP sin certificado) el botón lo explica.
  container.appendChild(VRButton.createButton(renderer));

  return renderer;
}

export function medidas(container) {
  return { w: container.clientWidth || window.innerWidth, h: container.clientHeight || window.innerHeight };
}

export function handleResize(renderer, container, camaras) {
  const onResize = () => {
    const { w, h } = medidas(container);
    for (const camera of camaras()) { camera.aspect = w / h; camera.updateProjectionMatrix(); }
    renderer.setSize(w, h);
  };
  window.addEventListener("resize", onResize);
  onResize();
  return onResize;
}

// IMPORTANTE: en VR hay que usar setAnimationLoop (no requestAnimationFrame).
export function startLoop(renderer, fn) {
  renderer.setAnimationLoop(fn);
}
