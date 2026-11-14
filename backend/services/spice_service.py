import math
from pathlib import Path

import numpy as np
import spiceypy as spice

KERNEL_DIR = Path(__file__).resolve().parent.parent / "nasa_data" / "kernels"
KERNELS = [
    "lsk/naif0012.tls",
    "pck/pck00011.tpc",
    "spk/de440s.bsp",
    "pck/moon_pa_de440_200625.bpc",
    "fk/moon_de440_220930.tf",
]
MOON_RADIUS_KM = 1737.4
ALLOWED_BODIES = {"MOON", "EARTH", "SUN"}
# Marco "Mean Earth": el de las coordenadas oficiales de los sitios Apolo.
ME_FRAME_CANDIDATES = ["MOON_ME", "MOON_ME_DE440_ME421"]

_loaded = False
_frame = None


def load_kernels() -> list[str]:
    """Carga los kernels una sola vez. Devuelve los que faltan."""
    global _loaded, _frame
    missing = []
    if not _loaded:
        for rel in KERNELS:
            path = KERNEL_DIR / rel
            if path.exists():
                spice.furnsh(str(path))
            else:
                missing.append(rel)
        _loaded = True
        _frame = _pick_frame()
    return missing


def _pick_frame() -> str:
    for name in ME_FRAME_CANDIDATES:
        if spice.namfrm(name) != 0:
            return name
    return "IAU_MOON"  # respaldo menos preciso (solo necesita pck00011.tpc)


def moon_frame() -> str:
    load_kernels()
    return _frame


def utc_to_et(utc: str) -> float:
    return spice.str2et(utc.rstrip("Z"))


def enu_sun(site_km: np.ndarray, sun_from_site_km: np.ndarray) -> dict:
    """Pasa el vector al Sol a coordenadas locales Este-Norte-Arriba del sitio."""
    up = site_km / np.linalg.norm(site_km)
    east = np.cross([0.0, 0.0, 1.0], up)
    east /= np.linalg.norm(east)
    north = np.cross(up, east)
    s = sun_from_site_km / np.linalg.norm(sun_from_site_km)
    e, n, u = float(s @ east), float(s @ north), float(s @ up)
    return {
        "enu": [e, n, u],
        # Convencion Three.js: x = este, y = arriba, -z = norte
        "three": [e, u, -n],
        "elevation_deg": math.degrees(math.asin(max(-1.0, min(1.0, u)))),
        "azimuth_deg": math.degrees(math.atan2(e, n)) % 360.0,
    }


def sun_direction(lat_deg: float, lon_deg: float, utc: str) -> dict:
    load_kernels()
    et = utc_to_et(utc)
    frame = moon_frame()
    sun_from_moon, _ = spice.spkpos("SUN", et, frame, "LT+S", "MOON")
    site = np.array(
        spice.georec(math.radians(lon_deg), math.radians(lat_deg), 0.0,
                     MOON_RADIUS_KM, 0.0)
    )
    result = enu_sun(site, np.array(sun_from_moon) - site)
    result.update({"utc": utc, "frame": frame})
    return result


def ephemeris(target: str, observer: str, utc: str) -> dict:
    load_kernels()
    et = utc_to_et(utc)
    state, light_time = spice.spkezr(target, et, "J2000", "NONE", observer)
    return {
        "target": target, "observer": observer, "utc": utc, "frame": "J2000",
        "position_km": list(state[:3]), "velocity_km_s": list(state[3:]),
        "light_time_s": light_time,
    }


def moon_orientation(utc: str) -> dict:
    """Matriz 3x3 J2000 -> marco lunar (fila a fila), para rotar luna.glb."""
    load_kernels()
    et = utc_to_et(utc)
    frame = moon_frame()
    m = spice.pxform("J2000", frame, et)
    return {"utc": utc, "frame": frame, "matrix": [list(map(float, row)) for row in m]}
