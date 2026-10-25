import assert from "node:assert/strict";
import test from "node:test";
import { loginRedirect } from "../src/services/loginRedirect.ts";

test("Google students cannot redirect to staff/admin or external sites", () => {
  for (const path of ["/admin", "/staff", "https://evil.test", "//evil.test", "/\\evil.test", "/queue#bad", null]) {
    assert.equal(loginRedirect("student", path), "/queue");
  }
  assert.equal(loginRedirect("student", "/appointments/new?departmentId=123"), "/appointments/new?departmentId=123");
});

test("password sign-in preserves role-specific destinations", () => {
  assert.equal(loginRedirect("admin", "/admin/departments"), "/admin/departments");
  assert.equal(loginRedirect("admin", "/staff"), "/admin");
  assert.equal(loginRedirect("staff", "/staff/history"), "/staff/history");
  assert.equal(loginRedirect("staff", "/admin"), "/staff");
});
