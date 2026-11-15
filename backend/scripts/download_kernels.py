"""Descarga los kernels SPICE de NAIF (JPL). Ejecutar desde backend/:  python scripts/download_kernels.py"""
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
DEST = Path(__file__).resolve().parent.parent / "nasa_data" / "kernels"

# (carpeta local, [rutas remotas candidatas: se prueba en orden hasta que una funcione])
KERNELS = [
    ("lsk", ["lsk/naif0012.tls"]),                        # segundos intercalares (UTC <-> ET)
    ("pck", ["pck/pck00011.tpc"]),                        # radios y constantes planetarias
    ("spk", ["spk/planets/de440s.bsp"]),                  # efemerides Sol/Tierra/Luna (1849-2150, ~32 MB)
    ("pck", ["pck/moon_pa_de440_200625.bpc"]),            # orientacion precisa de la Luna
    ("fk", [                                              # marcos lunares (MOON_PA / MOON_ME)
        "fk/satellites/moon_de440_250416.tf",             # version vigente
        "fk/satellites/a_old_versions/moon_de440_220930.tf",  # version anterior, tambien valida
    ]),
]


def fetch(remote: str, out: Path, intentos: int = 3) -> bool:
    for i in range(intentos):
        try:
            urllib.request.urlretrieve(BASE + remote, out)
            return True
        except urllib.error.HTTPError as e:      # 404: probar el siguiente candidato
            print(f"   {e.code} en {remote}")
            out.unlink(missing_ok=True)
            return False
        except (urllib.error.URLError, OSError) as e:   # red caída: reintentar
            print(f"   error de red ({e}); reintento {i + 1}/{intentos}")
            out.unlink(missing_ok=True)
            time.sleep(3 * (i + 1))
    return False


def main():
    fallos = 0
    for folder, candidates in KERNELS:
        name = Path(candidates[0]).name
        out_dir = DEST / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        # ya hay alguno de los candidatos descargado?
        if any((out_dir / Path(c).name).exists() for c in candidates):
            print(f"[ok]   {name} (o equivalente) ya existe")
            continue
        for remote in candidates:
            print(f"[down] {remote}")
            if fetch(remote, out_dir / Path(remote).name):
                break
        else:
            print(f"[FALLO] no se pudo descargar {name}; revisa el listado de NAIF")
            fallos += 1
    print("Listo." if not fallos else f"Faltan {fallos} kernels.")
    sys.exit(1 if fallos else 0)    # en Docker/Render el build falla en vez de arrancar sin datos


if __name__ == "__main__":
    main()