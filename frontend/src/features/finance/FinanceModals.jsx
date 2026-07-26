import { useEffect, useState } from "react";
import { apiDelete, apiPost, apiPut, apiUpload } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import Modal from "../../components/ui/Modal.jsx";
import {
  ACCOUNT_KINDS,
  CONTEXT_COLORS,
  CURRENCIES,
  PERIODS,
  toInputValue,
} from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";

const selectCls = inputCls;

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
    color: account?.color || CONTEXT_COLORS[0],
    banner_path: account?.banner_path || null,
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
            <input type="number" step="0.01" className={inputCls} value={form.initial_balance} onChange={set("initial_balance")} />
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

export function TransactionModal({ open, tx, type, accounts, categories, contexts, goals = [], onClose, onSaved }) {
  const initialType = tx?.type || type || "egreso";
  const { form, set, setForm, error, setError, saving, setSaving } = useForm(open, {
    type: initialType,
    description: tx?.description || "",
    amount: tx?.amount ?? "",
    account_id: tx?.account_id || accounts[0]?.id || "",
    to_kind: tx?.to_goal_id ? "meta" : "cuenta",
    to_account_id: tx?.to_account_id || "",
    to_goal_id: tx?.to_goal_id || "",
    category_id: tx?.category_id ?? "",
    context_id: tx?.context_id ?? "",
    occurred_at: tx ? toInputValue(tx.occurred_at) : toInputValue(new Date().toISOString()),
    attachment_path: tx?.attachment_path || null,
    attachment_name: tx?.attachment_name || null,
  });
  const isTransfer = form.type === "transferencia";

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
        occurred_at: form.occurred_at || null,
        attachment_path: form.attachment_path,
        attachment_name: form.attachment_name,
      };
      if (tx) await apiPut(`/api/finance/transactions/${tx.id}`, payload);
      else await apiPost("/api/finance/transactions", payload);
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("¿Eliminar esta transacción?")) return;
    await apiDelete(`/api/finance/transactions/${tx.id}`);
    onSaved();
  };

  const titles = { ingreso: "Ingreso", egreso: "Egreso", transferencia: "Transferencia" };

  return (
    <Modal open={open} onClose={onClose} title={`${tx ? "Editar" : "Nuevo"} ${titles[form.type]?.toLowerCase()}`}>
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

        <label className="flex flex-col gap-1 text-sm font-medium">
          Descripción
          <input className={inputCls} value={form.description} onChange={set("description")} autoFocus />
        </label>

        <div className="grid grid-cols-2 gap-4">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Monto
            <input type="number" step="0.01" min="0" className={inputCls} value={form.amount} onChange={set("amount")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Fecha y hora
            <input type="datetime-local" className={inputCls} value={form.occurred_at} onChange={set("occurred_at")} />
          </label>
        </div>

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
        <Footer onDelete={tx ? remove : null} onClose={onClose} onSave={save} saving={saving} />
      </div>
    </Modal>
  );
}

// ---------- Meta ----------

export function GoalModal({ open, goal, onClose, onSaved }) {
  const { form, set, error, setError, saving, setSaving } = useForm(open, {
    name: goal?.name || "",
    period: goal?.period || "mensual",
    target_amount: goal?.target_amount ?? "",
  });

  const save = async () => {
    if (!form.name.trim() || !form.target_amount) return setError("Nombre y monto objetivo.");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        period: form.period,
        target_amount: Number(form.target_amount),
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
            Plazo
            <select className={selectCls} value={form.period} onChange={set("period")}>
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Monto objetivo
            <input type="number" step="0.01" min="0" className={inputCls} value={form.target_amount} onChange={set("target_amount")} />
          </label>
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

// ---------- Deuda / pago recurrente ----------

export function RecurringModal({ open, item, accounts, categories, onClose, onSaved }) {
  const { form, set, error, setError, saving, setSaving } = useForm(open, {
    name: item?.name || "",
    total_amount: item?.total_amount ?? "",
    installment_amount: item?.installment_amount ?? "",
    installments_total: item?.installments_total ?? "",
    installments_paid: item?.installments_paid ?? 0,
    paid_amount: item?.paid_amount ?? 0,
    frequency: item?.frequency || "mensual",
    category_id: item?.category_id ?? "",
    account_id: item?.account_id ?? "",
    next_due: item?.next_due ? toInputValue(item.next_due).slice(0, 10) : "",
  });

  const save = async () => {
    if (!form.name.trim() || !form.total_amount || !form.installment_amount || !form.installments_total)
      return setError("Nombre, deuda total, monto de cuota y número de cuotas.");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        total_amount: Number(form.total_amount),
        installment_amount: Number(form.installment_amount),
        installments_total: Number(form.installments_total),
        installments_paid: Number(form.installments_paid) || 0,
        paid_amount: Number(form.paid_amount) || 0,
        frequency: form.frequency,
        category_id: form.category_id ? Number(form.category_id) : null,
        account_id: form.account_id ? Number(form.account_id) : null,
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
    <Modal open={open} onClose={onClose} title={item ? "Editar deuda" : "Nueva deuda / préstamo"}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Nombre
          <input className={inputCls} value={form.name} onChange={set("name")} placeholder="Préstamo auto, MSI pantalla…" autoFocus />
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Deuda total
            <input type="number" step="0.01" className={inputCls} value={form.total_amount} onChange={set("total_amount")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Monto por cuota
            <input type="number" step="0.01" className={inputCls} value={form.installment_amount} onChange={set("installment_amount")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            # de cuotas
            <input type="number" min="1" className={inputCls} value={form.installments_total} onChange={set("installments_total")} />
          </label>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Cuotas ya pagadas
            <input type="number" min="0" className={inputCls} value={form.installments_paid} onChange={set("installments_paid")} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Ya pagado ($)
            <input type="number" step="0.01" className={inputCls} value={form.paid_amount} onChange={set("paid_amount")} />
          </label>
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
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Siguiente pago
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
          <label className="flex flex-col gap-1 text-sm font-medium">
            Cuenta de pago
            <select className={selectCls} value={form.account_id} onChange={set("account_id")}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
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

export function SubscriptionModal({ open, item, accounts, categories, onClose, onSaved }) {
  const { form, set, error, setError, saving, setSaving } = useForm(open, {
    name: item?.name || "",
    amount: item?.amount ?? "",
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
            <input type="number" step="0.01" className={inputCls} value={form.amount} onChange={set("amount")} />
          </label>
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
          <label className="flex flex-col gap-1 text-sm font-medium">
            Siguiente cobro
            <input type="date" className={inputCls} value={form.next_due} onChange={set("next_due")} />
          </label>
        </div>
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
                  {a.name}
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
