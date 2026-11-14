"""Descarga los kernels SPICE de NAIF (JPL). Ejecutar desde backend/:  python scripts/download_kernels.py"""
import urllib.request
from pathlib import Path

BASE = "https://naif.jpl.nasa.gov/pub/naif/generic_kernels/"
DEST = Path(__file__).resolve().parent.parent / "nasa_data" / "kernels"

# (ruta remota, carpeta local)
KERNELS = [
    ("lsk/naif0012.tls", "lsk"),                          # segundos intercalares (UTC <-> ET)
    ("pck/pck00011.tpc", "pck"),                          # radios y constantes planetarias
    ("spk/planets/de440s.bsp", "spk"),                    # efemerides Sol/Tierra/Luna (1849-2150, ~32 MB)
    ("pck/moon_pa_de440_200625.bpc", "pck"),              # orientacion precisa de la Luna
    ("fk/satellites/moon_de440_220930.tf", "fk"),         # definicion de los marcos lunares (MOON_PA / MOON_ME)
]

def main():
    for remote, folder in KERNELS:
        out = DEST / folder / Path(remote).name
        out.parent.mkdir(parents=True, exist_ok=True)
        if out.exists():
            print(f"[ok]   {out.name} ya existe")
            continue
        print(f"[down] {remote}")
        urllib.request.urlretrieve(BASE + remote, out)
    print("Listo.")

if __name__ == "__main__":
    main()
