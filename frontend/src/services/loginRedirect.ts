import type { SessionUser } from "./session";

export function loginRedirect(role: SessionUser["role"], redirect: string | null) {
  if (role === "admin") return /^\/admin(?:\/(?:requests|users|activity|departments))?$/.test(redirect || "") ? redirect! : "/admin";
  if (role === "staff") return redirect === "/staff/history" ? redirect : "/staff";
  return redirect && /^\/(?:appointments(?:\/new)?|queue|departments\/[a-f\d]{24})(?:\?[^#]*)?$/i.test(redirect) ? redirect : "/queue";
}
