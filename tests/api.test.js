import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.js";

test("API requires a session, validates codes, and isolates saved messages", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zently-api-"));
  const { server, store } = await createApp({
    file: join(dir, "db.json"),
    devMode: true,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (path, data, cookie = "") =>
    fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(data),
    });
  try {
    assert.equal((await fetch(base + "/api/bootstrap")).status, 401);
    const request = await post("/api/auth/request", {
      phone: "+77001112233",
      username: "alice",
    });
    const challenge = await request.json();
    assert.match(challenge.devCode, /^\d{6}$/);
    assert.equal(
      (await post("/api/auth/verify", { id: challenge.id, code: "wrong" }))
        .status,
      400,
    );
    const verify = await post("/api/auth/verify", {
      id: challenge.id,
      code: challenge.devCode,
    });
    assert.equal(verify.status, 200);
    const cookie = verify.headers.get("set-cookie").split(";")[0];
    assert.match(verify.headers.get("set-cookie"), /HttpOnly/);
    assert.equal(
      (
        await post("/api/auth/verify", {
          id: challenge.id,
          code: challenge.devCode,
        })
      ).status,
      400,
    );
    const data = await (
      await fetch(base + "/api/bootstrap", { headers: { Cookie: cookie } })
    ).json();
    const saved = data.chats.find((c) => c.kind === "saved");
    const sent = await post(
      `/api/chats/${saved.id}/messages`,
      { text: "My private note", clientId: "note" },
      cookie,
    );
    assert.equal(sent.status, 200);
    assert.equal(
      (
        await (
          await fetch(base + `/api/chats/${saved.id}/messages`, {
            headers: { Cookie: cookie },
          })
        ).json()
      ).messages.at(-1).text,
      "My private note",
    );
    const denied = await fetch(base + "/api/profile", {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: "https://evil.test",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(denied.status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await store.flush();
    await rm(dir, { recursive: true, force: true });
  }
});
