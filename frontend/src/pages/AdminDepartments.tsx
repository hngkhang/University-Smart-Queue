import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { Building2, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import AppDialog from "../components/AppDialog";
import { adminApi } from "../services/admin";

type Service = { name: string; estimatedDuration: number; description?: string };
type Department = {
  id: string;
  name: string;
  vietnameseName: string;
  description: string;
  location: string;
  workingHours: string;
  isActive: boolean;
  bookingEnabled: boolean;
  bookingWeekdays: number[];
  bookingExcludedDates: string[];
  services: Service[];
};
const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const empty = (): Department => ({
  id: "", name: "", vietnameseName: "", description: "", location: "",
  workingHours: "07:30 - 11:30 | 13:00 - 16:30", isActive: true,
  bookingEnabled: true, bookingWeekdays: [1, 2, 3, 4, 5],
  bookingExcludedDates: [], services: [],
});

function DepartmentForm({ department, onClose, onSaved }: {
  department: Department;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [form, setForm] = useState(() => ({ ...department, services: department.services.map((s) => ({ ...s })) }));
  const [excluded, setExcluded] = useState(department.bookingExcludedDates.join(", "));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = <K extends keyof Department>(key: K, value: Department[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const bookingExcludedDates = excluded.split(",").map((item) => item.trim()).filter(Boolean);
    if (form.services.some((service) => !service.name.trim() || !Number.isInteger(service.estimatedDuration) || service.estimatedDuration < 1)) {
      setError("Enter a name and a positive whole number of minutes for each service.");
      return;
    }
    setBusy(true);
    try {
      await adminApi<{ department: Department }>(department.id ? `/departments/${department.id}` : "/departments", {
        method: department.id ? "PUT" : "POST",
        body: JSON.stringify({ ...form, bookingExcludedDates }),
      });
      onSaved(department.id ? "Department updated." : "Department created.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save this department.");
    } finally { setBusy(false); }
  }
  return (
    <AppDialog title={department.id ? "Edit department" : "Add department"} onClose={onClose} busy={busy} wide>
      <form onSubmit={submit} className="aw-department-form">
        <div className="aw-department-fields">
          <div><label htmlFor="department-name">Name</label><input id="department-name" required maxLength={120} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label htmlFor="department-vietnamese">Vietnamese name</label><input id="department-vietnamese" maxLength={120} value={form.vietnameseName} onChange={(e) => set("vietnameseName", e.target.value)} /></div>
        </div>
        <label htmlFor="department-description">Description</label>
        <textarea id="department-description" maxLength={1000} value={form.description} onChange={(e) => set("description", e.target.value)} />
        <div className="aw-department-fields">
          <div><label htmlFor="department-location">Office location</label><input id="department-location" required maxLength={200} value={form.location} onChange={(e) => set("location", e.target.value)} /></div>
          <div><label htmlFor="department-hours">Working hours</label><input id="department-hours" required maxLength={120} value={form.workingHours} onChange={(e) => set("workingHours", e.target.value)} /><p className="sq-help">Example: 07:30 - 11:30 | 13:00 - 16:30</p></div>
        </div>
        <div className="aw-department-flags">
          <label><input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} /> Active department</label>
          <label><input type="checkbox" checked={form.bookingEnabled} onChange={(e) => set("bookingEnabled", e.target.checked)} /> Allow appointments</label>
        </div>
        <fieldset className="aw-department-weekdays">
          <legend>Appointment days</legend>
          <div>{weekdays.map((day, index) => <label key={day}><input type="checkbox" checked={form.bookingWeekdays.includes(index)} onChange={(e) => set("bookingWeekdays", e.target.checked ? [...form.bookingWeekdays, index].sort() : form.bookingWeekdays.filter((value) => value !== index))} /> {day}</label>)}</div>
        </fieldset>
        <label htmlFor="department-excluded">Excluded appointment dates</label>
        <input id="department-excluded" value={excluded} onChange={(e) => setExcluded(e.target.value)} placeholder="YYYY-MM-DD, YYYY-MM-DD" />
        <p className="sq-help">Separate dates with commas.</p>
        <div className="aw-department-services-head"><strong>Services</strong><button type="button" className="sq-button" onClick={() => set("services", [...form.services, { name: "", estimatedDuration: 15 }])}><Plus size={15} /> Add service</button></div>
        {form.services.map((service, index) => (
          <div className="aw-department-service" key={index}>
            <input aria-label={`Service ${index + 1} name`} required maxLength={120} placeholder="Service name" value={service.name} onChange={(e) => set("services", form.services.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} />
            <input aria-label={`Service ${index + 1} duration in minutes`} type="number" required min={1} max={1440} value={service.estimatedDuration} onChange={(e) => set("services", form.services.map((item, i) => i === index ? { ...item, estimatedDuration: Number(e.target.value) } : item))} />
            <span>min</span>
            <button type="button" aria-label={`Remove service ${index + 1}`} onClick={() => set("services", form.services.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
            <textarea style={{ gridColumn: "1 / -1" }} aria-label={`Service ${index + 1} description`} maxLength={1000} rows={2} placeholder="Describe the service and how it differs from similar services (optional)" value={service.description || ""} onChange={(e) => set("services", form.services.map((item, i) => i === index ? { ...item, description: e.target.value } : item))} />
          </div>
        ))}
        {error && <p className="sq-notice sq-error" role="alert">{error}</p>}
        <div className="sq-dialog-actions"><button type="button" className="sq-button" onClick={onClose} disabled={busy}>Cancel</button><button type="submit" className="sq-button sq-button-primary" disabled={busy}>{busy ? "Saving…" : "Save department"}</button></div>
      </form>
    </AppDialog>
  );
}

export default function AdminDepartments() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [search, setSearch] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    adminApi<{ departments: Department[] }>("/departments", { signal: controller.signal })
      .then((data) => { setDepartments(data.departments); setError(""); })
      .catch((err) => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Unable to load departments."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [refresh]);
  const visible = departments.filter((department) =>
    `${department.name} ${department.vietnameseName} ${department.location}`.toLocaleLowerCase().includes(search.toLocaleLowerCase().trim()));
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError("");
    try {
      await adminApi(`/departments/${deleting.id}`, { method: "DELETE" });
      setDeleting(null);
      setMessage("Department deleted. Its history remains available.");
      setRefresh((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete this department.");
      setDeleting(null);
    } finally { setBusy(false); }
  }
  return <>
    <div className="aw-department-actions">
      <label className="aw-search"><Search size={17} /><input aria-label="Search departments" placeholder="Search departments…" value={search} onChange={(e) => setSearch(e.target.value)} /></label>
      <div><button className="sq-button" disabled={loading} onClick={() => { setLoading(true); setRefresh((value) => value + 1); }}><RefreshCw size={15} /> Refresh</button><button className="sq-button sq-button-primary" onClick={() => setEditing(empty())}><Plus size={16} /> Add department</button></div>
    </div>
    {message && <p className="sq-notice sq-success aw-department-feedback" role="status">{message}</p>}
    {error && <p className="sq-notice sq-error aw-department-feedback" role="alert">{error}</p>}
    <section className="aw-panel" aria-busy={loading}>
      <div className="aw-panel-heading"><div><h2>Departments <span className="aw-count">{departments.length}</span></h2><p>Manage offices, services and appointment availability.</p></div></div>
      {loading ? <div className="aw-loading"><RefreshCw size={24} /><p>Loading departments…</p></div>
        : visible.length ? <div className="aw-table-scroll"><table className="aw-table"><thead><tr><th>Department</th><th>Location</th><th>Services</th><th>Status</th><th>Actions</th></tr></thead><tbody>{visible.map((department) => <tr key={department.id}>
          <td><div className="aw-person"><span className="aw-avatar"><Building2 size={18} /></span><div><strong>{department.name}</strong><small>{department.vietnameseName || "—"}</small></div></div></td>
          <td>{department.location}</td><td>{department.services.length}</td><td><span className={`aw-badge aw-${department.isActive ? "active" : "disabled"}`}>{department.isActive ? "Active" : "Inactive"}</span></td>
          <td><div className="aw-department-row-actions"><button className="aw-row-action" onClick={() => setEditing(department)}><Pencil size={14} /> Edit</button><button className="aw-row-action aw-department-delete" onClick={() => setDeleting(department)}><Trash2 size={14} /> Delete</button></div></td>
        </tr>)}</tbody></table></div>
        : <div className="aw-empty"><Building2 size={32} /><h3>{search ? "No matching departments" : "No departments yet"}</h3><p>{search ? "Try another search term." : "Add a department to make it available in SmartQueue."}</p></div>}
    </section>
    {editing && <DepartmentForm department={editing} onClose={() => setEditing(null)} onSaved={(text) => { setEditing(null); setMessage(text); setLoading(true); setRefresh((value) => value + 1); }} />}
    {deleting && <AppDialog title="Delete department" onClose={() => setDeleting(null)} busy={busy}><p>Delete <strong>{deleting.name}</strong>? It will disappear from the department list. Existing records will be kept.</p><p className="sq-help">Departments with active tickets or future appointments must be resolved first.</p><div className="sq-dialog-actions"><button className="sq-button" onClick={() => setDeleting(null)} disabled={busy}>Cancel</button><button className="sq-button sq-button-danger" onClick={() => void remove()} disabled={busy}>{busy ? "Deleting…" : "Delete department"}</button></div></AppDialog>}
  </>;
}
