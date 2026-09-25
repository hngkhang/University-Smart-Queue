import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Ticket,
  Users,
} from "lucide-react";
import {
  cancelQueueTicket,
  durationLabel,
  fetchMyQueue,
  QueueError,
} from "../services/queue";
import { readSession, SESSION_CHANGED_EVENT } from "../services/session";
import type { QueueTicket } from "../types";

const labels: Record<QueueTicket["status"], string> = {
  waiting: "Waiting",
  called: "Your turn",
  serving: "Being served",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "Missed turn",
};
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));

export default function MyQueuePage() {
  const location = useLocation();
  const [session, setSession] = useState(readSession);
  const [data, setData] = useState<{
    ticket: QueueTicket | null;
    history: QueueTicket[];
  } | null>(null);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [retry, setRetry] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState("");
  const cancelLock = useRef(false);
  const revision = useRef(0);

  useEffect(() => {
    const update = () => {
      setSession(readSession());
      setData(null);
    };
    window.addEventListener(SESSION_CHANGED_EVENT, update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, update);
      window.removeEventListener("storage", update);
    };
  }, []);

  useEffect(() => {
    if (!session || session.user.role !== "student") return;
    let active = true;
    let pending = false;
    async function load() {
      if (pending || cancelLock.current) return;
      pending = true;
      const requestRevision = revision.current;
      setRefreshing(true);
      try {
        const result = await fetchMyQueue();
        if (active && requestRevision === revision.current) {
          setData(result);
          setError("");
          setUnauthorized(false);
        }
      } catch (reason) {
        if (active && requestRevision === revision.current) {
          setError(
            reason instanceof Error
              ? reason.message
              : "Unable to load your queue.",
          );
          setUnauthorized(
            reason instanceof QueueError &&
              (reason.status === 401 || reason.status === 403),
          );
        }
      } finally {
        pending = false;
        if (active) setRefreshing(false);
      }
    }
    void load();
    const timer = window.setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    const onFocus = () => {
      void load();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [retry, session]);

  async function cancel() {
    if (!data?.ticket || cancelLock.current) return;
    cancelLock.current = true;
    revision.current += 1;
    setCancelling(true);
    setError("");
    try {
      const result = await cancelQueueTicket(data.ticket._id);
      if (readSession()?.user.id !== session?.user.id) return;
      setData((previous) => ({
        ticket: null,
        history: [result.ticket, ...(previous?.history || [])].slice(0, 20),
      }));
      setNotice("Your ticket has been cancelled. You can join a queue again.");
      setConfirmCancel(false);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to cancel your ticket.",
      );
      setUnauthorized(
        reason instanceof QueueError &&
          (reason.status === 401 || reason.status === 403),
      );
    } finally {
      cancelLock.current = false;
      setCancelling(false);
    }
  }

  if (!session || session.user.role !== "student" || unauthorized)
    return (
      <main className="mx-auto max-w-3xl px-4 py-20">
        <h1 className="text-3xl font-bold text-slate-900">My Queue</h1>
        <p className="mt-3 text-slate-500">
          Sign in with an active student account to view and manage your ticket.
        </p>
        <Link
          to="/login?redirect=%2Fqueue"
          className="mt-6 inline-flex rounded-xl bg-[#3F6392] px-5 py-3 text-sm font-semibold text-white"
        >
          Sign in as a student
        </Link>
      </main>
    );

  const ticket = data?.ticket;
  const displayNotice =
    notice ||
    (ticket && location.state?.joined
      ? "You have joined the queue. Your ticket is ready."
      : "");
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <header className="mb-7 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[#3F6392]">
            Your campus visit
          </p>
          <h1 className="text-3xl font-bold text-slate-900">My Queue</h1>
          <p className="mt-2 text-sm text-slate-500">
            Your ticket, services and queue updates in one place.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
          disabled={refreshing || cancelling}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          <RefreshCw size={16} className={refreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>
      {displayNotice && (
        <p
          role="status"
          className="mb-5 flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <CheckCircle2 size={18} className="shrink-0" />
          {displayNotice}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
          {data && " Displayed information may be out of date."}
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="ml-2 font-semibold underline"
          >
            Try again
          </button>
        </div>
      )}
      {!data && !error && (
        <p
          role="status"
          className="flex items-center gap-2 py-12 text-slate-500"
        >
          <LoaderCircle size={20} className="animate-spin" />
          Loading your ticket…
        </p>
      )}
      {ticket && (
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="grid md:grid-cols-[280px_1fr]">
            <div className="flex flex-col items-center justify-center border-b border-dashed border-slate-200 bg-[#F1F5FA] px-6 py-9 text-center md:border-r md:border-b-0">
              <Ticket size={28} className="mb-4 text-[#3F6392]" />
              <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
                Your ticket number
              </p>
              <p className="mt-3 text-5xl font-extrabold tracking-tight text-[#0B1F3A]">
                {ticket.reference}
              </p>
              <span className="mt-5 rounded-full border border-blue-200 bg-white px-4 py-1.5 text-xs font-bold text-[#3F6392]">
                {labels[ticket.status]}
              </span>
              <p className="mt-5 text-xs text-slate-500">
                Issued {dateLabel(ticket.createdAt)}
              </p>
            </div>
            <div className="p-6 sm:p-8">
              <Link
                to={`/departments/${ticket.department}`}
                className="text-xl font-bold text-slate-900 hover:text-[#3F6392]"
              >
                {ticket.departmentName}
              </Link>
              <p className="mt-2 flex items-start gap-2 text-sm text-slate-500">
                <MapPin size={16} className="mt-0.5 shrink-0" />
                {ticket.location}
              </p>
              {ticket.queueStatus !== "open" && (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                  The department is currently {ticket.queueStatus}. Your ticket
                  is still saved; please check with the department for service
                  availability.
                </p>
              )}
              {(ticket.status === "called" || ticket.status === "serving") && (
                <p
                  role="status"
                  className="mt-4 rounded-lg bg-blue-50 p-3 text-sm font-medium text-blue-800"
                >
                  {ticket.status === "called"
                    ? "Your number has been called. Please go to the department now."
                    : "Your services are being handled by the department."}
                </p>
              )}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-slate-50 p-4">
                  <Users size={18} className="text-[#3F6392]" />
                  <p className="mt-2 text-xl font-bold text-slate-900">
                    {ticket.peopleAhead ?? "—"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    People ahead of you
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4">
                  <Clock3 size={18} className="text-[#3F6392]" />
                  <p className="mt-2 text-sm font-semibold text-slate-900">
                    {durationLabel(ticket.estimatedWait)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Estimated waiting time
                  </p>
                </div>
              </div>
              <h2 className="mt-6 text-sm font-bold text-slate-900">
                Selected services{" "}
                <span className="ml-1 font-normal text-slate-400">
                  ({ticket.services.length})
                </span>
              </h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {ticket.services.map((service) => (
                  <li
                    key={service.name}
                    className="flex items-start justify-between gap-4 py-3 text-sm"
                  >
                    <span className="text-slate-700">{service.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {durationLabel(service.estimatedDuration)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 text-sm font-semibold">
                <span className="text-slate-600">Estimated service time</span>
                <span className="text-right text-[#3F6392]">
                  {durationLabel(ticket.estimatedServiceTime)}
                </span>
              </div>
              {ticket.notes && (
                <div className="mt-5 rounded-lg bg-slate-50 p-3">
                  <h3 className="text-xs font-semibold text-slate-500">
                    Your notes
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
                    {ticket.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 px-6 py-4">
            <p className="max-w-md text-xs leading-5 text-slate-500">
              Updates automatically every 15 seconds. Please be at the
              department when your number is called.
            </p>
            {ticket.status === "waiting" && !confirmCancel && (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                Cancel ticket
              </button>
            )}
            {ticket.status === "waiting" && confirmCancel && (
              <div className="w-full rounded-xl border border-red-100 bg-red-50 p-4">
                <p className="text-sm font-semibold text-red-800">
                  Cancel this ticket and leave the queue?
                </p>
                <p className="mt-1 text-xs text-red-700">
                  You will lose your current place. Joining again gives you a
                  new ticket.
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => setConfirmCancel(false)}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold"
                  >
                    Keep my ticket
                  </button>
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => void cancel()}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling…" : "Yes, cancel ticket"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
      {data && !ticket && (
        <section className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#F1F5FA]">
            <Ticket size={30} className="text-[#3F6392]" />
          </div>
          <h2 className="mt-5 text-xl font-bold text-slate-900">
            You’re not in a queue yet
          </h2>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-slate-500">
            Choose a department and select the services you need to get your
            ticket.
          </p>
          <Link
            to="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#3F6392] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2E4B72]"
          >
            Browse departments <ArrowRight size={16} />
          </Link>
        </section>
      )}
      {Boolean(data?.history.length) && (
        <section className="mt-9">
          <h2 className="mb-4 text-lg font-bold text-slate-900">
            Recent tickets
          </h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {data?.history.map((item) => (
              <article
                key={item._id}
                className="flex flex-wrap items-start justify-between gap-3 p-5"
              >
                <div>
                  <p className="font-semibold text-slate-900">
                    {item.reference}{" "}
                    <span className="mx-1 text-slate-300">·</span>{" "}
                    {item.departmentName}
                  </p>
                  <p className="mt-1 text-sm text-slate-500">
                    {item.services.map((service) => service.name).join(" · ")}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">
                    {dateLabel(item.createdAt)}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                  {labels[item.status]}
                </span>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
