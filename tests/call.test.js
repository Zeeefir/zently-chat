import { test } from "node:test";
import assert from "node:assert/strict";
import { Calls } from "../public/call.js";

test('late offer response never starts ringback or a timeout after answer', async()=>{
  const controller=Object.create(Calls.prototype);let played=0;
  controller.sounds={unlock:async()=>true,play(){played++;},stop(){}};
  controller.draw=()=>{};
  controller.prepare=async()=>{controller.pc={createOffer:async()=>({}),setLocalDescription:async()=>{}};};
  controller.signal=async()=>{controller.answered=true;};
  controller.root={querySelector:()=>({textContent:''})};
  controller.error=message=>assert.fail(message);
  try {await controller.start({id:'peer',demo:false},false);assert.equal(played,0);assert.equal(controller.timeout,undefined);}
  finally {clearTimeout(controller.timeout);}
});

test("caller cancellation closes pending invitation before any media access", async () => {
  let closed = 0,
    notice = "",
    stopped = 0;
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
    controller.sounds = {
      stop() {
        stopped++;
      },
    };
    controller.toast = (text) => (notice = text);
    controller.prepare = () =>
      assert.fail("cancelled call must not acquire media");
    await controller.receive({ kind: "end", callId: "pending-call" });
    assert.equal(controller.incoming, null);
    assert.deepEqual(controller.incomingIce, []);
    assert.equal(closed, 1);
    assert.equal(stopped, 1);
    assert.match(notice, /отменён/);
  } finally {
    globalThis.document = old;
  }
});

test("answer stops ringback before applying the remote description", async () => {
  const controller = Object.create(Calls.prototype);
  let stopped = false,
    applied = false;
  controller.id = "outgoing";
  controller.queue = [];
  controller.sounds = {
    stop() {
      stopped = true;
    },
  };
  controller.root = { querySelector: () => ({ textContent: "" }) };
  controller.pc = {
    async setRemoteDescription() {
      assert.equal(stopped, true);
      applied = true;
    },
  };
  controller.error = (message) => assert.fail(message);
  await controller.receive({
    kind: "answer",
    callId: "outgoing",
    payload: { sdp: { type: "answer", sdp: "test" } },
  });
  assert.equal(applied, true);
});
