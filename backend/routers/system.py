import socket
from datetime import datetime

from fastapi import APIRouter

from backend.config import VERSION

router = APIRouter(prefix="/api/system", tags=["system"])

STARTED_AT = datetime.now()


@router.get("/ping")
def ping():
    return {"pong": True}


@router.get("/info")
def system_info():
    return {
        "hostname": socket.gethostname(),
        "version": VERSION,
        "started_at": STARTED_AT.isoformat(),
    }
