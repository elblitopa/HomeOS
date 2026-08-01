import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost, apiPut, apiUpload } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import {
  ACCOUNT_KINDS,
  BASE_CURRENCY,
  CONTEXT_COLORS,
  CURRENCIES,
  fmtMoney,
  formatDateTime,
  PERIODS,
  toInputLocal,
  toInputValue,
} from "../../lib/constants.js";

import { inputCls } from "../todos/TaskFormModal.jsx";

const selectCls = inputCls;

/** Selector de divisa: solo las que ya existen en la pestaña Divisas,
 *  porque son las únicas que se pueden convertir a MXN. */
function CurrencySelect({ value, onChange, rates }) {
  const codes = rates.length ? rates.map((r) => r.code) : [BASE_CURRENCY];
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      Divisa
      <select className={selectCls} value={value} onChange={onChange}>
        {codes.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Cuando el cobro pasó por PayPal, el tipo de cambio no es el del mercado.
 *
 *  PayPal no cobra una comisión aparte: mete su margen —en la práctica cerca
 *  del 6% arriba— dentro del propio tipo de cambio, y ese margen ni siquiera
 *  es constante entre un mes y otro. Por eso no se estima con un porcentaje:
 *  el recibo trae el monto exacto, así que se captura y se acabó.
 *
 *  Los dos campos son la misma cifra vista de dos formas, y se calculan entre
 *  sí: escribes el que tengas a la mano y el otro se llena solo.
 */
export function CobroPayPal({ montoOrigen, divisaOrigen, divisaCuenta, tasaMercado, valor, onChange }) {
  const { activo, total } = valor;
  const equivalente = montoOrigen * tasaMercado;
  const tasaUsada = montoOrigen > 0 && total ? Number(total) / montoOrigen : 0;
  const margen = tasaMercado > 0 && tasaUsada > 0 ? (tasaUsada / tasaMercado - 1) * 100 : 0;

  const setTotal = (v) => onChange({ ...valor, total: v });
  const setTasa = (v) => {
    const t = Number(v);
    onChange({ ...valor, total: t > 0 ? (montoOrigen * t).toFixed(2) : "" });
  };

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-glass-border bg-surface/50 p-3">
      <label className="flex items-start gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={activo}
          onChange={(e) =>
            onChange({
              activo: e.target.checked,
              // se precarga con la conversión de mercado para que solo corrijas
              total: e.target.checked ? equivalente.toFixed(2) : "",
            })
          }
          className="mt-0.5 h-4 w-4 accent-[#2383e2]"
        />
        <span>
          Se pagó por PayPal
          <span className="block text-xs font-normal text-ink-soft">
            PayPal convierte con su propio tipo de cambio. Copia el monto de tu recibo.
          </span>
        </span>
      </label>

      {activo && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Total en {divisaCuenta}
              <input
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                className={inputCls}
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                autoFocus
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Tipo de cambio
              <input
                type="number"
                inputMode="decimal"
                step="0.0001"
                min="0"
                className={inputCls}
                value={tasaUsada ? tasaUsada.toFixed(4) : ""}
                onChange={(e) => setTasa(e.target.value)}
              />
            </label>
          </div>
          <p className="text-xs text-ink-soft">
            A mercado ({tasaMercado.toFixed(4)}) serían {fmtMoney(equivalente, divisaCuenta)}.
            {margen > 0 && (
              <span className="text-err">
                {" "}
                PayPal te cobra {margen.toFixed(2)}% más ({fmtMoney(Number(total) - equivalente, divisaCuenta)}).
              </span>
            )}
          </p>
        </>
      )}
    </div>
  );
}

function Footer({ onDelete, onClose, onSave, saving, deleteLabel = "Eliminar" }) {
  return (
    <div className="flex justify-between gap-2 pt-1">
      {onDelete ? (
        <Button variant="danger" onClick={onDelete}>
          {deleteLabel}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? "Guardando…" : "Guardar"}
        </Button>
      </div>
    </div>
  );
}

function useForm(open, initial) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) {
      setForm(initial);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  return { form, setForm, set, error, setError, saving, setSaving };
}

// ---------- Cuenta ----------

export function AccountModal({ open, account, onClose, onSaved }) {
  const { form, set, setForm, error, setError, saving, setSaving } = useForm(open, {
    name: account?.name || "",
    kind: account?.kind || "efectivo",
    scope: account?.scope || "personal",
    bank: account?.bank || "",
    currency: account?.currency || "MXN",
    initial_balance: account?.initial_balance ?? 0,
    expected_income: account?.expected_income ?? 0,
    color: account?.color || CONTEXT_COLORS[0],
    banner_path: account?.banner_path || null,
    is_default: account?.is_default || false,
  });

  const uploadBanner = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const up = await apiUpload("/api/uploads/banner", file);
      setForm((f) => ({ ...f, banner_path: up.path }));
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const save = async () => {
    if (!form.name.trim()) return setError("Ponle nombre a la cuenta.");
    setSaving(true);
    setError(null);
    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        bank: form.bank.trim() || null,
        initial_balance: Number(form.initial_balance) || 0,
        expected_income: Number(form.expected_income) || 0,
      };
      if (account) await apiPut(`/api/finance/accounts/${account.id}`, payload);
      else await apiPost("/api/finance/accounts", payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar la cuenta "${account.name}"? Se borran también sus transacciones.`))
      return;
    await apiDelete(`/api/finance/accounts/${account.id}`);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={account ? "Editar cuenta" : "Nueva cuenta"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="BBVA Débito, Efectivo…" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Tipo
            <select className={selectCls} value={form.kind} onChange={set("kind")}>
              {ACCOUNT_KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.icon} {k.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Ámbito
            <select className={selectCls} value={form.scope} onChange={set("scope")}>
              <option value="personal">Personal</option>
              <option value="negocio">Negocio</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Banco (opcional)
            <input className={inputCls} value={form.bank} onChange={set("bank")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Divisa
            <select className={selectCls} value={form.currency} onChange={set("currency")}>
              {CURRENCIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Saldo inicial
            <input type="number" inputMode="decimal" step="0.01" className={inputCls} value={form.initial_balance} onChange={set("initial_balance")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Ingreso esperado al mes
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className={inputCls}
              value={form.expected_income}
              onChange={set("expected_income")}
              placeholder="0"
            />
            <span className="text-[11px] font-normal text-ink-soft">
              Se usa en el Presupuesto. Déjalo en 0 si no aplica.
            </span>
          </label>
          <div className="flex flex-col gap-1 text-sm font-medium">
            Color
            <div className="flex flex-wrap gap-1 pt-1">
              {CONTEXT_COLORS.map((c) => (
                <button
                  key={c}
                  className={`h-6 w-6 rounded-full ${form.color === c ? "ring-2 ring-ink/40 ring-offset-2" : ""}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setForm((f) => ({ ...f, color: c }))}
                />
              ))}
            </div>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
            className="mt-0.5 h-4 w-4 accent-[#2383e2]"
          />
          <span>
            Cuenta predeterminada
            <span className="block text-xs font-normal text-ink-soft">
              Sale preseleccionada al registrar un movimiento. Solo puede haber una.
            </span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Banner (opcional)
          {form.banner_path ? (
            <div className="flex items-center gap-2">
              <div
                className="h-14 flex-1 rounded-xl bg-cover bg-center"
                style={{ backgroundImage: `url(${form.banner_path})` }}
              />
              <button
                className="text-err"
                onClick={() => setForm((f) => ({ ...f, banner_path: null }))}
                title="Quitar banner"
              >
                ✕
              </button>
            </div>
          ) : (
            <input type="file" accept="image/*" className="text-xs" onChange={uploadBanner} />
          )}
          <span className="text-[11px] font-normal text-ink-soft">
            Ideal 1200 × 400 px. Se recorta al centro para llenar la tarjeta.
          </span>
        </div>

        {error && <p className="text-sm text-err">{error}</p>}
        <Footer onDelete={account ? remove : null} onClose={onClose} onSave={save} saving={saving} />
      </div>
    </Modal>
  );
}

// ---------- Transacción / Transferencia ----------

/** Alta y edición de movimientos, ya ocurridos o programados.
 *
 *  `tx` = transacción real que se edita. `sched` = programado que se edita.
 *  `programadoDefault` deja el interruptor encendido al crear (lo usa el botón
 *  de la pestaña Programados). Un programado no toca saldos: vive en su propia
 *  tabla hasta que se marca como concretado.
 */
export function TransactionModal({
  open,
  tx,
  sched,
  type,
  programadoDefault = false,
  accounts,
  categories,
  contexts,
  goals = [],
  rates = [],
  onClose,
  onSaved,
}) {
  const base = tx || sched;
  const initialType = base?.type || type || "egreso";
  // al crear manda la cuenta predeterminada; al editar, la que ya tiene
  const cuentaInicial =
    base?.account_id || accounts.find((a) => a.is_default)?.id || accounts[0]?.id || "";
  const { form, set, setForm, error, setError, saving, setSaving } = useForm(open, {
    type: initialType,
    programado: sched ? true : tx ? false : programadoDefault,
    // solo aplica a los programados: una transacción normal siempre va en la
    // divisa de su cuenta
    currency:
      sched?.currency ||
      accounts.find((a) => a.id === Number(cuentaInicial))?.currency ||
      BASE_CURRENCY,
    description: base?.description || "",
    amount: base?.amount ?? "",
    account_id: cuentaInicial,
    to_kind: base?.to_goal_id ? "meta" : "cuenta",
    to_account_id: base?.to_account_id || "",
    to_goal_id: base?.to_goal_id || "",
    category_id: base?.category_id ?? "",
    context_id: base?.context_id ?? "",
    occurred_at: sched
      ? toInputValue(sched.scheduled_for)
      : tx
        ? toInputValue(tx.occurred_at)
        : toInputLocal(),
    attachment_path: base?.attachment_path || null,
    attachment_name: base?.attachment_name || null,
  });
  const isTransfer = form.type === "transferencia";
  const esProgramado = form.programado;
  const [paypal, setPaypal] = useState({ activo: false, total: "" });
  // al abrir de nuevo el modal se limpia, para que no arrastre el cobro anterior
  useEffect(() => {
    if (open) setPaypal({ activo: false, total: "" });
  }, [open]);

  const cuentaDestino = accounts.find((a) => a.id === Number(form.account_id));
  const divisaCuenta = cuentaDestino?.currency || BASE_CURRENCY;
  const tasa = (code) =>
    code === BASE_CURRENCY ? 1 : rates.find((r) => r.code === code)?.rate_to_mxn || 1;
  // cuántas unidades de la divisa de la cuenta vale una de la del movimiento
  const tasaMercado = tasa(form.currency) / tasa(divisaCuenta);
  const otraDivisa = (form.currency || BASE_CURRENCY) !== divisaCuenta;

  // el monto que de verdad se le carga a la cuenta: el del recibo si se marcó
  // PayPal, y si no la conversión a la tasa de hoy
  const enDivisaCuenta = !otraDivisa
    ? Number(form.amount) || 0
    : paypal.activo && Number(paypal.total) > 0
      ? Number(paypal.total)
      : Math.round((Number(form.amount) || 0) * tasaMercado * 100) / 100;

  // en un programado la conversión se hace el día que se concreta, así que
  // aquí solo se informa; en una transacción ya ocurrida se guarda convertido
  const equivalencia =
    esProgramado && otraDivisa && form.amount
      ? fmtMoney((Number(form.amount) || 0) * tasaMercado, divisaCuenta)
      : null;

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const up = await apiUpload("/api/uploads/file", file);
      setForm((f) => ({ ...f, attachment_path: up.path, attachment_name: up.file_name }));
    } catch (err) {
      setError(err.message);
    }
  };

  const save = async () => {
    if (!form.description.trim() || !form.amount || !form.account_id)
      return setError("Descripción, monto y cuenta son obligatorios.");
    if (isTransfer && form.to_kind === "cuenta" && !form.to_account_id)
      return setError("Elige la cuenta destino.");
    if (isTransfer && form.to_kind === "meta" && !form.to_goal_id)
      return setError("Elige la meta destino.");
    if (otraDivisa && paypal.activo && !(Number(paypal.total) > 0))
      return setError("Escribe el total que te cobró PayPal.");
    setSaving(true);
    setError(null);
    try {
      const payload = {
        description: form.description.trim(),
        amount: Number(form.amount),
        type: form.type,
        account_id: Number(form.account_id),
        to_account_id: isTransfer && form.to_kind === "cuenta" ? Number(form.to_account_id) : null,
        to_goal_id: isTransfer && form.to_kind === "meta" ? Number(form.to_goal_id) : null,
        category_id: form.category_id ? Number(form.category_id) : null,
        context_id: form.context_id ? Number(form.context_id) : null,
        attachment_path: form.attachment_path,
        attachment_name: form.attachment_name,
      };
      if (esProgramado) {
        // la divisa se guarda tal cual se pactó; al concretarse se convierte
        // a la de la cuenta con el tipo de cambio de ese día, no el de hoy
        const cuerpo = {
          ...payload,
          currency: form.currency || BASE_CURRENCY,
          scheduled_for: form.occurred_at,
        };
        if (sched) await apiPut(`/api/finance/scheduled/${sched.id}`, cuerpo);
        else await apiPost("/api/finance/scheduled", cuerpo);
      } else {
        // ya ocurrió: se guarda convertido a la divisa de la cuenta, porque el
        // saldo vive en esa divisa. La cifra original queda anotada en la
        // descripción, que es el único lugar donde cabe sin cambiar el modelo.
        const cuerpo = {
          ...payload,
          amount: enDivisaCuenta,
          description: otraDivisa
            ? `${form.description.trim()} (${Number(form.amount)} ${form.currency})`
            : form.description.trim(),
          occurred_at: form.occurred_at || null,
          via_paypal: otraDivisa && paypal.activo,
        };
        if (tx) await apiPut(`/api/finance/transactions/${tx.id}`, cuerpo);
        else await apiPost("/api/finance/transactions", cuerpo);
      }
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (sched) {
      if (!confirm("¿Eliminar este movimiento programado?")) return;
      await apiDelete(`/api/finance/scheduled/${sched.id}`);
    } else {
      if (!confirm("¿Eliminar esta transacción?")) return;
      await apiDelete(`/api/finance/transactions/${tx.id}`);
    }
    onSaved();
  };

  const titles = { ingreso: "Ingreso", egreso: "Egreso", transferencia: "Transferencia" };
  // "transferencia" es femenino: sin esto el título decía "Nuevo transferencia"
  const nuevo = form.type === "transferencia" ? "Nueva" : "Nuevo";
  const titulo = `${base ? "Editar" : nuevo} ${titles[form.type]?.toLowerCase()}${
    esProgramado ? (form.type === "transferencia" ? " programada" : " programado") : ""
  }`;

  return (
    <Modal open={open} onClose={onClose} title={titulo}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
          {Object.entries(titles).map(([value, label]) => (
            <button
              key={value}
              className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                form.type === value ? "bg-surface shadow-sm" : "text-ink-soft"
              }`}
              onClick={() => setForm((f) => ({ ...f, type: value }))}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Programado: se anota ahora pero no toca los saldos hasta que se
            marque como concretado. Al editar ya no se puede cambiar de bando,
            porque una cosa y la otra viven en tablas distintas. */}
        {!tx && !sched && (
          <label className="flex items-start gap-2 rounded-xl border border-glass-border bg-surface/50 px-3 py-2.5 text-sm font-medium">
            <input
              type="checkbox"
              checked={esProgramado}
              onChange={(e) => setForm((f) => ({ ...f, programado: e.target.checked }))}
              className="mt-0.5 h-4 w-4 accent-[#2383e2]"
            />
            <span>
              Programado — aún no ha ocurrido
              <span className="block text-xs font-normal text-ink-soft">
                No cambia tus saldos. Llegada la fecha aparece como pendiente para que marques
                si se concretó.
              </span>
            </span>
          </label>
        )}

        <label className="flex flex-col gap-1 text-sm font-medium">
          Descripción
          <input className={inputCls} value={form.description} onChange={set("description")} autoFocus />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Monto
            <input type="number" inputMode="decimal" step="0.01" min="0" className={inputCls} value={form.amount} onChange={set("amount")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {esProgramado ? "Fecha programada" : "Fecha y hora"}
            <input type="datetime-local" className={inputCls} value={form.occurred_at} onChange={set("occurred_at")} />
          </label>
        </div>

        {/* La divisa del movimiento puede no ser la de la cuenta: comprar algo
            en dólares con una tarjeta en pesos. En un programado la conversión
            se hace el día que se concreta; en algo ya ocurrido, ahora. */}
        <div className="grid grid-cols-2 gap-4">
          <CurrencySelect value={form.currency} onChange={set("currency")} rates={rates} />
          {equivalencia && (
            <p className="self-end pb-2 text-xs text-ink-soft">
              ≈ {equivalencia} al tipo de cambio de hoy. Se convertirá con el del día en
              que lo concretes.
            </p>
          )}
          {!esProgramado && otraDivisa && (
            <p className="self-end pb-2 text-xs text-ink-soft">
              Se registrarán{" "}
              <span className="font-medium text-ink">
                {fmtMoney(enDivisaCuenta, divisaCuenta)}
              </span>{" "}
              en {cuentaDestino?.name}.
            </p>
          )}
        </div>

        {/* si hay conversión y el cargo pasó por PayPal, el tipo de cambio no
            es el del mercado y hay que capturar el del recibo */}
        {!esProgramado && otraDivisa && (
          <CobroPayPal
            montoOrigen={Number(form.amount) || 0}
            divisaOrigen={form.currency}
            divisaCuenta={divisaCuenta}
            tasaMercado={tasaMercado}
            valor={paypal}
            onChange={setPaypal}
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {isTransfer ? "Desde la cuenta" : "Cuenta"}
            <select className={selectCls} value={form.account_id} onChange={set("account_id")}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          {isTransfer ? (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Hacia
              <div className="flex gap-2">
                <select className={`${selectCls} !w-24`} value={form.to_kind} onChange={set("to_kind")}>
                  <option value="cuenta">Cuenta</option>
                  <option value="meta">Meta</option>
                </select>
                {form.to_kind === "cuenta" ? (
                  <select className={selectCls} value={form.to_account_id} onChange={set("to_account_id")}>
                    <option value="">Elegir…</option>
                    {accounts
                      .filter((a) => a.id !== Number(form.account_id))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                ) : (
                  <select className={selectCls} value={form.to_goal_id} onChange={set("to_goal_id")}>
                    <option value="">Elegir…</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-sm font-medium">
              Categoría
              <select className={selectCls} value={form.category_id} onChange={set("category_id")}>
                <option value="">Sin categoría</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Negocio / contexto
            <select className={selectCls} value={form.context_id} onChange={set("context_id")}>
              <option value="">General</option>
              {contexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Ticket / comprobante
            {form.attachment_name ? (
              <span className="flex items-center gap-2 text-xs font-normal">
                📎 {form.attachment_name}
                <button className="text-err" onClick={() => setForm((f) => ({ ...f, attachment_path: null, attachment_name: null }))}>
                  ✕
                </button>
              </span>
            ) : (
              <input type="file" className="text-xs" onChange={upload} />
            )}
          </label>
        </div>

        {error && <p className="text-sm text-err">{error}</p>}
        <Footer onDelete={base ? remove : null} onClose={onClose} onSave={save} saving={saving} />
      </div>
    </Modal>
  );
}

// ---------- Meta ----------

export function GoalModal({ open, goal, onClose, onSaved }) {
  const { form, set, setForm, error, setError, saving, setSaving } = useForm(open, {
    name: goal?.name || "",
    target_amount: goal?.target_amount ?? "",
    deadline: goal?.deadline ? goal.deadline.slice(0, 10) : "",
    banner_path: goal?.banner_path || null,
  });

  const uploadBanner = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      const up = await apiUpload("/api/uploads/banner", file);
      setForm((f) => ({ ...f, banner_path: up.path }));
    } catch (err) {
      setError(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const save = async () => {
    if (!form.name.trim() || !form.target_amount) return setError("Nombre y monto objetivo.");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        target_amount: Number(form.target_amount),
        deadline: form.deadline ? `${form.deadline}T23:59` : null,
        banner_path: form.banner_path,
      };
      if (goal) await apiPut(`/api/finance/goals/${goal.id}`, payload);
      else await apiPost("/api/finance/goals", payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar la meta "${goal.name}"?`)) return;
    await apiDelete(`/api/finance/goals/${goal.id}`);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={goal ? "Editar meta" : "Nueva meta"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Fondo de emergencia…" autoFocus />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Monto objetivo
            <input type="number" inputMode="decimal" step="0.01" min="0" className={inputCls} value={form.target_amount} onChange={set("target_amount")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Fecha límite (opcional)
            <input type="date" className={inputCls} value={form.deadline} onChange={set("deadline")} />
          </label>
        </div>
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          Banner (opcional)
          {form.banner_path ? (
            <div className="flex items-center gap-2">
              <div
                className="h-14 flex-1 rounded-xl bg-cover bg-center"
                style={{ backgroundImage: `url(${form.banner_path})` }}
              />
              <button
                className="text-err"
                onClick={() => setForm((f) => ({ ...f, banner_path: null }))}
                title="Quitar banner"
              >
                ✕
              </button>
            </div>
          ) : (
            <input type="file" accept="image/*" className="text-xs" onChange={uploadBanner} />
          )}
          <span className="text-[11px] font-normal text-ink-soft">
            Ideal 1200 × 400 px. Se recorta al centro para llenar la tarjeta.
          </span>
        </div>

        <p className="text-xs text-ink-soft">
          Para abonar a la meta usa una <b>Transferencia</b> desde una cuenta hacia la meta.
        </p>
        {error && <p className="text-sm text-err">{error}</p>}
        <Footer onDelete={goal ? remove : null} onClose={onClose} onSave={save} saving={saving} />
      </div>
    </Modal>
  );
}

// ---------- Pago recurrente: deuda que pagas o dinero que te abonan ----------

export function RecurringModal({ open, item, accounts, categories, contexts = [], rates = [], onClose, onSaved }) {
  const { form, set, setForm, error, setError, saving, setSaving } = useForm(open, {
    name: item?.name || "",
    type: item?.type || "egreso",
    total_amount: item?.total_amount ?? "",
    installment_amount: item?.installment_amount ?? "",
    installments_total: item?.installments_total ?? "",
    installments_paid: item?.installments_paid ?? 0,
    paid_amount: item?.paid_amount ?? 0,
    currency: item?.currency || BASE_CURRENCY,
    frequency: item?.frequency || "mensual",
    category_id: item?.category_id ?? "",
    account_id: item?.account_id ?? "",
    context_id: item?.context_id ?? "",
    provider_id: item?.provider_id ?? "",
    next_due: item?.next_due ? toInputValue(item.next_due).slice(0, 10) : "",
  });

  // los proveedores viven en /api/business, no vienen en las props de Finanzas
  const [providers, setProviders] = useState([]);
  useEffect(() => {
    if (open) apiGet("/api/business/providers").then(setProviders).catch(() => {});
  }, [open]);

  // los textos cambian según sea una deuda que pagas o un cobro que recibes
  const cobro = form.type === "ingreso";
  const t = cobro
    ? {
        titulo: item ? "Editar cobro a plazos" : "Nuevo cobro a plazos",
        total: "Total a recibir",
        cuota: "Monto por abono",
        cuotas: "Número de abonos",
        pagadas: "Abonos recibidos",
        acumulado: "Recibido acumulado",
        proximo: "Próximo abono",
        ejemplo: "Sueldo quincenal, pago de cliente…",
        falta: "Nombre, total a recibir, monto por abono y número de abonos.",
      }
    : {
        titulo: item ? "Editar deuda" : "Nueva deuda / préstamo",
        total: "Deuda total",
        cuota: "Monto por cuota",
        cuotas: "Número de cuotas",
        pagadas: "Cuotas pagadas",
        acumulado: "Pagado acumulado",
        proximo: "Próximo pago",
        ejemplo: "Préstamo auto, MSI pantalla…",
        falta: "Nombre, deuda total, monto de cuota y número de cuotas.",
      };

  const save = async () => {
    if (!form.name.trim() || !form.total_amount || !form.installment_amount || !form.installments_total)
      return setError(t.falta);
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        type: form.type,
        total_amount: Number(form.total_amount),
        installment_amount: Number(form.installment_amount),
        installments_total: Number(form.installments_total),
        installments_paid: Number(form.installments_paid) || 0,
        paid_amount: Number(form.paid_amount) || 0,
        currency: form.currency,
        frequency: form.frequency,
        category_id: form.category_id ? Number(form.category_id) : null,
        account_id: form.account_id ? Number(form.account_id) : null,
        context_id: form.context_id ? Number(form.context_id) : null,
        provider_id: form.provider_id ? Number(form.provider_id) : null,
        next_due: form.next_due ? `${form.next_due}T09:00` : null,
      };
      if (item) await apiPut(`/api/finance/recurring/${item.id}`, payload);
      else await apiPost("/api/finance/recurring", payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar "${item.name}"?`)) return;
    await apiDelete(`/api/finance/recurring/${item.id}`);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={t.titulo}>
      <div className="flex flex-col gap-4">
        <div className="flex gap-1 rounded-xl bg-ink/5 p-1">
          {[
            { value: "egreso", label: "Deuda que pago" },
            { value: "ingreso", label: "Dinero que recibo" },
          ].map((o) => (
            <button
              key={o.value}
              className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition ${
                form.type === o.value ? "bg-surface shadow-sm" : "text-ink-soft"
              }`}
              onClick={() => setForm((f) => ({ ...f, type: o.value }))}
            >
              {o.label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder={t.ejemplo} autoFocus />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.total}
            <input type="number" inputMode="decimal" step="0.01" className={inputCls} value={form.total_amount} onChange={set("total_amount")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.cuota}
            <input type="number" inputMode="decimal" step="0.01" className={inputCls} value={form.installment_amount} onChange={set("installment_amount")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.cuotas}
            <input type="number" inputMode="numeric" min="1" className={inputCls} value={form.installments_total} onChange={set("installments_total")} />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.pagadas}
            <input type="number" inputMode="numeric" min="0" className={inputCls} value={form.installments_paid} onChange={set("installments_paid")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.acumulado}
            <input type="number" inputMode="decimal" step="0.01" className={inputCls} value={form.paid_amount} onChange={set("paid_amount")} />
          </label>
          <CurrencySelect value={form.currency} onChange={set("currency")} rates={rates} />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Frecuencia
            <select className={selectCls} value={form.frequency} onChange={set("frequency")}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            {t.proximo}
            <input type="date" className={inputCls} value={form.next_due} onChange={set("next_due")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Categoría
            <select className={selectCls} value={form.category_id} onChange={set("category_id")}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Cuenta de pago
          <select className={selectCls} value={form.account_id} onChange={set("account_id")}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.currency})
              </option>
            ))}
          </select>
        </label>

        {/* con negocio y proveedor, cada cuota que se registre nace ya
            etiquetada y aparece en la sección Pagos de ese negocio */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Negocio / contexto
            <select className={selectCls} value={form.context_id} onChange={set("context_id")}>
              <option value="">—</option>
              {contexts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Proveedor
            <select className={selectCls} value={form.provider_id} onChange={set("provider_id")}>
              <option value="">—</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className="text-sm text-err">{error}</p>}
        <Footer onDelete={item ? remove : null} onClose={onClose} onSave={save} saving={saving} />
      </div>
    </Modal>
  );
}

// ---------- Suscripción ----------

export function SubscriptionModal({ open, item, accounts, categories, rates = [], onClose, onSaved }) {
  const { form, set, error, setError, saving, setSaving } = useForm(open, {
    name: item?.name || "",
    amount: item?.amount ?? "",
    currency: item?.currency || BASE_CURRENCY,
    period: item?.period || "mensual",
    category_id: item?.category_id ?? "",
    account_id: item?.account_id ?? "",
    next_due: item?.next_due ? toInputValue(item.next_due).slice(0, 10) : "",
  });

  const save = async () => {
    if (!form.name.trim() || !form.amount) return setError("Nombre y monto.");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        amount: Number(form.amount),
        currency: form.currency,
        period: form.period,
        category_id: form.category_id ? Number(form.category_id) : null,
        account_id: form.account_id ? Number(form.account_id) : null,
        next_due: form.next_due ? `${form.next_due}T09:00` : null,
      };
      if (item) await apiPut(`/api/finance/subscriptions/${item.id}`, payload);
      else await apiPost("/api/finance/subscriptions", payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`¿Eliminar la suscripción "${item.name}"?`)) return;
    await apiDelete(`/api/finance/subscriptions/${item.id}`);
    onSaved();
  };

  return (
    <Modal open={open} onClose={onClose} title={item ? "Editar suscripción" : "Nueva suscripción"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Netflix, Spotify, hosting…" autoFocus />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Monto
            <input type="number" inputMode="decimal" step="0.01" className={inputCls} value={form.amount} onChange={set("amount")} />
          </label>
          <CurrencySelect value={form.currency} onChange={set("currency")} rates={rates} />
          <label className="flex flex-col gap-1 text-sm font-medium">
            Periodo
            <select className={selectCls} value={form.period} onChange={set("period")}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Siguiente cobro
          <input type="date" className={inputCls} value={form.next_due} onChange={set("next_due")} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Categoría
            <select className={selectCls} value={form.category_id} onChange={set("category_id")}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Cuenta de pago
            <select className={selectCls} value={form.account_id} onChange={set("account_id")}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({a.currency})
                </option>
              ))}
            </select>
          </label>
        </div>
        {error && <p className="text-sm text-err">{error}</p>}
        <Footer onDelete={item ? remove : null} onClose={onClose} onSave={save} saving={saving} />
      </div>
    </Modal>
  );
}

// ---------- acciones de un movimiento programado ----------
// viven aqui y no en ScheduledTab porque tambien los usa el calendario,
// y no queremos arrastrar toda la pestana de programados al bundle

function fechaLocal(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ConcretarModal({ open, item, cuentas = [], tasas = [], onClose, onSaved }) {
  const [monto, setMonto] = useState("");
  const [cuando, setCuando] = useState("");
  const [paypal, setPaypal] = useState({ activo: false, total: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setMonto(String(item.amount));
    setPaypal({ activo: false, total: "" });
    // el backend usa la misma regla: si la fecha ya pasó el dinero se movió
    // ese día; si aún no llega, se registra ahora
    const prog = new Date(item.scheduled_for);
    const ahora = new Date();
    setCuando(toInputLocal(prog <= ahora ? prog : ahora));
    setError(null);
  }, [open, item]);

  if (!item) return null;

  const cuenta = cuentas.find((a) => a.id === item.account_id);
  const divisaCuenta = cuenta?.currency || BASE_CURRENCY;
  const tasaDe = (code) =>
    code === BASE_CURRENCY ? 1 : tasas.find((r) => r.code === code)?.rate_to_mxn || 1;
  // cuántas unidades de la divisa de la cuenta vale una del movimiento
  const tasaMercado = tasaDe(item.currency) / tasaDe(divisaCuenta);
  // solo tiene sentido si de verdad hay una conversión de por medio
  const hayConversion = (item.currency || BASE_CURRENCY) !== divisaCuenta;

  const guardar = async () => {
    const valor = Number(monto);
    if (!valor || valor <= 0) return setError("El monto debe ser mayor a cero.");
    if (paypal.activo && !(Number(paypal.total) > 0))
      return setError("Escribe el total que te cobró PayPal.");
    setSaving(true);
    setError(null);
    try {
      await apiPost(`/api/finance/scheduled/${item.id}/confirm`, {
        amount: valor,
        occurred_at: cuando || null,
        charged_amount: paypal.activo ? Number(paypal.total) : null,
        via_paypal: paypal.activo,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const cambio = Number(monto) !== item.amount;

  return (
    <Modal open={open} onClose={onClose} title="Concretar movimiento">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          <span className="font-medium text-ink">{item.description}</span>, programado para{" "}
          {formatDateTime(item.scheduled_for)}.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Monto real{item.currency ? ` (${item.currency})` : ""}
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              className={inputCls}
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              autoFocus
            />
            {cambio && (
              <span className="text-xs text-ink-soft">
                programado: {fmtMoney(item.amount, item.currency)}
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Fecha del movimiento
            <input
              type="datetime-local"
              className={inputCls}
              value={cuando}
              onChange={(e) => setCuando(e.target.value)}
            />
          </label>
        </div>

        {hayConversion && (
          <CobroPayPal
            montoOrigen={Number(monto) || 0}
            divisaOrigen={item.currency}
            divisaCuenta={divisaCuenta}
            tasaMercado={tasaMercado}
            valor={paypal}
            onChange={setPaypal}
          />
        )}

        <p className="rounded-xl bg-ink/5 px-3 py-2 text-xs text-ink-soft">
          Se creará la transacción real y el saldo de la cuenta cambiará. No puede quedar con
          fecha futura: si todavía no ocurre, mejor aplázalo.
        </p>

        {error && <p className="text-sm text-err">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Concretar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Registrar el cobro de una suscripción o la cuota de un pago recurrente.
 *
 *  Antes era un confirm() a secas. Ahora es un modal porque, cuando el cargo
 *  viene en otra divisa, hace falta poder decir cuánto te cobraron de verdad.
 */
export function CobrarModal({ open, item, kind, cuentas = [], tasas = [], onClose, onSaved }) {
  const [paypal, setPaypal] = useState({ activo: false, total: "" });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setPaypal({ activo: false, total: "" });
      setError(null);
    }
  }, [open]);

  if (!item) return null;

  const esSuscripcion = kind === "suscripcion";
  const cobro = !esSuscripcion && item.type === "ingreso";
  const monto = esSuscripcion ? item.amount : item.installment_amount;
  const cuenta = cuentas.find((a) => a.id === item.account_id);
  const divisaCuenta = cuenta?.currency || BASE_CURRENCY;
  const tasaDe = (code) =>
    code === BASE_CURRENCY ? 1 : tasas.find((r) => r.code === code)?.rate_to_mxn || 1;
  const tasaMercado = tasaDe(item.currency) / tasaDe(divisaCuenta);
  const hayConversion = (item.currency || BASE_CURRENCY) !== divisaCuenta;

  const guardar = async () => {
    if (paypal.activo && !(Number(paypal.total) > 0))
      return setError("Escribe el total que te cobró PayPal.");
    setSaving(true);
    setError(null);
    try {
      const ruta = esSuscripcion ? "subscriptions" : "recurring";
      await apiPost(`/api/finance/${ruta}/${item.id}/pay`, {
        charged_amount: paypal.activo ? Number(paypal.total) : null,
        via_paypal: paypal.activo,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const etiqueta = esSuscripcion ? "cobro" : cobro ? "abono" : "pago";

  return (
    <Modal open={open} onClose={onClose} title={`Registrar ${etiqueta}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          <span className="font-medium text-ink">{item.name}</span> ·{" "}
          {fmtMoney(monto, item.currency)}
          {!esSuscripcion && ` · ${cobro ? "abono" : "cuota"} ${item.installments_paid + 1} de ${item.installments_total}`}
          {cuenta ? ` · ${cuenta.name}` : ""}
        </p>

        {hayConversion && (
          <CobroPayPal
            montoOrigen={monto}
            divisaOrigen={item.currency}
            divisaCuenta={divisaCuenta}
            tasaMercado={tasaMercado}
            valor={paypal}
            onChange={setPaypal}
          />
        )}

        <p className="rounded-xl bg-ink/5 px-3 py-2 text-xs text-ink-soft">
          Se creará la transacción y {esSuscripcion ? "el cobro avanzará al siguiente periodo" : "se contará una cuota más"}.
        </p>

        {error && <p className="text-sm text-err">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Registrar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function AplazarModal({ open, item, onClose, onSaved }) {
  const [fecha, setFecha] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !item) return;
    setFecha(item.scheduled_for.slice(0, 10));
    setNota("");
    setError(null);
  }, [open, item]);

  if (!item) return null;

  const correr = (dias) => {
    const base = new Date(`${fecha}T12:00`);
    base.setDate(base.getDate() + dias);
    setFecha(fechaLocal(base));
  };

  const guardar = async () => {
    if (!fecha) return setError("Elige la nueva fecha.");
    setSaving(true);
    setError(null);
    try {
      // misma convención que deudas y suscripciones: los vencimientos van a las 9
      await apiPost(`/api/finance/scheduled/${item.id}/postpone`, {
        scheduled_for: `${fecha}T09:00`,
        note: nota.trim() || null,
      });
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Aplazar a otra fecha">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">
          <span className="font-medium text-ink">{item.description}</span> ·{" "}
          {fmtMoney(item.amount, item.currency)}
        </p>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Nueva fecha
          <input
            type="date"
            className={inputCls}
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {[
            { label: "+1 semana", dias: 7 },
            { label: "+2 semanas", dias: 14 },
            { label: "+1 mes", dias: 30 },
          ].map((a) => (
            <button
              key={a.label}
              onClick={() => correr(a.dias)}
              className="rounded-full bg-ink/5 px-3 py-1 text-xs font-medium text-ink-soft transition hover:bg-accent-soft hover:text-accent"
            >
              {a.label}
            </button>
          ))}
        </div>

        <label className="flex flex-col gap-1 text-sm font-medium">
          Nota (opcional)
          <input
            className={inputCls}
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            placeholder="Se atrasó el pago del cliente…"
          />
        </label>

        {item.postponed_count > 0 && (
          <p className="text-xs text-ink-soft">
            Ya se aplazó {item.postponed_count}{" "}
            {item.postponed_count === 1 ? "vez" : "veces"}; originalmente era para el{" "}
            {formatDateTime(item.original_scheduled_for)}.
          </p>
        )}

        {error && <p className="text-sm text-err">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={saving}>
            {saving ? "Guardando…" : "Aplazar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
