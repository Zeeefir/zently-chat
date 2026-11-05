import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { messageStatus } from "../public/message-status.js";

test("outgoing ticks distinguish sent, delivered and read for the actual peer", () => {
  const chat = { kind: "direct", members: ["alice", "bob"] },
    message = {};
  assert.equal(messageStatus(message, chat, "alice").state, "sent");
  message.deliveredTo = { bob: "now" };
  assert.equal(messageStatus(message, chat, "alice").state, "delivered");
  message.readBy = { carol: "now" };
  assert.equal(messageStatus(message, chat, "alice").state, "delivered");
  message.readBy.bob = "now";
  assert.equal(messageStatus(message, chat, "alice").state, "read");
  assert.equal(
    messageStatus(message, { kind: "saved" }, "alice").state,
    "saved",
  );
});

test("delivery and read receipts are recipient-owned, monotonic, bounded and persistent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zently-receipts-"));
  try {
    const file = join(dir, "db.json"),
      s = await Store.open(file);
    const a = s.register("+77001234567", "receipt_alice"),
      b = s.register("+77007654321", "receipt_bob"),
      c = s.register("+77005554433", "receipt_carol");
    const chat = s.direct(a.id, b.id),
      m = s.send(a.id, chat.id, { text: "First" }),
      later = s.send(a.id, chat.id, { text: "Later" });
    assert.equal(m.deliveredTo, undefined);
    assert.throws(
      () => s.receipt(c.id, chat.id, { through: m.id, read: true }),
      /доступ/i,
    );
    assert.equal(s.receipt(b.id, chat.id, { through: m.id }), true);
    assert.ok(m.deliveredTo[b.id]);
    assert.equal(m.readBy, undefined);
    assert.equal(later.deliveredTo, undefined);
    assert.equal(s.receipt(b.id, chat.id, { through: m.id }), false);
    assert.equal(s.receipt(b.id, chat.id, { through: m.id, read: true }), true);
    const time = m.readBy[b.id];
    s.receipt(b.id, chat.id, { through: m.id, read: false });
    assert.equal(m.readBy[b.id], time);
    s.receipt(a.id, chat.id, { through: later.id, read: true });
    assert.equal(later.readBy, undefined);
    assert.throws(
      () => s.receipt(b.id, chat.id, { through: "unknown" }),
      /не найдено/i,
    );
    await s.flush();
    const reopened = await Store.open(file);
    assert.equal(reopened.messages(a.id, chat.id)[0].readBy[b.id], time);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
