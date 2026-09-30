export type VisitStatus =
  "waiting" | "called" | "serving" | "completed" | "no_show";
export interface StaffVisit {
  id: string;
  reference: string;
  name: string;
  studentId: string;
  services: { name: string; duration: number }[];
  notes: string;
  joinedAt: number;
  status: VisitStatus;
  calledAt?: number;
  startedAt?: number;
  finishedAt?: number;
}
export interface DemoState {
  waiting: StaffVisit[];
  current: StaffVisit | null;
  history: StaffVisit[];
  paused: boolean;
  notice: string;
}
export type DemoAction =
  | { type: "call" | "start" | "recall" | "complete" | "no_show"; now: number }
  | { type: "pause" }
  | { type: "reset"; now: number };

export function createDemo(now: number): DemoState {
  const visit = (
    number: number,
    name: string,
    service: string,
    minutes: number,
    status: VisitStatus = "waiting",
  ): StaffVisit => ({
    id: `sample-${number}`,
    reference: `Q-${String(number).padStart(3, "0")}`,
    name,
    studentId: `DEMO-${number}`,
    services: [{ name: service, duration: 10 }],
    notes: "",
    joinedAt: now - minutes * 60000,
    status,
  });
  const current = visit(23, "Alex Nguyen", "Transcript Request", 16, "called");
  current.services.push({ name: "Student Confirmation", duration: 5 });
  current.notes =
    "I need a confirmation letter for my internship application. Thank you!";
  current.calledAt = now - 60000;
  const first = visit(24, "Jamie Tran", "Student Confirmation", 12);
  first.notes = "Please help me check which supporting documents are needed.";
  return {
    current,
    waiting: [
      first,
      visit(25, "Taylor Le", "Transcript Request", 9),
      visit(26, "Robin Pham", "Enrollment Support", 6),
      visit(27, "Sam Ho", "Student Confirmation", 3),
    ],
    history: [
      {
        ...visit(22, "Casey Vo", "Transcript Request", 35, "completed"),
        finishedAt: now - 180000,
      },
      {
        ...visit(21, "Morgan Bui", "Student Confirmation", 45, "no_show"),
        finishedAt: now - 1500000,
      },
      {
        ...visit(20, "Avery Phan", "Enrollment Support", 60, "completed"),
        finishedAt: now - 2400000,
      },
    ],
    paused: false,
    notice: "",
  };
}

// Demo transitions only. No request is sent and no database record is changed.
export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === "reset") return createDemo(action.now);
  if (action.type === "pause")
    return {
      ...state,
      paused: !state.paused,
      notice: state.paused
        ? "You can call the next student again."
        : "New calls paused. You can finish your current visit.",
    };
  if (action.type === "call") {
    if (state.current || state.paused || !state.waiting.length) return state;
    const next = state.waiting[0];
    return {
      ...state,
      current: { ...next, status: "called", calledAt: action.now },
      waiting: state.waiting.slice(1),
      notice: `${next.reference} has been called in this demo.`,
    };
  }
  const visit = state.current;
  if (!visit) return state;
  if (action.type === "start" && visit.status === "called")
    return {
      ...state,
      current: { ...visit, status: "serving", startedAt: action.now },
      notice: `Service started for ${visit.reference}.`,
    };
  if (action.type === "recall" && visit.status === "called")
    return {
      ...state,
      current: { ...visit, calledAt: action.now },
      notice: `${visit.reference} called again in this demo.`,
    };
  if (
    (action.type === "complete" && visit.status === "serving") ||
    (action.type === "no_show" && visit.status === "called")
  ) {
    const finished: StaffVisit = {
      ...visit,
      status: action.type === "complete" ? "completed" : "no_show",
      finishedAt: action.now,
    };
    return {
      ...state,
      current: null,
      history: [finished, ...state.history],
      notice:
        action.type === "complete"
          ? `${visit.reference} completed. Ready for the next student.`
          : `${visit.reference} marked as no-show.`,
    };
  }
  return state;
}
