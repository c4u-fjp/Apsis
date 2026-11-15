import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import ephemeris, mission, sites
from services import spice_service


@asynccontextmanager
async def lifespan(app: FastAPI):
    missing = spice_service.load_kernels()
    if missing:
        print("AVISO: faltan kernels:", missing, "-> python scripts/download_kernels.py")
    yield


app = FastAPI(title="Abandoned but not Forgotten API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    # En producción el frontend llama vía el proxy /api de Cloudflare Pages (mismo origen), así que no
    # hace falta CORS. Si se llama directo al backend, añade los dominios en ALLOWED_ORIGINS (separados por comas).
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"]
    + [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()],
    allow_methods=["GET"],
    allow_headers=["*"],
)
app.include_router(ephemeris.router)
app.include_router(sites.router)
app.include_router(mission.router)


@app.get("/health")
def health():
    return {"ok": True, "moon_frame": spice_service.moon_frame()}
