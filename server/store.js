import { randomUUID } from "node:crypto";
import { readFile, mkdir, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export function validateIdentity(rawPhone, rawUsername) {
  const digits = String(rawPhone ?? "").replace(/\D/g, "");
  if (
    !/^\d{7,15}$/.test(digits) ||
    !parsePhoneNumberFromString(`+${digits}`)?.isPossible()
  )
    throw new Error(
      "Проверьте телефон и код страны: нужен полный международный номер.",
    );
  const username = String(rawUsername ?? "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(username))
    throw new Error(
      "Имя: 3–24 латинских символа, цифры или _. Начните с буквы.",
    );
  return { phone: `+${digits}`, username };
}

const samples = [
  {
    id: "alina",
    username: "alina",
    name: "Алина Ветрова",
    avatar: "alina.jpg",
    bio: "Люблю хорошие разговоры, вечерние прогулки и маленькие открытия.",
  },
  {
    id: "mark",
    username: "mark",
    name: "Марк Ким",
    avatar: "mark.jpg",
    bio: "Дизайн, фотографии и новые идеи.",
  },
  {
    id: "friends",
    username: "friends",
    name: "Друзья",
    avatar: "friends.jpg",
    bio: "Увидимся в субботу!",
  },
  {
    id: "family",
    username: "family",
    name: "Семья",
    avatar: "family.jpg",
    bio: "Всегда рядом.",
  },
].map((u) => ({ ...u, demo: true }));

export class Store {
  constructor(file, data) {
    this.file = file;
    this.data = data;
    this.pending = Promise.resolve();
  }
  static async open(file) {
    let data;
    try {
      data = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      data = {
        users: structuredClone(samples),
        chats: [],
        messages: [],
        calls: [],
      };
    }
    return new Store(file, data);
  }
  save() {
    const contents = JSON.stringify(this.data, null, 2);
    this.pending = this.pending.then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      await writeFile(`${this.file}.tmp`, contents, { mode: 0o600 });
      await rename(`${this.file}.tmp`, this.file);
    });
    return this.pending;
  }
  flush() {
    return this.pending;
  }
  user(id) {
    return this.data.users.find((u) => u.id === id);
  }
  publicUser(u) {
    if (!u) return null;
    const { phone, ...safe } = u;
    return safe;
  }
  available(phone, username) {
    if (
      this.data.users.some((u) => u.username === username && u.phone !== phone)
    )
      throw new Error("Этот юзер уже занят. Придумайте другой.");
  }
  register(phone, username) {
    const clean = validateIdentity(phone, username);
    this.available(clean.phone, clean.username);
    const existing = this.data.users.find((u) => u.phone === clean.phone);
    if (existing) return existing;
    const user = {
      id: randomUUID(),
      ...clean,
      name: clean.username,
      bio: "",
      avatar: null,
      demo: false,
    };
    this.data.users.push(user);
    this.data.chats.push({
      id: randomUUID(),
      kind: "saved",
      members: [user.id],
      owner: user.id,
      archivedBy: [],
    });
    for (const contact of samples) {
      const chat = {
        id: randomUUID(),
        kind: "direct",
        members: [user.id, contact.id],
        archivedBy: [],
      };
      this.data.chats.push(chat);
      const texts =
        contact.id === "alina"
          ? [
              [contact.id, "Привет! Как твой день?\nЕсть минутка поболтать?"],
              [
                user.id,
                "Привет :) Всё отлично!\nТолько закончил дела, я на связи.",
              ],
              [
                contact.id,
                "Здорово! Давай созвонимся вечером?\nХочу рассказать одну классную вещь.",
              ],
              [user.id, "Давай сейчас? Я свободен."],
            ]
          : [
              [
                contact.id,
                contact.id === "mark"
                  ? "Отправил тебе фотографии. Как тебе идея?"
                  : contact.bio,
              ],
            ];
      texts.forEach(([sender, text], i) =>
        this.data.messages.push({
          id: randomUUID(),
          chatId: chat.id,
          sender,
          text,
          createdAt: new Date(Date.now() - (30 - i) * 60000).toISOString(),
          reactions: {},
          sample: true,
        }),
      );
    }
    this.save();
    return user;
  }
  member(userId, chatId) {
    const c = this.data.chats.find(
      (c) => c.id === chatId && c.members.includes(userId),
    );
    if (!c) throw new Error("Нет доступа к этой переписке.");
    return c;
  }
  contacts(userId) {
    return this.data.users
      .filter((u) => u.id !== userId)
      .map((u) => this.publicUser(u));
  }
  list(userId) {
    return this.data.chats
      .filter((c) => c.members.includes(userId))
      .map((c) => {
        const last = this.data.messages.filter((m) => m.chatId === c.id).at(-1);
        const peer = c.members.find((id) => id !== userId);
        return {
          ...c,
          peer: this.publicUser(this.user(peer)),
          last,
          archived: c.archivedBy.includes(userId),
        };
      })
      .sort((a, b) =>
        a.kind === "saved"
          ? -1
          : b.kind === "saved"
            ? 1
            : String(b.last?.createdAt ?? "").localeCompare(
                String(a.last?.createdAt ?? ""),
              ),
      );
  }
  messages(userId, chatId) {
    const chat = this.member(userId, chatId);
    const peer = chat.members.find((id) => id !== userId);
    const list = this.data.messages
      .filter((m) => m.chatId === chatId)
      .slice(-500);
    return list.map((m, i) => {
      // Seeded conversations demonstrate a past reply, never fake live receipts.
      if (
        m.sample &&
        m.sender === userId &&
        this.user(peer)?.demo &&
        list.slice(i + 1).some((next) => next.sample && next.sender === peer)
      ) {
        return {
          ...m,
          deliveredTo: { ...m.deliveredTo, [peer]: m.createdAt },
          readBy: { ...m.readBy, [peer]: m.createdAt },
        };
      }
      return m;
    });
  }
  receipt(userId, chatId, { through, read = false }) {
    const chat = this.member(userId, chatId);
    if (chat.kind === "saved") return false;
    const list = this.data.messages.filter((m) => m.chatId === chatId);
    const end = list.findIndex((m) => m.id === through);
    if (end < 0) throw Error("Сообщение не найдено.");
    let changed = false;
    for (const m of list.slice(0, end + 1)) {
      if (m.sender === userId) continue;
      m.deliveredTo ||= {};
      if (!m.deliveredTo[userId]) {
        m.deliveredTo[userId] = new Date().toISOString();
        changed = true;
      }
      if (read === true) {
        m.readBy ||= {};
        if (!m.readBy[userId]) {
          m.readBy[userId] = new Date().toISOString();
          changed = true;
        }
      }
    }
    if (changed) this.save();
    return changed;
  }
  direct(userId, peerId) {
    if (!this.user(peerId) || peerId === userId)
      throw new Error("Выберите собеседника из контактов.");
    let chat = this.data.chats.find(
      (c) =>
        c.kind === "direct" &&
        c.members.includes(userId) &&
        c.members.includes(peerId),
    );
    if (!chat) {
      chat = {
        id: randomUUID(),
        kind: "direct",
        members: [userId, peerId],
        archivedBy: [],
      };
      this.data.chats.push(chat);
      this.save();
    }
    return chat;
  }
  send(userId, chatId, input) {
    this.member(userId, chatId);
    const clientId = String(input.clientId ?? "").slice(0, 100);
    const duplicate =
      clientId &&
      this.data.messages.find(
        (m) =>
          m.sender === userId && m.chatId === chatId && m.clientId === clientId,
      );
    if (duplicate) return duplicate;
    const text = String(input.text ?? "").trim();
    if (text.length > 4000 || (!text && !input.attachment))
      throw new Error(
        "Сообщение должно содержать текст или файл, не более 4000 символов.",
      );
    let attachment;
    if (input.attachment) {
      const { name, type, data } = input.attachment;
      if (
        typeof data !== "string" ||
        data.length > 1500000 ||
        !/^data:(image\/(png|jpeg|webp|gif)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(
          data,
        )
      )
        throw new Error("Поддерживаются изображения и PDF до 1 МБ.");
      attachment = {
        name: String(name).slice(0, 120),
        type: String(type).slice(0, 60),
        data,
      };
    }
    const message = {
      id: randomUUID(),
      chatId,
      sender: userId,
      text,
      clientId,
      attachment,
      createdAt: new Date().toISOString(),
      reactions: {},
    };
    this.data.messages.push(message);
    this.save();
    return message;
  }
  react(userId, chatId, messageId, emoji) {
    this.member(userId, chatId);
    if (!["❤️", "👍", "🔥"].includes(emoji))
      throw new Error("Неизвестная реакция.");
    const m = this.data.messages.find(
      (m) => m.id === messageId && m.chatId === chatId,
    );
    if (!m) throw new Error("Сообщение не найдено.");
    m.reactions ??= {};
    if (m.reactions[userId] === emoji) delete m.reactions[userId];
    else m.reactions[userId] = emoji;
    this.save();
    return m;
  }
  archive(userId, chatId, archived) {
    const c = this.member(userId, chatId);
    c.archivedBy = c.archivedBy.filter((id) => id !== userId);
    if (archived) c.archivedBy.push(userId);
    this.save();
    return c;
  }
  profile(userId, input) {
    const user = this.user(userId);
    user.name =
      String(input.name ?? "")
        .trim()
        .slice(0, 50) || user.username;
    user.bio = String(input.bio ?? "")
      .trim()
      .slice(0, 180);
    this.save();
    return this.publicUser(user);
  }
}
