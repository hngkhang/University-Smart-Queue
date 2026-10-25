import { useEffect, useRef } from "react";
import { ArrowDownLeft, ArrowDownRight, ArrowUpRight, BookOpen, MessageCircle, RotateCcw, Send, Sparkles, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { readSession } from "../../../services/session";
import { useAssistant } from "../hooks/useAssistant";
import SourceCard from "./SourceCard";

const suggestions = ["Xin bảng điểm thì chọn phòng nào?", "Tôi có thể chọn nhiều dịch vụ không?", "Quy định đặt và hủy lịch là gì?"];

export default function AssistantPanel({ onClose, onDock, assistant }: {
  onClose: () => void;
  onDock: (side: "left" | "right") => void;
  assistant: ReturnType<typeof useAssistant>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();
  const signedIn = Boolean(readSession());
  const { status, messages, error, sending, send, refresh, draft, setDraft } = assistant;
  const canSend = signedIn && status?.canChat && !sending;

  useEffect(() => {
    const focused = document.activeElement;
    const overflow = document.body.style.overflow;
    const element = dialog.current;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (focused instanceof HTMLElement && focused.isConnected) focused.focus();
    };
  }, []);

  useEffect(() => {
    if (messages.length || sending) bottom.current?.scrollIntoView({ block: "nearest" });
  }, [messages, sending]);

  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend || !draft.trim()) return;
    const text = draft;
    setDraft("");
    if (!await send(text)) setDraft(text);
  }

  return <dialog ref={dialog} className="sq-ai-panel" aria-labelledby="sq-ai-title" onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => {
    if (event.target === event.currentTarget) {
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose();
    }
  }}>
    <div className="sq-ai-shell" lang="vi">
      <header className="sq-ai-header">
        <div className="sq-ai-avatar"><Sparkles size={21} aria-hidden="true" /></div>
        <div className="sq-ai-heading"><span>SMARTQUEUE ASSISTANT</span><h2 id="sq-ai-title">Trợ lý thủ tục</h2></div>
        <button type="button" className="sq-ai-icon" aria-label="Đóng trợ lý" onClick={onClose} autoFocus><X size={20} /></button>
      </header>
      <div className="sq-ai-subheader" role="status"><BookOpen size={14} aria-hidden="true" />
        {status?.canChat ? "Sẵn sàng · Trả lời kèm nguồn tham khảo" : error ? "Tạm thời chưa thể kết nối với trợ lý" : status ? "Trợ lý chưa sẵn sàng · Xem thông báo bên dưới" : "Đang kiểm tra kết nối…"}
      </div>
      <div className="sq-ai-content">
        {!messages.length && <div className="sq-ai-welcome">
          <div className="sq-ai-welcome-icon"><MessageCircle size={27} strokeWidth={1.6} aria-hidden="true" /></div>
          <h3>Bạn cần hỗ trợ thủ tục nào?</h3>
          <p>Hỏi về dịch vụ, cách đặt lịch và hàng đợi. Mỗi câu hỏi nên nêu rõ thủ tục bạn cần hỗ trợ.</p>
          <div className="sq-ai-suggestions">{suggestions.map((text) => <button type="button" key={text} onClick={() => { setDraft(text); input.current?.focus(); }}>
            <span>{text}</span><ArrowUpRight size={16} aria-hidden="true" />
          </button>)}</div>
        </div>}
        <div className="sq-ai-messages" role="log" aria-label="Hội thoại" aria-live="polite">
          {messages.map((message) => <article key={message.id} className={`sq-ai-message sq-ai-message-${message.role}`}>
            <span className="sq-ai-sender">{message.role === "user" ? "Bạn" : "Trợ lý"}</span>
            <p>{message.content}</p>
            {message.sources?.map((source) => <SourceCard key={source.chunkId} source={source} />)}
          </article>)}
          {sending && <p className="sq-ai-progress">Đang tìm câu trả lời…</p>}
        </div>
        <div className="sq-ai-notice" role="status">
          {!status && !error ? "Đang kiểm tra kết nối…" : status?.message}
          {error && <p>{error}</p>}
          {(!status || !status.canChat) && <button type="button" onClick={refresh}><RotateCcw size={13} aria-hidden="true" /> Kiểm tra lại</button>}
        </div>
        {!signedIn && <Link className="sq-ai-signin" onClick={onClose} to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}>Đăng nhập để sử dụng trợ lý <ArrowUpRight size={14} aria-hidden="true" /></Link>}
        <div ref={bottom} />
      </div>
      <form className="sq-ai-composer" onSubmit={submit}>
        <label htmlFor="sq-ai-question">Câu hỏi của bạn</label>
        <div className="sq-ai-input-wrap">
          <textarea ref={input} id="sq-ai-question" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder="Nhập câu hỏi về thủ tục…" aria-describedby="sq-ai-input-help" disabled={sending} />
          <button type="submit" aria-label="Gửi câu hỏi" disabled={!canSend || !draft.trim()}><Send size={18} aria-hidden="true" /></button>
        </div>
        <p id="sq-ai-input-help">{!signedIn ? "Đăng nhập để gửi câu hỏi cho trợ lý." : status?.canChat ? "Kiểm tra nguồn tham khảo trước khi thực hiện thủ tục." : "Bạn có thể soạn câu hỏi. Gửi tin nhắn sẽ mở khi trợ lý sẵn sàng."}</p>
      </form>
      <footer className="sq-ai-footer"><span>Vị trí nút trợ lý</span><div>
        <button type="button" onClick={() => onDock("left")} aria-label="Đặt nút trợ lý ở góc dưới bên trái"><ArrowDownLeft size={14} aria-hidden="true" /> Trái</button>
        <button type="button" onClick={() => onDock("right")} aria-label="Đặt nút trợ lý ở góc dưới bên phải"><ArrowDownRight size={14} aria-hidden="true" /> Phải</button>
      </div></footer>
    </div>
  </dialog>;
}
