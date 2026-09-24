export type DepartmentStatus = "open" | "closed" | "paused";

export interface Department {
  id: string;
  name: string;
  vietnameseName: string;
  description: string;
  status: DepartmentStatus;
  waitingCount: number;
  estimatedWait: number;
  activeCounters: number;
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
