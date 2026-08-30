import { useCallback, useEffect, useState } from "react";
import { apiGet } from "../../api/client.js";
import TopBar from "../../components/layout/TopBar.jsx";
import useContexts from "../../hooks/useContexts.js";
import ResumenTab from "./ResumenTab.jsx";
import TransactionsTab from "./TransactionsTab.jsx";
import ScheduledTab from "./ScheduledTab.jsx";
import MetasTab from "./MetasTab.jsx";
import PrestamosTab from "./PrestamosTab.jsx";
import CategoriesTab from "./CategoriesTab.jsx";
import MonthlyTab from "./MonthlyTab.jsx";
import BudgetTab from "./BudgetTab.jsx";
import DivisasPanel from "../divisas/DivisasPanel.jsx";

// Proveedores y Negocios vivieron aquí como pestañas; ahora son la sección
// Negocios (/negocios), con una página por negocio.
const TABS = [
  { key: "resumen", label: "Resumen" },
  { key: "transacciones", label: "Transacciones" },
  { key: "programados", label: "Programados" },
  { key: "metas", label: "Metas" },
  { key: "prestamos", label: "Préstamos" },
  { key: "categorias", label: "Categorías" },
  { key: "mensual", label: "Mensual" },
  { key: "presupuesto", label: "Presupuesto" },
];

// grupo aparte: no es parte del tracker, es la referencia de tipos de cambio
const EXTRA_TABS = [{ key: "divisas", label: "Divisas" }];

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

  // goTab: para que un tab pueda saltar a otro (ej. "Ver todas" de Metas)
  const shared = { accounts, categories, contexts, contextsById: byId, reload, version, goTab: setTab };

  return (
    <div className="p-4 md:p-8">
      <TopBar title="Finanzas" />

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
      {tab === "programados" && <ScheduledTab {...shared} />}
      {tab === "metas" && <MetasTab {...shared} />}
      {tab === "prestamos" && <PrestamosTab {...shared} />}
      {tab === "categorias" && <CategoriesTab {...shared} />}
      {tab === "mensual" && <MonthlyTab {...shared} />}
      {tab === "presupuesto" && <BudgetTab {...shared} />}
      {tab === "divisas" && <DivisasPanel {...shared} />}
    </div>
  );
}
