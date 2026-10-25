import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { finishGoogleLogin } from "../services/googleAuth";

export default function GoogleCallbackPage() {
  const navigate = useNavigate();
  const operation = useRef<Promise<string> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    // Reuse the exchange when StrictMode re-runs the effect: codes are single-use.
    operation.current ??= finishGoogleLogin();
    operation.current.then((path) => {
      if (active) navigate(path, { replace: true });
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Unable to sign in with Google. Please try again.");
    });
    return () => { active = false; };
  }, [navigate]);

  return <main className="mx-auto w-full max-w-lg px-4 py-20">
    <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-slate-900">Student sign-in</h1>
      {error ? <>
        <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>
        <Link to="/login" replace className="mt-6 inline-block font-semibold text-blue-700">Back to sign in</Link>
      </> : <p role="status" className="mt-4 text-slate-600">Verifying your Google account…</p>}
    </div>
  </main>;
}
