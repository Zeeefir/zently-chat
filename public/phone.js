export function defaultCountry(locale, zone) {
  if (
    [
      "Asia/Almaty",
      "Asia/Qyzylorda",
      "Asia/Qostanay",
      "Asia/Aqtobe",
      "Asia/Aqtau",
      "Asia/Atyrau",
      "Asia/Oral",
    ].includes(zone)
  )
    return "KZ";
  try {
    return new Intl.Locale(locale).region || "KZ";
  } catch {
    return "KZ";
  }
}
export function normalizePhone(
  raw,
  country,
  parse = globalThis.libphonenumber.parsePhoneNumberFromString,
) {
  const phone = parse(String(raw).trim(), country);
  if (!phone || !phone.isPossible() || phone.ext)
    throw Error(
      "Проверь номер телефона и выбранную страну. Введи полный национальный номер.",
    );
  return {
    number: phone.number,
    country: phone.country || country,
    national: phone.nationalNumber,
  };
}
