import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router";
import { readSession } from "../services/session";

export default function StudentAccess({ children }: { children: ReactNode }) {
  const location = useLocation();
  const session = readSession();
  if (!session)
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  if (session.user.role !== "student")
    return (
      <main className="mx-auto max-w-3xl px-4 py-20">
        <h1 className="text-2xl font-bold text-slate-900">
          Student appointments
        </h1>
        <p className="mt-3 text-slate-500">
          Please sign in with a student account to book and manage your
          appointments.
        </p>
        <Link
          className="mt-6 inline-block font-semibold text-blue-700"
          to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        >
          Sign in as a student →
        </Link>
      </main>
    );
  return children;
}
