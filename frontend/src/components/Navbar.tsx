import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Menu,
  LogOut,
  UserRound,
  ChevronDown,
  X,
} from "lucide-react";
import { NavLink, Link, useNavigate } from "react-router";
import logo from "../assets/hcmute-logo.png";
import {
  clearSession,
  readSession,
  SESSION_CHANGED_EVENT,
} from "../services/session";

const navItems = [
  { label: "Home", path: "/" },
  { label: "My Queue", path: "/queue" },
  { label: "Appointments", path: "/appointments" },
];

export default function Navbar() {
  const navigate = useNavigate();
  const [session, setSession] = useState(readSession);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isNavigationOpen, setIsNavigationOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef<HTMLElement>(null);
  const navigationButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const refreshSession = () => {
      setSession(readSession());
      setIsAccountMenuOpen(false);
      setIsNavigationOpen(false);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, refreshSession);
    window.addEventListener("storage", refreshSession);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refreshSession);
      window.removeEventListener("storage", refreshSession);
    };
  }, []);

  useEffect(() => {
    if (!isAccountMenuOpen && !isNavigationOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      if (!accountMenuRef.current?.contains(event.target))
        setIsAccountMenuOpen(false);
      if (
        !navigationRef.current?.contains(event.target) &&
        !navigationButtonRef.current?.contains(event.target)
      )
        setIsNavigationOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (isAccountMenuOpen) accountButtonRef.current?.focus();
      else if (isNavigationOpen) navigationButtonRef.current?.focus();
      setIsAccountMenuOpen(false);
      setIsNavigationOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen, isNavigationOpen]);

  const closeMenus = () => {
    setIsNavigationOpen(false);
    setIsAccountMenuOpen(false);
  };

  return (
    <header className="sq-header">
      <a href="#main-content" className="sq-skip-link">
        Skip to content
      </a>
      <div className="sq-container sq-header-inner">
        <Link
          to="/"
          className="sq-brand"
          onClick={closeMenus}
          aria-label="SmartQueue home"
        >
          <img src={logo} alt="HCMUTE" width="48" height="48" />
          <div>
            <span>
              Smart<span className="sq-brand-accent">Queue</span>
              <span className="sq-brand-period">.</span>
            </span>
            <small>HCMUTE STUDENT SERVICES</small>
          </div>
        </Link>
        <nav aria-label="Main navigation" className="sq-desktop-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              className={({ isActive }) => (isActive ? "is-active" : "")}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sq-header-actions">
          {session ? (
            <div
              ref={accountMenuRef}
              className="sq-account"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setIsAccountMenuOpen(false);
              }}
            >
              <button
                ref={accountButtonRef}
                type="button"
                aria-expanded={isAccountMenuOpen}
                aria-controls="account-dropdown"
                onClick={() => {
                  setIsAccountMenuOpen((open) => !open);
                  setIsNavigationOpen(false);
                }}
                className="sq-account-button"
                title={`Hello ${session.user.fullName}`}
              >
                <UserRound size={17} aria-hidden="true" />
                <span>{session.user.fullName}</span>
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {isAccountMenuOpen && (
                <div id="account-dropdown" className="sq-account-dropdown">
                  {session.user.role === "staff" && (
                    <Link to="/staff" className="sq-staff-link" onClick={closeMenus}>
                      <UserRound size={16} aria-hidden="true" /> Staff workspace
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      clearSession();
                      navigate("/login", { replace: true });
                    }}
                  >
                    <LogOut size={16} aria-hidden="true" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link to="/login" className="sq-sign-in" onClick={closeMenus}>
              Sign in <ArrowUpRight size={17} aria-hidden="true" />
            </Link>
          )}
          <button
            ref={navigationButtonRef}
            type="button"
            aria-label={
              isNavigationOpen
                ? "Close navigation menu"
                : "Open navigation menu"
            }
            aria-expanded={isNavigationOpen}
            aria-controls="mobile-navigation"
            className="sq-mobile-toggle"
            onClick={() => {
              setIsNavigationOpen((open) => !open);
              setIsAccountMenuOpen(false);
            }}
          >
            {isNavigationOpen ? (
              <X size={22} aria-hidden="true" />
            ) : (
              <Menu size={22} aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
      {isNavigationOpen && (
        <nav
          ref={navigationRef}
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="sq-mobile-nav"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === "/"}
              onClick={closeMenus}
              className={({ isActive }) => (isActive ? "is-active" : "")}
            >
              {item.label}
              <ArrowUpRight size={16} aria-hidden="true" />
            </NavLink>
          ))}
          <a href="/#how-it-works" onClick={closeMenus}>
            How it works
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </nav>
      )}
    </header>
  );
}
