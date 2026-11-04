import { test } from "node:test";
import assert from "node:assert/strict";
import { Calls } from "../public/call.js";

test("caller cancellation closes pending invitation before any media access", async () => {
  let closed = 0,
    notice = "";
  const old = globalThis.document;
  globalThis.document = {
    querySelector: () => ({
      oncancel: () => {},
      close() {
        closed++;
      },
    }),
  };
  try {
    const controller = Object.create(Calls.prototype);
    controller.incoming = { callId: "pending-call" };
    controller.incomingIce = [{ candidate: "queued" }];
    controller.toast = (text) => (notice = text);
    controller.prepare = () =>
      assert.fail("cancelled call must not acquire media");
    await controller.receive({ kind: "end", callId: "pending-call" });
    assert.equal(controller.incoming, null);
    assert.deepEqual(controller.incomingIce, []);
    assert.equal(closed, 1);
    assert.match(notice, /отменён/);
  } finally {
    globalThis.document = old;
  }
});
