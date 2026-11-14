"""Misión Apollo 11: cronología real (NASA SP-4029) + efemérides SPICE para el simulador.

Portado y ampliado desde nasa_space_apps/backend/main.py (/api/estado).
"""
import json
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from spiceypy.utils.exceptions import SpiceyError

from services import spice_service as sp

router = APIRouter(prefix="/mission", tags=["mission"])
DATA = Path(__file__).resolve().parent.parent / "nasa_data" / "apollo11_mission.json"


@lru_cache(maxsize=1)
def _mision() -> dict:
    return json.loads(DATA.read_text(encoding="utf-8"))


def get_a_segundos(get: str) -> float:
    """'102:45:39.9' -> segundos desde el despegue (admite signo negativo)."""
    neg = get.startswith("-")
    h, m, s = get.lstrip("-").split(":")
    v = int(h) * 3600 + int(m) * 60 + float(s)
    return -v if neg else v


def _lanzamiento() -> datetime:
    return datetime.fromisoformat(_mision()["lanzamiento_utc"].replace("Z", "+00:00"))


def _utc(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


@router.get("/apollo11")
def mision():
    """Cronología completa: fases, eventos, perfil de ascenso y encendidos."""
    return _mision()


@lru_cache(maxsize=8)
def _track(step_s: int) -> dict:
    t0 = _lanzamiento() - timedelta(hours=1)
    t1 = _lanzamiento() + timedelta(hours=126)
    out = sp.mission_track(_utc(t0), _utc(t1), float(step_s))
    out["t0_get_s"] = -3600.0  # la muestra 0 corresponde a GET -1 h
    return out


@router.get("/apollo11/track")
def track(step_s: int = Query(1800, ge=300, le=7200)):
    """Luna, Sol y orientación lunar desde GET -1 h hasta GET +126 h (SPICE, DE440)."""
    try:
        return _track(step_s)
    except SpiceyError as e:
        raise HTTPException(400, str(e))


@router.get("/apollo11/sky")
def sky(utc: str = Query("1969-07-20T20:17:40")):
    """Dirección del Sol y de la Tierra vistos desde Base Tranquilidad (ENU y convención Three.js)."""
    s = _mision()["sitio"]
    try:
        return {
            "sun": sp.sun_direction(s["lat"], s["lon"], utc),
            "earth": sp.body_direction_enu("EARTH", s["lat"], s["lon"], utc),
        }
    except SpiceyError as e:
        raise HTTPException(400, str(e))


def fase_en(get_s: float) -> dict:
    fases = _mision()["fases"]
    actual = fases[0]
    for f in fases:
        if get_a_segundos(f["inicio"]) <= get_s:
            actual = f
    return actual


@router.get("/apollo11/estado")
def estado(tiempo: str = Query(..., examples=["1969-07-19T17:21:50Z"])):
    """Estado de la misión en un instante (sucesor de /api/estado de nasa_space_apps)."""
    try:
        t = datetime.fromisoformat(tiempo.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(400, "Formato de 'tiempo' inválido (ISO 8601)")
    if t.tzinfo is None:
        t = t.replace(tzinfo=timezone.utc)
    get_s = (t - _lanzamiento()).total_seconds()
    eventos = _mision()["eventos"]
    previo = next((e for e in reversed(eventos) if get_a_segundos(e["get"]) <= get_s), None)
    siguiente = next((e for e in eventos if get_a_segundos(e["get"]) > get_s), None)
    luna = sp.ephemeris("MOON", "EARTH", _utc(t))
    return {
        "get_s": get_s,
        "fase": fase_en(get_s),
        "evento_anterior": previo,
        "evento_siguiente": siguiente,
        "luna_km": luna["position_km"],
        "distancia_tierra_luna_km": sum(v * v for v in luna["position_km"]) ** 0.5,
    }


# ───────────────────────── Marte (rovers lanzados en Delta II) ─────────────────────────
MARTE = Path(__file__).resolve().parent.parent / "nasa_data" / "marte_misiones.json"


@lru_cache(maxsize=1)
def _marte() -> dict:
    return json.loads(MARTE.read_text(encoding="utf-8"))


@router.get("/marte")
def misiones_marte():
    return _marte()


@lru_cache(maxsize=8)
def _helio(mid: str) -> dict:
    m = next((x for x in _marte()["misiones"] if x["id"] == mid), None)
    if m is None:
        raise HTTPException(404, "Misión no encontrada")
    t0 = datetime.fromisoformat(m["lanzamiento_utc"].replace("Z", "+00:00")) - timedelta(days=5)
    # 700 días: cubre el viaje y una órbita completa de Marte (687 d) para dibujarla
    out = sp.helio_track(_utc(t0), _utc(t0 + timedelta(days=700)), 86400.0)
    out["mision"] = m
    return out


@router.get("/marte/{mid}/track")
def track_marte(mid: str):
    """Posiciones heliocéntricas reales (SPICE) de la Tierra y Marte durante el viaje, cada día."""
    try:
        return _helio(mid)
    except SpiceyError as e:
        raise HTTPException(400, str(e))
