import { useState, useSyncExternalStore } from "react";
import { MessageCircle } from "lucide-react";
import { readSession, SESSION_CHANGED_EVENT } from "../../../services/session";
import { useFloatingPosition } from "../hooks/useFloatingPosition";
import { useAssistant } from "../hooks/useAssistant";
import { useBookingDraft } from "../hooks/useBookingDraft";
import AssistantPanel from "./AssistantPanel";
import "../styles/assistant.css";

function subscribe(callback: () => void) {
  window.addEventListener(SESSION_CHANGED_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(SESSION_CHANGED_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
const sessionIdentity = () => readSession()?.user.id || "guest";

function Widget() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "booking">("chat");
  const floating = useFloatingPosition();
  const assistant = useAssistant(open && mode === "chat");
  const booking = useBookingDraft(open && mode === "booking");
  return <>
    <button type="button" className={`sq-ai-launcher${floating.dragging ? " is-dragging" : ""}`} style={{ left: floating.position.x, top: floating.position.y }}
      {...floating.handlers}
      aria-label="Mở trợ lý thủ tục" aria-haspopup="dialog" aria-expanded={open}
      title="Trợ lý thủ tục · Kéo để di chuyển, hoặc dùng phím mũi tên"
      onClick={() => { if (!floating.consumeDragClick()) setOpen(true); }}>
      <MessageCircle size={25} strokeWidth={1.65} aria-hidden="true" />
      <span className="sq-ai-launcher-label" aria-hidden="true">Trợ lý thủ tục</span>
    </button>
    {open && <AssistantPanel assistant={assistant} booking={booking} mode={mode} setMode={setMode} onClose={() => setOpen(false)} />}
  </>;
}

export default function AssistantWidget() {
  const identity = useSyncExternalStore(subscribe, sessionIdentity, () => "guest");
  // Never retain another account's chat/draft when the session changes.
  return <Widget key={identity} />;
}
