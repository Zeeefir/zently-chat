import { icon } from "./icons.js";
export function messageStatus(message, chat, userId) {
  if (chat.kind === "saved")
    return { state: "saved", label: "Сохранено в избранном", symbol: "check" };
  const peer = chat.members.find((id) => id !== userId);
  if (message.readBy?.[peer])
    return { state: "read", label: "Прочитано", symbol: "checks" };
  if (message.deliveredTo?.[peer])
    return {
      state: "delivered",
      label: "Доставлено, ещё не прочитано",
      symbol: "checks",
    };
  return {
    state: "sent",
    label: "Отправлено, ещё не доставлено",
    symbol: "check",
  };
}
export function statusMarkup(message, chat, userId) {
  const s = messageStatus(message, chat, userId);
  return `<span class="checks status-${s.state}" role="img" aria-label="${s.label}" title="${s.label}">${icon(s.symbol)}</span>`;
}
