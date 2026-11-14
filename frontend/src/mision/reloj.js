// Reloj de misión con aceleración temporal. En "modo historia" la velocidad sigue el perfil de la
// cronología (tiempo real en el despegue y el alunizaje, miles de veces más rápido en el crucero).
export const WARPS = [0.5, 1, 2, 4, 10, 30, 100, 300, 1000, 3000, 10000];

export class RelojMision {
    constructor(cronologia) {
        this.c = cronologia;
        this.t = cronologia.inicio;
        this.pausado = false;
        this.auto = true;        // modo historia
        this.warpManual = 1;
        this.limite = Infinity;  // la escena interactiva puede frenar el reloj (p. ej. el alunizaje)
        this.bloqueado = false;  // mientras el usuario pilota, el tiempo corre a 1x
    }

    get warp() {
        if (this.bloqueado) return 1;
        return this.auto ? this.c.warpHistoria(this.t) : this.warpManual;
    }

    avanzar(dtReal) {
        if (this.pausado) return this.t;
        // en saltos grandes se limita el paso para no "atravesar" eventos de varias horas en un frame
        this.t = Math.min(this.limite, this.t + dtReal * this.warp);
        return this.t;
    }

    saltarA(t) { this.t = Math.min(t, this.limite); }

    cambiarWarp(dir) {
        const actual = this.warp;
        let i = WARPS.findIndex((w) => w >= actual - 1e-9);
        if (i < 0) i = WARPS.length - 1;
        this.auto = false;
        this.warpManual = WARPS[Math.max(0, Math.min(WARPS.length - 1, i + dir))];
    }

    modoHistoria() { this.auto = true; }
}
