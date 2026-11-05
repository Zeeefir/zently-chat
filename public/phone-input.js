import { escape as e, icon } from "./icons.js";
import { defaultCountry, normalizePhone } from "./phone.js";
let listeners;
const names = new Intl.DisplayNames(["ru"], { type: "region" });
const countries = () =>
  libphonenumber
    .getCountries()
    .sort((a, b) => names.of(a).localeCompare(names.of(b), "ru"));
const dial = (c) => "+" + libphonenumber.getCountryCallingCode(c);
export function phoneFields() {
  const all = countries(),
    saved = localStorage.getItem("phone-country");
  const suggested = defaultCountry(
    navigator.language,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const c = all.includes(saved)
    ? saved
    : all.includes(suggested)
      ? suggested
      : "KZ";
  return `<div class="field phone-field"><label for="phone">Номер телефона</label><div class="phone-number"><input id="country" name="country" type="hidden" value="${c}"><button type="button" class="country-trigger" aria-label="Изменить страну: ${e(names.of(c))} ${dial(c)}" aria-haspopup="dialog" aria-expanded="false" aria-controls="country-picker"><span class="country-iso">${c}</span><span class="phone-prefix">${dial(c)}</span><svg class="country-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" aria-hidden="true"><path d="m4 10 4-4 4 4"/></svg></button><input id="phone" name="phone" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="Номер телефона" aria-describedby="phone-help" required></div><small id="phone-help" class="muted">Нажми на код, чтобы выбрать страну</small><div id="country-picker" class="country-popover" role="dialog" aria-label="Выбор страны" hidden><div class="country-search">${icon("search")}<input id="country-search" type="search" placeholder="Страна или код" aria-label="Поиск страны" autocomplete="off"></div><div class="country-options" role="listbox" aria-label="Страны"></div></div></div>`;
}
export function setupPhoneFields() {
  listeners?.abort();
  listeners = new AbortController();
  const field = document.querySelector(".phone-field"),
    country = field.querySelector("#country"),
    input = field.querySelector("#phone"),
    trigger = field.querySelector(".country-trigger"),
    panel = field.querySelector("#country-picker"),
    search = field.querySelector("#country-search"),
    list = field.querySelector(".country-options");
  const all = countries();
  function update() {
    trigger.querySelector(".country-iso").textContent = country.value;
    trigger.querySelector(".phone-prefix").textContent = dial(country.value);
    trigger.setAttribute(
      "aria-label",
      `Изменить страну: ${names.of(country.value)} ${dial(country.value)}`,
    );
    localStorage.setItem("phone-country", country.value);
    input.removeAttribute("aria-invalid");
  }
  function options() {
    const q = search.value.trim().toLocaleLowerCase("ru");
    const filtered = all.filter((c) =>
      `${names.of(c)} ${c} ${dial(c)}`.toLocaleLowerCase("ru").includes(q),
    );
    list.innerHTML =
      filtered
        .map(
          (c) =>
            `<button type="button" role="option" tabindex="${c === country.value ? 0 : -1}" aria-selected="${c === country.value}" data-country="${c}" class="country-option"><span>${e(names.of(c))}</span><span class="muted">${dial(c)}</span>${c === country.value ? icon("check") : ""}</button>`,
        )
        .join("") || '<p class="country-no-results">Страна не найдена</p>';
  }
  function close(focus = false) {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    if (focus) trigger.focus();
  }
  trigger.onclick = () => {
    if (!panel.hidden) {
      close();
      return;
    }
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    search.value = "";
    options();
    search.focus();
  };
  list.onclick = (ev) => {
    const b = ev.target.closest("[data-country]");
    if (!b) return;
    country.value = b.dataset.country;
    update();
    close();
    input.focus();
  };
  search.oninput = options;
  search.onkeydown = (ev) => {
    if (ev.isComposing) return;
    if (["ArrowDown", "Enter"].includes(ev.key)) {
      ev.preventDefault();
      list.querySelector("button")?.focus();
    }
  };
  list.onkeydown = (ev) => {
    const buttons = [...list.querySelectorAll("button")],
      i = buttons.indexOf(document.activeElement);
    let target;
    if (ev.key === "ArrowDown") target = buttons[(i + 1) % buttons.length];
    if (ev.key === "ArrowUp")
      target = buttons[(i - 1 + buttons.length) % buttons.length];
    if (ev.key === "Home") target = buttons[0];
    if (ev.key === "End") target = buttons.at(-1);
    if (target) {
      ev.preventDefault();
      target.focus();
    }
  };
  field.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && !panel.hidden) {
      ev.preventDefault();
      ev.stopPropagation();
      close(true);
    }
  });
  field.addEventListener("focusout", (ev) => {
    if (!field.contains(ev.relatedTarget)) close();
  });
  document.addEventListener(
    "click",
    (ev) => {
      if (!field.contains(ev.target)) close();
    },
    { signal: listeners.signal },
  );
  input.onblur = () => {
    if (!input.value.trim().startsWith("+")) return;
    try {
      const result = normalizePhone(input.value, country.value);
      country.value = result.country;
      update();
      input.value = result.national;
    } catch {
      /* Validate incomplete values on submit. */
    }
  };
}
