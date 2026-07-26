import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import useContexts from "../../hooks/useContexts.js";
import ResumenTab from "./ResumenTab.jsx";
import TransactionsTab from "./TransactionsTab.jsx";
import CategoriesTab from "./CategoriesTab.jsx";
import MonthlyTab from "./MonthlyTab.jsx";
import ProvidersTab from "./ProvidersTab.jsx";
import BusinessTab from "./BusinessTab.jsx";
import DivisasPanel from "../divisas/DivisasPanel.jsx";

const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "transacciones", label: "Transacciones" },
  { key: "categorias", label: "Categorías" },
  { key: "mensual", label: "Mensual" },
  { key: "proveedores", label: "Proveedores" },
  { key: "negocios", label: "Negocios" },
];

// grupo aparte: no es parte del tracker, es la referencia de tipos de cambio
const EXTRA_TABS = [{ key: "divisas", label: "💱 Divisas" }];

export default function FinancePage() {
  const [tab, setTab] = useState("resumen");
  const { contexts, byId } = useContexts();

  // datos compartidos entre tabs
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [version, setVersion] = useState(0); // bump para refrescar tabs

  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    apiGet("/api/finance/accounts").then(setAccounts).catch(() => {});
    apiGet("/api/finance/categories").then(setCategories).catch(() => {});
  }, [version]);

  const shared = { accounts, categories, contexts, contextsById: byId, reload, version };

  return (
    <div className="p-4 md:p-8">
      <TopBar title="Finanzas & Negocios" />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1 rounded-2xl bg-ink/5 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-4 py-1.5 text-sm font-medium transition ${
                tab === t.key ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-2xl bg-ink/5 p-1">
          {EXTRA_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`rounded-xl px-4 py-1.5 text-sm font-medium transition ${
                tab === t.key ? "bg-surface text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "resumen" && <ResumenTab {...shared} />}
      {tab === "transacciones" && <TransactionsTab {...shared} />}
      {tab === "categorias" && <CategoriesTab {...shared} />}
      {tab === "mensual" && <MonthlyTab {...shared} />}
      {tab === "proveedores" && <ProvidersTab {...shared} />}
      {tab === "negocios" && <BusinessTab {...shared} />}
      {tab === "divisas" && <DivisasPanel {...shared} />}
    </div>
  );
}
