import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import {
  ArrowRight,
  Clock3,
  Info,
  LoaderCircle,
  Ticket,
  X,
} from "lucide-react";
import type { Department, QueueTicket } from "../types";
import { fetchDepartment } from "../services/departments";
import {
  durationLabel,
  fetchMyQueue,
  joinQueue,
  QueueError,
} from "../services/queue";

interface Props {
  department: Department;
  open: boolean;
  onClose: () => void;
}

export default function JoinQueueModal({ department, open, onClose }: Props) {
  const navigate = useNavigate();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const submitLock = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [details, setDetails] = useState(department);
  const [check, setCheck] = useState<{
    ready: boolean;
    ticket: QueueTicket | null;
    error: string;
  }>({ ready: false, ticket: null, error: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [hasExisting, setHasExisting] = useState(false);
  const [retry, setRetry] = useState(0);
  const loginUrl = `/login?redirect=${encodeURIComponent(`/departments/${department.id}?join=1`)}`;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    Promise.all([fetchDepartment(department.id), fetchMyQueue()])
      .then(([fresh, queue]) => {
        if (!active) return;
        setDetails(fresh);
        setCheck({ ready: true, ticket: queue.ticket, error: "" });
      })
      .catch((reason: unknown) => {
        if (!active) return;
        if (reason instanceof QueueError && reason.status === 401) {
          navigate(loginUrl, { replace: true });
          return;
        }
        setCheck({
          ready: false,
          ticket: null,
          error:
            reason instanceof Error
              ? reason.message
              : "Unable to load services.",
        });
      });
    return () => {
      active = false;
    };
  }, [open, department.id, retry, navigate, loginUrl]);

  const services =
    details.serviceDetails ??
    details.services.map((name) => ({ name, estimatedDuration: 0 }));
  const chosen = services.filter((service) => selected.includes(service.name));
  const total =
    chosen.length && chosen.every((service) => service.estimatedDuration > 0)
      ? chosen.reduce((sum, service) => sum + service.estimatedDuration, 0)
      : null;
  const existing = Boolean(check.ticket || hasExisting);

  function close() {
    if (submitLock.current) return;
    setCheck({ ready: false, ticket: null, error: "" });
    setError("");
    setHasExisting(false);
    onClose();
  }

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submitLock.current ||
      !check.ready ||
      existing ||
      !chosen.length ||
      details.status !== "open"
    )
      return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    try {
      await joinQueue({
        departmentId: details.id,
        services: chosen.map((service) => service.name),
        notes,
      });
      navigate("/queue", { state: { joined: true } });
    } catch (reason) {
      if (reason instanceof QueueError && reason.status === 401) {
        navigate(loginUrl, { replace: true });
        return;
      }
      if (reason instanceof QueueError && reason.code === "ACTIVE_TICKET")
        setHasExisting(true);
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to join the queue. Check My Queue before trying again.",
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="join-queue-title"
      aria-describedby="join-queue-description"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="fixed inset-0 m-auto max-h-[100dvh] w-full max-w-[640px] overflow-hidden border-0 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-slate-950/45 sm:max-h-[90dvh] sm:rounded-2xl"
    >
      <form
        onSubmit={submit}
        className="flex max-h-[100dvh] flex-col sm:max-h-[90dvh]"
      >
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-7">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#3F6392]">
              <Ticket size={16} /> Your next visit
            </div>
            <h2 id="join-queue-title" className="text-2xl font-bold">
              Join Online Queue
            </h2>
            <p className="mt-1 font-medium text-[#3F6392]">{details.name}</p>
            <p
              id="join-queue-description"
              className="mt-2 text-sm text-slate-500"
            >
              Select the services you need for this visit.
            </p>
          </div>
          <button
            type="button"
            aria-label="Close service selection"
            onClick={close}
            disabled={submitting}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </header>
        <div className="space-y-6 overflow-y-auto px-5 py-6 sm:px-7">
          {!check.ready && !check.error && (
            <p
              role="status"
              className="flex items-center gap-2 text-sm text-slate-500"
            >
              <LoaderCircle size={18} className="animate-spin" /> Loading
              services and checking your queue…
            </p>
          )}
          {check.error && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
            >
              {check.error}
              <button
                type="button"
                onClick={() => {
                  setCheck({ ready: false, ticket: null, error: "" });
                  setRetry((value) => value + 1);
                }}
                className="ml-2 font-semibold underline"
              >
                Try again
              </button>
            </div>
          )}
          {existing ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-5">
              <h3 className="font-semibold">
                You already have an active ticket
              </h3>
              {check.ticket && (
                <p className="mt-2 text-sm text-slate-600">
                  {check.ticket.reference} · {check.ticket.departmentName}
                </p>
              )}
              <p className="mt-2 text-sm text-slate-600">
                Finish or cancel your current visit before joining another
                queue.
              </p>
              <Link
                to="/queue"
                className="mt-4 inline-flex items-center gap-2 font-semibold text-[#3F6392]"
              >
                View My Queue <ArrowRight size={16} />
              </Link>
            </div>
          ) : (
            check.ready && (
              <>
                {details.status !== "open" && (
                  <p
                    role="alert"
                    className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800"
                  >
                    This department is {details.status} and is not accepting new
                    tickets.
                  </p>
                )}
                <fieldset disabled={submitting || details.status !== "open"}>
                  <legend className="mb-3 flex w-full items-center justify-between text-sm font-semibold">
                    Select services{" "}
                    <span
                      className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500"
                      aria-live="polite"
                    >
                      {chosen.length} selected
                    </span>
                  </legend>
                  <div className="space-y-3">
                    {services.map((service) => (
                      <label
                        key={service.name}
                        className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-[#3F6392] ${selected.includes(service.name) ? "border-[#3F6392] bg-[#F1F5FA]" : "border-slate-200 hover:border-slate-400"}`}
                      >
                        <input
                          type="checkbox"
                          name="services"
                          value={service.name}
                          checked={selected.includes(service.name)}
                          onChange={() =>
                            setSelected((items) =>
                              items.includes(service.name)
                                ? items.filter((name) => name !== service.name)
                                : [...items, service.name],
                            )
                          }
                          className="mt-1 h-4 w-4 shrink-0 accent-[#3F6392]"
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {service.name}
                          </span>
                          <span className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                            <Clock3 size={14} />
                            {service.estimatedDuration > 0
                              ? `About ${service.estimatedDuration} min`
                              : "Duration not available yet"}
                          </span>
                        </span>
                      </label>
                    ))}
                    {!services.length && (
                      <p className="text-sm text-slate-500">
                        No services are available for this department yet.
                      </p>
                    )}
                  </div>
                </fieldset>
                <div>
                  <label
                    htmlFor="queue-notes"
                    className="text-sm font-semibold"
                  >
                    Notes{" "}
                    <span className="font-normal text-slate-400">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id="queue-notes"
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    disabled={submitting}
                    maxLength={1000}
                    rows={3}
                    placeholder="Add details about your request…"
                    className="mt-2 block w-full resize-y rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#3F6392] focus:ring-1 focus:ring-[#3F6392]"
                  />
                  <p className="mt-1 text-right text-xs text-slate-400">
                    {notes.length}/1,000
                  </p>
                </div>
                <section
                  className="rounded-xl bg-slate-50 p-4"
                  aria-label="Your visit summary"
                >
                  <h3 className="mb-3 text-sm font-bold">Your visit</h3>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Selected services</dt>
                      <dd className="font-medium">{chosen.length} services</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Estimated service time</dt>
                      <dd
                        className="text-right font-semibold text-[#3F6392]"
                        aria-live="polite"
                      >
                        {chosen.length
                          ? durationLabel(total)
                          : "Select a service"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Estimated waiting time</dt>
                      <dd className="text-right font-medium">
                        {durationLabel(details.estimatedWait)}
                      </dd>
                    </div>
                  </dl>
                </section>
                <p className="flex items-start gap-2 text-xs leading-5 text-slate-500">
                  <Info size={16} className="mt-0.5 shrink-0" />
                  <span>
                    One ticket covers all selected services. Please be at the
                    department when called. Times are approximate.
                  </span>
                </p>
              </>
            )
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-red-50 p-4 text-sm text-red-700"
            >
              {error}{" "}
              <Link to="/queue" className="font-semibold underline">
                Check My Queue
              </Link>
            </div>
          )}
        </div>
        <footer className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-100 bg-white px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={close}
            disabled={submitting}
            className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {!existing && (
            <button
              type="submit"
              disabled={
                !check.ready ||
                !chosen.length ||
                submitting ||
                details.status !== "open"
              }
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3F6392] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2E4B72] disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting && (
                <LoaderCircle size={16} className="animate-spin" />
              )}
              {submitting ? "Getting your ticket…" : "Confirm & Get Ticket"}
            </button>
          )}
        </footer>
      </form>
    </dialog>
  );
}
