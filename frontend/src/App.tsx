import { Route, Routes } from "react-router";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import DepartmentPage from "./pages/DepartmentPage";
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import PlaceholderPage from "./pages/PlaceholderPage";

function App() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <Navbar />

      <div className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />

          <Route
            path="/departments/:departmentId"
            element={<DepartmentPage />}
          />

          <Route
            path="/queue"
            element={<PlaceholderPage title="My Queue" />}
          />

          <Route
            path="/appointments"
            element={<PlaceholderPage title="Appointments" />}
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

export default App;
