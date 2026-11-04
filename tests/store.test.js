import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, validateIdentity } from "../server/store.js";

test("identity rejects malformed phones and names", () => {
  assert.throws(() => validateIdentity("abc", "alex"), /телефон/i);
  assert.throws(() => validateIdentity("+77001234567", "<script>"), /имя/i);
  assert.deepEqual(validateIdentity("+7 (700) 123-45-67", "Alex_Name"), {
    phone: "+77001234567",
    username: "alex_name",
  });
});

test("saved messages are private, duplicates are idempotent, and data survives restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zently-test-"));
  try {
    const store = await Store.open(join(dir, "db.json"));
    const a = store.register("+77001234567", "alice");
    const b = store.register("+77007654321", "bob");
    assert.equal(
      store.list(a.id).length,
      5,
      "only saved and four demo chats are seeded",
    );
    assert.ok(
      store
        .list(a.id)
        .filter((c) => c.kind === "direct")
        .every((c) => c.members.length === 2 && c.members[0] !== c.members[1]),
      "no accidental self conversations",
    );
    const independent = await Store.open(join(dir, "independent.json"));
    assert.equal(
      independent.data.users.length,
      4,
      "stores must not share the mutable sample array",
    );
    const saved = store.list(a.id).find((c) => c.kind === "saved");
    assert.ok(saved);
    assert.throws(() => store.messages(b.id, saved.id), /доступ/i);
    const m = store.send(a.id, saved.id, {
      text: "<img onerror=alert(1)>",
      clientId: "message-1",
    });
    assert.equal(
      store.send(a.id, saved.id, { text: "again", clientId: "message-1" }).id,
      m.id,
    );
    assert.equal(store.messages(a.id, saved.id).length, 1);
    assert.throws(
      () => store.send(a.id, saved.id, { text: " " }),
      /сообщение/i,
    );
    const chat = store.direct(a.id, b.id);
    store.send(a.id, chat.id, { text: "Hello, Bob!", clientId: "message-2" });
    assert.equal(store.messages(b.id, chat.id).at(-1).text, "Hello, Bob!");
    await store.flush();
    const reopened = await Store.open(join(dir, "db.json"));
    assert.equal(reopened.messages(a.id, saved.id)[0].id, m.id);
    assert.equal(
      reopened.contacts(a.id).find((c) => c.id === b.id).phone,
      undefined,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
