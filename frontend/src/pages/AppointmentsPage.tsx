import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  CalendarDays,
  Clock3,
  LoaderCircle,
  MapPin,
  Plus,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import {
  AppointmentError,
  appointmentDate,
  appointmentTime,
  cancelAppointment,
  fetchAppointments,
} from "../services/appointments";
import type { Appointment } from "../types";

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState<"upcoming" | "history">("upcoming");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    fetchAppointments()
      .then((data) => {
        if (active) {
          setAppointments(data.appointments);
          setError("");
          setUnauthorized(false);
        }
      })
      .catch((reason: unknown) => {
        if (active) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load appointments.",
          );
          setUnauthorized(
            reason instanceof AppointmentError && reason.status === 401,
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  const upcoming = appointments
    .filter(
      (item) =>
        item.status === "confirmed" && new Date(item.endsAt).getTime() > now,
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const history = appointments.filter(
    (item) =>
      item.status === "cancelled" || new Date(item.endsAt).getTime() <= now,
  );
  const visible = tab === "upcoming" ? upcoming : history;

  async function cancel(id: string) {
    if (cancelling) return;
    setCancelling(id);
    setError("");
    setNotice("");
    try {
      const result = await cancelAppointment(id);
      setAppointments((items) =>
        items.map((item) => (item._id === id ? result.appointment : item)),
      );
      setConfirmCancel(null);
      setNotice("Appointment cancelled. You can find it in History.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to cancel your appointment.",
      );
      setUnauthorized(
        reason instanceof AppointmentError && reason.status === 401,
      );
    } finally {
      setCancelling(null);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">
            My Appointments
          </h1>
        </div>
        <Link
          to="/appointments/new"
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#3F6392] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2E4B72]"
        >
          <Plus size={18} />
          Book Appointment
        </Link>
      </div>
      <div
        className="mt-8 flex gap-6 border-b border-slate-200"
        role="tablist"
        aria-label="Appointment list"
      >
        {(["upcoming", "history"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            id={`${item}-tab`}
            aria-controls="appointment-panel"
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "upcoming"
                  : event.key === "End"
                    ? "history"
                    : item === "upcoming"
                      ? "history"
                      : "upcoming";
              setTab(next);
              setConfirmCancel(null);
              document.getElementById(`${next}-tab`)?.focus();
            }}
            onClick={() => {
              setTab(item);
              setConfirmCancel(null);
            }}
            className={`border-b-2 px-1 pb-4 text-sm font-semibold ${tab === item ? "border-[#3F6392] text-[#3F6392]" : "border-transparent text-slate-500 hover:text-slate-800"}`}
          >
            {item === "upcoming" ? "Upcoming" : "History"}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs">
              {item === "upcoming" ? upcoming.length : history.length}
            </span>
          </button>
        ))}
      </div>
      {notice && (
        <p
          role="status"
          className="mt-5 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          <p>{error}</p>
          {unauthorized ? (
            <Link
              to="/login?redirect=%2Fappointments"
              className="mt-2 inline-block font-semibold underline"
            >
              Sign in again
            </Link>
          ) : (
            <button
              onClick={() => {
                setLoading(true);
                setRetry((value) => value + 1);
              }}
              className="mt-2 font-semibold underline"
            >
              Refresh appointments
            </button>
          )}
        </div>
      )}
      <div
        id="appointment-panel"
        role="tabpanel"
        aria-labelledby={`${tab}-tab`}
        className="mt-6 space-y-4"
      >
        {loading ? (
          <p
            role="status"
            className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500"
          >
            <LoaderCircle size={20} className="animate-spin" />
            Loading appointments…
          </p>
        ) : visible.length === 0 && !error ? (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-16 text-center">
            <CalendarDays size={40} className="mx-auto text-slate-300" />
            <h2 className="mt-5 text-lg font-bold text-slate-800">
              {tab === "upcoming"
                ? "Your next visit starts here"
                : "No past appointments yet"}
            </h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
              {tab === "upcoming"
                ? "Choose a department, pick a service, and reserve a time that suits your schedule."
                : "Past and cancelled appointments will appear here."}
            </p>
            {tab === "upcoming" && (
              <Link
                to="/appointments/new"
                className="mt-6 inline-block text-sm font-semibold text-[#3F6392]"
              >
                Book your first appointment →
              </Link>
            )}
          </section>
        ) : (
          !loading &&
          visible.map((item) => {
            const future = new Date(item.startsAt).getTime() > now;
            const status =
              item.status === "cancelled"
                ? "Cancelled"
                : new Date(item.endsAt).getTime() <= now
                  ? "Past"
                  : future
                    ? "Confirmed"
                    : "Scheduled now";
            return (
              <article
                key={item._id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"
              >
                <div className="flex flex-col justify-between gap-4 sm:flex-row">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-[#3F6392]">
                      {item.departmentName}
                    </p>
                    <h2 className="mt-2 text-lg font-bold text-slate-900">
                      {item.service}
                    </h2>
                  </div>
                  <span
                    className={`h-fit w-fit rounded-full px-3 py-1 text-xs font-semibold ${status === "Confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  >
                    {status}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 text-sm text-slate-600">
                  <span className="inline-flex items-center gap-2">
                    <CalendarDays size={16} className="text-slate-400" />
                    {appointmentDate(item.startsAt)}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Clock3 size={16} className="text-slate-400" />
                    {appointmentTime(item.startsAt)} –{" "}
                    {appointmentTime(item.endsAt)} (UTC+7)
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <MapPin size={16} className="text-slate-400" />
                    {item.location}
                  </span>
                </div>
                <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    aria-expanded={expanded === item._id}
                    aria-controls={`details-${item._id}`}
                    onClick={() =>
                      setExpanded(expanded === item._id ? null : item._id)
                    }
                    className="inline-flex items-center gap-2 text-sm font-semibold text-[#3F6392]"
                  >
                    {expanded === item._id ? "Hide details" : "View details"}
                    {expanded === item._id ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>
                  {future && item.status === "confirmed" && (
                    <button
                      type="button"
                      disabled={Boolean(cancelling)}
                      onClick={() => setConfirmCancel(item._id)}
                      className="text-sm font-medium text-slate-500 hover:text-red-700 disabled:opacity-50"
                    >
                      Cancel appointment
                    </button>
                  )}
                </div>
                {expanded === item._id && (
                  <div
                    id={`details-${item._id}`}
                    className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 text-sm"
                  >
                    <p className="break-all">
                      <span className="text-slate-500">Reference: </span>
                      <span className="font-mono text-xs">
                        {item.reference}
                      </span>
                    </p>
                    <p className="whitespace-pre-wrap break-words">
                      <span className="text-slate-500">Notes: </span>
                      {item.notes || "No additional notes."}
                    </p>
                  </div>
                )}
                {confirmCancel === item._id && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">
                      Cancel this appointment?
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      Your reserved time will become available to other
                      students.
                    </p>
                    <div className="mt-3 flex gap-3">
                      <button
                        type="button"
                        disabled={Boolean(cancelling)}
                        onClick={() => void cancel(item._id)}
                        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {cancelling === item._id
                          ? "Cancelling…"
                          : "Yes, cancel"}
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(cancelling)}
                        onClick={() => setConfirmCancel(null)}
                        className="rounded-lg border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700"
                      >
                        Keep appointment
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        )}
      </div>
    </main>
  );
}
