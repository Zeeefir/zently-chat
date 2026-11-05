import { icon, escape as e, logo, avatar, iconButton as ib } from "./icons.js";
import { Calls } from "./call.js";
import { normalizePhone } from "./phone.js";
import { phoneFields, setupPhoneFields } from "./phone-input.js";
const root = document.querySelector("#app"),
  dialog = document.querySelector("#dialog");
let data,
  selected,
  section = "chats",
  query = "",
  messages = [],
  source,
  collapsed = localStorage.getItem("rail") === "1",
  mobile = false,
  attachment = null,
  sending = false,
  connected = false,
  request = 0,
  composerObserver;
const drafts = new Map();
export async function api(path, body) {
  const r = await fetch("/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  if (!r.ok) throw Error(v.error);
  return v;
}
function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3500);
}
function validateForms() {
  for (const f of document.querySelectorAll("form:not(.composer)")) {
    f.noValidate = true;
    f.addEventListener(
      "submit",
      (ev) => {
        const invalid = [...f.elements].find(
          (el) => el.willValidate && !el.checkValidity(),
        );
        for (const el of f.elements)
          if (el.willValidate) el.removeAttribute("aria-invalid");
        if (!invalid) return;
        ev.preventDefault();
        ev.stopImmediatePropagation();
        const error = f.querySelector(".field-error");
        if (error) {
          error.id = "form-error";
          error.textContent =
            invalid.name === "username"
              ? "Юзер: 3–24 латинских символа, цифры или _. Начни с буквы."
              : invalid.name === "code"
                ? "Введи код из 6 цифр."
                : "Заполни это поле.";
          invalid.setAttribute("aria-describedby", error.id);
        }
        invalid.setAttribute("aria-invalid", "true");
        invalid.focus();
      },
      { capture: true },
    );
  }
}
function modal(html) {
  dialog.innerHTML = `<div class="dialog-head"><h2 id="dialog-title">${html.title}</h2>${ib("close", "Закрыть", "close-dialog")}</div>${html.body}`;
  validateForms();
  if (!dialog.open) dialog.showModal();
}
const calls = new Calls({ api, toast, onClose: () => refresh() });
const time = (s) =>
  new Date(s).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
const chat = () => data?.chats.find((c) => c.id === selected);
const peer = (c) =>
  c.kind === "saved"
    ? { name: "Избранное", bio: "Личное пространство для ваших заметок" }
    : data.contacts.find((p) => p.id === c.peer?.id) || c.peer;
const face = (c) =>
  c.kind === "saved"
    ? `<span class="avatar saved-avatar">${icon("bookmark")}</span>`
    : avatar(peer(c));
async function refresh() {
  data = await api("/bootstrap");
  if (!selected)
    selected =
      data.chats.find((c) => c.peer?.id === "alina")?.id || data.chats[0]?.id;
  if (document.querySelector(".app-shell")) {
    renderList();
    if (section === "calls") renderWorkspace();
  }
  return data;
}
async function boot() {
  try {
    await refresh();
    calls.user = data.user;
    if (location.hash === "#media") history.replaceState(null, "", "#chats");
    const initial = location.hash.slice(1);
    if (navs.some((n) => n[0] === initial)) {
      section = initial;
      mobile = !["chats", "archive"].includes(initial);
      if (initial === "saved")
        selected = data.chats.find((c) => c.kind === "saved").id;
    }
    render();
    connect();
  } catch {
    auth();
  }
}
function connect() {
  source?.close();
  source = new EventSource("/api/events");
  source.onmessage = async (ev) => {
    const v = JSON.parse(ev.data);
    if (v.type === "connected") {
      setConnectionStatus(true);
      await refresh();
      if (["chats", "saved", "archive"].includes(section))
        await loadMessages(false);
    }
    if (v.type === "signal") {
      calls.receive(v);
      return;
    }
    if (v.type === "refresh") {
      await refresh();
      if (v.chatId === selected) loadMessages(false);
    }
    if (v.type === "presence") {
      const p = data.contacts.find((p) => p.id === v.userId);
      if (p) p.online = v.online;
      renderList();
    }
    document.querySelector(".connection-banner")?.remove();
  };
  source.onerror = () => {
    setConnectionStatus(false);
    if (!document.querySelector(".connection-banner"))
      document
        .querySelector(".workspace")
        ?.insertAdjacentHTML(
          "afterbegin",
          '<div class="connection-banner" role="status">Соединение потеряно. Переподключаемся…</div>',
        );
  };
}
function setConnectionStatus(value) {
  connected = value;
  const label = value ? "В сети" : "Не в сети";
  const badge = document.querySelector(".account-presence");
  if (badge) {
    badge.classList.toggle("is-online", value);
    badge.setAttribute("aria-label", label);
    badge.title = label;
  }
  const text = document.querySelector(".account-name small");
  if (text) {
    text.textContent = label;
    text.classList.toggle("is-offline", !value);
  }
}
function auth(error = "") {
  connected = false;
  source?.close();
  root.innerHTML = `<section class="auth-page"><div class="auth-card"><div class="auth-logo">${logo()}</div><span class="small-label">БЛИЖЕ ДРУГ К ДРУГУ</span><h1>Твой круг.<br>Твои разговоры.</h1><p class="intro">Создай аккаунт или вернись по номеру телефона.</p><form id="identity"><div class="field"><label for="username">Придумайте юзер профиля</label><input id="username" name="username" autocomplete="username" placeholder="Например, stas_01" minlength="3" maxlength="24" required pattern="[a-zA-Z][a-zA-Z0-9_]{2,23}"></div>${phoneFields()}<p class="field-error" role="alert">${e(error)}</p><button class="primary" type="submit">Продолжить ${icon("back")}</button></form><p class="dev-tag">Локальная версия: код появится на экране. СМС пока не отправляются.</p><button class="secondary" data-action="demo">Посмотреть демо</button></div></section>`;
  setupPhoneFields();
  validateForms();
  document.querySelector("#identity").onsubmit = async (ev) => {
    ev.preventDefault();
    const f = ev.currentTarget,
      button = f.querySelector("button");
    button.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(f));
      values.phone = normalizePhone(values.phone, values.country).number;
      delete values.country;
      const result = await api("/auth/request", values);
      codeForm(result, values);
    } catch (err) {
      f.querySelector(".field-error").textContent = err.message;
      const input =
        f.elements[/телефон/i.test(err.message) ? "phone" : "username"];
      input.setAttribute("aria-invalid", "true");
      input.focus();
      button.disabled = false;
    }
  };
}
function codeForm(result, values) {
  root.innerHTML = `<section class="auth-page"><div class="auth-card">${logo()}<h1>Почти готово</h1><p class="intro">Подтверди номер ${e(values.phone)}</p><div class="dev-code">Код для локальной разработки<strong>${e(result.devCode)}</strong><small>Действует 5 минут. Это не СМС.</small></div><form id="verify"><div class="field"><label for="code">Код подтверждения</label><input id="code" class="code-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></div><p class="field-error" role="alert"></p><button class="primary">Войти в Zently</button></form><button class="link-button" data-action="auth">Изменить данные</button></div></section>`;
  validateForms();
  document.querySelector("#code").focus();
  document.querySelector("#verify").onsubmit = async (ev) => {
    ev.preventDefault();
    const b = ev.currentTarget.querySelector("button");
    b.disabled = true;
    try {
      await api("/auth/verify", {
        id: result.id,
        code: ev.currentTarget.code.value,
      });
      await boot();
    } catch (err) {
      document.querySelector(".field-error").textContent = err.message;
      b.disabled = false;
    }
  };
}
const navs = [
  ["chats", "chat", "Чаты"],
  ["calls", "phone", "Звонки"],
  ["saved", "bookmark", "Избранное"],
  ["archive", "archive", "Архив"],
  ["settings", "settings", "Настройки"],
];
function render() {
  root.innerHTML = `<div class="app-shell ${collapsed ? "collapsed" : ""} ${mobile ? "mobile-chat" : ""}"><aside class="sidebar"><div class="sidebar-head">${logo()}<button class="collapse-button icon-button" data-action="collapse" aria-label="Свернуть меню">${icon(collapsed ? "expand" : "collapse")}</button></div><nav class="navigation" aria-label="Основная навигация">${navs.map(([id, ic, label]) => `<button class="nav-button ${section === id ? "active" : ""}" data-section="${id}" title="${label}" ${section === id ? 'aria-current="page"' : ""}>${icon(ic)}<span class="nav-label">${label}</span></button>`).join("")}</nav><button class="account-button" data-action="own-profile" aria-label="Мой профиль"><span class="account-avatar">${avatar(data.user)}<span class="account-presence ${connected ? "is-online" : ""}" role="img" aria-label="${connected ? "В сети" : "Не в сети"}" title="${connected ? "В сети" : "Не в сети"}"></span></span><span class="account-name"><strong>${e(data.user.name)}</strong><small class="online ${connected ? "" : "is-offline"}">${connected ? "В сети" : "Не в сети"}</small></span>${icon("more")}</button></aside><aside class="conversation-panel"><div class="list-tools"><label class="search-wrap">${icon("search")}<input id="search" aria-label="Поиск чатов" placeholder="Поиск…" value="${e(query)}"></label>${ib("plus", "Новый чат", "new-chat")}</div><div class="conversation-list"></div><div class="list-footer">Локальная версия · демо-контакты отмечены</div></aside><section class="workspace" aria-label="Рабочая область"></section></div>`;
  renderList();
  renderWorkspace();
  document.querySelector("#search").oninput = (ev) => {
    query = ev.target.value;
    renderList();
  };
}
function renderList() {
  const list = document.querySelector(".conversation-list");
  if (!list) return;
  const sw = document.querySelector(".search-wrap");
  sw?.querySelector("[data-action=clear-search]")?.remove();
  if (query)
    sw?.insertAdjacentHTML(
      "beforeend",
      ib("close", "Очистить поиск", "clear-search"),
    );
  const items = data.chats
    .filter((c) => (section === "archive" ? c.archived : !c.archived))
    .filter((c) =>
      (peer(c)?.name || "").toLowerCase().includes(query.toLowerCase()),
    );
  list.innerHTML =
    items
      .map(
        (c) =>
          `<button class="chat-item ${c.id === selected ? "selected" : ""}" data-chat="${c.id}">${face(c)}<span class="chat-item-text"><strong>${e(peer(c)?.name)}</strong><span class="chat-preview">${e(c.last?.text || (c.last?.attachment ? "Вложение" : c.kind === "saved" ? "Заметки только для тебя" : "Начни разговор"))}</span></span><span class="chat-time">${c.last ? time(c.last.createdAt) : ""}</span></button>`,
      )
      .join("") || '<p class="no-results">Ничего не найдено</p>';
}
function renderWorkspace() {
  composerObserver?.disconnect();
  const w = document.querySelector(".workspace");
  if (!w) return;
  if (section === "settings") {
    w.innerHTML = `<div class="settings-panel">${ib("back", "Назад к чатам", "back")}<h1 class="section-title">Настройки</h1><p class="section-subtitle">Твоё пространство общения</p><button class="setting-row" data-action="own-profile">${avatar(data.user)}<span>${e(data.user.name)}<small>@${e(data.user.username)}</small></span>${icon("user")}</button><label class="setting-row">Компактная навигация<input id="compact" type="checkbox" ${collapsed ? "checked" : ""}></label><label class="setting-row">Звуки звонков<input id="call-sounds" type="checkbox" ${calls.sounds.enabled ? "checked" : ""}></label><button class="secondary" data-action="test-ring">Прослушать мелодию</button><p class="presence-note">Данные хранятся на этом компьютере. Для настоящих СМС и звонков через интернет потребуется подключение серверных сервисов.</p><button class="secondary danger-text" data-action="logout">Выйти из аккаунта</button></div>`;
    document.querySelector("#compact").onchange = () => toggleRail();
    document.querySelector("#call-sounds").onchange = (ev) => {
      calls.sounds.setEnabled(ev.target.checked);
      localStorage.setItem("call-sounds", ev.target.checked ? "1" : "0");
    };
    return;
  }
  if (section === "calls") {
    w.innerHTML = `<div class="settings-panel">${ib("back", "Назад к чатам", "back")}<h1 class="section-title">Звонки</h1><p class="section-subtitle">Голосом бывает проще</p><button class="primary" data-action="new-chat">Выбрать собеседника</button><div class="calls-list">${
      data.calls
        .map((c) => {
          const p = data.contacts.find((p) => p.id === c.peerId);
          return `<button class="call-item" data-call-peer="${e(c.peerId)}" data-video="${c.video}">${avatar(p)}<span><strong>${e(p?.name || "Собеседник")}</strong><small>${c.preview ? "Демо-просмотр" : c.video ? "Видеозвонок" : "Аудиозвонок"} · ${Math.floor(c.duration)} сек.</small></span><small>${time(c.createdAt)}</small>${icon(c.video ? "video" : "phone")}</button>`;
        })
        .join("") ||
      '<div class="empty-state">' +
        icon("phone") +
        "<h2>Пока тихо</h2><p>Твои звонки появятся здесь.</p></div>"
    }</div></div>`;
    return;
  }
  if (section === "archive" && !chat()?.archived) {
    w.innerHTML =
      '<div class="empty-state"><h2>Архив пуст</h2><p>Здесь будут переписки, которые ты отправишь в архив.</p></div>';
    return;
  }
  if (!chat()) {
    w.innerHTML = '<div class="empty-state"><h2>Выбери разговор</h2></div>';
    return;
  }
  const c = chat(),
    p = peer(c),
    saved = c.kind === "saved";
  w.innerHTML = `<header class="chat-header">${ib("back", "Назад к чатам", "back", 'class="mobile-back"')}<button class="person-button" data-action="profile">${face(c)}<span class="person-title"><strong>${e(p?.name)}</strong><small class="${saved ? "muted" : "online"}">${saved ? "Только ты" : p?.demo ? "Демо-контакт" : p?.online ? "В сети" : "Не в сети"}</small></span></button><div class="header-actions">${saved ? "" : ib("phone", "Аудиозвонок", "audio") + ib("video", "Видеозвонок", "video")}${ib("more", "Действия с чатом", "chat-menu")}</div></header><div class="chat-divider"></div><div class="message-list" role="log" aria-label="Сообщения" aria-live="polite"></div><div class="composer-region"><div class="attachment-draft"></div><form class="composer"><input type="file" id="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" hidden>${ib("plus", "Прикрепить файл", "attach")}<div class="composer-field"><textarea aria-label="Сообщение" placeholder="Сообщение…" rows="1" maxlength="4000">${e(drafts.get(selected) || "")}</textarea>${ib("smile", "Выбрать эмодзи", "emoji")}</div><button class="send-button" aria-label="Отправить сообщение">${icon("send")}</button></form><p class="composer-error" role="alert"></p></div>`;
  const f = w.querySelector("form"),
    ta = f.querySelector("textarea");
  f.onsubmit = send;
  ta.oninput = () => {
    drafts.set(selected, ta.value);
    ta.style.height = "auto";
    ta.style.height = Math.min(130, ta.scrollHeight) + "px";
  };
  ta.onkeydown = (ev) => {
    if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      f.requestSubmit();
    }
  };
  w.querySelector("#file").onchange = readAttachment;
  const box = w.querySelector(".message-list");
  composerObserver = new ResizeObserver(([entry]) => {
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 90;
    const reserve = entry.target.getBoundingClientRect().height + 20;
    box.style.paddingBottom = `${reserve}px`;
    box.style.scrollPaddingBottom = `${reserve}px`;
    if (atBottom) box.scrollTo({ top: box.scrollHeight, behavior: "instant" });
  });
  composerObserver.observe(w.querySelector(".composer-region"));
  loadMessages(true);
}
async function loadMessages(scroll) {
  const id = selected,
    n = ++request;
  try {
    const v = await api(`/chats/${id}/messages`);
    if (n !== request || id !== selected) return;
    messages = v.messages;
    const box = document.querySelector(".message-list");
    if (!box) return;
    const bottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    box.innerHTML = messages.length
      ? `<div class="day-label">${new Date(messages[0].createdAt).toLocaleDateString("ru", { day: "numeric", month: "long" })}</div>` +
        messages
          .map(
            (m) =>
              `<div class="bubble-wrap ${m.sender === data.user.id ? "own" : ""}"><div class="bubble">${m.attachment ? (m.attachment.type.startsWith("image/") ? `<a href="${e(m.attachment.data)}" download="${e(m.attachment.name)}"><img class="attachment-image" src="${e(m.attachment.data)}" alt="${e(m.attachment.name)}"></a>` : `<a class="attachment-file" href="${e(m.attachment.data)}" download="${e(m.attachment.name)}">${icon("file")}${e(m.attachment.name)} ${icon("download")}</a>`) : ""}${m.text ? `<p>${e(m.text)}</p>` : ""}<div class="message-meta">${Object.values(
                m.reactions || {},
              )
                .map(e)
                .join(
                  " ",
                )}<time>${time(m.createdAt)}</time>${m.sender === data.user.id ? '<span class="checks" title="Сохранено на сервере">' + icon("check") + "</span>" : ""}</div><button class="message-menu icon-button" aria-label="Действия с сообщением" data-message="${m.id}">${icon("more")}</button></div></div>`,
          )
          .join("")
      : `<div class="empty-state">${icon("bookmark")}<h2>${chat().kind === "saved" ? "Всё важное — здесь" : "Начни разговор"}</h2><p>${chat().kind === "saved" ? "Сообщения и файлы видны только тебе." : "Напиши первое сообщение."}</p></div>`;
    if (scroll || bottom) {
      const composer = document.querySelector(".composer-region");
      const reserve = (composer?.getBoundingClientRect().height || 100) + 24;
      box.style.paddingBottom = `${reserve}px`;
      box.style.scrollPaddingBottom = `${reserve}px`;
      box.scrollTo({ top: box.scrollHeight, behavior: "instant" });
    }
  } catch (err) {
    toast(err.message);
  }
}
async function send(ev) {
  ev.preventDefault();
  if (sending) return;
  const ta = document.querySelector(".composer textarea"),
    text = ta.value;
  if (!text.trim() && !attachment) return;
  const id = selected;
  sending = true;
  document.querySelector(".send-button").disabled = true;
  try {
    await api(`/chats/${id}/messages`, {
      text,
      attachment,
      clientId: crypto.randomUUID(),
    });
    drafts.delete(id);
    if (selected === id) {
      ta.value = "";
      ta.style.height = "auto";
      attachment = null;
      document.querySelector(".attachment-draft").innerHTML = "";
      await loadMessages(true);
    }
    await refresh();
  } catch (err) {
    document.querySelector(".composer-error").textContent = err.message;
  } finally {
    sending = false;
    const b = document.querySelector(".send-button");
    if (b) b.disabled = false;
    ta.focus();
  }
}
async function readAttachment(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  if (
    file.size > 1024 * 1024 ||
    ![
      "image/png",
      "image/jpeg",
      "image/webp",
      "image/gif",
      "application/pdf",
    ].includes(file.type)
  ) {
    toast("Выбери изображение или PDF до 1 МБ.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    attachment = { name: file.name, type: file.type, data: reader.result };
    document.querySelector(".attachment-draft").innerHTML =
      `${icon("file")}${e(file.name)}${ib("close", "Убрать вложение", "remove-attachment")}`;
  };
  reader.readAsDataURL(file);
}
function profile(own = false) {
  const p = own ? data.user : peer(chat());
  modal({
    title: own ? "Мой профиль" : "Профиль",
    body: `<div class="profile-hero">${avatar(p, "large")}<h3>${e(p.name)}</h3><p class="muted">@${e(p.username || "saved")}</p></div>${own ? `<form id="profile-form"><div class="field"><label for="name">Имя</label><input id="name" name="name" value="${e(p.name)}" maxlength="50" required></div><div class="field"><label for="bio">О себе</label><textarea id="bio" name="bio" maxlength="180">${e(p.bio)}</textarea></div><p class="field-error" role="alert"></p><button class="primary">Сохранить</button></form>` : `<p>${e(p.bio || "Пока ничего не рассказал о себе.")}</p><p class="muted">${p.demo ? "Демонстрационный контакт. Настоящий человек к этому чату не подключён." : ""}</p>`}`,
  });
  if (own)
    document.querySelector("#profile-form").onsubmit = async (ev) => {
      ev.preventDefault();
      try {
        await api(
          "/profile",
          Object.fromEntries(new FormData(ev.currentTarget)),
        );
        await refresh();
        dialog.close();
        render();
        toast("Профиль сохранён");
      } catch (err) {
        dialog.querySelector(".field-error").textContent = err.message;
      }
    };
}
async function contacts() {
  await refresh();
  modal({
    title: "Новый разговор",
    body: `<p class="muted">Выбери собеседника. Зарегистрированные пользователи этого сервера также появятся здесь.</p><div class="contacts-scroll">${data.contacts.map((p) => `<button class="contact-option" data-peer="${e(p.id)}">${avatar(p)}<span><strong>${e(p.name)}</strong><small>${p.demo ? "Демо-контакт" : "@" + e(p.username)}</small></span>${icon("chat")}</button>`).join("")}</div>`,
  });
}
function toggleRail() {
  collapsed = !collapsed;
  localStorage.setItem("rail", collapsed ? "1" : "0");
  render();
}
async function navigate(s) {
  section = s;
  mobile = !["chats", "archive"].includes(s);
  attachment = null;
  if (s === "saved") selected = data.chats.find((c) => c.kind === "saved").id;
  location.hash = s;
  render();
}
document.addEventListener("click", async (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  try {
    if (b.dataset.section) {
      navigate(b.dataset.section);
      return;
    }
    if (b.dataset.chat) {
      selected = b.dataset.chat;
      section = section === "archive" ? "archive" : "chats";
      location.hash = section;
      mobile = true;
      attachment = null;
      render();
      return;
    }
    if (b.dataset.peer) {
      const v = await api("/chats", { peerId: b.dataset.peer });
      await refresh();
      selected = v.chat.id;
      section = "chats";
      location.hash = section;
      mobile = true;
      dialog.close();
      render();
      return;
    }
    if (b.dataset.callPeer) {
      const p = data.contacts.find((p) => p.id === b.dataset.callPeer);
      calls.start(p, b.dataset.video === "true");
      return;
    }
    if (b.dataset.message) {
      const m = messages.find((m) => m.id === b.dataset.message);
      modal({
        title: "Сообщение",
        body: `<div class="emoji-options">${["❤️", "👍", "🔥"].map((em) => `<button data-reaction="${em}" data-id="${m.id}" aria-label="Реакция ${em}">${em}</button>`).join("")}</div><div class="action-stack"><button class="secondary" data-save="${m.id}">Сохранить в избранное</button><button class="secondary" data-copy="${m.id}">Скопировать текст</button></div>`,
      });
      return;
    }
    if (b.dataset.reaction) {
      await api(`/chats/${selected}/reaction`, {
        messageId: b.dataset.id,
        emoji: b.dataset.reaction,
      });
      dialog.close();
      await loadMessages(false);
      return;
    }
    if (b.dataset.save) {
      const m = messages.find((m) => m.id === b.dataset.save),
        saved = data.chats.find((c) => c.kind === "saved");
      await api(`/chats/${saved.id}/messages`, {
        text: m.text,
        attachment: m.attachment,
        clientId: crypto.randomUUID(),
      });
      dialog.close();
      toast("Сохранено в избранное");
      return;
    }
    if (b.dataset.copy) {
      await navigator.clipboard.writeText(
        messages.find((m) => m.id === b.dataset.copy).text,
      );
      dialog.close();
      toast("Текст скопирован");
      return;
    }
    switch (b.dataset.action) {
      case "clear-search":
        query = "";
        document.querySelector("#search").value = "";
        renderList();
        document.querySelector("#search").focus();
        break;
      case "test-ring":
        await calls.previewRingtone();
        break;
      case "close-dialog":
        dialog.close();
        break;
      case "demo":
        b.disabled = true;
        await api("/auth/demo", {});
        await boot();
        break;
      case "auth":
        auth();
        break;
      case "collapse":
        toggleRail();
        break;
      case "new-chat":
        await contacts();
        break;
      case "own-profile":
        profile(true);
        break;
      case "profile":
        profile();
        break;
      case "back":
        mobile = false;
        section = "chats";
        location.hash = "chats";
        render();
        break;
      case "attach":
        document.querySelector("#file").click();
        break;
      case "remove-attachment":
        attachment = null;
        document.querySelector(".attachment-draft").innerHTML = "";
        break;
      case "emoji":
        modal({
          title: "Добавить эмодзи",
          body: `<div class="emoji-options">${["😊", "❤️", "👍", "🔥", "👋", "🎉"].map((em) => `<button data-emoji="${em}">${em}</button>`).join("")}</div>`,
        });
        break;
      case "audio":
      case "video":
        dialog.close();
        await calls.start(peer(chat()), b.dataset.action === "video");
        break;
      case "chat-menu":
        modal({
          title: "Переписка",
          body: `<button class="secondary" data-action="archive-chat">${chat().archived ? "Вернуть из архива" : "В архив"}</button><p class="muted">${peer(chat()).demo ? "Сообщения сохраняются локально. Демо-контакт не получает уведомления." : "Переписка доступна её участникам."}</p>`,
        });
        break;
      case "archive-chat":
        await api(`/chats/${selected}/archive`, { archived: !chat().archived });
        await refresh();
        dialog.close();
        render();
        break;
      case "logout":
        await calls.end();
        await api("/auth/logout", {});
        data = null;
        selected = null;
        source?.close();
        auth();
        break;
    }
    if (b.dataset.emoji) {
      const ta = document.querySelector(".composer textarea");
      ta.value += b.dataset.emoji;
      drafts.set(selected, ta.value);
      dialog.close();
      ta.focus();
    }
  } catch (err) {
    toast(err.message);
    b.disabled = false;
  }
});
window.addEventListener("hashchange", () => {
  const s = location.hash.slice(1);
  if (data && navs.some((n) => n[0] === s) && s !== section) navigate(s);
});
boot();
