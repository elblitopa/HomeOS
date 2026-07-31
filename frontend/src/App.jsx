import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar.jsx";
import InicioPage from "./features/inicio/InicioPage.jsx";
import AppsPage from "./features/apps/AppsPage.jsx";
import CalendarPage from "./features/calendar/CalendarPage.jsx";
import FilesPage from "./features/files/FilesPage.jsx";
import FinancePage from "./features/finance/FinancePage.jsx";
import NotesPage from "./features/notes/NotesPage.jsx";
import RoutinesPage from "./features/routines/RoutinesPage.jsx";
import SettingsPage from "./features/settings/SettingsPage.jsx";
import TodosPage from "./features/todos/TodosPage.jsx";

const SIDEBAR_KEY = "homeos-sidebar";

export default function App() {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === "collapsed"
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
  }, [collapsed]);

  return (
    // En movil el documento scrollea nativo (Safari deja pasar el contenido
    // tras sus barras translucidas); en desktop el scroll vive dentro de main.
    //
    // min-h-dvh y no min-h-full: en standalone con status-bar-style
    // black-translucent, height:100% le devuelve a iOS la pantalla MENOS la
    // barra de estado. En las paginas sin suficiente contenido ese 100% manda
    // y toda la interfaz —la barra inferior incluida— queda unos 59 px arriba
    // del fondo real. dvh si mide la pantalla completa.
    <div className="homeos-bg flex min-h-dvh md:h-full">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main
        className={`min-w-0 flex-1 md:overflow-y-auto max-md:pb-[calc(6rem+env(safe-area-inset-bottom,0px))] ${
          collapsed ? "md:pl-14" : ""
        }`}
      >
        <Routes>
          <Route path="/" element={<InicioPage />} />
          <Route path="/apps" element={<AppsPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/tareas" element={<TodosPage />} />
          <Route path="/finanzas" element={<FinancePage />} />
          <Route path="/rutinas" element={<RoutinesPage />} />
          <Route path="/notas" element={<NotesPage />} />
          <Route path="/archivos" element={<FilesPage />} />
          <Route path="/ajustes" element={<SettingsPage />} />
          {/* Navigate y no la página directa: si no, una URL desconocida
              pintaría Inicio pero ningún enlace del menú quedaría activo */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
