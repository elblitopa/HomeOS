import { useCallback, useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import Modal from "../../components/ui/Modal.jsx";
import { BASE_CURRENCY, PERIODS } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";
import { usePrivacidad } from "./privacidad.jsx";

const KIND_ICON = {
  Suscripción: "🔁",
  "Pago recurrente": "📆",
  Meta: "🎯",
};

const periodLabel = (v) => PERIODS.find((p) => p.value === v)?.label || v;

function Stat({ label, value, tone = "", hint }) {
  const { money } = usePrivacidad();
  return (
    <GlassCard className="p-4">
      <p className="text-xs text-ink-soft">{label}</p>
      <p className={`text-xl font-bold ${tone}`}>{money(value)}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-soft">{hint}</p>}
    </GlassCard>
  );
}

// tono visual por estado; el texto del mensaje siempre acompaña al color
// para que el semáforo nunca sea la única señal (accesibilidad)
const ESTADO_BUCKET = {
  ok: { icono: "🟢", barra: "#2f9e44" },
  aviso: { icono: "🟠", barra: "#f59e0b" },
  cerca: { icono: "🟠", barra: "#e8590c" },
  al_limite: { icono: "🔴", barra: "#e03131" },
  excedido: { icono: "🔴", barra: "#e03131" },
  cumplido: { icono: "🟢", barra: "#2f9e44" },
  debajo: { icono: "🟡", barra: "#f59e0b" },
  sin_base: { icono: "⚪", barra: "#868e96" },
};

function BarraBucket({ value, color }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-ink/10" role="presentation">
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${Math.min(100, (value || 0) * 100)}%`, backgroundColor: color }}
      />
    </div>
  );
}

/** Alta/edición de un objetivo de distribución (bucket).
 *
 *  Un bucket puede medir egresos por categoría, transferencias hacia cuentas
 *  destino (inversión/ahorro), o ambos. Los dos caminos son types distintos
 *  de transacción, así que nada se cuenta dos veces. */
function BucketModal({ open, item, categories, accounts = [], onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setForm({
        name: item?.name || "",
        kind: item?.kind || "max",
        percent: item?.percent ?? "",
        base: item?.base || "real",
        category_ids: item?.category_ids || [],
        account_ids: item?.account_ids || [],
      });
      setError(null);
    }
  }, [open, item]);

  const toggleEn = (campo) => (id) =>
    setForm((f) => ({
      ...f,
      [campo]: f[campo].includes(id)
        ? f[campo].filter((c) => c !== id)
        : [...f[campo], id],
    }));
  const toggleCat = toggleEn("category_ids");
  const toggleAcc = toggleEn("account_ids");

  const save = async () => {
    if (!form.name.trim()) return setError("Ponle nombre al objetivo.");
    const pct = Number(form.percent);
    if (!(pct > 0 && pct <= 100)) return setError("El porcentaje va de 1 a 100.");
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      percent: pct,
      base: form.base,
      category_ids: form.category_ids,
      account_ids: form.account_ids,
    };
    try {
      if (item) await apiPut(`/api/finance/budget-buckets/${item.id}`, payload);
      else await apiPost("/api/finance/budget-buckets", payload);
      onSaved();
    } catch (e) {
      setError(e.message); // p. ej. el 409 de categoría ya ocupada
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar el objetivo "${item.name}"? Tus transacciones no se tocan.`)) return;
    await apiDelete(`/api/finance/budget-buckets/${item.id}`);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={item ? "Editar objetivo" : "Nuevo objetivo"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input className={inputCls} value={form.name || ""} autoFocus
                 onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                 placeholder="Compras personales, Inversiones…" />
        </label>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Tipo de objetivo
          <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
            {[
              ["max", "Máximo — no pasarme"],
              ["min", "Mínimo — destinar al menos"],
            ].map(([value, label]) => (
              <button key={value}
                      onClick={() => setForm((f) => ({ ...f, kind: value }))}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
                        form.kind === value ? "bg-surface shadow-sm" : "text-ink-soft"
                      }`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Porcentaje del ingreso
            <input type="number" inputMode="decimal" min="1" max="100" step="0.5"
                   className={inputCls} value={form.percent ?? ""}
                   onChange={(e) => setForm((f) => ({ ...f, percent: e.target.value }))}
                   placeholder="15" />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Medir contra
            <select className={inputCls} value={form.base || "real"}
                    onChange={(e) => setForm((f) => ({ ...f, base: e.target.value }))}>
              <option value="real">Ingresos reales del periodo</option>
              <option value="esperado">Ingreso esperado (presupuestado)</option>
            </select>
          </label>
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Contar por categorías de gasto
          <span className="text-[11px] font-normal text-ink-soft">
            Egresos de estas categorías. Una categoría solo puede vivir en UN
            objetivo, para que ningún gasto se cuente dos veces.
          </span>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pt-1">
            {categories.map((c) => (
              <button key={c.id} onClick={() => toggleCat(c.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        form.category_ids?.includes(c.id)
                          ? "bg-accent text-white"
                          : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
                      }`}>
                {c.icon} {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Contar transferencias hacia cuentas
          <span className="text-[11px] font-normal text-ink-soft">
            Para inversión/ahorro: lo que TRANSFIERES a estas cuentas cuenta como
            destinado, sin volverse egreso ni tocar el flujo neto. Una cuenta
            solo puede vivir en un objetivo.
          </span>
          <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto pt-1">
            {accounts.map((a) => (
              <button key={a.id} onClick={() => toggleAcc(a.id)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        form.account_ids?.includes(a.id)
                          ? "bg-accent text-white"
                          : "bg-ink/5 text-ink-soft hover:bg-accent-soft"
                      }`}>
                🏦 {a.name}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-err">{error}</p>}
        <div className="flex justify-between gap-2">
          {item ? (
            <Button variant="danger" onClick={remove}>Eliminar</Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save}>Guardar</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function BudgetTab({ version, categories = [], accounts = [] }) {
  const { money, oculto } = usePrivacidad();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  // distribución de ingresos por porcentaje
  const [dist, setDist] = useState(null);
  const [periodo, setPeriodo] = useState("mensual");
  const [modal, setModal] = useState(null); // null | {} | {item}

  const cargarDist = useCallback(() => {
    apiGet(`/api/finance/budget-buckets?period=${periodo}`).then(setDist).catch(() => {});
  }, [periodo]);

  useEffect(() => {
    apiGet("/api/finance/budget").then(setData).catch((e) => setError(e.message));
  }, [version]);
  useEffect(cargarDist, [cargarDist, version]);

  if (error) return <GlassCard className="p-6 text-sm text-err">{error}</GlassCard>;
  if (!data) return <p className="text-sm text-ink-soft">Calculando…</p>;

  const t = data.totals;
  const grupos = ["Suscripción", "Pago recurrente", "Meta"];
  const alcanza = t.balance_expected >= 0;
  // los mensajes del backend traen cifras; con privacidad prendida se tapan
  const textoBucket = (b) => (oculto ? b.mensaje.replace(/\$[\d,]+(\.\d+)?/g, "••••") : b.mensaje);
  const etiquetaObjetivo = (b) =>
    `${b.spent_pct_of_income ?? "—"}% / ${b.kind === "max" ? "máx." : "mín."} ${b.percent}%`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-soft">
          Lo que necesitas cada mes para cubrir tus compromisos · {data.month_label}
        </p>
        <a href="/api/finance/budget/export.xlsx" download>
          <Button variant="ghost">⬇ Exportar a Excel</Button>
        </a>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
        <Stat
          label="Necesitas al mes"
          value={t.commitments}
          tone="text-err"
          hint="suscripciones + deudas + metas"
        />
        <Stat label="Ingreso esperado" value={t.expected_income} tone="text-ok" hint="lo que planeas recibir" />
        <Stat label="Ingreso real del mes" value={t.actual_income} hint="lo que ya entró" />
        <Stat
          label="Te sobra / falta"
          value={t.balance_expected}
          tone={alcanza ? "text-ok" : "text-err"}
          hint={alcanza ? "con tu ingreso esperado alcanza" : "tu ingreso esperado no alcanza"}
        />
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink-soft">📊 Distribución de ingresos</h2>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
              {[["mensual", "Mes"], ["anual", "Año"]].map(([value, label]) => (
                <button key={value} onClick={() => setPeriodo(value)}
                        className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                          periodo === value ? "bg-surface shadow-sm" : "text-ink-soft"
                        }`}>
                  {label}
                </button>
              ))}
            </div>
            <Button variant="ghost" onClick={() => setModal({})}>＋ Objetivo</Button>
          </div>
        </div>

        {!dist || dist.buckets.length === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-ink-soft">
            Decide qué porcentaje de tus ingresos va a cada cosa: un máximo para
            gasto (Compras ≤ 15%) o un mínimo para lo bueno (Inversión ≥ 20%).
            Crea el primero con ＋ Objetivo.
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-ink-soft">
              {dist.label} · ingreso real {money(dist.income_real)} · esperado{" "}
              {money(dist.income_esperado)}
              {periodo === "anual" &&
                " · el año se mide como acumulado real (gastado del año / ingresos del año)"}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              {dist.buckets.map((b) => {
                const tono = ESTADO_BUCKET[b.estado] || ESTADO_BUCKET.sin_base;
                return (
                  <GlassCard key={b.id} className="cursor-pointer p-4 transition hover:bg-surface/75"
                             onClick={() => setModal({ item: b })}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-medium">
                        {b.kind === "min" ? "📈" : "🛍️"} {b.name}
                      </p>
                      <span className="shrink-0 text-xs font-semibold">
                        {etiquetaObjetivo(b)} <span aria-hidden="true">{tono.icono}</span>
                      </span>
                    </div>
                    <BarraBucket value={b.progress} color={tono.barra} />
                    <p className="mt-1.5 text-xs text-ink-soft">
                      {textoBucket(b)}
                      {b.estado !== "sin_base" &&
                        ` · ${oculto ? "••••" : `${money(b.spent_amount)} de ${money(b.target_amount)}`}`}
                    </p>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold text-ink-soft">Compromisos del mes</h2>
        {data.commitments.length === 0 ? (
          <GlassCard className="p-8 text-center text-sm text-ink-soft">
            Aún no tienes suscripciones, deudas ni metas registradas.
          </GlassCard>
        ) : (
          <GlassCard className="divide-y divide-ink/5">
            {grupos.map((kind) => {
              const items = data.commitments.filter((c) => c.kind === kind);
              if (!items.length) return null;
              const subtotal = items.reduce((s, c) => s + c.monthly_mxn, 0);
              return (
                <div key={kind}>
                  <div className="flex items-center justify-between bg-ink/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    <span>
                      {KIND_ICON[kind]} {kind}
                    </span>
                    <span>{money(subtotal)}</span>
                  </div>
                  {items.map((c, i) => (
                    <div key={`${kind}-${i}`} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.name}</p>
                        <p className="truncate text-xs text-ink-soft">
                          {money(c.amount, c.currency)}
                          {c.period !== "—" && ` · ${periodLabel(c.period)}`}
                          {c.account && ` · ${c.account}`}
                          {c.note && ` · ${c.note}`}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 text-sm font-semibold ${
                          c.monthly_mxn === 0 ? "text-ink-soft" : ""
                        }`}
                        title="Equivalente mensual en MXN"
                      >
                        {money(c.monthly_mxn)}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            <div className="flex items-center justify-between px-4 py-3 font-semibold">
              <span>Total al mes</span>
              <span className="text-err">{money(t.commitments)}</span>
            </div>
          </GlassCard>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold text-ink-soft">Ingresos por cuenta</h2>
          <span className="text-[11px] text-ink-soft">
            El ingreso esperado se captura al editar cada cuenta
          </span>
        </div>
        <GlassCard className="divide-y divide-ink/5">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
            <span>Cuenta</span>
            <span className="w-28 text-right">Esperado</span>
            <span className="w-28 text-right">Real del mes</span>
          </div>
          {data.income.map((i) => (
            <div key={i.account} className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-2.5 text-sm">
              <span className="truncate">
                {i.account}
                {i.currency !== BASE_CURRENCY && (
                  <span className="ml-1 text-xs text-ink-soft">({i.currency})</span>
                )}
              </span>
              <span className="w-28 text-right text-ink-soft">{money(i.expected_mxn)}</span>
              <span className={`w-28 text-right font-medium ${i.actual_mxn > 0 ? "text-ok" : "text-ink-soft"}`}>
                {money(i.actual_mxn)}
              </span>
            </div>
          ))}
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 text-sm font-semibold">
            <span>Total</span>
            <span className="w-28 text-right">{money(t.expected_income)}</span>
            <span className="w-28 text-right text-ok">{money(t.actual_income)}</span>
          </div>
        </GlassCard>
      </section>

      <p className="text-xs text-ink-soft">
        Todo se convierte a MXN al tipo de cambio actual. Los montos que no son mensuales se
        prorratean (una suscripción anual cuenta como su doceava parte), y de cada meta se
        reparte lo que falta entre los meses que quedan hasta su fecha límite.
      </p>

      <BucketModal
        open={!!modal}
        item={modal?.item}
        categories={categories}
        accounts={accounts}
        onClose={() => setModal(null)}
        onSaved={() => {
          setModal(null);
          cargarDist();
        }}
      />
    </div>
  );
}
