import type { SubmitEvent } from "react";
import { useState } from "react";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router";

import campusImage from "../assets/hcmute-campus.jpg";
import { saveSession } from "../services/session";
import { startGoogleLogin } from "../services/googleAuth";
import { loginRedirect } from "../services/loginRedirect";
import ForgotPasswordDialog from "../components/ForgotPasswordDialog";

const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://127.0.0.1:5000/api";

type LoginStatus = {
  type: "error" | "success";
  text: string;
};

type LoginResponse = {
  message: string;
  token: string;
  user: {
    id: string;
    fullName: string;
    email: string;
    role: "student" | "staff" | "admin";
    department: string | null;
    studentID: string;
    phone: string;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
  };
};

function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<LoginStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);

  const handleGoogleLogin = async () => {
    if (isSubmitting || isGoogleSubmitting) return;
    setIsGoogleSubmitting(true);
    setStatus(null);
    try {
      await startGoogleLogin(rememberMe, searchParams.get("redirect"));
    } catch (error) {
      setStatus({
        type: "error",
        text: error instanceof Error ? error.message : "Unable to sign in with Google. Please try again.",
      });
      setIsGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting || isGoogleSubmitting) return;

    if (!email.trim() || !password.trim()) {
      setStatus({
        type: "error",
        text: "Please enter your email and password.",
      });
      return;
    }

    setIsSubmitting(true);
    setStatus(null);

    try {
      const response = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          rememberMe,
        }),
      }).catch(() => {
        throw new Error(
          "Cannot connect to the server. Please check your connection and try again. If the problem continues, contact support.",
        );
      });

      const data = (await response.json().catch(() => {
        throw new Error(
          "The sign-in service is unavailable. Please try again later.",
        );
      })) as Partial<LoginResponse> | null;

      if (!response.ok || !data?.token || !data.user) {
        throw new Error(data?.message || "Unable to login right now.");
      }

      const authenticatedUser = data.user;
      saveSession(data.token, authenticatedUser, rememberMe);

      setStatus({
        type: "success",
        text: `Welcome back, ${authenticatedUser.fullName}. Redirecting...`,
      });

      window.setTimeout(() => {
        navigate(loginRedirect(authenticatedUser.role, searchParams.get("redirect")));
      }, 700);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to login right now.";

      setStatus({
        type: "error",
        text: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="flex min-h-[calc(100vh-5rem)] bg-[#E2E8F0] lg:min-h-[calc(100vh-6rem)]">
      {/* Left side: Full height Image */}
      <div className="hidden lg:block lg:w-[55%] xl:w-[60%] relative">
        <img
          src={campusImage}
          alt="HCMUTE Campus"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>

      {/* Right side: Login Form */}
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-[440px]">
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"
          >
            <h3 className="text-2xl font-bold text-slate-900 mb-6 text-center">
              Sign In
            </h3>

            <label className="mt-6 block">
              <span className="text-sm font-semibold text-slate-700">
                Email
              </span>
              <span className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                <Mail size={19} className="text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Enter your email"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
              </span>
            </label>

            <label className="mt-4 block">
              <span className="text-sm font-semibold text-slate-700">
                Password
              </span>
              <span className="mt-2 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 transition focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
                <LockKeyhole size={19} className="text-slate-400" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                >
                  {showPassword ? <EyeOff size={19} /> : <Eye size={19} />}
                </button>
              </span>
            </label>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <label className="flex items-center gap-2 font-medium text-slate-600"></label>

              <button
                type="button"
                className="font-semibold text-blue-700 transition hover:text-blue-900"
                onClick={() => setForgotPasswordOpen(true)}
              >
                Forgot password?
              </button>
            </div>

            {status ? (
              <p
                role={status.type === "error" ? "alert" : "status"}
                className={`mt-5 rounded-lg border px-4 py-3 text-sm font-medium ${
                  status.type === "success"
                    ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                    : "border-red-100 bg-red-50 text-red-700"
                }`}
              >
                {status.text}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || isGoogleSubmitting}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-[#3F6392] px-4 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#2E4B72] hover:shadow active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>

            <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
              <span className="h-px flex-1 bg-slate-200" />
              <span>or</span>
              <span className="h-px flex-1 bg-slate-200" />
            </div>
            <button
              type="button"
              onClick={() => void handleGoogleLogin()}
              disabled={isSubmitting || isGoogleSubmitting}
              className="flex w-full items-center justify-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isGoogleSubmitting ? "Connecting to Google..." : "Continue with Google"}
            </button>
            <p className="mt-3 text-center text-xs text-slate-500">
              Google sign-in is available for students.
            </p>
          </form>
        </div>
      </div>
      {forgotPasswordOpen && (
        <ForgotPasswordDialog
          initialEmail={email}
          onClose={() => setForgotPasswordOpen(false)}
        />
      )}
    </main>
  );
}

export default LoginPage;
