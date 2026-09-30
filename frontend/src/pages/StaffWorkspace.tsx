import { useEffect, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, NavLink, useLocation } from "react-router";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronRight,
  Clock3,
  History,
  Info,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquare,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Search,
  ShieldCheck,
  Ticket,
  UserRound,
  Users,
  Volume2,
  WifiOff,
  X,
} from "lucide-react";
import logo from "../assets/hcmute-logo.png";
import {
  clearSession,
  readSession,
  SESSION_CHANGED_EVENT,
} from "../services/session";
import type { SessionUser } from "../services/session";
import { fetchDepartment } from "../services/departments";
import type { Department } from "../types";
import { createDemo, demoReducer } from "../features/staff/demo";
import type { StaffVisit } from "../features/staff/demo";
import "../styles/staff.css";

const statusNames = {
  waiting: "Waiting",
  called: "Called",
  serving: "In service",
  completed: "Completed",
  no_show: "No-show",
};
const clockTime = (value: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
const minutesSince = (value: number, now: number) =>
  Math.max(0, Math.floor((now - value) / 60000));
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("");

function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (focus instanceof HTMLElement) focus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="sw-dialog"
      aria-labelledby="staff-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="staff-dialog-title">{title}</h2>
        <button
          type="button"
          className="sw-icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}

export default function StaffWorkspace() {
  const { pathname } = useLocation();
  const [session, setSession] = useState(readSession);
  // Development-only showcase: fixtures, no login, no backend requests.
  const preview =
    import.meta.env.DEV &&
    (pathname === "/staff/preview" || pathname === "/staff/preview/history");
  useEffect(() => {
    const refresh = () => setSession(readSession());
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      window.clearInterval(timer);
    };
  }, []);
  if (!preview && !session)
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(pathname === "/staff/history" ? pathname : "/staff")}`}
        replace
      />
    );
  if (!preview && session?.user.role !== "staff")
    return (
      <main className="sw-access">
        <ShieldCheck size={36} />
        <h1>Staff access required</h1>
        <p>Sign in with your staff account to open this workspace.</p>
        <Link to="/login?redirect=%2Fstaff" className="sw-button primary">
          Sign in as staff
        </Link>
        <Link to="/">Back to home</Link>
      </main>
    );
  if (
    ![
      "/staff",
      "/staff/history",
      "/staff/preview",
      "/staff/preview/history",
    ].includes(pathname) ||
    (!import.meta.env.DEV && pathname.includes("/preview"))
  )
    return <Navigate to="/staff" replace />;
  const user: SessionUser = preview
    ? {
        id: "preview",
        fullName: "Jordan Nguyen",
        role: "staff",
        email: "",
        studentID: "",
        phone: "",
        department: "preview",
      }
    : session!.user;
  return (
    <Workspace
      key={`${preview ? "preview" : session!.token}`}
      user={user}
      preview={preview}
    />
  );
}

function Workspace({ user, preview }: { user: SessionUser; preview: boolean }) {
  const { pathname } = useLocation();
  const base = preview ? "/staff/preview" : "/staff";
  const historyPage = pathname.endsWith("/history");
  const [demo, setDemo] = useState(preview);
  const [state, dispatch] = useReducer(demoReducer, undefined, () =>
    createDemo(Date.now()),
  );
  const [now, setNow] = useState(Date.now);
  const [office, setOffice] = useState<{
    loading: boolean;
    data: Department | null;
    error: string;
  }>({ loading: !!user.department && !preview, data: null, error: "" });
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [historyFilter, setHistoryFilter] = useState("all");
  const [inspected, setInspected] = useState<StaffVisit | null>(null);
  const [confirmNoShow, setConfirmNoShow] = useState<string | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [checklistTicket, setChecklistTicket] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [historyPage]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 10000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!user.department || preview) return;
    let active = true;
    fetchDepartment(user.department)
      .then((data) => {
        if (active) setOffice({ loading: false, data, error: "" });
      })
      .catch((reason: unknown) => {
        if (active)
          setOffice({
            loading: false,
            data: null,
            error:
              reason instanceof Error
                ? reason.message
                : "Unable to load your office.",
          });
      });
    return () => {
      active = false;
    };
  }, [user.department, preview, retry]);
  const officeName = demo
    ? "Academic Affairs Office"
    : office.data?.name ||
      (office.loading ? "Loading your office…" : "Your service office");
  const current = demo ? state.current : null;
  const waiting = demo ? state.waiting : [];
  const history = demo ? state.history : [];
  const paused = demo && state.paused;
  const matches = (visit: StaffVisit) =>
    `${visit.reference} ${visit.name} ${visit.studentId} ${visit.services.map((service) => service.name).join(" ")}`
      .toLowerCase()
      .includes(query.trim().toLowerCase());
  const visibleWaiting = waiting.filter(matches);
  const visibleHistory = history.filter(
    (visit) =>
      matches(visit) &&
      (historyFilter === "all" || visit.status === historyFilter),
  );
  const completed = history.filter(
    (visit) => visit.status === "completed",
  ).length;
  const isChecked = (name: string) =>
    checklistTicket === current?.id && checked.includes(name);
  function startDemo() {
    const time = Date.now();
    setNow(time);
    dispatch({ type: "reset", now: time });
    setChecked([]);
    setChecklistTicket(null);
    setQuery("");
    setDemo(true);
  }
  function resetDemo() {
    const time = Date.now();
    setNow(time);
    dispatch({ type: "reset", now: time });
    setChecked([]);
    setChecklistTicket(null);
    setQuery("");
    setHistoryFilter("all");
  }

  return (
    <div className="sw-app">
      <a href="#staff-content" className="sw-skip">
        Skip to workspace
      </a>
      <aside className="sw-sidebar">
        <Link to="/" className="sw-brand" aria-label="SmartQueue home">
          <img src={logo} alt="" />
          <span>
            Smart<span>Queue.</span>
            <small>STAFF WORKSPACE</small>
          </span>
        </Link>
        <div className="sw-office-mark">
          <span className="sw-office-icon">
            <Building2 size={22} />
          </span>
          <div>
            <small>YOUR OFFICE</small>
            <strong>{officeName}</strong>
          </div>
        </div>
        <p className="sw-nav-label">WORKSPACE</p>
        <nav aria-label="Staff navigation">
          <NavLink
            to={base}
            end
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <LayoutDashboard size={19} />
            Service desk
            <ChevronRight size={16} />
          </NavLink>
          <NavLink
            to={`${base}/history`}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            <History size={19} />
            Service history
          </NavLink>
        </nav>
        <div className="sw-sidebar-note">
          <span className="sw-note-symbol">
            <Users size={21} />
          </span>
          <strong>One queue. Shared care.</strong>
          <p>Every service in your office joins the same queue.</p>
          <span>
            Helping campus life move forward
            <ArrowUpRight size={15} />
          </span>
        </div>
        <div className="sw-sidebar-bottom">
          <Link to="/">
            <ArrowLeft size={16} />
            Student portal
          </Link>
          <span>HCMUTE · Student services</span>
        </div>
      </aside>

      <div className="sw-main-shell">
        <header className="sw-topbar">
          <div className="sw-breadcrumb">
            <Building2 size={17} />
            <span>Staff workspace</span>
            <ChevronRight size={14} />
            <strong>{historyPage ? "Service history" : "Service desk"}</strong>
          </div>
          <div className="sw-profile">
            <span className="sw-avatar">{initials(user.fullName)}</span>
            <div>
              <strong>{user.fullName}</strong>
              <small>{preview ? "Demo staff account" : "Service staff"}</small>
            </div>
            {preview ? (
              <Link
                to="/login"
                className="sw-icon-button"
                aria-label="Go to sign in"
              >
                <ArrowUpRight size={18} />
              </Link>
            ) : (
              <button
                type="button"
                className="sw-icon-button"
                aria-label="Sign out"
                onClick={clearSession}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </header>
        <main id="staff-content" tabIndex={-1} className="sw-main">
          <div className={`sw-mode-banner ${demo ? "demo" : ""}`}>
            <Info size={17} />
            <p>
              {demo ? (
                <>
                  <strong>Interactive demo</strong>
                  <span>
                    Sample visits only. Actions here do not affect real
                    students.
                  </span>
                </>
              ) : (
                <>
                  <strong>Workspace setup</strong>
                  <span>
                    Live staff service is not connected yet. Explore the
                    workflow with sample visits.
                  </span>
                </>
              )}
            </p>
            <div>
              {demo ? (
                <>
                  <button onClick={resetDemo}>
                    <RotateCcw size={14} />
                    Reset demo
                  </button>
                  {!preview && (
                    <button
                      onClick={() => {
                        setDemo(false);
                        setQuery("");
                      }}
                    >
                      Exit demo
                    </button>
                  )}
                </>
              ) : (
                <button onClick={startDemo}>
                  Explore demo
                  <ArrowRight size={15} />
                </button>
              )}
            </div>
          </div>
          <div className="sw-page-heading">
            <div>
              <p className="sw-eyebrow">
                A LITTLE LESS WAITING. A LITTLE MORE CARE.
              </p>
              <h1 ref={headingRef} tabIndex={-1}>
                {historyPage ? "Service history" : "Your service desk"}
                <span>.</span>
              </h1>
              <p>
                {historyPage
                  ? "A record of the visits you have handled."
                  : "A clear view of your queue. A little more focus on each student."}
              </p>
            </div>
            <div className="sw-date">
              <Clock3 size={17} />
              <span>
                {new Intl.DateTimeFormat("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  timeZone: "Asia/Ho_Chi_Minh",
                }).format(now)}
                <small>Vietnam time · {clockTime(now)}</small>
              </span>
            </div>
          </div>
          <section
            className="sw-office-strip"
            aria-label="Office and availability"
          >
            <div>
              <span className="sw-office-icon">
                <Building2 size={20} />
              </span>
              <div>
                <strong>{officeName}</strong>
                <span>
                  <MapPin size={13} />
                  {demo
                    ? "A1-201 / A1-202 · Demo office"
                    : office.data?.location ||
                      "Office details will appear here"}
                </span>
              </div>
            </div>
            <div className="sw-desk-state">
              <span
                className={`sw-state-dot ${demo && !paused ? "available" : ""}`}
              />
              <span>
                {demo
                  ? paused
                    ? "New calls paused"
                    : "Accepting next calls"
                  : "Live service unavailable"}
              </span>
              <button
                className="sw-button subtle"
                disabled={!demo}
                onClick={() => dispatch({ type: "pause" })}
              >
                {paused ? <Play size={15} /> : <Pause size={15} />}
                {paused ? "Resume" : "Pause calls"}
              </button>
            </div>
          </section>
          {!demo && (office.loading || office.error || !user.department) && (
            <div
              className="sw-office-feedback"
              role={office.error ? "alert" : "status"}
            >
              {office.loading ? (
                "Loading your assigned office…"
              ) : office.error ? (
                <>
                  {office.error}{" "}
                  <button
                    onClick={() => {
                      setOffice({ loading: true, data: null, error: "" });
                      setRetry((value) => value + 1);
                    }}
                  >
                    Try again
                  </button>
                </>
              ) : (
                "Your account has no assigned office. Please contact your administrator."
              )}
            </div>
          )}
          <section className="sw-stats" aria-label="Today at a glance">
            <div>
              <span className="sw-stat-icon blue">
                <Users size={21} />
              </span>
              <div>
                <span>Waiting in office</span>
                <strong>
                  {demo ? waiting.length.toString().padStart(2, "0") : "—"}
                </strong>
                <small>Shared office queue</small>
              </div>
            </div>
            <div>
              <span className="sw-stat-icon amber">
                <Radio size={21} />
              </span>
              <div>
                <span>Your current visit</span>
                <strong>{current?.reference || (demo ? "Ready" : "—")}</strong>
                <small>
                  {current
                    ? statusNames[current.status]
                    : demo
                      ? "No visit assigned"
                      : "Awaiting live connection"}
                </small>
              </div>
            </div>
            <div>
              <span className="sw-stat-icon green">
                <CheckCheck size={21} />
              </span>
              <div>
                <span>Completed by you</span>
                <strong>
                  {demo ? completed.toString().padStart(2, "0") : "—"}
                </strong>
                <small>{demo ? "Today · Demo session" : "Today"}</small>
              </div>
            </div>
          </section>
          <div className="sw-announcement" role="status" aria-live="polite">
            {demo && state.notice && (
              <>
                <CheckCircle2 size={17} />
                <span>{state.notice}</span>
              </>
            )}
          </div>
          {historyPage ? (
            <section className="sw-panel sw-history">
              <div className="sw-panel-header">
                <div>
                  <h2>Your recent visits</h2>
                  <p>Completed visits and students who missed their turn.</p>
                </div>
                <span className="sw-count">
                  {demo ? history.length : "—"} visits
                </span>
              </div>
              <div className="sw-history-tools">
                <label className="sw-search">
                  <Search size={17} />
                  <input
                    aria-label="Search service history"
                    placeholder="Search ticket, student or service…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <label className="sw-history-filter">
                  Status
                  <select
                    value={historyFilter}
                    onChange={(event) => setHistoryFilter(event.target.value)}
                  >
                    <option value="all">All statuses</option>
                    <option value="completed">Completed</option>
                    <option value="no_show">No-show</option>
                  </select>
                </label>
              </div>
              {!demo ? (
                <Unavailable onDemo={startDemo} />
              ) : visibleHistory.length ? (
                <div className="sw-table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Ticket / Student</th>
                        <th>Services</th>
                        <th>Finished at</th>
                        <th>Status</th>
                        <th>
                          <span className="sr-only">Details</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleHistory.map((visit) => (
                        <tr key={visit.id}>
                          <td>
                            <strong>{visit.reference}</strong>
                            <span>{visit.name}</span>
                          </td>
                          <td>
                            {visit.services
                              .map((service) => service.name)
                              .join(", ")}
                          </td>
                          <td>{clockTime(visit.finishedAt!)}</td>
                          <td>
                            <span className={`sw-badge ${visit.status}`}>
                              {statusNames[visit.status]}
                            </span>
                          </td>
                          <td>
                            <button
                              className="sw-icon-button"
                              aria-label={`View ${visit.reference}`}
                              onClick={() => setInspected(visit)}
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <Empty
                  title="No matching visits"
                  text="Try another search or choose a different status."
                />
              )}
            </section>
          ) : (
            <div className="sw-work-grid">
              <section className="sw-panel sw-queue-panel">
                <div className="sw-panel-header">
                  <div>
                    <div className="sw-section-title">
                      <h2>Office queue</h2>
                      <span className="sw-count">
                        {demo ? waiting.length : "—"}
                      </span>
                    </div>
                    <p>Next in line, across all services.</p>
                  </div>
                  <span className="sw-panel-icon">
                    <Users size={21} />
                  </span>
                </div>
                <label className="sw-search">
                  <Search size={17} />
                  <input
                    aria-label="Search office queue"
                    placeholder="Find a ticket or student…"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </label>
                <div className="sw-list-caption">
                  <span>STUDENT / SERVICE</span>
                  <span>WAITING</span>
                </div>
                <div className="sw-queue-list">
                  {!demo ? (
                    <Empty
                      title="Your queue will appear here"
                      text="Live visits become available when staff service is connected."
                    />
                  ) : visibleWaiting.length ? (
                    visibleWaiting.map((visit) => (
                      <button
                        key={visit.id}
                        className="sw-queue-row"
                        onClick={() => setInspected(visit)}
                        aria-label={`View ${visit.reference}, ${visit.name}`}
                      >
                        <span className="sw-ticket-code">
                          {visit.reference}
                          {visit.id === waiting[0]?.id && <small>NEXT</small>}
                        </span>
                        <span className="sw-queue-person">
                          <strong>{visit.name}</strong>
                          <span>
                            {visit.services[0].name}
                            {visit.services.length > 1
                              ? ` +${visit.services.length - 1}`
                              : ""}
                          </span>
                          {visit.notes && (
                            <small>
                              <MessageSquare size={11} />
                              Note attached
                            </small>
                          )}
                        </span>
                        <span className="sw-wait-time">
                          {minutesSince(visit.joinedAt, now)}
                          <small>min</small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <Empty
                      title={
                        waiting.length
                          ? "No matching students"
                          : "All caught up"
                      }
                      text={
                        waiting.length
                          ? "Try a ticket number, student name or service."
                          : "There are no students waiting in this demo."
                      }
                    />
                  )}
                </div>
                <div className="sw-queue-footer">
                  <ShieldCheck size={14} />
                  <span>One shared queue. Students are called in order.</span>
                </div>
              </section>
              <section
                className="sw-panel sw-visit-panel"
                aria-label="Current visit"
              >
                <div className="sw-panel-header">
                  <div>
                    <p className="sw-eyebrow">ONE STUDENT AT A TIME</p>
                    <h2>Current visit</h2>
                  </div>
                  <span className={`sw-badge ${current?.status || ""}`}>
                    {current
                      ? statusNames[current.status]
                      : demo
                        ? "Ready for next"
                        : "Not connected"}
                  </span>
                </div>
                {!demo ? (
                  <Unavailable onDemo={startDemo} />
                ) : current ? (
                  <>
                    <div className="sw-current-heading">
                      <div>
                        <small>TICKET NUMBER</small>
                        <strong>{current.reference}</strong>
                      </div>
                      <div className="sw-call-time">
                        <Clock3 size={15} />
                        <span>
                          {minutesSince(
                            current.startedAt || current.calledAt || now,
                            now,
                          )}{" "}
                          min
                          <small>
                            {current.status === "serving"
                              ? "in service"
                              : "since called"}
                          </small>
                        </span>
                      </div>
                    </div>
                    <ol className="sw-progress" aria-label="Visit progress">
                      {["Called", "In service", "Completed"].map(
                        (label, index) => (
                          <li
                            key={label}
                            aria-current={
                              (
                                current.status === "called"
                                  ? index === 0
                                  : index === 1
                              )
                                ? "step"
                                : undefined
                            }
                            className={
                              index <= (current.status === "called" ? 0 : 1)
                                ? "reached"
                                : ""
                            }
                          >
                            <span>
                              {index < (current.status === "called" ? 0 : 1) ? (
                                <Check size={12} />
                              ) : (
                                index + 1
                              )}
                            </span>
                            {label}
                          </li>
                        ),
                      )}
                    </ol>
                    <div className="sw-student">
                      <span className="sw-avatar">
                        {initials(current.name)}
                      </span>
                      <div>
                        <strong>{current.name}</strong>
                        <span>Student ID · {current.studentId}</span>
                      </div>
                      <UserRound size={18} />
                    </div>
                    <div className="sw-services-heading">
                      <h3>
                        Requested services{" "}
                        <span>({current.services.length})</span>
                      </h3>
                      <span>
                        ~
                        {current.services.reduce(
                          (sum, service) => sum + service.duration,
                          0,
                        )}{" "}
                        min total
                      </span>
                    </div>
                    <div className="sw-service-list">
                      {current.services.map((service) => (
                        <label
                          key={service.name}
                          className={isChecked(service.name) ? "done" : ""}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked(service.name)}
                            disabled={current.status !== "serving"}
                            onChange={() => {
                              const items =
                                checklistTicket === current.id ? checked : [];
                              setChecklistTicket(current.id);
                              setChecked(
                                items.includes(service.name)
                                  ? items.filter(
                                      (name) => name !== service.name,
                                    )
                                  : [...items, service.name],
                              );
                            }}
                          />
                          <span>{service.name}</span>
                          <small>~{service.duration} min</small>
                        </label>
                      ))}
                    </div>
                    <p className="sw-service-help">
                      {current.status === "called"
                        ? "Start service when the student arrives."
                        : "Use the checklist to keep track during this visit."}
                    </p>
                    {current.notes && (
                      <div className="sw-student-note">
                        <div>
                          <MessageSquare size={15} />
                          <strong>Student note</strong>
                        </div>
                        <p>{current.notes}</p>
                      </div>
                    )}
                    <div className="sw-visit-actions">
                      {current.status === "called" ? (
                        <>
                          <button
                            className="sw-button primary"
                            onClick={() =>
                              dispatch({ type: "start", now: Date.now() })
                            }
                          >
                            <Play size={17} />
                            Start service
                            <ArrowRight size={17} />
                          </button>
                          <div>
                            <button
                              className="sw-button secondary"
                              onClick={() =>
                                dispatch({ type: "recall", now: Date.now() })
                              }
                            >
                              <Volume2 size={16} />
                              Call again
                            </button>
                            <button
                              className="sw-button danger-quiet"
                              onClick={() => setConfirmNoShow(current.id)}
                            >
                              Mark no-show
                            </button>
                          </div>
                        </>
                      ) : (
                        <button
                          className="sw-button primary"
                          onClick={() =>
                            dispatch({ type: "complete", now: Date.now() })
                          }
                        >
                          <CheckCheck size={18} />
                          Complete visit
                          <ArrowRight size={17} />
                        </button>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="sw-ready">
                    <span className="sw-ready-icon">
                      <Ticket size={34} />
                    </span>
                    <h3>
                      {paused
                        ? "Take a moment."
                        : waiting.length
                          ? "Ready for the next student?"
                          : "A little breathing room."}
                    </h3>
                    <p>
                      {paused
                        ? "Resume new calls when you are ready. Your office queue stays in order."
                        : waiting.length
                          ? `${waiting[0].reference} is next in your office queue.`
                          : "You have reached the end of the demo queue. Reset the demo to explore again."}
                    </p>
                    <button
                      className="sw-button primary"
                      disabled={paused || !waiting.length}
                      onClick={() =>
                        dispatch({ type: "call", now: Date.now() })
                      }
                    >
                      <Volume2 size={18} />
                      Call next
                      <ArrowRight size={17} />
                    </button>
                    {paused && (
                      <button
                        className="sw-button secondary"
                        onClick={() => dispatch({ type: "pause" })}
                      >
                        <Play size={16} />
                        Resume calls
                      </button>
                    )}
                  </div>
                )}
              </section>
            </div>
          )}
          <footer className="sw-work-footer">
            <span>
              <span className="sw-state-dot" />
              {demo
                ? "Demo session · Changes reset on reload"
                : "Live service not connected"}
            </span>
            <span>Small moments. Better campus days.</span>
          </footer>
        </main>
      </div>
      {inspected && (
        <Dialog
          title={`Visit details · ${inspected.reference}`}
          onClose={() => setInspected(null)}
        >
          <div className="sw-dialog-body">
            <span className={`sw-badge ${inspected.status}`}>
              {statusNames[inspected.status]}
            </span>
            <h3>{inspected.name}</h3>
            <p>Student ID · {inspected.studentId}</p>
            <h4>Requested services</h4>
            <ul>
              {inspected.services.map((service) => (
                <li key={service.name}>
                  {service.name}
                  <span>~{service.duration} min</span>
                </li>
              ))}
            </ul>
            <h4>Student note</h4>
            <p>{inspected.notes || "No additional notes."}</p>
            <p className="sw-dialog-hint">
              {inspected.status === "waiting"
                ? "Use Call next at the service desk to take the next student in order."
                : "This visit is part of your demo session."}
            </p>
            <button
              className="sw-button secondary"
              onClick={() => setInspected(null)}
            >
              Close details
            </button>
          </div>
        </Dialog>
      )}
      {confirmNoShow && (
        <Dialog
          title="Mark this student as no-show?"
          onClose={() => setConfirmNoShow(null)}
        >
          <div className="sw-dialog-body">
            <p>
              {current?.reference} will leave your current visit and move to
              service history. You can call again if the student needs a moment.
            </p>
            <div className="sw-dialog-actions">
              <button
                className="sw-button secondary"
                onClick={() => setConfirmNoShow(null)}
              >
                Keep visit
              </button>
              <button
                className="sw-button destructive"
                onClick={() => {
                  if (current?.id === confirmNoShow)
                    dispatch({ type: "no_show", now: Date.now() });
                  setConfirmNoShow(null);
                }}
              >
                Mark no-show
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="sw-empty">
      <Users size={27} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
function Unavailable({ onDemo }: { onDemo: () => void }) {
  return (
    <div className="sw-ready">
      <span className="sw-ready-icon">
        <WifiOff size={30} />
      </span>
      <h3>Your desk is taking shape.</h3>
      <p>
        Live calling and service updates are not available yet. Try the demo to
        explore your new workspace.
      </p>
      <button className="sw-button primary" onClick={onDemo}>
        Explore demo
        <ArrowRight size={17} />
      </button>
    </div>
  );
}
