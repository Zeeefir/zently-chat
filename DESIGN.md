# Zently visual integration

## Intent
Apply the user's approved Zently messenger visual identity to the existing React client. The friend's Go/PostgreSQL/Pusher backend and WebRTC controller are authoritative and must remain unchanged.

## Visual language
Dark three-panel messenger, Manrope, #0B090E background, #141116 surfaces, #211C23 cards, #FF1493 pink and #B7FF39 lime. Pink outgoing bubbles, subtle pink edge light on incoming bubbles, lime navigation and send controls. Glass is limited to composer and call controls. No blue. Initial avatars use an account username when supplied, otherwise the existing account name; contact-label aliases are not introduced.

## Tokens and ownership
Runtime visual tokens live in client/src/zently.css. Reusable Brand/Avatar are in client/src/Visual.tsx. Existing api.ts, calls.ts, RemoteAudio.tsx, main.tsx and the entire api directory remain unchanged. CallPanel.tsx changes layout, modal focus and optional synthesized audio only; it delegates start/accept/reject/end/device actions to the original CallController.

## Supported behavior
Preserve email/password auth, original user search, pagination, message retry/idempotency, Pusher subscriptions, call polling and WebRTC media handling. This integration does not add unsupported backend capabilities or pretend that a Pusher publication is a read receipt. Mobile separates the conversation list and active chat, with a Back action. Call sound is a presentation-only preference.

## Verification
Original build, lint and four call-controller tests pass. See INTEGRATION.md for API checks, UI fixture coverage, protected-file verification and remaining gaps. Test fixtures stay outside the repository and are not shipped.
