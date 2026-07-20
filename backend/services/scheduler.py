"""Loop de recordatorios: revisa cada minuto eventos y tareas con due date
y manda webhooks de Discord en los offsets configurados (1d, 6h, ..., 0min).
"""

import asyncio
import logging
from datetime import datetime, timedelta

from backend.database import SessionLocal
from backend.models import Event, SentReminder, Todo, get_setting
from backend.notifications.discord import send_webhook

log = logging.getLogger("homeos.scheduler")

CHECK_EVERY_S = 60
# si el server estuvo apagado, todavia manda recordatorios atrasados hasta 10 min
LATE_TOLERANCE = timedelta(minutes=10)
MAX_OFFSET = timedelta(minutes=1441)


def _fmt_offset(minutes: int) -> str:
    if minutes <= 0:
        return "¡ahora!"
    if minutes < 60:
        return f"en {minutes} min"
    if minutes < 1440:
        h = minutes // 60
        return f"en {h} hora{'s' if h > 1 else ''}"
    d = minutes // 1440
    return f"en {d} día{'s' if d > 1 else ''}"


def _fmt_when(dt: datetime) -> str:
    today = datetime.now().date()
    time_part = dt.strftime("%H:%M")
    if dt.date() == today:
        return f"hoy {time_part}"
    if (dt.date() - today).days == 1:
        return f"mañana {time_part}"
    return dt.strftime("%d/%m %H:%M")


def _already_sent(db, kind: str, item_id: int, offset: int) -> bool:
    return (
        db.query(SentReminder)
        .filter_by(kind=kind, item_id=item_id, offset_minutes=offset)
        .first()
        is not None
    )


def _mark_sent(db, kind: str, item_id: int, offset: int) -> None:
    db.add(SentReminder(kind=kind, item_id=item_id, offset_minutes=offset))
    db.commit()


def process_reminders() -> int:
    """Corre en un thread. Regresa cuántos webhooks se enviaron."""
    now = datetime.now()
    sent = 0
    with SessionLocal() as db:
        url = get_setting(db, "discord_webhook_url")
        if not url:
            return 0

        events = (
            db.query(Event)
            .filter(Event.start >= now - LATE_TOLERANCE, Event.start <= now + MAX_OFFSET)
            .all()
        )
        for ev in events:
            for offset in ev.reminders or []:
                fire_at = ev.start - timedelta(minutes=offset)
                if fire_at <= now <= fire_at + LATE_TOLERANCE and not _already_sent(
                    db, "event", ev.id, offset
                ):
                    msg = (
                        f"📅 **{ev.title}** — {_fmt_offset(offset)} ({_fmt_when(ev.start)})"
                    )
                    if send_webhook(msg, url):
                        _mark_sent(db, "event", ev.id, offset)
                        sent += 1

        todos = (
            db.query(Todo)
            .filter(
                Todo.status == "pendiente",
                Todo.due_date.isnot(None),
                Todo.due_date >= now - LATE_TOLERANCE,
                Todo.due_date <= now + MAX_OFFSET,
            )
            .all()
        )
        for todo in todos:
            for offset in todo.reminders or []:
                fire_at = todo.due_date - timedelta(minutes=offset)
                if fire_at <= now <= fire_at + LATE_TOLERANCE and not _already_sent(
                    db, "todo", todo.id, offset
                ):
                    msg = (
                        f"✅ Tarea **{todo.title}** — vence {_fmt_offset(offset)}"
                        f" ({_fmt_when(todo.due_date)})"
                    )
                    if send_webhook(msg, url):
                        _mark_sent(db, "todo", todo.id, offset)
                        sent += 1
    return sent


async def reminder_loop() -> None:
    log.info("Scheduler de recordatorios iniciado")
    while True:
        try:
            sent = await asyncio.to_thread(process_reminders)
            if sent:
                log.info("Recordatorios enviados: %d", sent)
        except Exception:
            log.exception("Error en el loop de recordatorios")
        await asyncio.sleep(CHECK_EVERY_S)
