import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar.jsx";
import AppsPage from "./features/apps/AppsPage.jsx";
import CalendarPage from "./features/calendar/CalendarPage.jsx";
import FinancePage from "./features/finance/FinancePage.jsx";
import SettingsPage from "./features/settings/SettingsPage.jsx";
import TodosPage from "./features/todos/TodosPage.jsx";
import ComingSoon from "./components/layout/ComingSoon.jsx";

export default function App() {
  return (
    <div className="homeos-bg flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<AppsPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/tareas" element={<TodosPage />} />
          <Route path="/finanzas" element={<FinancePage />} />
          <Route path="/rutinas" element={<ComingSoon title="Rutinas" />} />
          <Route path="/notas" element={<ComingSoon title="Notas" />} />
          <Route path="/archivos" element={<ComingSoon title="Archivos" />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<AppsPage />} />
        </Routes>
      </main>
    </div>
  );
}
