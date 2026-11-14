import json
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/sites", tags=["sites"])
DATA = Path(__file__).resolve().parent.parent / "nasa_data" / "sites.json"


def _load() -> list[dict]:
    return json.loads(DATA.read_text(encoding="utf-8"))


@router.get("")
def list_sites():
    return _load()


@router.get("/{site_id}")
def get_site(site_id: str):
    for s in _load():
        if s["id"] == site_id:
            return s
    raise HTTPException(404, "Sitio no encontrado")
