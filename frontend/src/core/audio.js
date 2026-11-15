// Sonido sintético (sin archivos de audio), adaptado de saturno_v_lanzamiento_web/main.js:
// pitidos de la cuenta regresiva y el rugido de los motores. Solo suena si el usuario lo activa.
let ctx = null, activo = false, sonando = [];

function contexto() {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    if (!ctx) ctx = new C();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
}

export const sonido = {
    get activo() { return activo; },
    alternar() { activo = !activo; if (activo) contexto(); else this.parar(); return activo; },
    parar() { for (const n of sonando) { try { n.stop(); } catch { /* ya terminó */ } } sonando = []; },
    pitido(f = 760) {
        if (!activo) return;
        const c = contexto(); if (!c) return;
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, c.currentTime);
        g.gain.exponentialRampToValueAtTime(0.075, c.currentTime + 0.025);
        g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.17);
        o.connect(g).connect(c.destination);
        o.start(); o.stop(c.currentTime + 0.19);
    },
    rugido(duracion = 40) {
        if (!activo) return;
        const c = contexto(); if (!c) return;
        this.parar();
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
        ruido.connect(lp).connect(g).connect(c.destination);
        ruido.start(t); ruido.stop(t + duracion + 6);
        const o = c.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(36, t); o.frequency.linearRampToValueAtTime(48, t + 5);
        const lp2 = c.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 100;
        const g2 = c.createGain(); g2.gain.setValueAtTime(0.0001, t);
        g2.gain.exponentialRampToValueAtTime(0.045, t + 1);
        g2.gain.setTargetAtTime(0.0001, t + duracion * 0.6, 2);
        o.connect(lp2).connect(g2).connect(c.destination);
        o.start(t); o.stop(t + duracion + 6);
        sonando = [ruido, o];
    },
};
