import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { Link, Navigate, NavLink, useLocation } from "react-router";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Eye,
  EyeOff,
  GraduationCap,
  History,
  Inbox,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import logo from "../assets/hcmute-logo.png";
import {
  clearSession,
  readSession,
  SESSION_CHANGED_EVENT,
} from "../services/session";
import { adminApi } from "../services/admin";
import type {
  Account,
  AdminSummary,
  Page,
  PasswordRequest,
} from "../services/admin";
import AppDialog from "../components/AppDialog";
import "../styles/admin.css";

const links = [
  { path: "/admin", label: "Overview", icon: LayoutDashboard },
  { path: "/admin/users", label: "User Management", icon: Users },
  { path: "/admin/requests", label: "Password Requests", icon: KeyRound },
  { path: "/admin/activity", label: "Activity Log", icon: History },
];
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Ho_Chi_Minh",
      }).format(new Date(value))
    : "—";
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((s) => s[0])
    .join("");
function Badge({ status }: { status: string }) {
  return (
    <span className={`aw-badge aw-${status}`}>
      {status === "pending" ? (
        <Clock3 size={12} />
      ) : status === "completed" ? (
        <CheckCircle2 size={12} />
      ) : null}
      {status}
    </span>
  );
}

function RequestReview({
  request,
  onClose,
  onDone,
}: {
  request: PasswordRequest;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [mode, setMode] = useState<"reset" | "reject">("reset");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [verified, setVerified] = useState(false);
  const [show, setShow] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (mode === "reset" && password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    if (mode === "reset" && new TextEncoder().encode(password).length > 72) {
      setError("Password must be no more than 72 UTF-8 bytes.");
      return;
    }
    setBusy(true);
    try {
      const result = await adminApi<{ message: string }>(
        `/requests/${request._id}/resolve`,
        {
          method: "POST",
          body: JSON.stringify({
            action: mode,
            password,
            confirmation,
            verified,
            reason,
          }),
        },
      );
      setPassword("");
      setConfirmation("");
      onDone(result.message);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to resolve this request.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppDialog
      title={
        request.status === "pending"
          ? "Review password request"
          : "Request details"
      }
      onClose={onClose}
      busy={busy}
      wide
    >
      <div className="aw-person aw-review-person">
        <span className="aw-avatar">{initials(request.fullName)}</span>
        <div>
          <strong>{request.fullName}</strong>
          <small>{request.email}</small>
        </div>
        <Badge status={request.status} />
      </div>
      <dl className="aw-details">
        <div>
          <dt>Role / account</dt>
          <dd>
            {request.role} · {request.isActive ? "Active" : "Disabled"}
          </dd>
        </div>
        <div>
          <dt>{request.role === "student" ? "Student ID" : "Department"}</dt>
          <dd>
            {request.role === "student"
              ? request.studentID || "Not provided"
              : request.department || "Not assigned"}
          </dd>
        </div>
        <div>
          <dt>Registered phone</dt>
          <dd>{request.phone || "Not provided"}</dd>
        </div>
        <div>
          <dt>Requested (ICT)</dt>
          <dd>{date(request.createdAt)}</dd>
        </div>
      </dl>
      <div className="aw-request-note">
        <small>REQUEST NOTE</small>
        <p>{request.note || "No note provided."}</p>
      </div>
      {request.status !== "pending" ? (
        <div className="sq-notice mt-5">
          <p>
            {request.status === "completed"
              ? "Password reset"
              : "Request rejected"}{" "}
            by <strong>{request.resolvedByName}</strong>
          </p>
          <p>{date(request.resolvedAt)} (ICT)</p>
          {request.reason && <p>Reason: {request.reason}</p>}
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="aw-choice" aria-label="Resolution action">
            <button
              type="button"
              disabled={busy}
              aria-pressed={mode === "reset"}
              onClick={() => {
                setMode("reset");
                setError("");
              }}
            >
              Reset password
            </button>
            <button
              type="button"
              disabled={busy}
              aria-pressed={mode === "reject"}
              onClick={() => {
                setMode("reject");
                setPassword("");
                setConfirmation("");
                setError("");
              }}
            >
              Reject request
            </button>
          </div>
          {mode === "reset" ? (
            <>
              <label className="sq-check">
                <input
                  type="checkbox"
                  required
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                I verified this account owner in person or through their
                registered contact information.
              </label>
              {!request.isActive && (
                <p className="sq-notice sq-error">
                  This account is disabled. You can reject this request.
                </p>
              )}
              <label htmlFor="admin-new-password">New password</label>
              <div className="sq-password-field">
                <input
                  id="admin-new-password"
                  type={show ? "text" : "password"}
                  required
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-describedby="password-rules"
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="sq-help" id="password-rules">
                At least 8 characters; at most 72 UTF-8 bytes.
              </p>
              <label htmlFor="admin-confirm-password">
                Confirm new password
              </label>
              <input
                id="admin-confirm-password"
                type={show ? "text" : "password"}
                required
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
              <p className="sq-help mt-4">
                Existing sessions will expire. Give the new password to the
                verified owner in person; it will not be emailed or stored in
                the activity log.
              </p>
            </>
          ) : (
            <>
              <label htmlFor="reject-reason">Reason for rejection</label>
              <textarea
                id="reject-reason"
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain why this request cannot be approved."
              />
              <p className="sq-help">
                This reason is recorded in the admin activity log.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="sq-notice sq-error mt-4">
              {error}
            </p>
          )}
          <div className="sq-dialog-actions">
            <button
              type="button"
              className="sq-button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className={`sq-button ${mode === "reset" ? "sq-button-primary" : "sq-button-danger"}`}
              disabled={
                busy || (mode === "reset" && (!verified || !request.isActive))
              }
            >
              {busy
                ? "Saving…"
                : mode === "reset"
                  ? "Reset password"
                  : "Confirm rejection"}
            </button>
          </div>
        </form>
      )}
    </AppDialog>
  );
}

function UserDetails({
  account,
  onClose,
}: {
  account: Account;
  onClose: () => void;
}) {
  return (
    <AppDialog title="Account details" onClose={onClose}>
      <div className="aw-person">
        <span className="aw-avatar">{initials(account.fullName)}</span>
        <div>
          <strong>{account.fullName}</strong>
          <small>{account.email}</small>
        </div>
      </div>
      <dl className="aw-details">
        <div>
          <dt>Role</dt>
          <dd>{account.role}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{account.isActive ? "Active" : "Disabled"}</dd>
        </div>
        <div>
          <dt>Student ID</dt>
          <dd>{account.studentID || "—"}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{account.department?.name || "—"}</dd>
        </div>
        <div>
          <dt>Phone</dt>
          <dd>{account.phone || "—"}</dd>
        </div>
        <div>
          <dt>Created (ICT)</dt>
          <dd>{date(account.createdAt)}</dd>
        </div>
      </dl>
      <p className="sq-notice">
        To reset this account’s password, review its pending request in Password
        Requests.
      </p>
      <div className="sq-dialog-actions">
        <button className="sq-button" onClick={onClose}>
          Close
        </button>
      </div>
    </AppDialog>
  );
}

function AdminPage({ name }: { name: string }) {
  const session = readSession()!;
  const [summary, setSummary] = useState<AdminSummary | null>(null);
  const [requests, setRequests] = useState<Page<PasswordRequest> | null>(null);
  const [users, setUsers] = useState<Page<Account> | null>(null);
  const [activity, setActivity] = useState<PasswordRequest[]>([]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("pending");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [selected, setSelected] = useState<PasswordRequest | null>(null);
  const [account, setAccount] = useState<Account | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const isOverview = name === "Overview";
  const isUsers = name === "User Management";
  const isActivity = name === "Activity Log";
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load(showLoading = true) {
      if (inFlight) return;
      inFlight = true;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(page),
          search: query,
        });
        if (isUsers) params.set("role", role);
        else if (isActivity) params.set("activity", "true");
        else params.set("status", isOverview ? "pending" : status);
        const [counts, list, recent] = await Promise.all([
          adminApi<AdminSummary>("/summary", { signal: controller.signal }),
          adminApi<Page<Account> | Page<PasswordRequest>>(
            `/${isUsers ? "users" : "requests"}?${params}`,
            { signal: controller.signal },
          ),
          isOverview
            ? adminApi<Page<PasswordRequest>>("/requests?activity=true", {
                signal: controller.signal,
              })
            : Promise.resolve(null),
        ]);
        if (controller.signal.aborted) return;
        const lastPage = Math.max(1, Math.ceil(list.total / list.pageSize));
        if (page > lastPage) {
          setPage(lastPage);
          return;
        }
        setSummary(counts);
        if (isUsers) setUsers(list as Page<Account>);
        else setRequests(list as Page<PasswordRequest>);
        setActivity(recent?.items.slice(0, 4) || []);
        setUpdatedAt(new Date().toISOString());
      } catch (err) {
        if (!controller.signal.aborted)
          setError(err instanceof Error ? err.message : "Unable to load data.");
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(false);
    }, 30000);
    return () => {
      controller.abort();
      window.clearInterval(interval);
    };
  }, [isOverview, isUsers, isActivity, query, page, role, status, refresh]);
  const result = isUsers ? users : requests;
  const descriptions: Record<string, string> = {
    Overview: "A clear view of accounts and requests that need your attention.",
    "User Management":
      "Find student and staff accounts across your university.",
    "Password Requests":
      "Verify account owners and help them get back to their work.",
    "Activity Log":
      "A record of password requests resolved by your admin team.",
  };
  return (
    <div className="aw-app">
      <a className="aw-skip" href="#admin-content">
        Skip to content
      </a>
      {menuOpen && (
        <button
          className="aw-menu-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`aw-sidebar ${menuOpen ? "aw-sidebar-open" : ""}`}>
        <Link to="/admin" className="aw-brand">
          <img src={logo} alt="HCMUTE" />
          <span>
            Smart<span>Queue.</span>
            <small>UNIVERSITY SERVICES</small>
          </span>
        </Link>
        <div className="aw-workspace">
          <ShieldCheck size={22} />
          <div>
            <strong>Admin workspace</strong>
            <small>System administration</small>
          </div>
        </div>
        <p className="aw-nav-label">WORKSPACE</p>
        <nav aria-label="Admin navigation">
          {links.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end
              onClick={() => setMenuOpen(false)}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {item.path === "/admin/requests" &&
                summary &&
                summary.pending > 0 && (
                  <b aria-label={`${summary.pending} pending requests`}>
                    {summary.pending}
                  </b>
                )}
            </NavLink>
          ))}
        </nav>
        <div className="aw-sidebar-bottom">
          <div className="aw-secure-note">
            <ShieldCheck size={19} />
            <strong>Account care, in one place.</strong>
            <p>Verify each request before restoring access.</p>
          </div>
          <Link to="/" className="aw-back">
            <ArrowDownLeft size={17} />
            Back to SmartQueue
          </Link>
          <button className="aw-signout" onClick={clearSession}>
            <LogOut size={17} />
            Sign out
          </button>
        </div>
      </aside>
      <div className="aw-main">
        <header className="aw-topbar">
          <div className="aw-breadcrumb">
            <button
              className="aw-menu"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {menuOpen ? <X size={21} /> : <Menu size={21} />}
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{name}</strong>
          </div>
          <div className="aw-admin-profile">
            <div>
              <strong>{session.user.fullName}</strong>
              <small>Administrator</small>
            </div>
            <span className="aw-avatar aw-admin-avatar">
              {initials(session.user.fullName)}
            </span>
          </div>
        </header>
        <main id="admin-content" tabIndex={-1} className="aw-content">
          <div className="aw-page-heading">
            <div>
              <p className="aw-eyebrow">
                ADMINISTRATION /{" "}
                {isOverview ? "AT A GLANCE" : name.toUpperCase()}
              </p>
              <h1>{isOverview ? "Your workspace, at a glance." : name}</h1>
              <p>{descriptions[name]}</p>
            </div>
            <button
              className="sq-button"
              disabled={loading}
              onClick={() => setRefresh((v) => v + 1)}
            >
              <RefreshCw size={15} />
              {loading ? "Updating…" : "Refresh"}
            </button>
          </div>
          {message && (
            <div className="sq-notice sq-success aw-feedback" role="status">
              <span>{message}</span>
              <button
                aria-label="Dismiss notification"
                onClick={() => setMessage("")}
              >
                <X size={18} />
              </button>
            </div>
          )}
          {error && (
            <div className="sq-notice sq-error aw-feedback" role="alert">
              <span>{error}</span>
              <button
                className="sq-button"
                onClick={() => setRefresh((v) => v + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {isOverview && (
            <>
              <div className="aw-welcome">
                <div>
                  <span className="aw-welcome-tag">
                    <span />
                    ADMIN CONTROL CENTER
                  </span>
                  <h2>Keep your campus connected.</h2>
                  <p>
                    Manage accounts, review access requests, and help your
                    university get back on track.
                  </p>
                  <Link to="/admin/requests">
                    Review password requests <ArrowRight size={17} />
                  </Link>
                </div>
                <div className="aw-welcome-art" aria-hidden="true">
                  <div className="aw-orbit">
                    <ShieldCheck size={62} strokeWidth={1.3} />
                  </div>
                  <span className="aw-art-key">
                    <KeyRound size={22} />
                  </span>
                  <span className="aw-art-check">
                    <CheckCircle2 size={23} />
                  </span>
                </div>
              </div>
              <div className="aw-stats">
                {[
                  {
                    label: "Student accounts",
                    value: summary?.students,
                    icon: GraduationCap,
                    helper: "Registered across campus",
                    className: "blue",
                  },
                  {
                    label: "Staff accounts",
                    value: summary?.staff,
                    icon: Users,
                    helper: "University service team",
                    className: "purple",
                  },
                  {
                    label: "Pending requests",
                    value: summary?.pending,
                    icon: KeyRound,
                    helper: "Waiting for admin review",
                    className: "amber",
                  },
                  {
                    label: "Requests completed",
                    value: summary?.completed,
                    icon: CheckCircle2,
                    helper: "Access successfully restored",
                    className: "green",
                  },
                ].map((stat) => (
                  <article className="aw-stat" key={stat.label}>
                    <div>
                      <span>{stat.label}</span>
                      <span
                        className={`aw-stat-icon aw-icon-${stat.className}`}
                      >
                        <stat.icon size={21} />
                      </span>
                    </div>
                    <strong>{stat.value?.toLocaleString() ?? "—"}</strong>
                    <small>{stat.helper}</small>
                  </article>
                ))}
              </div>
            </>
          )}
          <div className={isOverview ? "aw-overview-grid" : ""}>
            <section className="aw-panel" aria-busy={loading}>
              <div className="aw-panel-heading">
                <div>
                  <h2>
                    {isOverview
                      ? "Requests needing attention"
                      : isUsers
                        ? "University accounts"
                        : isActivity
                          ? "Resolution history"
                          : "Recovery inbox"}
                    {result && <span className="aw-count">{result.total}</span>}
                  </h2>
                  <p>
                    {isOverview
                      ? "Review pending requests and restore account access."
                      : isActivity
                        ? "All times are shown in Indochina Time (UTC+7)."
                        : "Search by name, email, or student ID."}
                  </p>
                </div>
                {isOverview && (
                  <Link to="/admin/requests" className="aw-text-link">
                    View all <ArrowUpRight size={16} />
                  </Link>
                )}
              </div>
              {!isOverview && (
                <div className="aw-filters">
                  <div className="aw-search">
                    <Search size={17} />
                    <input
                      aria-label="Search accounts or requests"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search name, email, student ID…"
                    />
                    {search && (
                      <button
                        aria-label="Clear search"
                        onClick={() => setSearch("")}
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  {isUsers ? (
                    <select
                      aria-label="Filter by role"
                      value={role}
                      onChange={(e) => {
                        setRole(e.target.value);
                        setPage(1);
                      }}
                    >
                      <option value="">All roles</option>
                      <option value="student">Students</option>
                      <option value="staff">Staff</option>
                    </select>
                  ) : (
                    !isActivity && (
                      <div
                        className="aw-status-tabs"
                        aria-label="Filter requests by status"
                      >
                        {["pending", "completed", "rejected"].map((s) => (
                          <button
                            key={s}
                            aria-pressed={status === s}
                            onClick={() => {
                              setStatus(s);
                              setPage(1);
                            }}
                          >
                            {s}
                            <span>
                              {summary?.[
                                s as "pending" | "completed" | "rejected"
                              ] ?? "—"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              )}
              {loading ? (
                <div className="aw-loading" role="status">
                  <RefreshCw size={23} />
                  <p>Loading your workspace…</p>
                </div>
              ) : error ? (
                <div className="aw-empty">
                  <Inbox size={30} />
                  <h3>Data is unavailable</h3>
                  <p>Use Try again above to reload this view.</p>
                </div>
              ) : !result?.items.length ? (
                <div className="aw-empty">
                  <span>
                    <Inbox size={29} />
                  </span>
                  <h3>
                    {query
                      ? "No matching results"
                      : isUsers
                        ? "No accounts yet"
                        : isActivity
                          ? "No activity yet"
                          : status === "pending" || isOverview
                            ? "You’re all caught up"
                            : "No requests here yet"}
                  </h3>
                  <p>
                    {query
                      ? "Try another name, email, or student ID."
                      : isActivity
                        ? "Resolved requests will appear here with the admin and time."
                        : "Requests from the sign-in page will appear in this inbox."}
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="aw-table-scroll"
                    tabIndex={0}
                    role="region"
                    aria-label={
                      isUsers ? "Accounts table" : "Password requests table"
                    }
                  >
                    <table className="aw-table">
                      <thead>
                        <tr>
                          <th>Account</th>
                          <th>Role</th>
                          {isUsers ? (
                            <>
                              <th>Student ID / Department</th>
                              <th>Status</th>
                            </>
                          ) : (
                            <>
                              <th>
                                {isActivity
                                  ? "Resolved (ICT)"
                                  : "Requested (ICT)"}
                              </th>
                              <th>{isActivity ? "Handled by" : "Status"}</th>
                            </>
                          )}
                          <th>
                            <span className="sr-only">Actions</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {isUsers
                          ? users?.items.map((user) => (
                              <tr key={user._id}>
                                <td>
                                  <Person account={user} />
                                </td>
                                <td>
                                  <Badge status={user.role} />
                                </td>
                                <td>
                                  {user.role === "student"
                                    ? user.studentID || "—"
                                    : user.department?.name || "Not assigned"}
                                </td>
                                <td>
                                  <Badge
                                    status={
                                      user.isActive ? "active" : "disabled"
                                    }
                                  />
                                </td>
                                <td>
                                  <button
                                    className="aw-row-action"
                                    onClick={() => setAccount(user)}
                                  >
                                    Details <ChevronRight size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))
                          : (isOverview
                              ? requests?.items.slice(0, 5)
                              : requests?.items
                            )?.map((request) => (
                              <tr key={request._id}>
                                <td>
                                  <Person account={request} />
                                </td>
                                <td>
                                  <Badge status={request.role} />
                                </td>
                                <td className="aw-date">
                                  {date(
                                    isActivity
                                      ? request.resolvedAt
                                      : request.createdAt,
                                  )}
                                </td>
                                <td>
                                  {isActivity ? (
                                    <div className="aw-handler">
                                      <span>{request.resolvedByName}</span>
                                      <Badge status={request.status} />
                                    </div>
                                  ) : (
                                    <Badge status={request.status} />
                                  )}
                                </td>
                                <td>
                                  <button
                                    className="aw-row-action"
                                    onClick={() => setSelected(request)}
                                  >
                                    {request.status === "pending"
                                      ? "Review"
                                      : "Details"}
                                    <ChevronRight size={14} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                      </tbody>
                    </table>
                  </div>
                  {!isOverview && result && (
                    <div className="aw-pagination">
                      <span>
                        {(page - 1) * result.pageSize + 1}–
                        {Math.min(page * result.pageSize, result.total)} of{" "}
                        {result.total}
                      </span>
                      <div>
                        <button
                          aria-label="Previous page"
                          disabled={page <= 1}
                          onClick={() => setPage((p) => p - 1)}
                        >
                          <ChevronLeft size={17} />
                        </button>
                        <span>Page {page}</span>
                        <button
                          aria-label="Next page"
                          disabled={page * result.pageSize >= result.total}
                          onClick={() => setPage((p) => p + 1)}
                        >
                          <ChevronRight size={17} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
            {isOverview && (
              <aside className="aw-overview-side">
                <section className="aw-panel aw-activity">
                  <div className="aw-panel-heading">
                    <div>
                      <h2>Recent activity</h2>
                      <p>The latest account updates</p>
                    </div>
                    <History size={19} />
                  </div>
                  {activity.length ? (
                    <ul>
                      {activity.map((item) => (
                        <li key={item._id}>
                          <span className={`aw-activity-dot aw-${item.status}`}>
                            <CheckCircle2 size={15} />
                          </span>
                          <div>
                            <strong>
                              {item.status === "completed"
                                ? "Password reset"
                                : "Request rejected"}
                            </strong>
                            <p>{item.fullName}</p>
                            <small>
                              {item.resolvedByName} · {date(item.resolvedAt)}
                            </small>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="aw-activity-empty">
                      <History size={26} />
                      <p>
                        {loading
                          ? "Loading activity…"
                          : error
                            ? "Activity is unavailable."
                            : "Your team’s resolved requests will appear here."}
                      </p>
                    </div>
                  )}
                  <Link to="/admin/activity" className="aw-activity-link">
                    View activity log <ArrowRight size={15} />
                  </Link>
                </section>
                <div className="aw-reminder">
                  <ShieldCheck size={24} />
                  <h3>A quick identity check.</h3>
                  <p>
                    Confirm the account owner using their registered details
                    before setting a new password.
                  </p>
                </div>
              </aside>
            )}
          </div>
          <footer className="aw-footer">
            <span>HCMUTE · SmartQueue administration</span>
            <span>
              {updatedAt
                ? `Last updated ${date(updatedAt)} (ICT)`
                : "Connecting to account services"}
            </span>
          </footer>
        </main>
      </div>
      {selected && (
        <RequestReview
          request={selected}
          onClose={() => setSelected(null)}
          onDone={(text) => {
            setSelected(null);
            setMessage(text);
            setRefresh((v) => v + 1);
          }}
        />
      )}
      {account && (
        <UserDetails account={account} onClose={() => setAccount(null)} />
      )}
    </div>
  );
}
function Person({ account }: { account: Account | PasswordRequest }) {
  return (
    <div className="aw-person">
      <span
        className={`aw-avatar ${account.role === "staff" ? "aw-avatar-staff" : ""}`}
      >
        {initials(account.fullName)}
      </span>
      <div>
        <strong>{account.fullName}</strong>
        <small>{account.email}</small>
      </div>
    </div>
  );
}
export default function AdminWorkspace() {
  const location = useLocation();
  const [session, setSession] = useState(readSession);
  useEffect(() => {
    const update = () => setSession(readSession());
    window.addEventListener(SESSION_CHANGED_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);
  if (!session)
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname)}`}
        replace
      />
    );
  if (session.user.role !== "admin")
    return (
      <div className="aw-access">
        <ShieldCheck size={40} />
        <h1>Admin access required</h1>
        <p>Sign in with an administrator account to open this workspace.</p>
        <Link
          className="sq-button sq-button-primary"
          to="/login?redirect=/admin"
        >
          Sign in as admin
        </Link>
        <Link
          className="sq-button"
          to={session.user.role === "staff" ? "/staff" : "/queue"}
        >
          Back to my workspace
        </Link>
      </div>
    );
  const match = links.find((item) => item.path === location.pathname);
  if (!match) return <Navigate to="/admin" replace />;
  return <AdminPage key={location.pathname} name={match.label} />;
}
