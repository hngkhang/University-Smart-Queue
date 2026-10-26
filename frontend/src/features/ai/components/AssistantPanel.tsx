import { useEffect, useRef } from "react";
import { Send, X } from "lucide-react";
import { Link, useLocation } from "react-router";
import { readSession } from "../../../services/session";
import { useAssistant } from "../hooks/useAssistant";
import SourceCard from "./SourceCard";
import { useBookingDraft } from "../hooks/useBookingDraft";
import BookingDraftCard from "./BookingDraftCard";

const suggestions = ["Xin bảng điểm thì chọn phòng nào?", "Tôi có thể chọn nhiều dịch vụ không?", "Quy định đặt và hủy lịch là gì?"];

export default function AssistantPanel({ onClose, assistant, booking, mode, setMode }: {
  onClose: () => void;
  assistant: ReturnType<typeof useAssistant>;
  booking: ReturnType<typeof useBookingDraft>;
  mode: "chat" | "booking";
  setMode: (mode: "chat" | "booking") => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const location = useLocation();
  const signedIn = Boolean(readSession());
  const isStudent = readSession()?.user.role === "student";
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
        <div className="sq-ai-heading"><h2 id="sq-ai-title">Trợ lý SmartQueue</h2></div>
        <button type="button" className="sq-ai-icon" aria-label="Đóng trợ lý" onClick={onClose} autoFocus><X size={20} /></button>
      </header>
      <div className="sq-ai-modes" role="group" aria-label="Chế độ trợ lý">
        <button type="button" aria-pressed={mode === "chat"} onClick={() => setMode("chat")}>Hỏi đáp thủ tục</button>
        <button type="button" aria-pressed={mode === "booking"} onClick={() => setMode("booking")}>Hỗ trợ đặt lịch</button>
      </div>
      {mode === "chat" ? <>
      <div className="sq-ai-content">
        {!messages.length && <div className="sq-ai-welcome">
          <h3>Bạn cần hỗ trợ thủ tục nào?</h3>
          <p>Hỏi về dịch vụ, lịch hẹn hoặc hàng đợi.</p>
          <div className="sq-ai-suggestions">{suggestions.map((text) => <button type="button" key={text} onClick={() => { setDraft(text); input.current?.focus(); }}>
            {text}
          </button>)}</div>
        </div>}
        <div className="sq-ai-messages" role="log" aria-label="Hội thoại" aria-live="polite">
          {messages.map((message) => <article key={message.id} className={`sq-ai-message sq-ai-message-${message.role}`}>
            <span className="sq-ai-sender">{message.role === "user" ? "Bạn" : "Trợ lý"}</span>
            <p>{message.content || (sending ? "Đang tìm câu trả lời…" : "")}</p>
            {!!message.sources?.length && <details className="sq-ai-sources"><summary>Nguồn tham khảo ({message.sources.length})</summary>
              {message.sources.map((source) => <SourceCard key={source.chunkId} source={source} />)}
            </details>}
          </article>)}
          {sending && messages.at(-1)?.role === "assistant" && Boolean(messages.at(-1)?.content) &&
            <p className="sq-ai-progress">Đang trả lời…</p>}
        </div>
        {(error || !status?.canChat) && <div className="sq-ai-notice" role="status">
          {error || status?.message || "Đang kiểm tra kết nối…"}
          <button type="button" onClick={refresh}>Thử lại</button>
        </div>}
        {!signedIn && <Link className="sq-ai-signin" onClick={onClose} to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}>Đăng nhập để sử dụng trợ lý</Link>}
        <div ref={bottom} />
      </div>
      <form className="sq-ai-composer" onSubmit={submit}>
        <label htmlFor="sq-ai-question">Câu hỏi của bạn</label>
        <div className="sq-ai-input-wrap">
          <textarea ref={input} id="sq-ai-question" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={2} placeholder="Nhập câu hỏi về thủ tục…" disabled={sending} />
          <button type="submit" aria-label="Gửi câu hỏi" disabled={!canSend || !draft.trim()}><Send size={18} aria-hidden="true" /></button>
        </div>
      </form>
      </> : <>
        <div className="sq-ai-content">
          {!booking.result && <div className="sq-ai-welcome">
            <h3>Bạn muốn đặt lịch làm gì?</h3>
            <p>Cho biết thủ tục và ngày giờ bạn muốn đến.</p>
            <div className="sq-ai-suggestions"><button type="button" disabled={booking.sending} onClick={() => booking.setText("Tôi muốn xin bảng điểm vào sáng mai, khoảng 9 giờ.")}>Xin bảng điểm vào sáng mai lúc 9 giờ</button></div>
          </div>}
          {booking.sending && <p className="sq-ai-progress" role="status">Đang phân tích nhu cầu đặt lịch…</p>}
          {booking.result && <BookingDraftCard result={booking.result} onClose={onClose} />}
          {booking.error && <div className="sq-ai-notice" role="alert">{booking.error}
            {!booking.status?.canDraft && <button type="button" onClick={booking.refresh}>Thử lại</button>}
          </div>}
          {!booking.error && (!isStudent || !booking.status?.canDraft) && <div className="sq-ai-notice" role="status">
            {!isStudent ? "Cần tài khoản sinh viên để sử dụng hỗ trợ đặt lịch." : booking.status?.message || "Đang kiểm tra kết nối…"}
            {!booking.status?.canDraft && <button type="button" onClick={booking.refresh}>Thử lại</button>}
          </div>}
          {booking.result?.status === "ready" && <button type="button" className="sq-ai-edit-request" onClick={() => booking.setText(booking.text)}>Sửa nhu cầu đặt lịch</button>}
          {!booking.result?.draft && booking.result?.status !== "rejected" && <Link className="sq-ai-signin" to="/appointments/new" onClick={onClose}>Đặt lịch thủ công</Link>}
          {!signedIn && <Link className="sq-ai-signin" to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} onClick={onClose}>Đăng nhập để sử dụng trợ lý</Link>}
        </div>
        {booking.result?.status !== "ready" && <form className="sq-ai-composer" onSubmit={event => { event.preventDefault(); if (isStudent) void booking.send(); }}>
          <label htmlFor="sq-ai-booking-input">Nhu cầu đặt lịch</label>
          <div className="sq-ai-input-wrap">
            <textarea id="sq-ai-booking-input" value={booking.text} onChange={event => booking.setText(event.target.value)} maxLength={2000} rows={2} placeholder="Ví dụ: Xin bảng điểm sáng mai lúc 9 giờ…" disabled={booking.sending} />
            <button type="submit" aria-label="Phân tích nhu cầu đặt lịch" disabled={!isStudent || !booking.status?.canDraft || booking.sending || !booking.text.trim()}><Send size={18} aria-hidden="true" /></button>
          </div>
        </form>}
      </>}
    </div>
  </dialog>;
}
