from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Routine, RoutineLog

router = APIRouter(prefix="/api/routines", tags=["routines"])


class RoutinePayload(BaseModel):
    name: str = Field(min_length=1)
    icon: str = "✅"
    active: bool = True
    # None = no tocar el acomodo (al crear se va al final de la lista)
    sort_order: int | None = None


class ReorderPayload(BaseModel):
    ids: list[int]


def _today() -> str:
    return date.today().isoformat()


def _dia(day: str | None) -> str:
    """El date_key a usar: el que pidan, o hoy.

    Se valida aqui porque date_key es texto libre en la tabla: sin esto, un
    dia mal escrito no truena, guarda el check con una llave que despues no
    empata con nada y el palomeado se pierde en silencio.
    """
    if not day:
        return _today()
    try:
        return date.fromisoformat(day).isoformat()
    except ValueError:
        raise HTTPException(400, f"Fecha inválida: {day}. Se espera AAAA-MM-DD.")


@router.get("")
def list_routines(day: str | None = None, db: Session = Depends(get_db)):
    """El checklist de un dia. Sin `day` es el de hoy.

    Sirve para anotar en frio: si se te paso palomear ayer, pides ayer y lo
    marcas, en vez de perder el dia.
    """
    date_key = _dia(day)
    routines = (
        db.query(Routine).filter(Routine.active == 1).order_by(Routine.sort_order, Routine.name).all()
    )
    hechas = {
        log.routine_id
        for log in db.query(RoutineLog).filter(RoutineLog.date_key == date_key).all()
    }
    return [{**r.to_dict(), "date": date_key, "done": r.id in hechas} for r in routines]


@router.post("", status_code=201)
def create_routine(payload: RoutinePayload, db: Session = Depends(get_db)):
    if payload.sort_order is None:
        last = db.query(func.max(Routine.sort_order)).scalar()
        sort_order = 0 if last is None else last + 1
    else:
        sort_order = payload.sort_order
    routine = Routine(
        name=payload.name.strip(),
        icon=payload.icon or "✅",
        active=1 if payload.active else 0,
        sort_order=sort_order,
    )
    db.add(routine)
    db.commit()
    return routine.to_dict()


@router.post("/reorder")
def reorder_routines(payload: ReorderPayload, db: Session = Depends(get_db)):
    """Guarda el acomodo de la lista (drag & drop)."""
    routines = {r.id: r for r in db.query(Routine).all()}
    for index, routine_id in enumerate(payload.ids):
        routine = routines.get(routine_id)
        if routine:
            routine.sort_order = index
    db.commit()
    return {"ordered": len(payload.ids)}


@router.put("/{routine_id}")
def update_routine(routine_id: int, payload: RoutinePayload, db: Session = Depends(get_db)):
    routine = db.get(Routine, routine_id)
    if not routine:
        raise HTTPException(404, "Rutina no encontrada")
    routine.name = payload.name.strip()
    routine.icon = payload.icon or "✅"
    routine.active = 1 if payload.active else 0
    if payload.sort_order is not None:
        routine.sort_order = payload.sort_order
    db.commit()
    return routine.to_dict()


@router.delete("/{routine_id}")
def delete_routine(routine_id: int, db: Session = Depends(get_db)):
    routine = db.get(Routine, routine_id)
    if not routine:
        raise HTTPException(404, "Rutina no encontrada")
    db.delete(routine)
    db.commit()
    return {"deleted": True}


@router.post("/{routine_id}/toggle")
def toggle_routine(routine_id: int, day: str | None = None, db: Session = Depends(get_db)):
    routine = db.get(Routine, routine_id)
    if not routine:
        raise HTTPException(404, "Rutina no encontrada")
    date_key = _dia(day)
    log = (
        db.query(RoutineLog)
        .filter(RoutineLog.routine_id == routine_id, RoutineLog.date_key == date_key)
        .first()
    )
    if log:
        db.delete(log)
        done = False
    else:
        db.add(RoutineLog(routine_id=routine_id, date_key=date_key))
        done = True
    db.commit()
    return {"routine_id": routine_id, "date": date_key, "done": done}


@router.get("/stats")
def stats(days: int = 30, db: Session = Depends(get_db)):
    """Por día: cuántas rutinas se completaron vs el total activo."""
    days = max(1, min(days, 365))
    total = db.query(Routine).filter(Routine.active == 1).count()
    start = (date.today() - timedelta(days=days - 1)).isoformat()
    rows = (
        db.query(RoutineLog.date_key, func.count(RoutineLog.id))
        .filter(RoutineLog.date_key >= start)
        .group_by(RoutineLog.date_key)
        .all()
    )
    by_day = dict(rows)
    out = []
    for i in range(days):
        d = (date.today() - timedelta(days=days - 1 - i)).isoformat()
        out.append({"date": d, "done": by_day.get(d, 0), "total": total})
    return {"days": out, "total_routines": total}


@router.get("/logs")
def logs(days: int = 7, db: Session = Depends(get_db)):
    """Logs crudos de los últimos N días para la matriz semanal."""
    days = max(1, min(days, 60))
    start = (date.today() - timedelta(days=days - 1)).isoformat()
    rows = db.query(RoutineLog).filter(RoutineLog.date_key >= start).all()
    return [{"routine_id": r.routine_id, "date": r.date_key} for r in rows]
