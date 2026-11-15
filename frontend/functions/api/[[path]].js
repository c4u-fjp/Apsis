// Cloudflare Pages Function (solo si el frontend va en Cloudflare): reenvía /api/* al backend.
// Así el navegador solo habla con Cloudflare (mismo origen, HTTPS): sin CORS y sin recompilar
// el frontend si cambia la URL del backend. Configura la variable BACKEND_URL en Cloudflare Pages,
// p. ej.  https://apsis-backend.onrender.com
export async function onRequestGet({ request, env, params }) {
    const base = (env.BACKEND_URL ?? '').replace(/\/$/, '');
    if (!base) return new Response('Falta la variable BACKEND_URL en Cloudflare Pages', { status: 500 });
    const ruta = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');
    const { search } = new URL(request.url);
    const resp = await fetch(`${base}/${ruta}${search}`, {
        headers: { accept: request.headers.get('accept') ?? 'application/json' },
        cf: { cacheEverything: true, cacheTtl: 3600 },   // las efemérides no cambian: caché de 1 h
    });
    const h = new Headers(resp.headers);
    if (resp.ok) h.set('cache-control', 'public, max-age=3600');
    return new Response(resp.body, { status: resp.status, headers: h });
}
