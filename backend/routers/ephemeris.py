from fastapi import APIRouter, HTTPException, Query
from spiceypy.utils.exceptions import SpiceyError

from services import spice_service as sp

router = APIRouter(tags=["spice"])


def _guard(fn, *args):
    try:
        return fn(*args)
    except SpiceyError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/ephemeris")
def ephemeris(target: str = "MOON", observer: str = "EARTH",
              utc: str = Query(..., examples=["1969-07-20T20:17:40"])):
    target, observer = target.upper(), observer.upper()
    if target not in sp.ALLOWED_BODIES or observer not in sp.ALLOWED_BODIES:
        raise HTTPException(400, f"Cuerpos permitidos: {sorted(sp.ALLOWED_BODIES)}")
    return _guard(sp.ephemeris, target, observer, utc)


@router.get("/sun-direction")
def sun_direction(lat: float = Query(..., ge=-90, le=90),
                  lon: float = Query(..., ge=-180, le=180),
                  utc: str = Query(..., examples=["1969-07-20T20:17:40"])):
    return _guard(sp.sun_direction, lat, lon, utc)


@router.get("/moon-orientation")
def moon_orientation(utc: str):
    return _guard(sp.moon_orientation, utc)
