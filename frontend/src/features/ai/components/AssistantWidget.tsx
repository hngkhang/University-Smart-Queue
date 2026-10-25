import { useState, useSyncExternalStore } from "react";
import { Sparkles } from "lucide-react";
import { readSession, SESSION_CHANGED_EVENT } from "../../../services/session";
import { useFloatingPosition } from "../hooks/useFloatingPosition";
import { useAssistant } from "../hooks/useAssistant";
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
  const floating = useFloatingPosition();
  const assistant = useAssistant(open);
  return <>
    <button type="button" className={`sq-ai-launcher${floating.dragging ? " is-dragging" : ""}`} style={{ left: floating.position.x, top: floating.position.y }}
      {...floating.handlers}
      aria-label="Mở trợ lý thủ tục" aria-haspopup="dialog" aria-expanded={open}
      title="Trợ lý thủ tục · Kéo để di chuyển, hoặc dùng phím mũi tên"
      onClick={() => { if (!floating.consumeDragClick()) setOpen(true); }}>
      <Sparkles size={25} strokeWidth={1.65} aria-hidden="true" />
      <span className="sq-ai-launcher-label" aria-hidden="true">Trợ lý thủ tục</span>
    </button>
    {open && <AssistantPanel assistant={assistant} onClose={() => setOpen(false)} onDock={floating.dock} />}
  </>;
}

export default function AssistantWidget() {
  const identity = useSyncExternalStore(subscribe, sessionIdentity, () => "guest");
  // Never retain another account's chat/draft when the session changes.
  return <Widget key={identity} />;
}
