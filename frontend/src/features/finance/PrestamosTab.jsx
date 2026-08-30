import { useEffect, useState } from "react";
import { apiGet, apiPost } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import TelefonoCliente from "../../components/ui/TelefonoCliente.jsx";
import { fmtMoney } from "../../lib/constants.js";
import { LoanModal, LoanPayModal } from "./FinanceModals.jsx";

/** Préstamos a personas: a quién, cuánto, de qué cuenta, cuándo prometió
 *  pagar (visible también en el calendario) y su teléfono para cobrarle por
 *  WhatsApp. Marcar pagado registra el ingreso con intereses/extra. */

function fecha(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
}

function urgencia(l) {
  if (l.status === "pagado") return "border-glass-border bg-surface/50";
  if (l.days_left === null || l.days_left === undefined) return "border-glass-border bg-surface/50";
  if (l.days_left <= 0) return "border-err/40 bg-err/10";
  if (l.days_left <= 7) return "border-amber-500/40 bg-amber-500/10";
  return "border-glass-border bg-surface/50";
}

export default function PrestamosTab({ accounts, reload, version }) {
  const [loans, setLoans] = useState([]);
  const [modal, setModal] = useState(null); // {type: "loan"|"pay", data?}
  const [verPagados, setVerPagados] = useState(false);

  const cargar = () => apiGet("/api/finance/loans").then(setLoans).catch(() => {});
  useEffect(() => {
    cargar();
  }, [version]);

  const saved = () => {
    setModal(null);
    reload();
  };

  const reabrir = async (l) => {
    if (!confirm(`¿Reabrir el préstamo a ${l.person}? Se borra el ingreso registrado.`)) return;
    await apiPost(`/api/finance/loans/${l.id}/reopen`);
    reload();
  };

  const activos = loans.filter((l) => l.status === "prestado");
  const pagados = loans.filter((l) => l.status === "pagado");
  const cuentaDe = (id) => accounts.find((a) => a.id === id)?.name;
  const totalPorCobrar = activos.reduce((s, l) => s + (l.expected_amount || l.amount), 0);

  const tarjeta = (l) => (
    <div key={l.id} className={`rounded-xl border p-3 backdrop-blur transition ${urgencia(l)}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="cursor-pointer text-sm font-medium"
           onClick={() => setModal({ type: "loan", data: l })}>
          🤝 {l.person}
          {l.status === "pagado" && (
            <span className="ml-2 rounded-full bg-ok/10 px-2 py-0.5 text-xs font-medium text-ok">
              Pagado
            </span>
          )}
        </p>
        <TelefonoCliente phone={l.phone} className="text-xs" />
      </div>
      <p className="mt-1 text-sm">
        {fmtMoney(l.amount, l.currency)}
        {(l.expected_amount || l.amount) !== l.amount && (
          <span className="text-ink-soft"> → espero {fmtMoney(l.expected_amount, l.currency)}</span>
        )}
        {l.status === "pagado" && l.received_amount != null && (
          <span className="text-ok"> · recibí {fmtMoney(l.received_amount, l.currency)}</span>
        )}
      </p>
      <p className="mt-0.5 text-xs text-ink-soft">
        Prestado el {fecha(l.lent_date)}
        {cuentaDe(l.account_id) ? ` desde ${cuentaDe(l.account_id)}` : ""}
        {l.extra ? ` · extra: ${l.extra}` : ""}
      </p>
      {l.status === "prestado" && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className={`text-xs ${l.overdue ? "font-medium text-err" : "text-ink-soft"}`}>
            {l.promised_date
              ? l.overdue
                ? `Prometió pagar hace ${Math.abs(l.days_left)} d (${fecha(l.promised_date)})`
                : l.days_left === 0
                  ? "Prometió pagar HOY"
                  : `Paga en ${l.days_left} d (${fecha(l.promised_date)})`
              : "Sin fecha prometida"}
          </p>
          <button
            className="shrink-0 rounded-lg bg-ok/10 px-2.5 py-1 text-xs font-medium text-ok transition hover:bg-ok/20"
            onClick={() => setModal({ type: "pay", data: l })}
          >
            ✓ Me pagó
          </button>
        </div>
      )}
      {l.status === "pagado" && (
        <div className="mt-1.5 flex items-center justify-between gap-2">
          <p className="text-xs text-ink-soft">Pagado el {fecha(l.paid_at)}</p>
          <button className="text-xs text-ink-soft underline-offset-2 hover:underline"
                  onClick={() => reabrir(l)}>
            reabrir
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-ink-soft">🤝 Dinero prestado</h2>
          {activos.length > 0 && (
            <p className="text-xs text-ink-soft">
              Por cobrar: <span className="font-medium text-ink">{fmtMoney(totalPorCobrar)}</span>
              {" "}en {activos.length} préstamo{activos.length > 1 ? "s" : ""}
            </p>
          )}
        </div>
        <Button onClick={() => setModal({ type: "loan" })}>＋ Préstamo</Button>
      </div>

      {activos.length === 0 ? (
        <GlassCard className="p-8 text-center text-sm text-ink-soft">
          No le debes cobrar a nadie 🎉 Registra un préstamo con ＋ y su fecha
          prometida aparecerá en el calendario.
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-3">{activos.map(tarjeta)}</div>
      )}

      {pagados.length > 0 && (
        <div>
          <button
            className="mb-2 text-xs font-medium text-ink-soft hover:text-ink"
            onClick={() => setVerPagados((v) => !v)}
          >
            {verPagados ? "▾" : "▸"} Pagados ({pagados.length})
          </button>
          {verPagados && <div className="flex flex-col gap-3">{pagados.map(tarjeta)}</div>}
        </div>
      )}

      <LoanModal
        open={modal?.type === "loan"}
        loan={modal?.data}
        accounts={accounts}
        onClose={() => setModal(null)}
        onSaved={saved}
      />
      <LoanPayModal
        open={modal?.type === "pay"}
        loan={modal?.data}
        accounts={accounts}
        onClose={() => setModal(null)}
        onSaved={saved}
      />
    </div>
  );
}
