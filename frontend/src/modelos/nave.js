// La "pila" Apollo/Saturn V como piezas separables y su configuración en función del tiempo de misión.
// Todo es función pura de t (se puede saltar hacia delante o atrás sin acumular estado).
//
// Marco de la pila (unidades del modelo saturnoV.glb): +Y = punta del cohete, origen en la base de los F-1.
import * as THREE from 'three';
import { CORTES, SATURNO_M_POR_UNIDAD, LM_M_POR_UNIDAD } from './cargador.js';
import { crearLlama, animarLlama } from './efectos.js';

const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const centro = (id) => (CORTES[id][0] + Math.min(CORTES[id][1], 12.85)) / 2;
const Y_CSM = (CORTES.SM[0] + CORTES.CM[1]) / 2;       // centro de giro del CSM
const MEDIO_CSM = CORTES.CM[1] - Y_CSM;                // de su centro a la punta del CM
const LM_ESCALA = LM_M_POR_UNIDAD / SATURNO_M_POR_UNIDAD;
const LM_BASE = CORTES.SIVB[1] + 0.03;
const LM_TOPE = LM_BASE + 5.12 * LM_ESCALA;
const Y_ACOPLE = LM_TOPE + MEDIO_CSM;
const X = new THREE.Vector3(1, 0, 0);

export class NaveApollo {
    // saturno: resultado de crearSaturno(); lm: resultado de crearLM()
    constructor(saturno, lm, crono) {
        this.s = saturno;
        this.lm = lm;
        this.c = crono;
        this.raiz = new THREE.Group();
        this.raiz.name = 'pila_apollo';
        this.todas = [...Object.values(saturno.piezas), ...saturno.petalos];
        for (const p of this.todas) this.raiz.add(p.pivote);
        // El LM va en su propia raíz: mientras viaja en la pila se coloca con la misma pose que la pila,
        // y tras el desacople la escena la mueve por su cuenta.
        this.lmPivote = new THREE.Group();
        this.lmPivote.add(lm.grupo);
        this.raizLM = new THREE.Group();
        this.raizLM.name = 'raiz_LM';
        this.raizLM.add(this.lmPivote);

        // Llamas (en unidades de cada pieza)
        const P = saturno.piezas;
        this.llamas = {
            'S-IC': this._llama(P.SIC, -0.14 - centro('SIC'), { radio: 0.62, largo: 7, intensidad: 1.1 }),
            'S-II': this._llama(P.SII, CORTES.SII[0] - centro('SII'), { radio: 0.5, largo: 3.2, colorA: 0xd8e4ff, colorB: 0x6f8cff, intensidad: 0.55 }),
            'S-IVB': this._llama(P.SIVB, CORTES.SIVB[0] - centro('SIVB'), { radio: 0.42, largo: 2.6, colorA: 0xd8e4ff, colorB: 0x6f8cff, intensidad: 0.5 }),
            SPS: this._llama(P.SM, CORTES.SM[0] - 0.12 - centro('SM'), { radio: 0.16, largo: 1.4, colorA: 0xfff3d6, colorB: 0xff9a4a, intensidad: 0.5 }),
        };
        const dps = crearLlama({ radio: 0.5, largo: 3.5, colorA: 0xfff3d6, colorB: 0xff9a4a, intensidad: 0.45 });
        dps.position.y = 0.55;
        lm.grupo.add(dps);
        this.llamas.DPS = dps;

        this._q = new THREE.Quaternion();
        this._v = new THREE.Vector3();
    }

    _llama(pieza, y, op) {
        const l = crearLlama(op);
        l.position.y = y;
        pieza.pivote.add(l);
        return l;
    }

    // Separaciones: la escena del espacio las convierte en trayectorias balísticas.
    get separaciones() {
        const ev = this.c.ev;
        return [
            { id: 'SIC', t: ev.sepS1, impulso: [0, -9, 0], giro: [0.02, 0, 0.03] },
            { id: 'INTER', t: ev.interetapa, impulso: [0.4, -3, 0], giro: [0.3, 0.1, 0.2] },
            { id: 'LES', t: ev.les, impulso: [3, 40, 0], giro: [0.05, 0, 0.4] },
            { id: 'SII', t: ev.sepS2, impulso: [0, -4, 0], giro: [0.01, 0, 0.02] },
            ...this.s.petalos.map((p) => ({ id: p.id, t: ev.sepCSM + 30, impulso: [p.dir.x * 1.2, -0.15, p.dir.z * 1.2], giro: [p.eje.x * 0.15, 0.05, p.eje.z * 0.15] })),
        ];
    }

    // Configuración en el instante t. 'escala' = unidades de escena por unidad del modelo.
    // Devuelve el centro (unidades de pila) de lo que sigue unido, para la cámara.
    configurar(t, escala, tiempoReal = 0) {
        const ev = this.c.ev;
        const P = this.s.piezas;
        const sueltas = new Set(this.separaciones.filter((s) => t >= s.t).map((s) => s.id));
        let suma = new THREE.Vector3(), n = 0;
        const colocar = (pieza, x, y, z, q = null) => {
            pieza.pivote.position.set(x * escala, y * escala, z * escala);
            if (q) pieza.pivote.quaternion.copy(q); else pieza.pivote.quaternion.identity();
            pieza.pivote.scale.setScalar(escala);
            pieza.pivote.visible = true;
            suma.add(this._v.set(x, y, z)); n++;
        };

        // Etapas del lanzador
        for (const id of ['SIC', 'INTER', 'SII', 'LES']) {
            const p = P[id];
            p.pivote.userData.suelta = sueltas.has(id);
            if (!sueltas.has(id)) colocar(p, 0, centro(id), 0);
        }
        // S-IVB: tras la extracción se aleja despacio (en el marco de Columbia/Eagle) y desaparece tras la "honda"
        const ext = t < ev.extraccion ? 0 : 2.4 * sm((t - ev.extraccion) / 120) + 0.004 * Math.max(0, t - ev.extraccion - 120);
        P.SIVB.pivote.userData.suelta = false;
        if (t < ev.honda) {
            colocar(P.SIVB, 0, centro('SIVB') - ext, 0);
            if (t >= ev.extraccion) { n--; suma.sub(this._v); }
        } else P.SIVB.pivote.visible = false;

        // Adaptador SLA: entero hasta la separación; luego 4 pétalos que se abren y se sueltan
        const abierto = t >= ev.sepCSM;
        P.SLA.pivote.userData.suelta = abierto;
        if (!abierto) colocar(P.SLA, 0, centro('SLA'), 0);
        else P.SLA.pivote.visible = false;
        for (const p of this.s.petalos) {
            p.pivote.userData.suelta = sueltas.has(p.id);
            if (!abierto) { p.pivote.visible = false; continue; }
            if (sueltas.has(p.id)) continue;
            const ang = (Math.PI / 4) * sm((t - ev.sepCSM) / 15);
            this._q.setFromAxisAngle(p.eje, ang);
            colocar(p, p.centro.x, p.centro.y, p.centro.z, this._q);
            n--; suma.sub(this._v);   // los pétalos no cuentan para el centro
        }

        // CSM (SM + CM): separación, giro de 180° y acople con el LM
        const t1 = ev.sepCSM + 101, t2 = t1 + 60, t3 = t2 + 140, tA = ev.acople;
        let yC = Y_CSM, giro = 0;
        if (t >= t1) yC += 1.9 * sm((t - t1) / (t2 - t1));
        if (t >= t2) giro = Math.PI * sm((t - t2) / (t3 - t2));
        if (t >= t3) yC = Y_CSM + 1.9 + (Y_ACOPLE - Y_CSM - 1.9) * sm((t - t3) / (tA - t3));
        if (t >= tA) yC = Y_ACOPLE;
        this._q.setFromAxisAngle(X, giro);
        for (const id of ['SM', 'CM']) {
            const off = this._v.set(0, centro(id) - Y_CSM, 0).applyQuaternion(this._q);
            const pos = off.clone();
            colocar(P[id], pos.x, yC + pos.y, pos.z, this._q);
        }

        // LM: oculto dentro del SLA hasta que se abre
        const lmVisible = abierto;
        this.lmPivote.visible = lmVisible;
        if (lmVisible) {
            this.lmPivote.position.set(0, LM_BASE * escala, 0);
            this.lmPivote.quaternion.identity();
            this.lmPivote.scale.setScalar(escala * LM_ESCALA);
            this.lm.ascenso.position.set(0, 0, 0);
            suma.add(this._v.set(0, LM_BASE + 0.4, 0)); n++;
        }

        // Llamas
        const enc = this.c.encendido(t);
        for (const [motor, l] of Object.entries(this.llamas)) {
            if (motor === 'DPS') continue; // el motor de descenso lo gestiona la escena del LM
            animarLlama(l, tiempoReal, !!enc && enc.motor === motor);
        }
        return n ? suma.multiplyScalar(1 / n) : new THREE.Vector3(0, 6, 0);
    }

    // Tras el desacople cada vehículo va por su cuenta: estos métodos dejan la pila en un solo vehículo
    soloCSM(escala, t, tiempoReal = 0) {
        for (const p of this.todas) p.pivote.visible = false;
        const P = this.s.piezas;
        this._q.setFromAxisAngle(X, Math.PI);
        for (const id of ['SM', 'CM']) {
            const off = this._v.set(0, centro(id) - Y_CSM, 0).applyQuaternion(this._q);
            P[id].pivote.position.set(off.x * escala, off.y * escala, off.z * escala);
            P[id].pivote.quaternion.copy(this._q);
            P[id].pivote.scale.setScalar(escala);
            P[id].pivote.visible = true;
        }
        const enc = this.c.encendido(t);
        for (const [motor, l] of Object.entries(this.llamas)) if (motor !== 'DPS') animarLlama(l, tiempoReal, !!enc && enc.motor === motor);
    }

    // Eagle solo (tras el desacople): su raíz se coloca directamente en la pose del LM
    soloLM(escalaLM) {
        this.lmPivote.position.set(0, 0, 0);
        this.lmPivote.quaternion.identity();
        this.lmPivote.scale.setScalar(escalaLM);
        this.lmPivote.visible = true;
    }

    actualizarRecortes() { for (const p of this.todas) if (p.pivote.visible) p.actualizarRecorte(); }

    // Centro del CSM respecto a la base del LM (unidades de pila), para el desacople
    static get offsetCSMdesdeLM() { return Y_ACOPLE - LM_BASE; }
    static get baseLM() { return LM_BASE; }
    static get escalaLM() { return LM_ESCALA; }
}
