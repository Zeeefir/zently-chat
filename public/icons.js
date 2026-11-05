const paths = {
  chat: "M4 4h16v13H9l-5 4V4Z",
  phone: "m5 3 4 5-3 3c2 4 4 6 8 7l3-3 5 4c-2 6-9 3-14-2S0 5 5 3Z",
  video: "M3 6h13v13H3V6Zm13 4 6-4v13l-6-4",
  folder: "M3 7h7l3 3h9v11H3V7Zm0 0V3h7l3 4",
  bookmark: "M6 3h12v19l-6-4-6 4V3Z",
  archive: "M3 7h18v14H3V7Zm-1-4h20v4H2V3Zm7 9h6",
  settings:
    "m9 3 .5-1h5l.5 3 2 1 2.8-1 2.5 4.3-2.3 2v2.4l2.3 2-2.5 4.3-2.8-1-2 1-.5 2.7h-5L9 20l-2-1-2.8 1-2.5-4.3 2.3-2v-2.4l-2.3-2L4.2 5 7 6l2-1V3Zm3 5a4 4 0 1 0 0 8 4 4 0 1 0 0-8Z",
  search: "m17 17 5 5M19 10a9 9 0 1 0-18 0 9 9 0 1 0 18 0Z",
  plus: "M12 3v18M3 12h18",
  more: "M4 12h.1M12 12h.1M20 12h.1",
  back: "m15 5-7 7 7 7",
  collapse: "m10 6-6 6 6 6m9-12-6 6 6 6",
  expand: "m5 6 6 6-6 6m9-12 6 6-6 6",
  close: "m5 5 14 14M19 5 5 19",
  send: "m2 10 20-8-8 20-3-9-9-3Zm9 3L22 2",
  mic: "M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5ZM6 10v2a6 6 0 0 0 12 0v-2m-6 8v4m-4 0h8",
  smile:
    "M21 12a9 9 0 1 0-18 0 9 9 0 1 0 18 0ZM8 9h.1M16 9h.1M8 14c2 4 6 4 8 0",
  pin: "M8 3h8l-1 6 4 5h-6v8l-2-4v-4H5l4-5-1-6Z",
  check: "m4 12 5 5L21 5",
  checks: "m2 12 5 5L19 5m-8 9 3 3L24 6",
  screen: "M2 3h20v14H2V3Zm6 19h8m-4-5v5",
  cameraOff: "m2 2 20 20M3 7v12h13v-4m-8-9h8v4l6-4v13l-3-2",
  logout: "M9 3H3v18h6m5-15 6 6-6 6M7 12h13",
  user: "M12 3a4 4 0 1 0 0 8 4 4 0 1 0 0-8ZM4 22v-3c0-7 16-7 16 0v3",
  file: "M5 2h9l5 5v15H5V2Zm9 0v6h5M8 13h8m-8 4h6",
  download: "M12 2v13m-5-5 5 5 5-5M3 17v5h18v-5",
  fullscreen: "M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6",
  volume: "m3 9 5 0 5-5v16l-5-5H3V9Zm13-1c3 2 3 6 0 8m3-11c5 4 5 10 0 14",
  info: "M12 21a9 9 0 1 0 0-18 9 9 0 1 0 0 18Zm0-10v6m0-10h.1",
  star: "m12 2 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1 3-7Z",
};
export function icon(name, cls = "") {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] ?? paths.chat}"/></svg>`;
}
export function escape(s = "") {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
}
export const logo = () =>
  '<span class="brand"><img src="/assets/logo.svg" alt="" width="34" height="32"><span>zently</span></span>';
export function avatar(user, cls = "") {
  const username = String(user?.username || "").trim().replace(/^@/, "");
  const initials = Array.from(username).slice(0, 2).join("").toLocaleUpperCase("ru") || "?";
  return `<span class="avatar ${cls}" aria-hidden="true"><span>${escape(initials)}</span></span>`;
}
export function iconButton(name, label, action, extra = "") {
  return `<button class="icon-button ${action === "back" ? "mobile-back" : ""} ${action === "attach" ? "composer-plus" : ""} ${action === "new-chat" ? "new-chat" : ""}" type="button" aria-label="${escape(label)}" title="${escape(label)}" data-action="${action}" ${extra.replace(/class="[^"]*"/g, "")}>${icon(name)}</button>`;
}
