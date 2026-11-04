# Zently design context

## Intent
A Russian-language messenger for personal conversations, saved notes, and calls. The two user-approved Figma references are authoritative; this is an implementation, not another redesign.

## Visual language
Three connected panels: navigation, conversations, active chat. Expanded navigation has labels, collapsed navigation has accessible names and tooltips. No dashboard or news home page. A saved-messages conversation is owned by the current user alone.

## Tokens
Runtime source of truth: `public/styles.css` `:root`.
Background #0B090E; surfaces #141116; cards #211C23; pink #FF1493; deep pink #A90058; lime #B7FF39; text #FFFFFF; secondary #A6A0A9; divider #302530.
Manrope is the interface font. Pink outgoing bubbles, subtle pink borders and restrained selected-chat glow. Lime selected navigation, presence and primary actions. Glass is limited to the composer and call toolbar. No blue or decorative waves.

## Behavior
See UX-CONTRACT.md. The registration flow is phone and username, verification, then chats. Development authentication is explicitly labelled, never presented as real SMS. Calling a demo contact opens an explicitly labelled call preview; real registered contacts use WebRTC signaling. Never request microphone/camera before a user's call action.

## Responsive layout
Desktop: three panels. Compact desktop: collapsed rail. Mobile: conversation list and active conversation are separate views with a visible back action. Video retains separate call controls and accessible names.

## Verification
Node integration tests exercise authentication, authorization, persistence, private saved messages and chat delivery. Browser checks cover registration, demo entry, sending, saved messages, search, profile and mobile navigation. Real cross-device calls require manual device verification and production STUN/TURN configuration.
