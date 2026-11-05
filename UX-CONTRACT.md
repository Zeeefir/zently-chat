# Integration behavior contract

- Existing API payloads, cookies, query/mutation request functions and call-controller code are preserved.
- Email/password is the actual supported authentication flow. Phone OTP is not invented by the skin.
- User search keeps the existing backend semantics: name fragment or exact email. The backend has no unique username field.
- Saved messages, archive, attachments, message delivery/read acknowledgements and presence are not provided by this API; the skin does not show fake working versions of them.
- One dark message check means saved on the server; there is no unsupported delivery/read inference.
- Native buttons and labels, visible rounded focus, mobile Back, modal call focus and reduced-motion support are maintained.
- Synthesized ringing follows the existing call status. Audio stops on status change/unmount; blocked autoplay has an explicit sound-enable action. Server call expiry remains the friend's original behavior.
- Technical connection information is retained in a collapsible connection section, without changing the original realtime logic.
