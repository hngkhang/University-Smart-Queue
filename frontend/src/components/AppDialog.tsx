import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import "../styles/dialog.css";

export default function AppDialog({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    ref.current?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (focus instanceof HTMLElement) focus.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`sq-dialog ${wide ? "sq-dialog-wide" : ""}`}
      aria-labelledby="app-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <header>
        <div>
          <span className="sq-dialog-eyebrow">
            SMARTQUEUE · ACCOUNT SERVICES
          </span>
          <h2 id="app-dialog-title">{title}</h2>
        </div>
        <button
          type="button"
          className="sq-dialog-close"
          aria-label="Close dialog"
          onClick={onClose}
          disabled={busy}
        >
          <X size={20} />
        </button>
      </header>
      <div className="sq-dialog-body">{children}</div>
    </dialog>
  );
}
