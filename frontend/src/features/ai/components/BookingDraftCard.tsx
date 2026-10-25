import { useNavigate } from "react-router";
import { useEffect, useRef } from "react";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { saveBookingHandoff, timePreferenceLabel } from "../bookingHandoff";
import type { BookingDraftResult } from "../types";

export default function BookingDraftCard({ result, onClose }: { result: BookingDraftResult; onClose: () => void }) {
  const navigate = useNavigate();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const { draft } = result;
  return <section className="sq-ai-booking-card" aria-label="Bản nháp đặt lịch" aria-live="polite">
    <h3 ref={heading} tabIndex={-1}><CalendarDays size={18} aria-hidden="true" /> {draft ? "Thông tin dự kiến" : "Chưa thể tạo bản nháp"}</h3>
    {draft && <dl>
      <dt>Phòng</dt><dd>{draft.departmentName || "Chọn thêm trong form"}</dd>
      <dt>Dịch vụ</dt><dd>{draft.services.join(", ") || "Chọn thêm trong form"}</dd>
      <dt>Ngày</dt><dd>{draft.date ? draft.date.split("-").reverse().join("/") : "Chọn thêm trong form"}</dd>
      <dt>Ưu tiên</dt><dd>{timePreferenceLabel(draft.timePreference)}</dd>
      {draft.notes && <><dt>Ghi chú</dt><dd>{draft.notes}</dd></>}
    </dl>}
    {result.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
    {draft && <>
      <p>Chưa đặt lịch hoặc giữ chỗ. Hãy kiểm tra thông tin và chọn giờ còn trống ở bước tiếp theo.</p>
      <button type="button" className="sq-ai-booking-continue" onClick={() => {
        try {
          const key = saveBookingHandoff(draft);
          navigate(`/appointments/new${draft.departmentId ? `?department=${encodeURIComponent(draft.departmentId)}` : ""}`, { state: { bookingDraftKey: key } });
        } catch { navigate("/login?redirect=%2Fappointments%2Fnew"); }
        onClose();
      }}>Tiếp tục đặt lịch <ArrowUpRight size={16} aria-hidden="true" /></button>
    </>}
  </section>;
}
