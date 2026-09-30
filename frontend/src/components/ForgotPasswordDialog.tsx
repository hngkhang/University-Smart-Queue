import { useState } from "react";
import type { SubmitEvent } from "react";
import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import AppDialog from "./AppDialog";

export default function ForgotPasswordDialog({
  initialEmail,
  onClose,
}: {
  initialEmail: string;
  onClose: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState("");
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api"}/auth/forgot-password`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, note }),
        },
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Unable to send your request.");
      setSent(data.message);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to connect. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppDialog
      title={sent ? "Request received" : "Forgot your password?"}
      onClose={onClose}
      busy={busy}
    >
      {sent ? (
        <>
          <CheckCircle2 size={40} className="text-emerald-700 mb-4" />
          <p role="status">{sent}</p>
          <div className="sq-dialog-actions">
            <button className="sq-button sq-button-primary" onClick={onClose}>
              Back to sign in <ArrowRight size={16} />
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={submit}>
          <p className="text-slate-600">
            Send a recovery request to your administrator. Only an administrator
            can reset student and staff passwords.
          </p>
          <label htmlFor="recovery-email">Account email</label>
          <input
            autoFocus
            id="recovery-email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Your registered email"
          />
          <label htmlFor="recovery-note">
            Note <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id="recovery-note"
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tell your administrator how they can help. Do not include a password."
          />
          <p className="sq-help">{note.length}/500 characters</p>
          <div className="sq-notice mt-5 flex items-start gap-3">
            <ShieldCheck size={22} className="shrink-0 mt-1" />
            <p>
              Your current password stays the same until your administrator
              verifies your identity and resets it.
            </p>
          </div>
          {error && (
            <p role="alert" className="sq-notice sq-error mt-4">
              {error}
            </p>
          )}
          <div className="sq-dialog-actions">
            <button
              type="button"
              className="sq-button"
              disabled={busy}
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="sq-button sq-button-primary" disabled={busy}>
              {busy ? "Sending…" : "Send request"}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      )}
    </AppDialog>
  );
}
