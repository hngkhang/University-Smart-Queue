export type DepartmentStatus = "open" | "closed" | "paused";

export interface Department {
  id: string;
  name: string;
  vietnameseName: string;
  description: string;
  status: DepartmentStatus;
  waitingCount: number;
  estimatedWait: number | null;
  activeCounters: number | null;
  services: string[];
  location: string;
  workingHours: string;
  serviceDetails?: { name: string; estimatedDuration: number }[];
  bookingEnabled?: boolean;
  bookingWeekdays?: number[];
  bookingExcludedDates?: string[];
}

export interface Appointment {
  _id: string;
  reference: string;
  department: string;
  departmentName: string;
  services: { name: string; estimatedDuration: number }[];
  estimatedServiceTime: number;
  location: string;
  startsAt: string;
  endsAt: string;
  notes: string;
  status: "confirmed" | "cancelled";
  cancellationReason?: "end_of_day" | null;
  serviceStatus?: QueueTicket["status"] | null;
  queueReference?: string | null;
  queueAdmissionBlocked?: boolean;
}

export interface AppointmentSlot {
  startsAt: string;
  endsAt: string;
  available: boolean;
}

export interface QueueTicket {
  _id: string;
  reference: string;
  department: string;
  departmentName: string;
  serviceDate: string;
  appointment?: string | null;
  appointmentReference?: string | null;
  appointmentStartsAt?: string | null;
  services: { name: string; estimatedDuration: number | null }[];
  estimatedServiceTime: number | null;
  estimatedWait: number | null;
  notes: string;
  status: "waiting" | "called" | "serving" | "completed" | "cancelled" | "no_show";
  queueStatus: DepartmentStatus;
  peopleAhead: number | null;
  location: string;
  createdAt: string;
  calledAt?: string | null;
  lastCalledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: "end_of_day" | null;
  noShowAt?: string | null;
  assignedStaffName?: string;
  statusHistory?: { status: QueueTicket["status"]; at: string }[];
}
