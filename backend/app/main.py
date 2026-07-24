from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api import (
    routes_area,
    routes_auth,
    routes_bd,
    routes_calc_settings,
    routes_catalog,
    routes_dimensionamento,
    routes_mismatch,
)
from app.infra.db import Base, engine

app = FastAPI(title="Fotus — Calculadora de Dimensionamento", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # rede local/hospedagem propria — restringir se exposto publicamente
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(engine)


app.include_router(routes_auth.router)
app.include_router(routes_catalog.router)
app.include_router(routes_dimensionamento.router)
app.include_router(routes_area.router)
app.include_router(routes_mismatch.router)
app.include_router(routes_bd.router)
app.include_router(routes_calc_settings.router)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok"}


# Hospedagem local single-port: se o frontend tiver sido buildado
# (`npm run build` em frontend/), serve os arquivos estaticos a partir
# do proprio backend, permitindo acessar o app inteiro por um unico
# endereco (ex: http://<ip-da-maquina>:8010) na rede da Fotus.
_frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
if _frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
