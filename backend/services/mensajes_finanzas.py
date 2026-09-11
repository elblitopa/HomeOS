"""Mensajes financieros por reglas deterministas (sin IA, sin persistencia).

Una sola capa que arma frases tipo "Te quedan $620 en Compras" o "Tu tarjeta
BBVA corta mañana", pensada para reutilizarse igual en Finanzas, en Inicio y
mañana en widgets/notificaciones sin duplicar la lógica.

Anti-spam por diseño: esto es PULL — describe el estado actual cada vez que
se pide y no guarda nada, así que no puede repetirse ni desincronizarse. La
identidad (key) es estable mientras el estado no cambie, para que la UI pueda
deduplicar o animar. Los avisos PUSH (Discord) van aparte en el scheduler con
su propia tabla sent_reminders.
"""

from datetime import date, datetime, timedelta

from sqlalchemy.orm import Session

from backend.models import Account
from backend.services.presupuesto_pct import resumen_buckets
from backend.services.tarjetas import es_tarjeta, fechas_tarjeta

# con cuántos días de anticipación hablan las tarjetas aquí (el panel de
# Inicio no necesita el aviso de 7 días: para eso está el calendario)
DIAS_TARJETA_CORTE = 1
DIAS_TARJETA_PAGO = 3
# a partir de cuándo se recuerda un objetivo mínimo que va abajo: la última
# semana del periodo, cuando todavía se puede corregir
DIAS_FIN_DE_MES = 7

NIVELES = ("info", "warn", "err")


def _cuando(dias: int) -> str:
    if dias == 0:
        return "HOY"
    if dias == 1:
        return "mañana"
    return f"en {dias} días"


def alertas(db: Session, hoy: date | None = None) -> list[dict]:
    """Las alertas financieras vigentes, ya ordenadas por severidad."""
    hoy = hoy or date.today()
    out: list[dict] = []

    # ---- presupuestos por porcentaje (siempre sobre el mes en curso) ----
    resumen = resumen_buckets(db, "mensual")
    fin_mes = datetime.fromisoformat(resumen["to"]).date()
    quedan = (fin_mes - hoy).days
    for b in resumen["buckets"]:
        key = f"bucket-{b['id']}-{b['estado']}"
        if b["kind"] == "max":
            if b["estado"] in ("al_limite", "excedido"):
                out.append({"key": key, "nivel": "err", "texto": b["mensaje"], "tab": "presupuesto"})
            elif b["estado"] == "cerca":
                out.append({"key": key, "nivel": "warn", "texto": b["mensaje"], "tab": "presupuesto"})
            elif b["estado"] == "aviso":
                out.append({"key": key, "nivel": "info", "texto": b["mensaje"], "tab": "presupuesto"})
        else:
            # mínimos: semántica de progreso, nunca "ya usaste 90%"
            if b["estado"] == "cerca":
                out.append({"key": key, "nivel": "info", "texto": b["mensaje"], "tab": "presupuesto"})
            elif b["estado"] == "debajo" and quedan <= DIAS_FIN_DE_MES:
                out.append({"key": key, "nivel": "warn", "texto": b["mensaje"], "tab": "presupuesto"})

    # ---- tarjetas de crédito ----
    for acc in db.query(Account).filter(Account.kind == "credito").all():
        if not es_tarjeta(acc):
            continue
        f = fechas_tarjeta(acc, hoy)
        dc = f.get("statement_days_left")
        if dc is not None and dc <= DIAS_TARJETA_CORTE:
            out.append({
                "key": f"tarjeta-{acc.id}-corte-{f['statement_date']}",
                "nivel": "warn",
                "texto": f"Tu tarjeta {acc.name} corta {_cuando(dc)}.",
                "tab": "resumen",
            })
        dp = f.get("payment_days_left")
        if dp is not None and dp <= DIAS_TARJETA_PAGO:
            out.append({
                "key": f"tarjeta-{acc.id}-pago-{f['payment_date']}",
                "nivel": "err" if dp <= 1 else "warn",
                "texto": f"Tu pago de {acc.name} vence {_cuando(dp)}.",
                "tab": "resumen",
            })

    orden = {"err": 0, "warn": 1, "info": 2}
    out.sort(key=lambda a: orden.get(a["nivel"], 3))
    return out
