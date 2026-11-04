import { createServer } from "node:http";
import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Store, validateIdentity } from "./store.js";

const root = fileURLToPath(new URL("../public/", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".ico": "image/x-icon",
};
function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}
async function body(req) {
  let data = "";
  for await (const chunk of req) {
    data += chunk;
    if (Buffer.byteLength(data) > 2100000) fail("Файл слишком большой.", 413);
  }
  try {
    const parsed = JSON.parse(data || "{}");
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
      throw Error();
    return parsed;
  } catch {
    fail("Некорректные данные запроса.");
  }
}
const json = (res, status, data, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(JSON.stringify(data));
};

export async function createApp({
  file = resolve("data/db.json"),
  devMode = process.env.ZENTLY_DEV_MODE !== "0",
} = {}) {
  const store = await Store.open(file);
  const sessions = new Map(),
    challenges = new Map(),
    limits = new Map(),
    clients = new Map();
  const push = (id, data) => {
    for (const r of clients.get(id) ?? [])
      r.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  const refresh = (chat) =>
    chat.members.forEach((id) =>
      push(id, { type: "refresh", chatId: chat.id }),
    );
  const session = (req) => {
    const token = /(?:^|;\s*)zently_session=([a-f0-9]+)/.exec(
      req.headers.cookie ?? "",
    )?.[1];
    const s = sessions.get(token);
    if (!s || s.expires < Date.now() || !store.user(s.userId))
      fail("Войдите в аккаунт, чтобы продолжить.", 401);
    return { ...s, token };
  };
  const online = (id) => Boolean(clients.get(id)?.size);
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    );
    try {
      const url = new URL(req.url, `http://${req.headers.host}`),
        path = url.pathname;
      if (
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}` &&
        req.headers.origin !== `https://${req.headers.host}`
      )
        fail("Этот запрос заблокирован.", 403);
      if (path.startsWith("/api/")) {
        if (path === "/api/health")
          return json(res, 200, { ok: true, devMode });
        if (path === "/api/auth/request" && req.method === "POST") {
          if (!devMode)
            fail(
              "СМС-провайдер ещё не подключён. Используйте локальный режим.",
              503,
            );
          const input = await body(req),
            clean = validateIdentity(input.phone, input.username);
          store.available(clean.phone, clean.username);
          const prior = limits.get(clean.phone);
          const rate =
            prior && prior.until > Date.now()
              ? prior
              : { count: 0, until: Date.now() + 600000 };
          if (++rate.count > 5)
            fail("Слишком много попыток. Повторите через 10 минут.", 429);
          limits.set(clean.phone, rate);
          const id = randomBytes(18).toString("hex"),
            code = String(randomInt(100000, 1000000));
          challenges.set(id, {
            ...clean,
            code,
            expires: Date.now() + 300000,
            attempts: 0,
          });
          return json(res, 200, { id, devCode: code, expiresIn: 300 });
        }
        if (path === "/api/auth/verify" && req.method === "POST") {
          const { id, code } = await body(req),
            c = challenges.get(id);
          if (!c || c.expires < Date.now() || c.attempts >= 5) {
            challenges.delete(id);
            fail("Код истёк. Запросите новый.");
          }
          c.attempts++;
          const supplied = Buffer.from(String(code ?? "")),
            expected = Buffer.from(c.code);
          if (
            supplied.length !== expected.length ||
            !timingSafeEqual(supplied, expected)
          )
            fail("Код не совпадает. Проверьте 6 цифр и попробуйте ещё раз.");
          challenges.delete(id);
          const user = store.register(c.phone, c.username),
            token = randomBytes(32).toString("hex");
          sessions.set(token, {
            userId: user.id,
            expires: Date.now() + 604800000,
          });
          await store.flush();
          return json(
            res,
            200,
            { user: store.publicUser(user) },
            {
              "Set-Cookie": `zently_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
            },
          );
        }
        if (path === "/api/auth/demo" && req.method === "POST") {
          if (!devMode) fail("Демонстрационный режим отключён.", 403);
          const suffix = randomBytes(4).toString("hex");
          const user = store.register(
            `+7999${String(randomInt(1000000, 10000000))}`,
            `guest_${suffix}`,
          );
          user.name = "Стас";
          user.avatar = "stas.jpg";
          store.save();
          const token = randomBytes(32).toString("hex");
          sessions.set(token, {
            userId: user.id,
            expires: Date.now() + 604800000,
          });
          await store.flush();
          return json(
            res,
            200,
            { user: store.publicUser(user) },
            {
              "Set-Cookie": `zently_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`,
            },
          );
        }
        const s = session(req),
          uid = s.userId;
        if (path === "/api/auth/logout" && req.method === "POST") {
          sessions.delete(s.token);
          return json(
            res,
            200,
            { ok: true },
            {
              "Set-Cookie":
                "zently_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
            },
          );
        }
        if (path === "/api/bootstrap")
          return json(res, 200, {
            user: store.publicUser(store.user(uid)),
            contacts: store
              .contacts(uid)
              .map((u) => ({ ...u, online: online(u.id) })),
            chats: store.list(uid),
            calls: store.data.calls
              .filter((c) => c.userId === uid)
              .slice(-50)
              .reverse(),
            devMode,
          });
        if (path === "/api/events") {
          res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
          });
          if (!clients.has(uid)) clients.set(uid, new Set());
          clients.get(uid).add(res);
          res.write('data: {"type":"connected"}\n\n');
          for (const id of clients.keys())
            push(id, { type: "presence", userId: uid, online: true });
          const keepalive = setInterval(
            () => res.write(": keepalive\n\n"),
            20000,
          );
          req.on("close", () => {
            clearInterval(keepalive);
            clients.get(uid)?.delete(res);
            if (!online(uid)) {
              clients.delete(uid);
              for (const id of clients.keys())
                push(id, { type: "presence", userId: uid, online: false });
            }
          });
          return;
        }
        if (path === "/api/profile" && req.method === "POST") {
          const user = store.profile(uid, await body(req));
          await store.flush();
          return json(res, 200, { user });
        }
        if (path === "/api/chats" && req.method === "POST") {
          const chat = store.direct(uid, (await body(req)).peerId);
          refresh(chat);
          await store.flush();
          return json(res, 200, { chat });
        }
        const messagePath = /^\/api\/chats\/([^/]+)\/messages$/.exec(path);
        if (messagePath) {
          const cid = messagePath[1];
          if (req.method === "GET")
            return json(res, 200, { messages: store.messages(uid, cid) });
          if (req.method === "POST") {
            const message = store.send(uid, cid, await body(req));
            await store.flush();
            refresh(store.member(uid, cid));
            return json(res, 200, { message });
          }
        }
        const chatAction = /^\/api\/chats\/([^/]+)\/(archive|reaction)$/.exec(
          path,
        );
        if (chatAction && req.method === "POST") {
          const input = await body(req),
            [, cid, action] = chatAction;
          const result =
            action === "archive"
              ? store.archive(uid, cid, Boolean(input.archived))
              : store.react(uid, cid, input.messageId, input.emoji);
          await store.flush();
          refresh(store.member(uid, cid));
          return json(res, 200, { result });
        }
        if (path === "/api/calls/log" && req.method === "POST") {
          const input = await body(req);
          if (!store.user(input.peerId)) fail("Собеседник не найдено.");
          const call = {
            id: randomBytes(12).toString("hex"),
            userId: uid,
            peerId: input.peerId,
            video: Boolean(input.video),
            preview: Boolean(input.preview),
            duration: Math.max(0, Math.min(86400, Number(input.duration) || 0)),
            createdAt: new Date().toISOString(),
          };
          store.data.calls.push(call);
          await store.save();
          return json(res, 200, { call });
        }
        if (path === "/api/signal" && req.method === "POST") {
          const input = await body(req),
            peer = store.user(input.to);
          if (
            !peer ||
            peer.demo ||
            peer.id === uid ||
            !["offer", "answer", "ice", "end", "decline"].includes(input.kind)
          )
            fail("Некорректный вызов.");
          if (JSON.stringify(input.payload ?? {}).length > 150000)
            fail("Слишком большой пакет.", 413);
          if (!online(peer.id)) fail("Собеседник сейчас не в сети.", 409);
          push(peer.id, {
            type: "signal",
            from: store.publicUser(store.user(uid)),
            kind: input.kind,
            callId: String(input.callId).slice(0, 100),
            payload: input.payload,
          });
          return json(res, 200, { ok: true });
        }
        fail("Страница API не найдена.", 404);
      }
      if (!["GET", "HEAD"].includes(req.method))
        fail("Метод не поддерживается.", 405);
      const relative = decodeURIComponent(path === "/" ? "/index.html" : path);
      const target = resolve(root, `.${relative}`);
      if (!target.startsWith(root.endsWith(sep) ? root : root + sep))
        fail("Нет доступа.", 403);
      try {
        const data = await readFile(target);
        res.writeHead(200, {
          "Content-Type": mime[extname(target)] ?? "application/octet-stream",
          "Cache-Control": "no-cache",
        });
        res.end(req.method === "HEAD" ? undefined : data);
      } catch (e) {
        if (e.code === "ENOENT" || e.code === "EISDIR")
          fail("Файл не найден.", 404);
        throw e;
      }
    } catch (error) {
      if (res.headersSent) {
        res.end();
        return;
      }
      const status =
        error.status ?? (/доступ/i.test(error.message) ? 403 : 400);
      json(res, status, {
        error: error.message || "Не удалось обработать запрос.",
      });
    }
  });
  server.on("close", () => {
    for (const streams of clients.values())
      for (const stream of streams) stream.end();
  });
  return { server, store };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { server, store } = await createApp();
  const host = process.env.HOST || "127.0.0.1",
    port = Number(process.env.PORT) || 3000;
  if (
    process.env.ZENTLY_DEV_MODE !== "0" &&
    !["127.0.0.1", "localhost", "::1"].includes(host)
  )
    throw Error("Development authentication is local-only. Bind to localhost.");
  server.listen(port, host, () =>
    console.log(
      `Zently: http://${host}:${port}\nDevelopment SMS mode: local verification codes only.`,
    ),
  );
  process.on("SIGINT", async () => {
    await store.flush();
    server.close();
    process.exit(0);
  });
}
