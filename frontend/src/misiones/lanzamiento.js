// Pantalla de lanzamiento (el cohete en la plataforma y el botón LANZAMIENTO) y cuenta regresiva.
const $ = (id) => document.getElementById(id);

export function pantallaLanzamiento({ destino, mision, alLanzar, alVolver }) {
    const el = $('lanzamiento');
    $('lz-destino').textContent = destino;
    $('lz-mision').innerHTML = '';
    for (const linea of mision) { const d = document.createElement('div'); d.textContent = linea; $('lz-mision').append(d); }
    const lanzar = $('btn-lanzar');
    lanzar.disabled = false;
    $('lz-cuenta').textContent = '';
    el.querySelector('.lz-info').style.display = '';
    lanzar.onclick = () => { lanzar.disabled = true; el.querySelector('.lz-info').style.display = 'none'; alLanzar(); };
    $('btn-volver').onclick = alVolver;
    el.classList.remove('oculto');
    return {
        cuenta(texto) {
            const [n, sub] = texto.split(' · ');
            const el = $('lz-cuenta');
            if (el.dataset.t === texto) return;
            el.dataset.t = texto;
            el.innerHTML = '';
            el.append(n ?? '');
            if (sub) { const s = document.createElement('small'); s.textContent = sub; el.append(s); }
        },
        ocultar() { el.classList.add('oculto'); $('lz-cuenta').textContent = ''; },
    };
}

// Texto de la cuenta regresiva para un instante t (s respecto al despegue)
export function textoCuenta(t, ignicion) {
    if (t < -0.05) return t > ignicion ? `T-${Math.ceil(-t)} · IGNICIÓN` : `T-${Math.ceil(-t)}`;
    if (t < 4) return 'DESPEGUE';
    return '';
}
