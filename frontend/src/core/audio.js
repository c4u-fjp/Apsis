// Sonido del simulador.
//  · Grabaciones de Apollo 11 (public/sonidos), sincronizadas con el tiempo de misión.
//  · Sonido sintético (de saturno_v_lanzamiento_web): pitidos y rugido de respaldo si falta un archivo.
// El navegador solo deja sonar audio tras un gesto del usuario (elegir destino / LANZAR).

// Pistas y dónde caen. "offset" = segundo del archivo que coincide con el instante t0 de la misión.
// Medido con reconocimiento de voz sobre cada archivo:
//   conteo_apollo11.mp3: "ignition sequence start" 0,5 s · "six" 3,0 · … · "zero" 9,1 · "liftoff" 11,5 · "roll program" 22
//   -> el "zero" del locutor (Jack King) coincide con el despegue: la pista empieza en T-9,1 s.
export const PISTAS = {
    conteo: { url: '/sonidos/conteo_apollo11.mp3', volumen: 1.0 },          // cuenta regresiva y despegue (voz de Control de Lanzamiento)
    despegue: { url: '/sonidos/despegue.mp3', volumen: 0.75 },              // rugido de los motores (26,6 s)
    espacio: { url: '/sonidos/en_el_espacio.mp3', volumen: 1.0 },           // "Nice to be in orbit" (NASA)
    aterrizaje: { url: '/sonidos/aterrizaje.mp3', volumen: 0.8 },           // golpe musical del contacto (8 s)
    eagle: { url: '/sonidos/eagle_has_landed.mp3', volumen: 1.0 },          // "Tranquility Base here, the Eagle has landed"
};
export const CONTEO_T0 = -9.1;

let ctx = null, maestro = null, activo = true, sonando = [];
const buffers = {};
const enCurso = new Map();   // id -> fuente (pistas sincronizadas con la misión)

function contexto() {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!ctx) { ctx = new C(); maestro = ctx.createGain(); maestro.connect(ctx.destination); }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

async function cargar(id) {
    if (buffers[id] !== undefined) return buffers[id];
    buffers[id] = null;
    const c = contexto(); if (!c) return null;
    try {
        const r = await fetch(PISTAS[id].url);
        if (!r.ok) throw new Error(r.status);
        buffers[id] = await c.decodeAudioData(await r.arrayBuffer());
    } catch (e) { console.warn('Sonido no disponible:', id, e.message); buffers[id] = false; }
    return buffers[id];
}

export const sonido = {
    get activo() { return activo; },
    // Precarga (llamar tras un gesto del usuario)
    preparar() { if (!activo) return; contexto(); for (const id of Object.keys(PISTAS)) cargar(id); },
    tiene(id) { return !!buffers[id]; },
    alternar() {
        activo = !activo;
        if (activo) this.preparar(); else this.parar();
        return activo;
    },

    // Reproduce una pista desde el segundo "desde"; con "id" único, no se duplica
    reproducir(id, { desde = 0, retraso = 0 } = {}) {
        if (!activo || !buffers[id]) return null;
        const c = contexto(); if (!c) return null;
        if (desde >= buffers[id].duration) return null;
        this.detener(id);
        const f = c.createBufferSource(), g = c.createGain();
        f.buffer = buffers[id];
        g.gain.value = PISTAS[id].volumen;
        f.connect(g).connect(maestro);
        f.start(c.currentTime + retraso, Math.max(0, desde));
        f.userData = { inicio: c.currentTime + retraso - Math.max(0, desde) };   // instante de audio del segundo 0
        f.onended = () => { if (enCurso.get(id) === f) enCurso.delete(id); };
        enCurso.set(id, f);
        return f;
    },
    sonando(id) { return enCurso.has(id); },
    detener(id) { const f = enCurso.get(id); if (f) { try { f.stop(); } catch { /* ya terminó */ } enCurso.delete(id); } },

    // Pista atada al reloj de la misión: suena si t está dentro de [t0, t0 + duración] a velocidad real,
    // empezando en el punto que toca; se corta si se pausa, se acelera o se salta.
    sincronizar(id, t, t0, { tiempoReal = true } = {}) {
        const b = buffers[id];
        if (!activo || !b) return;
        const dentro = t >= t0 && t < t0 + b.duration;
        if (!dentro || !tiempoReal) { this.detener(id); return; }
        const f = enCurso.get(id);
        // si la animación va más lenta que el tiempo real (equipo lento), se vuelve a sincronizar
        if (!f || Math.abs((ctx.currentTime - f.userData.inicio) - (t - t0)) > 0.6) this.reproducir(id, { desde: t - t0 });
    },

    parar() {
        for (const n of sonando) { try { n.stop(); } catch { /* ya terminó */ } }
        sonando = [];
        for (const id of [...enCurso.keys()]) this.detener(id);
    },

    // ── sintético ──
    pitido(f = 760) {
        if (!activo) return;
        const c = contexto(); if (!c) return;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.075, c.currentTime + 0.025);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.17);
        o.connect(g).connect(maestro);
        o.start(); o.stop(c.currentTime + 0.19);
    },
    rugido(duracion = 40) {
        if (!activo) return;
        const c = contexto(); if (!c) return;
        const t = c.currentTime;
        const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
        const ruido = c.createBufferSource(); ruido.buffer = buf; ruido.loop = true;
        const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 205;
        const g = c.createGain(); g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.23, t + 1.4);
        g.gain.setTargetAtTime(0.07, t + 8, 3);
        g.gain.setTargetAtTime(0.0001, t + duracion, 1.5);
        ruido.connect(lp).connect(g).connect(maestro);
        ruido.start(t); ruido.stop(t + duracion + 6);
        sonando.push(ruido);
    },
};
