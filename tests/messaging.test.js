import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/index.js";

test("two accounts exchange live messages, attachments, reactions and private archive state", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zently-live-"));
  const { server, store } = await createApp({
    file: join(dir, "db.json"),
    devMode: true,
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const abort = new AbortController();
  let reader;
  const post = (path, body, cookie = "") =>
    fetch(base + "/api" + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(body),
    });
  const get = (path, cookie) =>
    fetch(base + "/api" + path, { headers: { Cookie: cookie } }).then((r) =>
      r.json(),
    );
  try {
    const a = await post("/auth/demo", {}),
      b = await post("/auth/demo", {});
    const ca = a.headers.get("set-cookie").split(";")[0],
      cb = b.headers.get("set-cookie").split(";")[0];
    const ua = (await a.json()).user,
      ub = (await b.json()).user;
    const stream = await fetch(base + "/api/events", {
      headers: { Cookie: cb },
      signal: abort.signal,
    });
    reader = stream.body.getReader();
    let buffered = "";
    async function event(predicate) {
      const timeout = setTimeout(() => abort.abort(), 3000);
      try {
        while (true) {
          let end;
          while ((end = buffered.indexOf("\n\n")) >= 0) {
            const frame = buffered.slice(0, end);
            buffered = buffered.slice(end + 2);
            if (frame.startsWith("data: ")) {
              const v = JSON.parse(frame.slice(6));
              if (predicate(v)) return v;
            }
          }
          const { value, done } = await reader.read();
          assert.equal(done, false);
          buffered += new TextDecoder().decode(value);
        }
      } finally {
        clearTimeout(timeout);
      }
    }
    await event((v) => v.type === "connected");
    const { chat } = await (await post("/chats", { peerId: ub.id }, ca)).json();
    await event((v) => v.type === "refresh" && v.chatId === chat.id);
    const attachment = {
      name: "note.pdf",
      type: "application/pdf",
      data: "data:application/pdf;base64,JVBERi0xLjQ=",
    };
    const { message } = await (
      await post(
        `/chats/${chat.id}/messages`,
        { text: "Live test", attachment, clientId: "live-1" },
        ca,
      )
    ).json();
    await event((v) => v.type === "refresh" && v.chatId === chat.id);
    assert.equal(
      (await get(`/chats/${chat.id}/messages`, cb)).messages.at(-1).attachment
        .name,
      "note.pdf",
    );
    assert.equal(
      (await post(`/chats/${chat.id}/receipts`, { through: message.id }, cb))
        .status,
      200,
    );
    let receiptMessage = (
      await get(`/chats/${chat.id}/messages`, ca)
    ).messages.at(-1);
    assert.ok(receiptMessage.deliveredTo[ub.id]);
    assert.equal(receiptMessage.readBy, undefined);
    await post(
      `/chats/${chat.id}/receipts`,
      { through: message.id, read: true },
      cb,
    );
    receiptMessage = (await get(`/chats/${chat.id}/messages`, ca)).messages.at(
      -1,
    );
    assert.ok(receiptMessage.readBy[ub.id]);
    assert.equal(
      (
        await post(
          `/chats/${chat.id}/reaction`,
          { messageId: message.id, emoji: "❤️" },
          cb,
        )
      ).status,
      200,
    );
    assert.equal(
      (await get(`/chats/${chat.id}/messages`, ca)).messages.at(-1).reactions[
        ub.id
      ],
      "❤️",
    );
    await post(`/chats/${chat.id}/archive`, { archived: true }, ca);
    assert.equal(
      (await get("/bootstrap", ca)).chats.find((c) => c.id === chat.id)
        .archived,
      true,
    );
    assert.equal(
      (await get("/bootstrap", cb)).chats.find((c) => c.id === chat.id)
        .archived,
      false,
    );
    const saved = (await get("/bootstrap", ca)).chats.find(
      (c) => c.kind === "saved",
    );
    assert.equal(
      (
        await fetch(base + `/api/chats/${saved.id}/messages`, {
          headers: { Cookie: cb },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await post(
          `/chats/${chat.id}/messages`,
          {
            attachment: {
              name: "bad",
              type: "image/png",
              data: "javascript:bad",
            },
          },
          ca,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await post(
          "/signal",
          {
            to: ub.id,
            kind: "offer",
            callId: "test-call",
            payload: { video: true },
          },
          ca,
        )
      ).status,
      200,
    );
    const signal = await event((v) => v.type === "signal");
    assert.equal(signal.from.id, ua.id);
  } finally {
    abort.abort();
    await reader?.cancel().catch(() => {});
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await store.flush();
    await rm(dir, { recursive: true, force: true });
  }
});
