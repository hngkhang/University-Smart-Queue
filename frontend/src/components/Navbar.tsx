import { useEffect, useRef, useState } from "react";
import { Bell, Menu, LogIn, LogOut, UserRound, ChevronDown } from "lucide-react";
import { NavLink, Link, useNavigate } from "react-router";
import logo from "../assets/hcmute-logo.png";
import { clearSession, readSession, SESSION_CHANGED_EVENT } from "../services/session";

const navItems = [
  { label: "Home", path: "/" },
  { label: "My Queue", path: "/queue" },
  { label: "Appointments", path: "/appointments" },
];

function Navbar() {
  const navigate = useNavigate();
  const [session, setSession] = useState(readSession);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const refreshSession = () => {
      setSession(readSession());
      setIsAccountMenuOpen(false);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, refreshSession);
    window.addEventListener("storage", refreshSession);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refreshSession);
      window.removeEventListener("storage", refreshSession);
    };
  }, []);

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (event.target instanceof Node && !accountMenuRef.current?.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
        accountButtonRef.current?.focus();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  const handleLogout = () => {
    clearSession();
    setIsAccountMenuOpen(false);
    navigate("/login", { replace: true });
  };

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

          {session ? (
            <div
              ref={accountMenuRef}
              className="relative min-w-0"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setIsAccountMenuOpen(false);
                }
              }}
            >
              <button
                ref={accountButtonRef}
                type="button"
                aria-expanded={isAccountMenuOpen}
                aria-controls="account-dropdown"
                onClick={() => setIsAccountMenuOpen((open) => !open)}
                className="flex min-w-0 items-center gap-2 rounded-full bg-[#0B1F3A] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 sm:px-5"
                title={`Hello ${session.user.fullName}`}
              >
                <UserRound size={16} className="shrink-0" />
                <span className="max-w-32 truncate lg:max-w-48">
                  Hello {session.user.fullName}
                </span>
                <ChevronDown size={16} className={`shrink-0 transition-transform ${isAccountMenuOpen ? "rotate-180" : ""}`} />
              </button>
              {isAccountMenuOpen && (
                <div
                  id="account-dropdown"
                  className="absolute right-0 top-full mt-2 w-44 rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg"
                >
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-red-600 transition hover:bg-red-50 focus-visible:bg-red-50 focus-visible:outline-2 focus-visible:outline-red-600"
                  >
                    <LogOut size={16} />
                    Logout
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              to="/login"
              className="flex items-center gap-2 rounded-full bg-[#0B1F3A] px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-800 sm:px-5"
            >
              <LogIn size={16} />
              Sign in
            </Link>
          )}

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
