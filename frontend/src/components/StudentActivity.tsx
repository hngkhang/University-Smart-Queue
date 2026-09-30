import { ArrowRight, CalendarDays, Ticket } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import {
  appointmentDate,
  appointmentTime,
  fetchAppointments,
} from "../services/appointments";
import { fetchMyQueue } from "../services/queue";
import { readSession, SESSION_CHANGED_EVENT } from "../services/session";
import type { Appointment, QueueTicket } from "../types";

function ActivityDetails() {
  const [activity, setActivity] = useState<{
    ticket: QueueTicket | null;
    appointment: Appointment | null;
    queueError: boolean;
    appointmentError: boolean;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let pending = false;
    const load = async () => {
      if (pending || document.hidden) return;
      pending = true;
      const [queue, bookings] = await Promise.allSettled([
        fetchMyQueue(),
        fetchAppointments(),
      ]);
      if (active) {
        const appointment =
          bookings.status === "fulfilled"
            ? (bookings.value.appointments
                .filter(
                  (item) =>
                    item.status === "confirmed" &&
                    new Date(item.endsAt).getTime() > Date.now(),
                )
                .sort(
                  (a, b) =>
                    new Date(a.startsAt).getTime() -
                    new Date(b.startsAt).getTime(),
                )[0] ?? null)
            : null;
        setActivity({
          ticket: queue.status === "fulfilled" ? queue.value.ticket : null,
          appointment,
          queueError: queue.status === "rejected",
          appointmentError: bookings.status === "rejected",
        });
      }
      pending = false;
    };
    void load();
    const timer = window.setInterval(() => void load(), 15000);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  return (
    <section className="sq-activity" aria-labelledby="activity-heading">
      <div className="sq-activity-heading">
        <span className="sq-section-kicker">PICK UP WHERE YOU LEFT OFF</span>
        <h2 id="activity-heading">Your activity</h2>
      </div>
      <div className="sq-activity-grid">
        <Link to="/queue" className="sq-activity-card">
          <Ticket size={23} aria-hidden="true" />
          <div>
            <span>Your queue</span>
            <strong>
              {!activity
                ? "Loading your queue..."
                : activity.queueError
                  ? "View your queue details"
                  : activity.ticket
                    ? `${activity.ticket.reference} · ${activity.ticket.departmentName}`
                    : "No active queue ticket"}
            </strong>
            <small>
              {activity?.ticket
                ? activity.ticket.status === "called"
                  ? "It's your turn. Please head to your department."
                  : activity.ticket.status === "serving"
                    ? "Your visit is in progress."
                    : activity.ticket.peopleAhead != null
                      ? `${activity.ticket.peopleAhead} ${activity.ticket.peopleAhead === 1 ? "person" : "people"} ahead of you`
                      : "Open your ticket for details."
                : activity?.queueError
                  ? "We couldn't refresh your queue right now."
                  : "Find a service to join a queue."}
            </small>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
        <Link to="/appointments" className="sq-activity-card">
          <CalendarDays size={23} aria-hidden="true" />
          <div>
            <span>Next appointment</span>
            <strong>
              {!activity
                ? "Loading your appointments..."
                : activity.appointmentError
                  ? "View your appointments"
                  : (activity.appointment?.departmentName ??
                    "Nothing scheduled yet")}
            </strong>
            <small>
              {activity?.appointment
                ? `${appointmentDate(activity.appointment.startsAt)} at ${appointmentTime(activity.appointment.startsAt)} (Vietnam time)`
                : activity?.appointmentError
                  ? "We couldn't refresh your appointments right now."
                  : "Plan your next visit around your day."}
            </small>
          </div>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

export default function StudentActivity() {
  const [session, setSession] = useState(readSession);
  useEffect(() => {
    const refresh = () => setSession(readSession());
    window.addEventListener(SESSION_CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener(SESSION_CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return session?.user.role === "student" ? (
    <ActivityDetails key={session.token} />
  ) : null;
}
