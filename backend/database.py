from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.config import DATABASE_URL, IS_CLOUD


class Base(DeclarativeBase):
    pass


# La URL decide el motor: sqlite (default, local) o postgres (cloud opcional).
# check_same_thread es exclusivo del driver sqlite3 y truena con psycopg.
_es_sqlite = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if _es_sqlite else {},
)

if _es_sqlite:
    # En local el repo vive en OneDrive: journal DELETE evita los archivos
    # -wal/-shm que hacen churn constante de sincronizacion. En la nube no hay
    # OneDrive y WAL aguanta mejor lecturas concurrentes con el scheduler.
    _journal = "WAL" if IS_CLOUD else "DELETE"

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_conn, _record):
        cursor = dbapi_conn.cursor()
        cursor.execute(f"PRAGMA journal_mode={_journal}")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columnas agregadas despues de que la base ya existia. create_all() solo crea
# tablas nuevas, no columnas nuevas, asi que estas se agregan a mano.
#
# El DDL de cada tupla esta escrito para SQLite (el historico); en Postgres los
# defaults booleanos 1/0 no son validos y se traducen en _ddl_para_dialecto.
# Una base Postgres NUEVA no necesita nada de esto (create_all crea las tablas
# ya completas); las migraciones solo aplican a bases que vienen de versiones
# anteriores del esquema.
MIGRATIONS = [
    ("transactions", "fx_rate", "fx_rate FLOAT"),
    ("accounts", "banner_path", "banner_path VARCHAR"),
    ("exchange_rates", "kind", "kind VARCHAR DEFAULT 'fiat'"),
    ("exchange_rates", "api_id", "api_id VARCHAR"),
    ("goals", "deadline", "deadline DATETIME"),
    ("goals", "banner_path", "banner_path VARCHAR"),
    ("recurring_payments", "currency", "currency VARCHAR DEFAULT 'MXN'"),
    ("subscriptions", "currency", "currency VARCHAR DEFAULT 'MXN'"),
    ("accounts", "expected_income", "expected_income FLOAT DEFAULT 0"),
    ("events", "sync_google", "sync_google BOOLEAN DEFAULT 1"),
    ("recurring_payments", "type", "type VARCHAR DEFAULT 'egreso'"),
    ("accounts", "is_default", "is_default INTEGER DEFAULT 0"),
    ("transactions", "via_paypal", "via_paypal BOOLEAN DEFAULT 0"),
    # negocio = contexto con palomita; el banner y el orden son de su tarjeta
    ("contexts", "is_business", "is_business INTEGER DEFAULT 0"),
    ("contexts", "banner_path", "banner_path VARCHAR"),
    ("contexts", "sort_order", "sort_order INTEGER DEFAULT 0"),
    # pagos a terceros: a quien pertenece cada deuda/movimiento
    ("recurring_payments", "context_id", "context_id INTEGER REFERENCES contexts(id) ON DELETE SET NULL"),
    ("recurring_payments", "provider_id", "provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL"),
    ("scheduled_transactions", "provider_id", "provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL"),
    ("transactions", "provider_id", "provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL"),
    ("subscriptions", "context_id", "context_id INTEGER REFERENCES contexts(id) ON DELETE SET NULL"),
    ("subscriptions", "provider_id", "provider_id INTEGER REFERENCES providers(id) ON DELETE SET NULL"),
    # agenda de eventos: la palomita viaja con el negocio; banners de seccion
    # y catalogo de renta son metadatos del negocio (business_info)
    ("contexts", "has_agenda", "has_agenda INTEGER DEFAULT 0"),
    ("business_info", "section_banners", "section_banners JSON"),
    ("business_info", "agenda_options", "agenda_options JSON"),
    # a que maquina pertenece cada app (Fase 2 cloud). El app_id estable es el
    # slug que ya existia; no se genera ningun identificador nuevo.
    ("apps", "device_id", "device_id VARCHAR DEFAULT 'pc-principal'"),
    # consumibles: un egreso puede ser la compra de un articulo trackeado.
    # create_all corre antes que esto, asi que consumables ya existe.
    ("transactions", "consumable_id", "consumable_id INTEGER REFERENCES consumables(id) ON DELETE SET NULL"),
]

# Columnas que dejaron de usarse (en SQLite necesita 3.35+, incluido en Python 3.11)
DROP_COLUMNS = [
    ("goals", "period"),
]

# Reescrituras de DDL para Postgres: en PG un BOOLEAN no acepta DEFAULT 1/0.
_PG_DDL_FIXES = {
    "BOOLEAN DEFAULT 1": "BOOLEAN DEFAULT TRUE",
    "BOOLEAN DEFAULT 0": "BOOLEAN DEFAULT FALSE",
    "DATETIME": "TIMESTAMP",
}


def _ddl_para_dialecto(ddl: str) -> str:
    if _es_sqlite:
        return ddl
    for viejo, nuevo in _PG_DDL_FIXES.items():
        ddl = ddl.replace(viejo, nuevo)
    return ddl


def ensure_columns() -> None:
    # inspect() funciona en ambos dialectos (PRAGMA table_info era SQLite-only)
    inspector = inspect(engine)

    def columns_of(table: str) -> set[str]:
        if not inspector.has_table(table):
            return set()
        return {col["name"] for col in inspector.get_columns(table)}

    with engine.begin() as conn:
        for table, column, ddl in MIGRATIONS:
            cols = columns_of(table)
            if not cols:
                continue  # la tabla aun no existe; create_all la crea completa
            if column not in cols:
                conn.exec_driver_sql(
                    f"ALTER TABLE {table} ADD COLUMN {_ddl_para_dialecto(ddl)}"
                )

        for table, column in DROP_COLUMNS:
            if column in columns_of(table):
                conn.exec_driver_sql(f"ALTER TABLE {table} DROP COLUMN {column}")
