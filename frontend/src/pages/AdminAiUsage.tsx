import { useEffect, useState } from "react";
import type { SubmitEvent } from "react";
import { Link } from "react-router";
import { Activity, ArrowRight, RefreshCw, Search, ChevronLeft, ChevronRight } from "lucide-react";
import AppDialog from "../components/AppDialog";
import { adminApi } from "../services/admin";
import type { Page } from "../services/admin";
import type { AiMetrics, AiSummary, AiLog } from "../services/adminAi";
import { features, statuses, money, duration, localDate } from "../services/adminAi";
import "../styles/admin-ai.css";

function range(days: number) {
  const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
  return { from: new Date(+new Date(`${today}T00:00:00Z`) - (days - 1) * 86400000).toISOString().slice(0, 10), to: today };
}
function Cards({ metrics }: { metrics: AiMetrics }) {
  const cards = [
    ["Yêu cầu AI", metrics.requests.toLocaleString("vi-VN"), `${metrics.providerCalls} lượt gọi provider`],
    ["Chi phí quy đổi đã tính", money(metrics.knownCostUsd), `${metrics.pricedRequests}/${metrics.requests} yêu cầu đủ dữ liệu chi phí`],
    ["Chi phí TB / yêu cầu", money(metrics.avgCostUsd), "Chỉ tính yêu cầu đủ dữ liệu chi phí"],
    ["Thời gian phản hồi TB", duration(metrics.avgLatencyMs), "Toàn bộ lượt xử lý đã kết thúc"],
    ["Yêu cầu lỗi", String(metrics.failed), "Timeout, kết quả sai hoặc lỗi hệ thống"],
    ["Từ chối trả lời", String(metrics.refused), `${metrics.rejected} bị chặn · ${metrics.cancelled} đã ngắt`],
  ];
  return <div className="aiu-cards">{cards.map(([label, value, hint]) => <article className="aiu-card" key={label}>
    <span>{label}</span><strong>{value}</strong><small>{hint}</small>
  </article>)}</div>;
}
export function AiOverview({ refresh }: { refresh: number }) {
  const [data, setData] = useState<AiSummary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    adminApi<AiSummary>(`/ai/summary?${new URLSearchParams({ ...range(7), scope: "interactive" })}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setData(value); setError(""); } })
      .catch(() => { if (!controller.signal.aborted) setError("Không tải được thống kê AI. Mở AI Usage & Logs để thử lại."); });
    return () => controller.abort();
  }, [refresh]);
  return <section className="aiu-overview" aria-label="Thống kê AI 7 ngày">
    <div className="aiu-section-heading"><div><h2><Activity size={20} /> AI trong 7 ngày qua</h2><p>Hỏi đáp và điền lịch · Theo giờ Việt Nam</p></div>
      <Link className="sq-button" to="/admin/ai">AI Usage &amp; Logs <ArrowRight size={16} /></Link></div>
    {error ? <p role="alert" className="sq-notice sq-error">{error}</p> : data ? <Cards metrics={data.totals} /> : <p role="status">Đang tải thống kê AI…</p>}
  </section>;
}
function LogDetails({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const [item, setItem] = useState<AiLog | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    adminApi<AiLog>(`/ai/logs/${requestId}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) { setItem(value); setError(""); } })
      .catch(err => { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không tải được log."); });
    return () => controller.abort();
  }, [requestId, retry]);
  const sources: Record<string, string> = { provider: "Gemini cung cấp", estimated_chars: "Ước lượng 4 ký tự/token", unknown: "Chưa xác định", incomplete: "Usage chưa đầy đủ" };
  return <AppDialog title="Chi tiết yêu cầu AI" onClose={onClose} wide>
    <div className="aiu-detail">
      <code>{requestId}</code>
      {error ? <div role="alert"><p>{error}</p><button className="sq-button" onClick={() => setRetry(v => v + 1)}>Thử lại</button></div> : !item ? <p role="status">Đang tải…</p> : <>
        <dl className="aiu-detail-grid">
          <div><dt>Tính năng</dt><dd>{features[item.feature]}</dd></div>
          <div><dt>Trạng thái</dt><dd>{statuses[item.status]}</dd></div>
          <div><dt>Thời gian (Việt Nam)</dt><dd>{localDate(item.startedAt)}</dd></div>
          <div><dt>Thời gian xử lý</dt><dd>{duration(item.latencyMs)}</dd></div>
          <div><dt>Prompt version</dt><dd>{item.promptVersion}</dd></div>
          <div><dt>Lý do / mã lỗi</dt><dd>{item.reasonCode || "—"}</dd></div>
          <div><dt>Chi phí quy đổi đầy đủ</dt><dd>{money(item.costUsd)}</dd></div>
          <div><dt>Chi phí đã tính được</dt><dd>{money(item.knownCostUsd)}</dd></div>
          <div><dt>Gói khai báo</dt><dd>{item.billingTier}</dd></div>
          <div><dt>Ước tính theo gói</dt><dd>{money(item.billingEstimateUsd)}</dd></div>
          <div><dt>Phương thức</dt><dd>{item.transport}</dd></div>
          <div><dt>LLM tools đã gọi</dt><dd>{item.toolsCalled?.length ? item.toolsCalled.join(", ") : "Không có"}</dd></div>
        </dl>
        <h3>Các lần gọi provider ({item.providerCalls?.length || 0})</h3>
        {!item.providerCalls?.length && <p>Không gọi Gemini trong yêu cầu này; chi phí provider bằng 0.</p>}
        {item.providerCalls?.map((call, index) => <section className="aiu-call" key={call.callId}>
          <h4>{index + 1}. {call.kind === "generation" ? "Sinh câu trả lời" : call.kind === "embedding_query" ? "Embedding câu hỏi" : "Embedding tài liệu"}</h4>
          <p><strong>{call.model}</strong> · {call.status === "success" ? "Hoàn tất" : "Lỗi / chưa hoàn tất"} · {duration(call.latencyMs)}</p>
          {call.errorCode && <p>Mã lỗi: <code>{call.errorCode}</code></p>}
          <p>Input: {call.usage.inputTokens ?? "?"} · Output: {call.usage.outputTokens ?? "?"} · Thinking: {call.usage.thinkingTokens} · Cached: {call.usage.cachedTokens}</p>
          <p>Nguồn token: <strong>{sources[call.usage.source]}</strong></p>
          <p>Chi phí quy đổi: <strong>{money(call.costUsd)}</strong></p>
          {call.price ? <p className="aiu-muted">Đơn giá USD / 1M token: input {call.price.input}, output (gồm thinking) {call.price.output}, cached {call.price.cached}. Phiên bản {call.price.version}. <a href={call.price.source} target="_blank" rel="noreferrer">Nguồn bảng giá</a></p> : <p>Chưa có đơn giá cho model này.</p>}
        </section>)}
        <p className="aiu-muted">Không lưu câu hỏi, câu trả lời, nội dung tài liệu, danh tính hay khóa API. Chi phí là ước tính, không phải hóa đơn Google.</p>
      </>}
    </div>
  </AppDialog>;
}
type Day = AiMetrics & { date: string };
function Charts({ days }: { days: Day[] }) {
  return <div className="aiu-charts">{(["requests", "knownCostUsd"] as const).map(metric => {
    const maximum = Math.max(...days.map(day => day[metric]), 1e-9);
    return <section className="aiu-panel" key={metric}>
      <h2>{metric === "requests" ? "Yêu cầu theo ngày" : "Chi phí quy đổi theo ngày"}</h2>
      <p className="aiu-muted">Cao nhất: {metric === "requests" ? `${Math.max(...days.map(day => day.requests))} yêu cầu` : money(Math.max(...days.map(day => day.knownCostUsd)))}</p>
      <p className="aiu-muted">{metric === "requests" ? "Một lượt tương tác được tính là một yêu cầu." : "Gồm phần đã tính được; ngày thiếu usage có dấu *."}</p>
      <div className="aiu-chart-scroll" tabIndex={0} aria-label="Biểu đồ theo ngày, cuộn để xem thêm">
        <div className="aiu-bars" style={{ minWidth: Math.max(days.length * 28, 240) }} role="img" aria-label={`${metric === "requests" ? "Số yêu cầu" : "Chi phí"} theo ngày. Bảng số liệu chi tiết ở bên dưới.`}>
          {days.map((day, index) => <div className="aiu-bar-column" key={day.date} title={`${day.date}: ${metric === "requests" ? day.requests : money(day.knownCostUsd)}${day.pricedRequests < day.requests ? " (thiếu dữ liệu chi phí)" : ""}`}>
            <div className={`aiu-bar ${metric === "knownCostUsd" ? "aiu-bar-cost" : ""}`} style={{ height: `${day[metric] / maximum * 100}%`, minHeight: day[metric] ? 3 : 0 }} />
            <span>{days.length <= 14 || index % Math.ceil(days.length / 10) === 0 ? day.date.slice(5).split("-").reverse().join("/") : ""}{metric === "knownCostUsd" && day.pricedRequests < day.requests ? "*" : ""}</span>
          </div>)}
        </div>
      </div>
    </section>;
  })}</div>;
}
export default function AdminAiUsage() {
  const [filters, setFilters] = useState({ ...range(7), scope: "interactive", feature: "", status: "", model: "", requestId: "", sort: "newest" });
  const [applied, setApplied] = useState(filters);
  const [preset, setPreset] = useState("7");
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<{ summary: AiSummary; days: Day[]; logs: Page<AiLog> } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = new URLSearchParams({ ...applied, page: String(page) }).toString();
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    async function load(showLoading = true) {
      if (inFlight) return;
      inFlight = true;
      if (showLoading) setLoading(true);
      setError("");
      try {
        const [summary, series, logs] = await Promise.all([
          adminApi<AiSummary>(`/ai/summary?${query}`, { signal: controller.signal }),
          adminApi<{ days: Day[] }>(`/ai/timeseries?${query}`, { signal: controller.signal }),
          adminApi<Page<AiLog>>(`/ai/logs?${query}`, { signal: controller.signal }),
        ]);
        if (!controller.signal.aborted) {
          const last = Math.max(1, Math.ceil(logs.total / logs.pageSize));
          if (page > last) { setPage(last); return; }
          setData({ summary, days: series.days, logs });
        }
      } catch (err) { if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "Không tải được dữ liệu AI."); }
      finally { inFlight = false; if (showLoading && !controller.signal.aborted) setLoading(false); }
    }
    void load();
    const interval = window.setInterval(() => { if (document.visibilityState === "visible") void load(false); }, 30000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [query, page, refresh]);
  const update = (key: keyof typeof filters, value: string) => setFilters(previous => ({ ...previous, [key]: value }));
  function apply(event: SubmitEvent<HTMLFormElement>) { event.preventDefault(); setPage(1); setApplied({ ...filters, requestId: filters.requestId.trim() }); setRefresh(v => v + 1); }
  return <div className="aiu-page">
    <form className="aiu-filters aiu-panel" onSubmit={apply}>
      <div className="aiu-section-heading"><div><h2>Phạm vi thống kê</h2><p>Ngày theo múi giờ Việt Nam · Tự cập nhật mỗi 30 giây</p></div>
        <button type="button" className="sq-button" disabled={loading} onClick={() => setRefresh(v => v + 1)}><RefreshCw size={16} /> Làm mới</button></div>
      <div className="aiu-filter-grid">
        <label>Khoảng thời gian<select value={preset} onChange={e => { setPreset(e.target.value); if (e.target.value !== "custom") setFilters(previous => ({ ...previous, ...range(Number(e.target.value)) })); }}>
          <option value="1">Hôm nay</option><option value="7">7 ngày qua</option><option value="30">30 ngày qua</option><option value="custom">Tùy chọn</option></select></label>
        <label>Từ ngày<input required type="date" value={filters.from} onChange={e => { setPreset("custom"); update("from", e.target.value); }} /></label>
        <label>Đến ngày<input required type="date" min={filters.from} value={filters.to} onChange={e => { setPreset("custom"); update("to", e.target.value); }} /></label>
        <label>Phạm vi<select value={filters.scope} onChange={e => setFilters(previous => ({ ...previous, scope: e.target.value, feature: "" }))}>
          <option value="interactive">Tương tác người dùng</option><option value="ingest">Nạp tài liệu</option><option value="all">Tất cả hoạt động</option></select></label>
        <label>Tính năng<select value={filters.feature} onChange={e => update("feature", e.target.value)}><option value="">Tất cả trong phạm vi</option>
          {Object.entries(features).filter(([key]) => filters.scope === "all" || (filters.scope === "ingest" ? key === "knowledge_ingest" : key !== "knowledge_ingest")).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Trạng thái<select value={filters.status} onChange={e => update("status", e.target.value)}><option value="">Tất cả trạng thái</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Model<select value={filters.model} onChange={e => update("model", e.target.value)}><option value="">Tất cả model</option>{data?.summary.models.map(model => <option key={model} value={model}>{model}</option>)}</select></label>
        <label>Sắp xếp logs<select value={filters.sort} onChange={e => update("sort", e.target.value)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option><option value="cost">Chi phí đã tính cao nhất</option><option value="latency">Thời gian lâu nhất</option></select></label>
      </div>
      <div className="aiu-search-row"><label>Request ID<input maxLength={36} value={filters.requestId} onChange={e => update("requestId", e.target.value)} placeholder="Nhập ID hoặc phần đầu của ID" /></label>
        <button className="sq-button sq-button-primary" type="submit" disabled={loading}><Search size={16} /> Áp dụng bộ lọc</button></div>
    </form>
    {error && <div className="sq-notice sq-error" role="alert">{error} <button className="sq-button" onClick={() => setRefresh(v => v + 1)}>Thử lại</button></div>}
    {loading && <p role="status" className="aiu-loading">Đang cập nhật thống kê AI…</p>}
    {!loading && !error && data && <>
      <div className="aiu-section-heading"><p>{data.summary.from} → {data.summary.to} · {data.summary.scope === "interactive" ? "Tương tác người dùng" : data.summary.scope === "ingest" ? "Nạp tài liệu" : "Tất cả hoạt động"}</p><small>Cập nhật: {localDate(data.summary.generatedAt)}</small></div>
      {(data.summary.logging.failedWrites > 0 || data.summary.logging.pendingWrites > 0) && <p role="status" className="sq-notice">Trong phiên máy chủ từ {localDate(data.summary.logging.since)}: {data.summary.logging.failedWrites} log ghi thất bại, {data.summary.logging.pendingWrites} log đang chờ. Số liệu có thể chưa đầy đủ.</p>}
      <Cards metrics={data.summary.totals} />
      <div className="aiu-explanation">
        <p><strong>Chi phí quy đổi theo giá niêm yết USD, không phải hóa đơn Google.</strong> {data.summary.totals.estimatedRequests} yêu cầu có token embedding ước lượng (4 ký tự/token). {data.summary.totals.requests - data.summary.totals.pricedRequests} yêu cầu chưa đủ dữ liệu chi phí. Tổng hiển thị gồm phần đã tính được của các yêu cầu này.</p>
        <p>Ước tính theo gói free/paid đã khai báo: <strong>{money(data.summary.totals.billingKnownRequests ? data.summary.totals.billingEstimateUsd : null)}</strong> · Có dữ liệu cho {data.summary.totals.billingKnownRequests}/{data.summary.totals.requests} yêu cầu. Gói chưa cấu hình hoặc usage thiếu không được coi là chi phí bằng 0.</p>
        <p>Token đã ghi: input {data.summary.totals.inputTokens.toLocaleString("vi-VN")} · output {data.summary.totals.outputTokens.toLocaleString("vi-VN")} · thinking {data.summary.totals.thinkingTokens.toLocaleString("vi-VN")}. Bộ lọc model chọn toàn bộ yêu cầu có gọi model đó, gồm các lượt gọi liên quan.</p>
      </div>
      {!data.summary.totals.requests && <div className="aiu-empty"><Activity size={32} /><h2>Chưa có yêu cầu trong khoảng này</h2><p>Thử hỏi trợ lý, điền lịch bằng AI hoặc chọn khoảng ngày khác. Lịch sử bắt đầu được lưu từ khi bật module này.</p></div>}
      <Charts days={data.days} />
      <section className="aiu-panel"><h2>Phân bổ theo tính năng</h2><div className="aiu-feature-grid">{data.summary.features.length ? data.summary.features.map(item => <article key={item._id}><h3>{features[item._id]}</h3><strong>{item.requests} yêu cầu</strong><p>{money(item.knownCostUsd)} · TB {duration(item.avgLatencyMs)}</p><small>{item.pricedRequests}/{item.requests} đủ dữ liệu chi phí · {item.failed} lỗi · {item.refused} từ chối</small></article>) : <p className="aiu-muted">Chưa có dữ liệu.</p>}</div></section>
      <details className="aiu-panel aiu-daily"><summary>Xem bảng số liệu theo ngày</summary><div className="aiu-table-scroll"><table><caption className="aiu-sr-only">Số liệu theo ngày, múi giờ Việt Nam</caption><thead><tr><th>Ngày</th><th>Yêu cầu</th><th>Chi phí đã tính</th><th>Đủ dữ liệu chi phí</th><th>Latency TB</th><th>Lỗi / từ chối</th></tr></thead><tbody>{data.days.map(day => <tr key={day.date}><td>{day.date}</td><td>{day.requests}</td><td>{money(day.knownCostUsd)}</td><td>{day.pricedRequests}/{day.requests}</td><td>{duration(day.avgLatencyMs)}</td><td>{day.failed} / {day.refused}</td></tr>)}</tbody></table></div></details>
      <section className="aiu-panel"><div className="aiu-section-heading"><div><h2>Nhật ký yêu cầu</h2><p>{data.logs.total.toLocaleString("vi-VN")} kết quả · Chọn ID để xem các lần gọi provider</p></div></div>
        <div className="aiu-table-scroll"><table><caption className="aiu-sr-only">Nhật ký AI đã lọc</caption><thead><tr><th>Thời gian / Request ID</th><th>Tính năng / Model</th><th>Trạng thái</th><th>Token in / out</th><th>Latency</th><th>Chi phí quy đổi</th></tr></thead>
          <tbody>{data.logs.items.map(item => <tr key={item.requestId}><td>{localDate(item.startedAt)}<button className="aiu-id" title={item.requestId} onClick={() => setSelected(item.requestId)} aria-label={`Xem yêu cầu ${item.requestId}`}>{item.requestId.slice(0, 8)}… <ArrowRight size={13} /></button></td>
            <td>{features[item.feature]}<small>{item.models.join(", ") || "Không gọi provider"}</small></td><td><span className={`aiu-status aiu-${item.status}`}>{statuses[item.status]}</span>{item.reasonCode && <small>{item.reasonCode}</small>}</td><td>{item.inputTokens?.toLocaleString("vi-VN") ?? "?"} / {item.outputTokens?.toLocaleString("vi-VN") ?? "?"}<small>Thinking: {item.thinkingTokens ?? "?"}</small></td><td>{duration(item.latencyMs)}</td><td>{item.costUsd == null ? `${money(item.knownCostUsd)} + ?` : money(item.costUsd)}<small>{item.costStatus === "estimated" ? "Có token ước lượng" : item.costStatus === "incomplete" ? "Thiếu dữ liệu" : item.costStatus === "no_calls" ? "Không gọi provider" : "Token từ Gemini"}</small></td></tr>)}</tbody></table></div>
        {!data.logs.items.length && <p className="aiu-muted">Không có log phù hợp.</p>}
        <div className="aiu-pagination"><span>Trang {page} / {Math.max(1, Math.ceil(data.logs.total / data.logs.pageSize))}</span><div><button className="sq-button" disabled={page <= 1} onClick={() => setPage(v => v - 1)}><ChevronLeft size={16} /> Trước</button><button className="sq-button" disabled={page * data.logs.pageSize >= data.logs.total} onClick={() => setPage(v => v + 1)}>Sau <ChevronRight size={16} /></button></div></div>
      </section>
    </>}
    {selected && <LogDetails key={selected} requestId={selected} onClose={() => setSelected(null)} />}
  </div>;
}
