import type { QueueTicket } from "../types";
import { ticketStatusLabels } from "../services/queue";
const time = (value: string) => new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(value));

export default function TicketProgress({ ticket }: { ticket: QueueTicket }) {
  const stages = ["waiting", "called", "serving", "completed"] as const;
  const timestamps = {
    waiting: ticket.createdAt, called: ticket.calledAt, serving: ticket.startedAt,
    completed: ticket.completedAt, cancelled: ticket.cancelledAt, no_show: ticket.noShowAt,
  };
  const endedEarly = ticket.status === "cancelled" || ticket.status === "no_show";
  const visibleStages: QueueTicket["status"][] = endedEarly ? [...stages.slice(0, 3), ticket.status] : [...stages];
  return (
    <ol aria-label="Ticket progress" className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
      {visibleStages.map((status) => {
        const at = ticket.statusHistory?.find((event) => event.status === status)?.at || timestamps[status];
        const reached = !!at || status === ticket.status || (!endedEarly && stages.indexOf(status as typeof stages[number]) <= stages.indexOf(ticket.status as typeof stages[number]));
        return (
          <li key={status} aria-current={ticket.status === status ? "step" : undefined}
            className={`rounded-lg border p-3 text-xs ${reached ? endedEarly && status === ticket.status ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-100 text-slate-400"}`}>
            <span className="block font-semibold">{ticketStatusLabels[status]}</span>
            <span className="mt-1 block">{at ? time(at) : reached ? "Recorded" : endedEarly ? "Not reached" : "Pending"}</span>
          </li>
        );
      })}
    </ol>
  );
}
