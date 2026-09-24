import { Bell, Menu, LogIn } from "lucide-react";
import { NavLink, Link } from "react-router";
import logo from "../assets/hcmute-logo.png";

const navItems = [
  { label: "Home", path: "/" },
  { label: "My Queue", path: "/queue" },
  { label: "Appointments", path: "/appointments" },
];

function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/90 shadow-sm backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo + Name */}
        <Link to="/" className="flex items-center gap-3">
          <img
            src={logo}
            alt="HCMUTE Logo"
            className="h-16 w-16 shrink-0 object-contain"
          />
          <div className="hidden sm:block">
            <p className="text-xs font-bold uppercase tracking-wide text-[#0B1F3A]">
              HCMC University of Technology and Engineering
            </p>
            <p className="text-lg font-extrabold text-[#0B1F3A]">
              SmartQueue
            </p>
          </div>
        </Link>

        {/* Navigation */}
        <nav className="hidden items-center gap-6 md:flex">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `text-sm font-semibold transition-colors ${
                  isActive
                    ? "text-blue-700"
                    : "text-slate-600 hover:text-blue-700"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Right */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Notifications"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-[#0B1F3A]"
          >
            <Bell size={20} />
          </button>

          <Link
            to="/login"
            className="hidden items-center gap-2 rounded-full bg-[#0B1F3A] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-blue-800 sm:flex"
          >
            <LogIn size={16} />
            Login
          </Link>

          <button
            type="button"
            aria-label="Open navigation menu"
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 md:hidden"
          >
            <Menu size={20} />
          </button>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
