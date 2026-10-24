import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import AppDialog from "../components/AppDialog";
import { adminApi } from "../services/admin";
import type { Account } from "../services/admin";

type DepartmentOption = { id: string; name: string; isActive: boolean };
type DialogProps = { onClose: () => void; onSaved: (message: string) => void };

export default function AdminUserForm({ account, onClose, onSaved }: DialogProps & { account: Account | null }) {
  const [form, setForm] = useState({
    fullName: account?.fullName || "", email: account?.email || "",
    role: account?.role || "student", studentID: account?.studentID || "",
    phone: account?.phone || "", department: account?.department?._id || "",
    password: "", confirmation: "",
  });
  const [departments, setDepartments] = useState<DepartmentOption[]>([]);
  const [departmentLoading, setDepartmentLoading] = useState(true);
  const [departmentError, setDepartmentError] = useState("");
  const [retry, setRetry] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (key: keyof typeof form, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    const controller = new AbortController();
    adminApi<{ departments: DepartmentOption[] }>("/departments", { signal: controller.signal })
      .then((data) => { if (!controller.signal.aborted) { setDepartments(data.departments); setDepartmentError(""); } })
      .catch((err) => { if (!controller.signal.aborted) setDepartmentError(err instanceof Error ? err.message : "Unable to load departments."); })
      .finally(() => { if (!controller.signal.aborted) setDepartmentLoading(false); });
    return () => controller.abort();
  }, [retry]);

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!account && (form.password !== form.confirmation || new TextEncoder().encode(form.password).length > 72)) {
      setError("Enter matching passwords with at most 72 UTF-8 bytes.");
      return;
    }
    setBusy(true);
    try {
      const { password, confirmation, ...profile } = form;
      const result = await adminApi<{ message: string }>(account ? `/users/${account._id}` : "/users", {
        method: account ? "PUT" : "POST",
        body: JSON.stringify({ ...profile, ...(account ? { updatedAt: account.updatedAt } : { password, confirmation }) }),
      });
      onSaved(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save this account.");
    } finally { setBusy(false); }
  }

  const availableDepartments = departments.filter((department) => department.isActive || department.id === account?.department?._id);
  return <AppDialog title={account ? "Edit account" : "Add account"} onClose={onClose} busy={busy} wide>
    <form onSubmit={submit}>
      <fieldset disabled={busy} className="aw-user-fields">
        <div className="aw-department-fields">
          <div><label htmlFor="user-name">Full name</label><input id="user-name" autoComplete="name" required maxLength={120} value={form.fullName} onChange={(e) => set("fullName", e.target.value)} /></div>
          <div><label htmlFor="user-email">Email</label><input id="user-email" type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
          <div><label htmlFor="user-role">Role</label><select id="user-role" value={form.role} onChange={(e) => set("role", e.target.value)}><option value="student">Student</option><option value="staff">Staff</option></select></div>
          <div><label htmlFor="user-phone">Phone (optional)</label><input id="user-phone" type="tel" autoComplete="tel" maxLength={32} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
        </div>
        {form.role === "student" ? <><label htmlFor="user-student-id">Student ID</label><input id="user-student-id" required maxLength={40} value={form.studentID} onChange={(e) => set("studentID", e.target.value)} /></> : <>
          <label htmlFor="user-department">Assigned department</label>
          <select id="user-department" required disabled={departmentLoading || !!departmentError} value={form.department} onChange={(e) => set("department", e.target.value)}>
            <option value="">{departmentLoading ? "Loading departments…" : "Select a department"}</option>
            {account?.department && !availableDepartments.some((department) => department.id === account.department?._id) && <option value={account.department._id} disabled>{account.department.name} (unavailable)</option>}
            {availableDepartments.map((department) => <option key={department.id} value={department.id}>{department.name}{department.isActive ? "" : " (inactive)"}</option>)}
          </select>
          {departmentError ? <div className="sq-notice sq-error aw-user-notice" role="alert"><p>{departmentError}</p><button type="button" className="sq-button" onClick={() => { setDepartmentLoading(true); setRetry((value) => value + 1); }}>Retry departments</button></div>
            : !departmentLoading && !availableDepartments.length && <p className="sq-help">Add an active department in Departments before creating a staff account.</p>}
        </>}
        {!account && <>
          <label htmlFor="user-password">Initial password</label>
          <div className="sq-password-field"><input id="user-password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={72} value={form.password} onChange={(e) => set("password", e.target.value)} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          <label htmlFor="user-confirmation">Confirm password</label><input id="user-confirmation" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={8} maxLength={72} value={form.confirmation} onChange={(e) => set("confirmation", e.target.value)} />
          <p className="sq-help">Use at least 8 characters. Give the initial password directly to the account owner.</p>
        </>}
      </fieldset>
      {account && <p className="sq-notice aw-user-notice">Saving signs this user out so their profile and permissions refresh at the next sign-in. Password changes are handled in Password Requests.</p>}
      {error && <p className="sq-notice sq-error aw-user-notice" role="alert">{error}</p>}
      <div className="sq-dialog-actions"><button type="button" className="sq-button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="sq-button sq-button-primary" disabled={busy || (form.role === "staff" && (departmentLoading || !!departmentError || !availableDepartments.some((department) => department.id === form.department)))}>{busy ? "Saving…" : account ? "Save changes" : "Create account"}</button></div>
    </form>
  </AppDialog>;
}

export function UserStatusDialog({ account, onClose, onSaved }: DialogProps & { account: Account }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await adminApi<{ message: string }>(`/users/${account._id}/status`, {
        method: "PATCH", body: JSON.stringify({ isActive: !account.isActive, updatedAt: account.updatedAt }),
      });
      onSaved(result.message);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to change account status."); }
    finally { setBusy(false); }
  }
  return <AppDialog title={account.isActive ? "Disable account" : "Enable account"} onClose={onClose} busy={busy}>
    <p>{account.isActive ? "Disable" : "Enable"} <strong>{account.fullName}</strong> ({account.email})?</p>
    <p className="sq-help">{account.isActive ? "The user will be signed out and cannot sign in until an administrator enables their account. Their queue, appointment and request history will be kept." : "The user can sign in again with their existing password. Old sessions will remain invalid."}</p>
    {error && <p className="sq-notice sq-error aw-user-notice" role="alert">{error}</p>}
    <div className="sq-dialog-actions"><button className="sq-button" onClick={onClose} disabled={busy}>Cancel</button><button className={`sq-button ${account.isActive ? "sq-button-danger" : "sq-button-primary"}`} onClick={() => void submit()} disabled={busy}>{busy ? "Saving…" : account.isActive ? "Disable account" : "Enable account"}</button></div>
  </AppDialog>;
}
