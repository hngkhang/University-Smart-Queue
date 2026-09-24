import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface Props {
  value: string;
  min: string;
  max: string;
  weekdays: number[];
  excludedDates: string[];
  onChange: (date: string) => void;
}

export default function BookingCalendar({
  value,
  min,
  max,
  weekdays,
  excludedDates,
  onChange,
}: Props) {
  const [month, setMonth] = useState(() => (value || min).slice(0, 7));
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const blanks = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const shift = (amount: number) =>
    setMonth(
      new Date(Date.UTC(year, monthNumber - 1 + amount, 1))
        .toISOString()
        .slice(0, 7),
    );
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <div className="mb-4 flex items-center justify-between">
        <p aria-live="polite" className="font-semibold text-slate-800">
          {first.toLocaleDateString("en-GB", {
            month: "long",
            year: "numeric",
            timeZone: "UTC",
          })}
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            aria-label="Previous month"
            disabled={month <= min.slice(0, 7)}
            onClick={() => shift(-1)}
            className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronLeft size={17} />
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={month >= max.slice(0, 7)}
            onClick={() => shift(1)}
            className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-sm">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => (
          <span key={day} className="pb-2 text-xs text-slate-400">
            {day}
          </span>
        ))}
        {Array.from({ length: blanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: days }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const disabled =
            date < min ||
            date > max ||
            !weekdays.includes(new Date(`${date}T00:00:00Z`).getUTCDay()) ||
            excludedDates.includes(date);
          return (
            <button
              key={date}
              type="button"
              disabled={disabled}
              onClick={() => onChange(date)}
              aria-label={new Date(`${date}T00:00:00Z`).toLocaleDateString(
                "en-GB",
                { dateStyle: "full", timeZone: "UTC" },
              )}
              aria-pressed={value === date}
              aria-current={date === min ? "date" : undefined}
              className={`min-h-10 rounded-lg font-medium transition disabled:cursor-not-allowed disabled:text-slate-300 ${value === date ? "bg-[#3F6392] text-white shadow-sm" : "text-slate-700 enabled:hover:bg-blue-50"} ${date === min && value !== date ? "ring-1 ring-inset ring-blue-200" : ""}`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Book up to 30 days ahead. Unavailable days are disabled.
      </p>
    </div>
  );
}
