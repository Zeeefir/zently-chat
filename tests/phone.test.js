import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { normalizePhone, defaultCountry } from "../public/phone.js";

test("national numbers are normalized with the selected country without duplicate calling codes", () => {
  assert.equal(
    normalizePhone("701 123 45 67", "KZ", parsePhoneNumberFromString).number,
    "+77011234567",
  );
  assert.equal(
    normalizePhone("020 7946 0018", "GB", parsePhoneNumberFromString).number,
    "+442079460018",
  );
  assert.equal(
    normalizePhone("201 555 0123", "US", parsePhoneNumberFromString).number,
    "+12015550123",
  );
  const pasted = normalizePhone(
    "+33 6 12 34 56 78",
    "KZ",
    parsePhoneNumberFromString,
  );
  assert.equal(pasted.number, "+33612345678");
  assert.equal(pasted.country, "FR");
  assert.throws(
    () => normalizePhone("123", "KZ", parsePhoneNumberFromString),
    /номер/i,
  );
  assert.equal(defaultCountry("ru-RU", "Asia/Qyzylorda"), "KZ");
  assert.equal(defaultCountry("en-GB", "Europe/London"), "GB");
});
