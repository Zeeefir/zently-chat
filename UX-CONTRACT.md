# Zently UX contract

| Capability | Owner | Contract |
| --- | --- | --- |
| Form | app.js auth renderer | Labels, inline errors, preserved values, first invalid field focus, no native bubbles |
| Search | app.js conversation list | Local filtering, clear action, empty state; no remote request race |
| Feedback | app.js toast | One polite live region; persistent errors have inline correction paths |
| Dialog | native dialog in app.js | Escape, initial focus, focus restoration; no browser alert/confirm/prompt |
| Navigation | app.js state | Chats/Calls/Media/Saved/Archive/Settings; browser URL hash restores section |
| Scrollbar | styles.css global baseline | Visible, low contrast graphite, pink hover, reduced-motion respected |
| Saved messages | store.js | One self-only conversation per registered user, no other members allowed |
| Authentication | server/index.js | HttpOnly same-site cookie; development challenge has expiry and attempt limit; no phone numbers in client contacts |
| Call | call.js | Explicit permission action; visible pending/denied/offline states; end releases all tracks |

Message drafts are retained per chat in session memory. Messages are persisted on the local server. Optimistic duplicate sends are prevented by a client message id. Profile and settings are shared across screens. No claim of end-to-end encryption is made.

Phone registration uses one composite field: country/calling-code trigger and national number. The authored country picker opens above the field, supports local country/code search, arrow navigation, Enter selection, Escape and outside dismissal. It remembers only the chosen country. Full international pasted numbers are normalized without adding the calling code twice. Region detection is an editable timezone/locale suggestion, not location verification.

Call audio uses a shared CallSounds controller. Outgoing ringback and incoming melody are exclusive and terminate on answer, cancellation, decline, timeout, connection failure, or sound preference disable. Autoplay failure gets an explicit incoming sound-enable button. Mobile call controls and incoming actions have at least 48px target height and respect safe-area insets.
