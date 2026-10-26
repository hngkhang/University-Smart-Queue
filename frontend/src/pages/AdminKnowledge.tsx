import { useEffect, useRef, useState } from "react";
import type { SubmitEvent } from "react";
import { CheckCircle2, FileText, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { adminApi } from "../services/admin";

interface KnowledgeStatus {
  sourceFile: string;
  maxBytes: number;
  expectedDocumentId: string;
  current: { documentId: string; version: string; bytes: number; updatedAt: string } | null;
  state: "idle" | "processing" | "ready" | "failed";
  message: string;
  locked: boolean;
}
const formatDate = (value: string) => new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh",
}).format(new Date(value));

export default function AdminKnowledge() {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refresh, setRefresh] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      try {
        const result = await adminApi<KnowledgeStatus>("/knowledge", { signal: controller.signal });
        if (!controller.signal.aborted) setStatus(result);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không thể đọc thông tin tài liệu.");
      } finally { loading = false; }
    }
    void load();
    const timer = window.setInterval(() => { void load(); }, 5000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [refresh]);

  function selectFile(selected: File | undefined) {
    setFile(null);
    setError("");
    setMessage("");
    if (!selected) return;
    if (!/\.md$/i.test(selected.name)) setError("Chỉ cho phép tải lên file .md.");
    else if (!selected.size) setError("File tài liệu không được để trống.");
    else if (selected.size > (status?.maxBytes || 2 * 1024 * 1024)) setError("File vượt quá giới hạn 2 MB.");
    else { setFile(selected); return; }
    if (input.current) input.current.value = "";
  }

  async function upload(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy || status?.locked) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await adminApi<{ message: string }>("/knowledge", {
        method: "PUT", body: file,
        headers: { "Content-Type": "application/octet-stream", "X-File-Name": encodeURIComponent(file.name) },
      });
      setMessage(result.message);
      setFile(null);
      if (input.current) input.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mất kết nối. Kiểm tra trạng thái tài liệu trước khi thử lại.");
    } finally { setBusy(false); setRefresh(value => value + 1); }
  }

  const locked = busy || !!status?.locked;
  return (
    <div className="aw-knowledge">
      {error && <div className="aw-error" role="alert">{error}</div>}
      {message && <div className="aw-success" role="status"><CheckCircle2 size={18} />{message}</div>}
      <section className="aw-panel aw-knowledge-current">
        <div className="aw-panel-heading">
          <div><h2><FileText size={20} /> Tài liệu hiện tại</h2><p>Nguồn hướng dẫn thủ tục cho chatbot sinh viên</p></div>
          <button type="button" className="sq-button" onClick={() => { setError(""); setRefresh(value => value + 1); }} aria-label="Làm mới thông tin tài liệu"><RefreshCw size={17} /></button>
        </div>
        {status ? <div className="aw-knowledge-body">
          <p className="aw-knowledge-filename">{status.sourceFile}</p>
          {status.current ? <dl className="aw-knowledge-details">
            <div><dt>Mã tài liệu</dt><dd>{status.current.documentId}</dd></div>
            <div><dt>Phiên bản</dt><dd>{status.current.version}</dd></div>
            <div><dt>Dung lượng</dt><dd>{(status.current.bytes / 1024).toFixed(1)} KB</dd></div>
            <div><dt>Cập nhật (giờ Việt Nam)</dt><dd>{formatDate(status.current.updatedAt)}</dd></div>
          </dl> : <p>Chưa có file tài liệu. Tải lên file đầu tiên với mã bên dưới.</p>}
          <p className="aw-knowledge-status" role="status">
            {locked && status.state !== "failed" ? "Kho tài liệu đang cập nhật. Chatbot sẽ hoạt động lại khi xử lý xong." : status.message}
          </p>
        </div> : <p className="aw-knowledge-body">{error ? "Chưa đọc được thông tin. Hãy làm mới để thử lại." : "Đang tải thông tin tài liệu…"}</p>}
      </section>
      <section className="aw-panel">
        <div className="aw-panel-heading"><div><h2>Thay thế tài liệu</h2><p>Tên file lưu trên hệ thống được giữ nguyên sau khi tải lên.</p></div><Upload size={22} /></div>
        <form className="aw-knowledge-body" onSubmit={upload} aria-busy={busy}>
          <label className="aw-knowledge-picker" htmlFor="knowledge-file">
            <FileText size={30} aria-hidden="true" />
            <strong>Chọn tài liệu Markdown</strong>
            <span>Chỉ nhận .md · UTF-8 · tối đa 2 MB</span>
            <input ref={input} id="knowledge-file" type="file" accept=".md" disabled={!status || locked} onChange={event => selectFile(event.target.files?.[0])} aria-describedby="knowledge-help" />
          </label>
          {file && <p className="aw-knowledge-selection">Đã chọn: <strong>{file.name}</strong> · {(file.size / 1024).toFixed(1)} KB</p>}
          <div id="knowledge-help" className="aw-knowledge-help">
            <p>Giữ nguyên mã tài liệu và cập nhật phiên bản bên trong file:</p>
            <pre>{`- Mã tài liệu: ${status?.expectedDocumentId || "SQ-KB-STUDENT-GUIDE"}\n- Phiên bản: <phiên bản mới>`}</pre>
            <p>Nội dung mới sẽ thay thế hướng dẫn cũ của chatbot. Chỉ tải tài liệu được phép cung cấp cho sinh viên.</p>
          </div>
          <button className="sq-button sq-button-primary" type="submit" disabled={!status || !file || locked}>
            {busy ? <LoaderCircle className="aw-knowledge-spin" size={18} /> : <Upload size={18} />}
            {busy ? "Đang cập nhật kiến thức…" : "Tải lên và thay thế tài liệu"}
          </button>
          {busy && <p role="status" className="aw-knowledge-wait">Việc xử lý có thể mất vài phút. Vui lòng chờ kết quả cập nhật.</p>}
        </form>
      </section>
    </div>
  );
}
