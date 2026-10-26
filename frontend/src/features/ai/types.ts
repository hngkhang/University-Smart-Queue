export interface AssistantStatus {
  state: "setup_required" | "ready";
  canChat: boolean;
  message: string;
}

export interface AssistantSource {
  label: number;
  chunkId: string;
  documentId: string;
  version: string;
  section: string;
  excerpt?: string;
  sourceFile?: string;
}

export interface AssistantMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AssistantSource[];
}

export interface BookingDraft {
  departmentId: string | null;
  departmentName: string | null;
  services: string[];
  date: string | null;
  timePreference: { period: "any" | "morning" | "afternoon" | "evening"; time: string | null } | null;
  notes: string;
}

export interface BookingDraftResult {
  status: "ready" | "needs_input" | "out_of_scope" | "rejected";
  message?: string;
  draft: BookingDraft | null;
  missingFields: string[];
  warnings: string[];
  requestId: string;
}

export interface BookingStatus { canDraft: boolean; message: string }
