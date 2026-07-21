import { Routes, Route } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar.jsx";
import AppsPage from "./features/apps/AppsPage.jsx";
import CalendarPage from "./features/calendar/CalendarPage.jsx";
import FilesPage from "./features/files/FilesPage.jsx";
import FinancePage from "./features/finance/FinancePage.jsx";
import NotesPage from "./features/notes/NotesPage.jsx";
import RoutinesPage from "./features/routines/RoutinesPage.jsx";
import SettingsPage from "./features/settings/SettingsPage.jsx";
import TodosPage from "./features/todos/TodosPage.jsx";

export default function App() {
  return (
    <div className="homeos-bg flex h-full">
      <Sidebar />
      <main className="flex-1 overflow-y-auto max-md:pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        <Routes>
          <Route path="/" element={<AppsPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/tareas" element={<TodosPage />} />
          <Route path="/finanzas" element={<FinancePage />} />
          <Route path="/rutinas" element={<RoutinesPage />} />
          <Route path="/notas" element={<NotesPage />} />
          <Route path="/archivos" element={<FilesPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          <Route path="*" element={<AppsPage />} />
        </Routes>
      </main>
    </div>
  );
}
