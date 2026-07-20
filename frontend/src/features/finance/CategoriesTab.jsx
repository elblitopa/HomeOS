import { useEffect, useState } from "react";
import { apiDelete, apiGet, apiPost } from "../../api/client.js";
import Button from "../../components/ui/Button.jsx";
import GlassCard from "../../components/ui/GlassCard.jsx";
import { fmtMoney } from "../../lib/constants.js";
import { inputCls } from "../todos/TaskFormModal.jsx";

export default function CategoriesTab({ categories, reload, version }) {
  const [summary, setSummary] = useState({ by_category: {} });
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("🏷️");
  const [error, setError] = useState(null);

  useEffect(() => {
    apiGet("/api/finance/summary").then(setSummary).catch(() => {});
  }, [version]);

  const add = async () => {
    if (!newName.trim()) return;
    setError(null);
    try {
      await apiPost("/api/finance/categories", { name: newName.trim(), icon: newIcon || "🏷️" });
      setNewName("");
      reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const remove = async (cat) => {
    if (!confirm(`¿Eliminar la categoría "${cat.name}"? Sus transacciones quedan sin categoría.`)) return;
    await apiDelete(`/api/finance/categories/${cat.id}`);
    reload();
  };

  const totals = (id) =>
    summary.by_category?.[String(id)] || { ingresos: 0, egresos: 0, balance: 0 };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${inputCls} !w-16 text-center`}
          value={newIcon}
          onChange={(e) => setNewIcon(e.target.value)}
          maxLength={4}
          title="Emoji"
        />
        <input
          className={`${inputCls} !w-56`}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nueva categoría…"
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add} disabled={!newName.trim()}>
          Agregar
        </Button>
        {error && <p className="text-sm text-err">{error}</p>}
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
        {categories.map((cat) => {
          const t = totals(cat.id);
          return (
            <GlassCard key={cat.id} className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 font-semibold">
                  <span className="text-xl">{cat.icon}</span>
                  {cat.name}
                </span>
                <button
                  className="text-xs text-ink-soft transition hover:text-err"
                  onClick={() => remove(cat)}
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
              <div className="flex flex-col gap-0.5 text-sm">
                <p className="flex justify-between">
                  <span className="text-ink-soft">Ingresos:</span>
                  <span className="font-medium text-ok">{fmtMoney(t.ingresos)}</span>
                </p>
                <p className="flex justify-between">
                  <span className="text-ink-soft">Egresos:</span>
                  <span className="font-medium text-err">{fmtMoney(t.egresos)}</span>
                </p>
                <p className="flex justify-between border-t border-ink/5 pt-1">
                  <span className="text-ink-soft">Balance:</span>
                  <span className="font-semibold">{fmtMoney(t.balance)}</span>
                </p>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
