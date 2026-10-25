import { saveSession } from "./session";
import type { SessionUser } from "./session";
import { loginRedirect } from "./loginRedirect";

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api";
const PENDING = "smartqueue_google_login";
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function startGoogleLogin(rememberMe: boolean, redirect: string | null) {
  const response = await fetch(`${API}/auth/google/status`);
  if (!response.ok) throw new Error("The sign-in service is unavailable. Please try again.");
  const config = await response.json() as { enabled: boolean; clientOrigin: string | null };
  if (!config.enabled) throw new Error("Google student sign-in is not configured yet. Please sign in with your email and password.");
  if (config.clientOrigin !== window.location.origin) throw new Error(`Open ${config.clientOrigin}/login to sign in with Google.`);
  if (!window.crypto?.subtle) throw new Error("Google sign-in requires HTTPS or localhost.");
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  sessionStorage.setItem(PENDING, JSON.stringify({ verifier, redirect, createdAt: Date.now() }));
  window.location.assign(`${API}/auth/google?${new URLSearchParams({ challenge, rememberMe: String(rememberMe) })}`);
}

const messages: Record<string, string> = {
  access_denied: "Google sign-in was cancelled. You can try again or use your password.",
  invalid_state: "Google sign-in has expired or was opened in another browser. Please start again.",
  role_conflict: "This email already belongs to a staff or administrator account. Sign in with its password or use another Google account to create a student account.",
  account_disabled: "Your student account has been disabled. Please contact an administrator.",
  account_mismatch: "This Google account does not match your student account. Please contact an administrator.",
  email_not_supported: "Use the Gmail or Google Workspace email registered for your student account, or sign in with your password.",
  google_failed: "Unable to verify your Google account. Please try again.",
};

export async function finishGoogleLogin() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  // Remove the one-time code before rendering or making further requests.
  window.history.replaceState(null, "", window.location.pathname);
  const raw = sessionStorage.getItem(PENDING);
  sessionStorage.removeItem(PENDING);
  if (params.has("error")) throw new Error(messages[params.get("error")!] || messages.google_failed);
  if (!raw || !params.get("code")) throw new Error(messages.invalid_state);
  const pending = JSON.parse(raw) as { verifier: string; redirect: string | null; createdAt: number };
  if (!pending.verifier || !Number.isFinite(pending.createdAt) || Date.now() - pending.createdAt > 11 * 60 * 1000) throw new Error(messages.invalid_state);
  const response = await fetch(`${API}/auth/google/exchange`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: params.get("code"), verifier: pending.verifier }),
  });
  const data = await response.json() as { message?: string; token?: string; user?: SessionUser; rememberMe?: boolean };
  if (!response.ok || !data.token || data.user?.role !== "student") throw new Error(data.message || messages.google_failed);
  saveSession(data.token, data.user, data.rememberMe === true);
  return loginRedirect(data.user.role, pending.redirect);
}
