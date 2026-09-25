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
  service: string;
  location: string;
  startsAt: string;
  endsAt: string;
  notes: string;
  status: "confirmed" | "cancelled";
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
  services: { name: string; estimatedDuration: number | null }[];
  estimatedServiceTime: number | null;
  estimatedWait: number | null;
  notes: string;
  status: "waiting" | "called" | "serving" | "completed" | "cancelled" | "no_show";
  queueStatus: DepartmentStatus;
  peopleAhead: number | null;
  location: string;
  createdAt: string;
}
