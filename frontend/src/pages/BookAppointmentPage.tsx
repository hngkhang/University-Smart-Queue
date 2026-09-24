import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  LoaderCircle,
  MapPin,
  UserRound,
} from "lucide-react";
import BookingCalendar from "../components/BookingCalendar";
import { fetchDepartments } from "../services/departments";
import {
  AppointmentError,
  appointmentDate,
  appointmentTime,
  createAppointment,
  fetchAvailability,
  todayInVietnam,
} from "../services/appointments";
import { readSession } from "../services/session";
import type { Appointment, AppointmentSlot, Department } from "../types";

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-[#3F6392] focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400";
const cardClass =
  "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7";

export default function BookAppointmentPage() {
  const [params, setParams] = useSearchParams();
  const departmentId = params.get("department") || "";
  const user = readSession()?.user;
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [service, setService] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [availability, setAvailability] = useState<{
    key: string;
    slots: AppointmentSlot[];
    error?: string;
    unauthorized?: boolean;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [error, setError] = useState("");
  const [unauthorized, setUnauthorized] = useState(false);
  const [success, setSuccess] = useState<Appointment | null>(null);
  const department = departments.find((item) => item.id === departmentId);
  const selectedService = department?.services.includes(service) ? service : "";
  const duration = department?.serviceDetails?.find(
    (item) => item.name === selectedService,
  )?.estimatedDuration;
  const bookingEnabled = department && department.bookingEnabled !== false;
  const today = todayInVietnam();
  const lastDate = new Date(`${today}T00:00:00Z`);
  lastDate.setUTCDate(lastDate.getUTCDate() + 30);
  const maxDate = lastDate.toISOString().slice(0, 10);
  const availabilityKey = JSON.stringify([
    departmentId,
    selectedService,
    date,
    refresh,
  ]);
  const readyToLoad = Boolean(bookingEnabled && selectedService && date);
  const slots = availability?.key === availabilityKey ? availability.slots : [];
  const slotsLoading = readyToLoad && availability?.key !== availabilityKey;
  const slotError =
    availability?.key === availabilityKey ? availability.error : "";
  const selectedSlot = slots.find(
    (item) => item.startsAt === time && item.available,
  );
  const loginUrl = `/login?redirect=${encodeURIComponent(`/appointments/new?${params}`)}`;

  useEffect(() => {
    let active = true;
    fetchDepartments()
      .then((data) => {
        if (active) {
          setDepartments(data);
          setLoadError("");
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setLoadError(
            reason instanceof Error
              ? reason.message
              : "Unable to load departments.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);

  useEffect(() => {
    if (!readyToLoad) return;
    const controller = new AbortController();
    fetchAvailability(departmentId, selectedService, date, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setAvailability({ key: availabilityKey, slots: data.slots });
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setAvailability({
            key: availabilityKey,
            slots: [],
            error:
              reason instanceof Error
                ? reason.message
                : "Unable to load available times.",
            unauthorized:
              reason instanceof AppointmentError && reason.status === 401,
          });
      });
    return () => controller.abort();
  }, [departmentId, selectedService, date, availabilityKey, readyToLoad]);

  const clearSelection = () => {
    setTime("");
    setError("");
  };
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedSlot || !department || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setError("");
    setUnauthorized(false);
    try {
      const result = await createAppointment({
        departmentId,
        service: selectedService,
        date,
        startsAt: selectedSlot.startsAt,
        notes,
      });
      setSuccess(result.appointment);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Unable to book. Please check My Appointments before trying again.",
      );
      if (reason instanceof AppointmentError && reason.status === 409) {
        setTime("");
        setRefresh((value) => value + 1);
      }
      if (reason instanceof AppointmentError && reason.status === 401)
        setUnauthorized(true);
    } finally {
      setSubmitting(false);
      submitLock.current = false;
    }
  }

  if (!user) return <Navigate to={loginUrl} replace />;

  if (success)
    return (
      <main className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
        <section className={`${cardClass} text-center`} aria-live="polite">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 size={34} />
          </div>
          <p className="mt-6 text-xs font-bold uppercase tracking-widest text-emerald-700">
            Booking confirmed
          </p>
          <h1 className="mt-2 text-3xl font-bold text-slate-900">
            Your visit is scheduled.
          </h1>
          <p className="mt-3 text-sm text-slate-500">
            You can find these details anytime in My Appointments.
          </p>
          <div className="mt-7 rounded-xl bg-slate-50 p-5 text-left">
            <p className="font-bold text-slate-900">{success.departmentName}</p>
            <p className="mt-1 text-sm text-slate-600">{success.service}</p>
            <p className="mt-4 text-sm text-slate-700">
              {appointmentDate(success.startsAt)} ·{" "}
              {appointmentTime(success.startsAt)} –{" "}
              {appointmentTime(success.endsAt)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {success.location} · Vietnam time (UTC+7)
            </p>
            <p className="mt-4 text-xs text-slate-500">Booking reference</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-700">
              {success.reference}
            </p>
          </div>
          <p className="mt-5 text-sm text-slate-500">
            This reserves your visit. It does not add you to the live queue.
          </p>
          <Link
            to="/appointments"
            className="mt-7 inline-flex w-full justify-center rounded-xl bg-[#3F6392] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2E4B72]"
          >
            View My Appointments
          </Link>
          <Link
            to="/"
            className="mt-4 inline-block text-sm font-medium text-slate-500"
          >
            Back to Homepage
          </Link>
        </section>
      </main>
    );

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        to={department ? `/departments/${department.id}` : "/appointments"}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-700"
      >
        <ArrowLeft size={17} />
        {department ? "Back to Department" : "My Appointments"}
      </Link>
      <h1 className="sr-only">Book Appointment</h1>
      {loading ? (
        <p className="py-16 text-slate-500" role="status">
          Loading departments…
        </p>
      ) : loadError ? (
        <div
          className="mt-8 rounded-xl border border-red-100 bg-red-50 p-5"
          role="alert"
        >
          <p>{loadError}</p>
          <button
            onClick={() => {
              setLoading(true);
              setRetry((v) => v + 1);
            }}
            className="mt-3 font-semibold text-blue-700"
          >
            Try again
          </button>
        </div>
      ) : (
        <form
          onSubmit={submit}
          className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
        >
          <fieldset disabled={submitting} className="min-w-0 space-y-6">
            <section className={cardClass}>
              <h2 className="flex items-center gap-3 text-lg font-bold text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs text-[#3F6392]">
                  1
                </span>{" "}
                Select your service
              </h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">
                  Department <span className="text-blue-700">*</span>
                  <select
                    required
                    value={departmentId}
                    onChange={(event) => {
                      setParams(
                        event.target.value
                          ? { department: event.target.value }
                          : {},
                        { replace: true },
                      );
                      setService("");
                      setDate("");
                      clearSelection();
                    }}
                    className={inputClass}
                  >
                    <option value="">Choose a department</option>
                    {departmentId && !department && (
                      <option value={departmentId} disabled>
                        Department unavailable
                      </option>
                    )}
                    {departments.map((item) => (
                      <option
                        key={item.id}
                        value={item.id}
                        disabled={item.bookingEnabled === false}
                      >
                        {item.name}
                        {item.bookingEnabled === false ? " — unavailable" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-semibold text-slate-700">
                  Service <span className="text-blue-700">*</span>
                  <select
                    required
                    disabled={!bookingEnabled}
                    value={selectedService}
                    onChange={(event) => {
                      setService(event.target.value);
                      clearSelection();
                    }}
                    className={inputClass}
                  >
                    <option value="">Choose a service</option>
                    {department?.services.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {departmentId && !bookingEnabled && (
                <p className="mt-4 text-sm text-amber-700">
                  This department is not accepting appointments. Please choose
                  another department.
                </p>
              )}
              {bookingEnabled && department.services.length === 0 && (
                <p className="mt-4 text-sm text-amber-700">
                  No services are available for this department yet.
                </p>
              )}
              {department && (
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-2">
                    <MapPin size={14} />
                    {department.location}
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <Clock3 size={14} />
                    {department.workingHours}
                  </span>
                </div>
              )}
            </section>
            <section className={cardClass}>
              <h2 className="flex items-center gap-3 text-lg font-bold text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs text-[#3F6392]">
                  2
                </span>{" "}
                Choose date & time
              </h2>
              {duration && (
                <p className="mt-2 text-sm text-slate-500">
                  This service takes about {duration} minutes.
                </p>
              )}
              {!selectedService || !bookingEnabled ? (
                <div className="mt-5 rounded-xl border border-dashed border-slate-200 px-5 py-12 text-center text-sm text-slate-500">
                  <CalendarDays
                    className="mx-auto mb-3 text-slate-300"
                    size={30}
                  />
                  Select a department and service to see available times.
                </div>
              ) : (
                <div className="mt-5 grid gap-6 xl:grid-cols-2">
                  <div>
                    <p className="mb-3 text-sm font-semibold text-slate-700">
                      Select date <span className="text-blue-700">*</span>
                    </p>
                    <BookingCalendar
                      value={date}
                      min={today}
                      max={maxDate}
                      weekdays={department?.bookingWeekdays ?? [1, 2, 3, 4, 5]}
                      excludedDates={department?.bookingExcludedDates ?? []}
                      onChange={(value) => {
                        setDate(value);
                        clearSelection();
                      }}
                    />
                  </div>
                  <div aria-live="polite" aria-busy={slotsLoading}>
                    <p className="mb-3 text-sm font-semibold text-slate-700">
                      Available time <span className="text-blue-700">*</span>
                    </p>
                    {!date ? (
                      <p className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
                        Choose a date to view its available times.
                      </p>
                    ) : slotsLoading ? (
                      <p className="flex items-center gap-2 py-8 text-sm text-slate-500">
                        <LoaderCircle size={18} className="animate-spin" />
                        Finding available times…
                      </p>
                    ) : slotError ? (
                      <div role="alert" className="text-sm text-red-700">
                        <p>{slotError}</p>
                        {availability?.unauthorized ? (
                          <Link
                            to={loginUrl}
                            className="mt-3 inline-block font-semibold underline"
                          >
                            Sign in again
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setRefresh((v) => v + 1)}
                            className="mt-3 font-semibold underline"
                          >
                            Try again
                          </button>
                        )}
                      </div>
                    ) : slots.length === 0 ? (
                      <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">
                        No appointment times for this date. Please choose
                        another day.
                      </p>
                    ) : (
                      <>
                        {[
                          { label: "Morning", morning: true },
                          { label: "Afternoon", morning: false },
                        ].map((period) => {
                          const periodSlots = slots.filter(
                            (item) =>
                              Number(
                                appointmentTime(item.startsAt).slice(0, 2),
                              ) <
                                12 ===
                              period.morning,
                          );
                          if (!periodSlots.length) return null;
                          return (
                            <div className="mb-5" key={period.label}>
                              <p className="mb-2 text-xs font-medium text-slate-500">
                                {period.label}
                              </p>
                              <div className="grid grid-cols-3 gap-2">
                                {periodSlots.map((slot) => (
                                  <button
                                    type="button"
                                    key={slot.startsAt}
                                    disabled={!slot.available}
                                    aria-pressed={time === slot.startsAt}
                                    aria-label={`${appointmentTime(slot.startsAt)} to ${appointmentTime(slot.endsAt)}${slot.available ? "" : ", unavailable"}`}
                                    onClick={() => {
                                      setTime(slot.startsAt);
                                      setError("");
                                    }}
                                    className={`min-h-12 rounded-lg border px-1 py-2 text-sm font-semibold transition ${time === slot.startsAt && slot.available ? "border-[#3F6392] bg-[#3F6392] text-white" : slot.available ? "border-slate-200 text-slate-700 hover:border-[#3F6392] hover:bg-blue-50" : "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"}`}
                                  >
                                    <span className="inline-flex items-center gap-1">
                                      {time === slot.startsAt &&
                                        slot.available && <Check size={12} />}
                                      {appointmentTime(slot.startsAt)}
                                    </span>
                                    {!slot.available && (
                                      <span className="block text-[10px] font-normal">
                                        Unavailable
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {!slots.some((slot) => slot.available) && (
                          <p className="text-sm text-amber-700">
                            All times are unavailable. Please choose another
                            date.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>
            <section className={cardClass}>
              <h2 className="flex items-center gap-3 text-lg font-bold text-slate-900">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-50 text-xs text-[#3F6392]">
                  3
                </span>{" "}
                Your information
              </h2>
              <div className="mt-5 flex items-start gap-3 rounded-xl bg-slate-50 p-4">
                <UserRound size={20} className="mt-1 shrink-0 text-[#3F6392]" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800">
                    {user.fullName}
                  </p>
                  <p className="mt-1 break-words text-sm text-slate-500">
                    {user.studentID ? `Student ID: ${user.studentID} · ` : ""}
                    {user.email}
                  </p>
                </div>
              </div>
              <label className="mt-5 block text-sm font-semibold text-slate-700">
                Notes{" "}
                <span className="font-normal text-slate-400">(optional)</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Tell us what you need help with…"
                  className={`${inputClass} resize-y`}
                />
              </label>
              <p className="mt-1 text-right text-xs text-slate-400">
                {notes.length}/1,000
              </p>
            </section>
          </fieldset>
          <aside className="lg:sticky lg:top-24">
            <section className={cardClass}>
              <h2 className="text-lg font-bold text-slate-900">
                Booking Summary
              </h2>
              <div className="my-6 border-t border-slate-100 pt-5">
                <p className="text-xs text-slate-400">Department</p>
                <p className="mt-1 font-semibold text-slate-800">
                  {department?.name || "Not selected"}
                </p>
                <p className="mt-4 text-xs text-slate-400">Service</p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  {selectedService || "Not selected"}
                </p>
              </div>
              <div className="space-y-4 rounded-xl bg-slate-50 p-4 text-sm">
                <div className="flex gap-3">
                  <CalendarDays size={18} className="shrink-0 text-[#3F6392]" />
                  <span>
                    {date
                      ? appointmentDate(`${date}T00:00:00+07:00`)
                      : "Choose a date"}
                  </span>
                </div>
                <div className="flex gap-3">
                  <Clock3 size={18} className="shrink-0 text-[#3F6392]" />
                  <span>
                    {selectedSlot
                      ? `${appointmentTime(selectedSlot.startsAt)} – ${appointmentTime(selectedSlot.endsAt)}`
                      : "Choose a time"}
                    <span className="mt-1 block text-xs text-slate-400">
                      Vietnam time (UTC+7)
                    </span>
                  </span>
                </div>
                <div className="flex gap-3">
                  <MapPin size={18} className="shrink-0 text-[#3F6392]" />
                  <span>{department?.location || "Select a department"}</span>
                </div>
              </div>
              {error && (
                <div
                  role="alert"
                  className="mt-5 rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  <p>{error}</p>
                  {unauthorized ? (
                    <Link className="mt-2 inline-block underline" to={loginUrl}>
                      Sign in again
                    </Link>
                  ) : (
                    <Link
                      className="mt-2 inline-block underline"
                      to="/appointments"
                    >
                      Check My Appointments
                    </Link>
                  )}
                </div>
              )}
              <button
                type="submit"
                disabled={!selectedSlot || submitting || !bookingEnabled}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#3F6392] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#2E4B72] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {submitting ? (
                  <LoaderCircle size={18} className="animate-spin" />
                ) : (
                  <Check size={18} />
                )}
                {submitting ? "Confirming…" : "Confirm Appointment"}
              </button>
            </section>
          </aside>
        </form>
      )}
    </main>
  );
}
