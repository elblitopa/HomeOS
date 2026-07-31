from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from backend.config import DB_PATH


class Base(DeclarativeBase):
    pass


engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)


# El repo vive en OneDrive: journal DELETE (default) evita los archivos
# -wal/-shm que hacen churn constante de sincronizacion.
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _record):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA journal_mode=DELETE")
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
    ("recurring_payments", "type", "type VARCHAR DEFAULT 'egreso'"),
    ("accounts", "is_default", "is_default INTEGER DEFAULT 0"),
    ("transactions", "via_paypal", "via_paypal BOOLEAN DEFAULT 0"),
]

# Columnas que dejaron de usarse (necesita SQLite 3.35+, incluido desde Python 3.11)
DROP_COLUMNS = [
    ("goals", "period"),
]


def ensure_columns() -> None:
    with engine.begin() as conn:

        def columns_of(table: str) -> set[str]:
            return {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table})")}

        for table, column, ddl in MIGRATIONS:
            cols = columns_of(table)
            if not cols:
                continue  # la tabla aun no existe; create_all la crea completa
            if column not in cols:
                conn.exec_driver_sql(f"ALTER TABLE {table} ADD COLUMN {ddl}")

        for table, column in DROP_COLUMNS:
            if column in columns_of(table):
                conn.exec_driver_sql(f"ALTER TABLE {table} DROP COLUMN {column}")
