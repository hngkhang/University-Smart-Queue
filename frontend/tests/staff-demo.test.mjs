import assert from "node:assert/strict";
import test from "node:test";
import { createDemo, demoReducer } from "../src/features/staff/demo.ts";

const now = 1790755200000;

test("a staff member finishes the current visit before taking the next FIFO ticket", () => {
  let state = createDemo(now);
  assert.equal(demoReducer(state, { type: "call", now }), state);
  assert.equal(demoReducer(state, { type: "complete", now }), state);
  state = demoReducer(state, { type: "start", now });
  assert.equal(demoReducer(state, { type: "no_show", now }), state);
  state = demoReducer(state, { type: "complete", now });
  assert.equal(state.current, null);
  assert.equal(state.history[0].reference, "Q-023");
  assert.equal(state.history[0].status, "completed");
  assert.equal(demoReducer(state, { type: "complete", now }), state);
  state = demoReducer(state, { type: "call", now });
  assert.equal(state.current.reference, "Q-024");
  assert.equal(state.waiting.length, 3);
});

test("pausing prevents new calls but allows an existing visit to finish", () => {
  let state = demoReducer(createDemo(now), { type: "pause" });
  state = demoReducer(state, { type: "start", now });
  state = demoReducer(state, { type: "complete", now });
  assert.equal(demoReducer(state, { type: "call", now }), state);
  state = demoReducer(state, { type: "pause" });
  assert.equal(
    demoReducer(state, { type: "call", now }).current.reference,
    "Q-024",
  );
});

test("recalling preserves the current ticket and no-show moves it to history once", () => {
  let state = demoReducer(createDemo(now), { type: "recall", now: now + 5000 });
  assert.equal(state.current.calledAt, now + 5000);
  assert.equal(state.waiting.length, 4);
  state = demoReducer(state, { type: "no_show", now });
  assert.equal(state.current, null);
  assert.equal(state.history[0].status, "no_show");
  assert.equal(demoReducer(state, { type: "no_show", now }), state);
});

test("the demo queue can be exhausted without duplicate visits and reset cleanly", () => {
  let state = createDemo(now);
  while (state.current || state.waiting.length) {
    if (!state.current) state = demoReducer(state, { type: "call", now });
    state = demoReducer(state, { type: "start", now });
    state = demoReducer(state, { type: "complete", now });
  }
  assert.equal(state.history.length, 8);
  assert.equal(new Set(state.history.map((visit) => visit.id)).size, 8);
  assert.equal(demoReducer(state, { type: "call", now }), state);
  const reset = demoReducer(state, { type: "reset", now });
  assert.equal(reset.waiting.length, 4);
  assert.equal(reset.history.length, 3);
  assert.equal(reset.current.status, "called");
});
