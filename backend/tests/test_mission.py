"""Pruebas del backend. Las de SPICE se saltan si no se han descargado los kernels (p. ej. en GitHub Actions)."""
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from main import app  # noqa: E402
from routers.mission import get_a_segundos  # noqa: E402
from services import spice_service  # noqa: E402

client = TestClient(app)
HAY_KERNELS = (spice_service.KERNEL_DIR / "spk" / "de440s.bsp").exists()


def test_get_a_segundos():
    assert get_a_segundos("102:45:39.9") == pytest.approx(369939.9)
    assert get_a_segundos("-000:00:08.9") == pytest.approx(-8.9)


def test_cronologia():
    d = client.get("/mission/apollo11").json()
    tiempos = [get_a_segundos(e["get"]) for e in d["eventos"]]
    assert tiempos == sorted(tiempos)
    assert {f["escena"] for f in d["fases"]} <= {"plataforma", "espacio", "superficie"}


def test_sitios():
    ids = [s["id"] for s in client.get("/sites").json()]
    assert "apollo11" in ids


@pytest.mark.skipif(not HAY_KERNELS, reason="faltan kernels SPICE (python scripts/download_kernels.py)")
def test_sol_en_el_alunizaje():
    r = client.get("/sun-direction", params={"lat": 0.6741, "lon": 23.473, "utc": "1969-07-20T20:17:40"}).json()
    assert 9 < r["elevation_deg"] < 12   # histórico: ~10,8°


@pytest.mark.skipif(not HAY_KERNELS, reason="faltan kernels SPICE")
def test_track():
    d = client.get("/mission/apollo11/track", params={"step_s": 7200}).json()
    assert len(d["samples"]) > 60


def test_misiones_marte():
    d = client.get("/mission/marte").json()
    assert {m["id"] for m in d["misiones"]} >= {"pathfinder", "spirit"}


@pytest.mark.skipif(not HAY_KERNELS, reason="faltan kernels SPICE")
def test_track_marte():
    d = client.get("/mission/marte/spirit/track").json()
    r = sum(v * v for v in d["samples"][0]["tierra"]) ** 0.5
    assert 1.45e8 < r < 1.53e8   # la Tierra a ~1 UA del Sol
