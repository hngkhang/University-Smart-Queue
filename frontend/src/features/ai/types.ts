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
