import { Route, Routes, useLocation } from "react-router";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import DepartmentPage from "./pages/DepartmentPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import PlaceholderPage from "./pages/PlaceholderPage";
import BookAppointmentPage from "./pages/BookAppointmentPage";
import AppointmentsPage from "./pages/AppointmentsPage";
import StudentAccess from "./components/StudentAccess";
import MyQueuePage from "./pages/MyQueuePage";
import StaffWorkspace from "./pages/StaffWorkspace";
import AdminWorkspace from "./pages/AdminWorkspace";
import { useSessionValidation } from "./services/useSessionValidation";
import AssistantWidget from "./features/ai/components/AssistantWidget";

function AppContent() {
  useSessionValidation();
  const { pathname } = useLocation();
  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <AdminWorkspace />;
  }
  if (pathname === "/staff" || pathname.startsWith("/staff/")) {
    return <StaffWorkspace />;
  }
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />

      <div id="main-content" tabIndex={-1} className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />

          <Route
            path="/departments/:departmentId"
            element={<DepartmentPage />}
          />

          <Route path="/queue" element={<MyQueuePage />} />

          <Route
            path="/appointments"
            element={
              <StudentAccess>
                <AppointmentsPage />
              </StudentAccess>
            }
          />

          <Route
            path="/appointments/new"
            element={
              <StudentAccess>
                <BookAppointmentPage />
              </StudentAccess>
            }
          />

          <Route path="/login" element={<LoginPage />} />

          <Route
            path="*"
            element={<PlaceholderPage title="Page Not Found" />}
          />
        </Routes>
      </div>

      <Footer />
    </div>
  );
}

function App() {
  const { pathname } = useLocation();
  const showAssistant = pathname === "/" || pathname.startsWith("/departments/") || pathname === "/queue" || pathname === "/appointments" || pathname === "/appointments/new";
  return <><AppContent />{showAssistant && <AssistantWidget />}</>;
}

export default App;
