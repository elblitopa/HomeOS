"""CLI del Agent: correr el servicio y administrar la allowlist local.

    python -m agent run                  corre el agente (necesita agent/.env)
    python -m agent list                 todas las apps y su estado
    python -m agent pending              solo las propuestas sin aprobar
    python -m agent show <app_id>        detalle de una app
    python -m agent approve <app_id>     aprueba la propuesta pendiente
    python -m agent revoke <app_id>      desautoriza la app
    python -m agent propose              propone las apps de la instalación
                                         local de HomeOS (migración inicial)

Los comandos de allowlist NO requieren .env: son administración local pura.
"""

import argparse
import sys

from agent import allowlist
from agent.config import DEFAULT_LOCAL_DB


def _linea_app(app_id: str, entry: dict) -> str:
    datos = entry.get("approved") or entry.get("proposed") or {}
    return (
        f"  {app_id:<26} {allowlist.estado_de(entry):<30} "
        f"puerto {datos.get('port', '?')}"
    )


def cmd_list(_args) -> int:
    apps = allowlist.load()["apps"]
    if not apps:
        print("Allowlist vacía. Genera propuestas con: python -m agent propose")
        return 0
    print(f"{len(apps)} app(s) en la allowlist local:")
    for app_id in sorted(apps):
        print(_linea_app(app_id, apps[app_id]))
    print("\nDetalle: python -m agent show <app_id>")
    return 0


def cmd_pending(_args) -> int:
    apps = {k: v for k, v in allowlist.load()["apps"].items() if v.get("proposed")}
    if not apps:
        print("No hay propuestas pendientes.")
        return 0
    print(f"{len(apps)} propuesta(s) pendientes de aprobación:")
    for app_id in sorted(apps):
        print(_linea_app(app_id, apps[app_id]))
    print("\nRevisa cada una con show y aprueba con: python -m agent approve <app_id>")
    return 0


def _imprimir_config(titulo: str, datos: dict) -> None:
    print(f"  [{titulo}]")
    print(f"    APP:      {datos['name']}")
    print(f"    PATH:     {datos['folder']}")
    print(f"    LAUNCHER: {datos['launcher']}")
    print(f"    PORT:     {datos['port']}")


def cmd_show(args) -> int:
    entry = allowlist.load()["apps"].get(args.app_id)
    if not entry:
        print(f"No existe '{args.app_id}' en la allowlist.")
        return 1
    print(f"{args.app_id} — {allowlist.estado_de(entry)}")
    if entry.get("approved"):
        _imprimir_config(f"APROBADA {entry.get('approved_at', '')}", entry["approved"])
    if entry.get("proposed"):
        _imprimir_config(
            f"PROPUESTA {entry.get('proposed_at', '')} (fuente: {entry.get('source', '?')})",
            entry["proposed"],
        )
        print(f"\n  Aprobar:  python -m agent approve {args.app_id}")
    return 0


def cmd_approve(args) -> int:
    try:
        datos = allowlist.approve(args.app_id)
    except allowlist.AllowlistError as e:
        print(f"No se aprobó: {e}")
        return 1
    print(f"'{args.app_id}' APROBADA. Esta PC ejecutará exclusivamente:")
    _imprimir_config("APROBADA", datos)
    return 0


def cmd_revoke(args) -> int:
    try:
        allowlist.revoke(args.app_id)
    except allowlist.AllowlistError as e:
        print(f"No se revocó: {e}")
        return 1
    print(f"'{args.app_id}' revocada: el cloud ya no puede iniciarla ni detenerla.")
    return 0


def cmd_propose(args) -> int:
    from pathlib import Path

    db = Path(args.db) if args.db else DEFAULT_LOCAL_DB
    try:
        resultados = allowlist.propose_from_homeos_db(db)
    except allowlist.AllowlistError as e:
        print(str(e))
        return 1
    if not resultados:
        print("La base local de HomeOS no tiene apps registradas.")
        return 0
    print(f"Propuestas generadas desde {db} (NADA queda aprobado todavía):")
    for app_id, resultado in resultados:
        print(f"  {app_id:<26} {resultado}")
    print("\nRevisa con: python -m agent show <app_id>")
    print("Aprueba con: python -m agent approve <app_id>")
    return 0


def cmd_run(_args) -> int:
    from agent.main import run

    return run()


def main() -> int:
    parser = argparse.ArgumentParser(
        prog="python -m agent", description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="comando")

    sub.add_parser("run", help="correr el agente")
    sub.add_parser("list", help="todas las apps de la allowlist")
    sub.add_parser("pending", help="propuestas sin aprobar")
    p = sub.add_parser("show", help="detalle de una app")
    p.add_argument("app_id")
    p = sub.add_parser("approve", help="aprobar la propuesta de una app")
    p.add_argument("app_id")
    p = sub.add_parser("revoke", help="desautorizar una app")
    p.add_argument("app_id")
    p = sub.add_parser("propose", help="proponer las apps de HomeOS local")
    p.add_argument("--db", help=f"ruta de homeos.db (default: {DEFAULT_LOCAL_DB})")

    args = parser.parse_args()
    if not args.comando:
        parser.print_help()
        return 0
    return {
        "run": cmd_run,
        "list": cmd_list,
        "pending": cmd_pending,
        "show": cmd_show,
        "approve": cmd_approve,
        "revoke": cmd_revoke,
        "propose": cmd_propose,
    }[args.comando](args)


if __name__ == "__main__":
    sys.exit(main())
