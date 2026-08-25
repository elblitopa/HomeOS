"""Espejo de HomeOS hacia Google Calendar.

Una sola via: HomeOS manda, Google obedece. Todo lo local que tiene fecha
—eventos marcados, tareas pendientes con fecha limite, pagos y suscripciones—
se refleja como un evento de Google, para que el celular avise por su cuenta
ademas de Discord.

En vez de enganchar cada endpoint que crea o borra algo, esto compara lo que
deberia existir contra lo que ya se subio (tabla google_links) y empareja la
diferencia. Asi se recupera solo si Google fallo, si el servidor estuvo
apagado o si el next_due de un pago avanzo.
"""

import hashlib
import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session

from backend.database import SessionLocal
from backend.models import (
    Event,
    GoogleLink,
    RecurringPayment,
    ScheduledTransaction,
    Subscription,
    Todo,
    get_setting,
)
from backend.services import google_calendar as gcal

log = logging.getLogger("homeos.google.sync")

TODOS_KEY = "google_sync_todos"
FINANCE_KEY = "google_sync_finance"

# Google acepta hasta 5 avisos por evento, de 0 a 40320 minutos antes.
MAX_OVERRIDES = 5
MAX_MINUTES = 40320

# En un evento de dia completo los minutos se cuentan desde la medianoche,
# asi que 900 = el dia anterior a las 9 de la manana.
AVISO_DIA_ANTERIOR = 900


def activo(db: Session, key: str) -> bool:
    """Los interruptores de Ajustes; por defecto encendidos."""
    return (get_setting(db, key) or "1") == "1"


def _avisos(minutos: list[int] | None) -> dict:
    limpios = sorted({int(m) for m in (minutos or []) if 0 <= int(m) <= MAX_MINUTES})
    if not limpios:
        return {"useDefault": True}
    return {
        "useDefault": False,
        "overrides": [{"method": "popup", "minutes": m} for m in limpios[:MAX_OVERRIDES]],
    }


def _cuerpo(kind: str, local_id: int, title: str, start: datetime,
            end: datetime | None, all_day: bool, description: str | None,
            avisos: list[int] | None) -> dict:
    inicio, fin = gcal.rango(start, end, all_day)
    return {
        "summary": title,
        "description": description,
        "start": inicio,
        "end": fin,
        "reminders": _avisos(avisos),
        # la marca sirve para reconocer el evento como propio al leerlo
        "extendedProperties": {"private": {gcal.MARK_KEY: f"{kind}:{local_id}"}},
    }


def _pie(texto: str | None, origen: str) -> str:
    return f"{texto}\n\n— {origen} · HomeOS" if texto else f"— {origen} · HomeOS"


def _deseado(db: Session) -> dict[tuple[str, int], dict]:
    """Lo que deberia existir en Google ahora mismo."""
    quiero: dict[tuple[str, int], dict] = {}

    for ev in db.query(Event).filter(Event.sync_google.is_(True)).all():
        quiero[("evento", ev.id)] = _cuerpo(
            "evento", ev.id, ev.title, ev.start, ev.end, ev.all_day,
            _pie(ev.description, "Evento"), ev.reminders,
        )

    if activo(db, TODOS_KEY):
        tareas = (
            db.query(Todo)
            .filter(Todo.status == "pendiente", Todo.due_date.isnot(None))
            .all()
        )
        for t in tareas:
            # si la fecha limite no trae hora, va como evento de dia completo
            sin_hora = (t.due_date.hour, t.due_date.minute) == (0, 0)
            quiero[("tarea", t.id)] = _cuerpo(
                "tarea", t.id, f"✅ {t.title}", t.due_date, None, sin_hora,
                _pie(t.description, "Tarea"),
                t.reminders if not sin_hora else (t.reminders or [AVISO_DIA_ANTERIOR]),
            )

    if activo(db, FINANCE_KEY):
        for s in db.query(Subscription).filter(Subscription.next_due.isnot(None)).all():
            quiero[("suscripcion", s.id)] = _cuerpo(
                "suscripcion", s.id,
                f"🔁 {s.name} — ${s.amount:,.2f} {s.currency or 'MXN'}",
                s.next_due, None, True,
                _pie(f"Cobro {s.period}.", "Suscripción"), [AVISO_DIA_ANTERIOR],
            )

        deudas = (
            db.query(RecurringPayment)
            .filter(
                RecurringPayment.next_due.isnot(None),
                RecurringPayment.installments_paid < RecurringPayment.installments_total,
            )
            .all()
        )
        for p in deudas:
            faltan = p.installments_total - p.installments_paid
            cobro = (p.type or "egreso") == "ingreso"
            etiqueta = "Abono" if cobro else "Pago"
            quiero[("pago", p.id)] = _cuerpo(
                "pago", p.id,
                f"{'💰' if cobro else '💳'} {p.name} — ${p.installment_amount:,.2f} {p.currency or 'MXN'}",
                p.next_due, None, True,
                _pie(f"{etiqueta} {p.installments_paid + 1} de {p.installments_total}"
                     f" ({faltan} por delante).", "Cobro a plazos" if cobro else "Deuda"),
                [AVISO_DIA_ANTERIOR],
            )

        # ingresos y egresos programados que siguen sin confirmarse
        pendientes = db.query(ScheduledTransaction).filter(
            ScheduledTransaction.status == "pendiente"
        ).all()
        for s in pendientes:
            signo = "+" if s.type == "ingreso" else "−"
            quiero[("programado", s.id)] = _cuerpo(
                "programado", s.id,
                f"{'📥' if s.type == 'ingreso' else '📤'} {s.description} — "
                f"{signo}${s.amount:,.2f} {s.currency or 'MXN'}",
                s.scheduled_for, None, True,
                _pie("Marcar en HomeOS si se concretó.", "Programado"),
                [AVISO_DIA_ANTERIOR],
            )

    return quiero


def _huella(cuerpo: dict) -> str:
    crudo = json.dumps(cuerpo, sort_keys=True, ensure_ascii=False)
    return hashlib.sha1(crudo.encode()).hexdigest()


def _desaparecio(e: gcal.GoogleError) -> bool:
    """El evento ya no esta en Google (lo borraron a mano desde el celular)."""
    return e.status in (404, 410)


def sync(db: Session) -> dict:
    """Empareja Google con HomeOS. Nunca lanza: los errores se reportan."""
    situacion = gcal.estado(db)
    if situacion == "no_conectado":
        return {"omitido": "no hay cuenta de Google conectada"}
    if situacion == "requiere_reconexion":
        # el refresh token ya fue rechazado: insistir cada minuto solo
        # generaría ruido. El aviso se logueó UNA vez al marcarse; aquí se
        # sale en silencio y los google_links quedan intactos para retomar
        # sin duplicados cuando el usuario reconecte.
        return {"omitido": "Google requiere reconexión (Ajustes → Reconectar)"}

    destino = gcal.calendar_id(db)
    quiero = _deseado(db)
    enlaces = {(l.kind, l.local_id): l for l in db.query(GoogleLink).all()}
    creados = actualizados = borrados = 0
    errores: list[str] = []

    # lo que ya no debe estar en Google: tareas completadas, eventos borrados,
    # deudas liquidadas o cosas que dejaron de espejarse
    for clave, enlace in enlaces.items():
        if clave in quiero:
            continue
        try:
            gcal.delete_event(db, enlace.google_event_id, enlace.google_calendar_id)
        except gcal.GoogleError as e:
            if not _desaparecio(e):
                errores.append(f"borrar {clave[0]} {clave[1]}: {e}")
                continue
        db.delete(enlace)
        borrados += 1

    for clave, cuerpo in quiero.items():
        enlace = enlaces.get(clave)
        huella = _huella(cuerpo)
        try:
            if enlace is None:
                creado = gcal.insert_raw(db, destino, cuerpo)
                db.add(GoogleLink(
                    kind=clave[0], local_id=clave[1],
                    google_event_id=creado["id"], google_calendar_id=destino,
                    fingerprint=huella, updated_at=datetime.now(),
                ))
                creados += 1
            elif enlace.fingerprint != huella:
                gcal.patch_raw(db, enlace.google_calendar_id, enlace.google_event_id, cuerpo)
                enlace.fingerprint = huella
                enlace.updated_at = datetime.now()
                actualizados += 1
        except gcal.GoogleError as e:
            if enlace is not None and _desaparecio(e):
                # lo borraron desde Google; se suelta el enlace y en la
                # siguiente vuelta se vuelve a crear
                db.delete(enlace)
            else:
                errores.append(f"{clave[0]} {clave[1]}: {e}")

    db.commit()
    if errores:
        log.warning("Sync con Google incompleto: %s", "; ".join(errores[:5]))
    return {
        "creados": creados,
        "actualizados": actualizados,
        "borrados": borrados,
        "errores": errores,
        "calendario": destino,
    }


def sync_seguro(db: Session) -> dict:
    """Igual que sync(), pero un fallo de red tampoco tumba a quien lo llama."""
    try:
        return sync(db)
    except Exception as e:  # noqa: BLE001 - el espejo nunca debe romper el panel
        log.exception("Fallo el espejo con Google")
        db.rollback()
        return {"error": str(e)}


def sync_aparte() -> None:
    """Para BackgroundTasks: sesion propia, sin hacer esperar la respuesta.

    Se usa al guardar eventos y tareas para que el espejo sea inmediato en vez
    de aguantar hasta la siguiente vuelta del scheduler.
    """
    with SessionLocal() as db:
        sync_seguro(db)
