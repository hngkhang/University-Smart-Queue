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
}