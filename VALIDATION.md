# Validation record

- `npm test`: 21 passing tests covering BIP-340 signatures, Nostr event validation, relay filters, profiles, threads, and payment targets.
- `node --check`: `public/src/app.js`, `public/src/templates.js`, and `public/config.js` parse without syntax errors.
- HTTP `GET /` against a local Python server returns 200.
- **Not validated end-to-end:** external Nostr relay connectivity, actual live FLASH events, browser rendering in this environment, nsyte publication, Lightning invoice generation, and payment receipts. Those require an unrestricted browser/network environment and/or FLASH-controlled infrastructure.
- Demo mode is explicit and contains only illustrative, fictional updates and payment targets; its goal payment controls are disabled.
- Curated lists and crowdfunding are retained in the source but hidden by default through `showCuratedLists: false` and `showCrowdfunding: false`. The default UI exposes only the newswire and support payment targets.

- v0.1.1: Browser-rendering smoke test in Chromium using in-memory static content and mock relays passed `/#/support` (including no-goals state), `/#/stories`, and `/#/` with zero page errors. Direct browser HTTP navigation was blocked in this environment; live relay/payment end-to-end tests remain out of scope.

## v0.1.2 payment target additions

- 12/12 Node tests pass (6 existing and 6 new payment-target tests).
- Earlier browser-injected demonstration smoke checks passed: Support (three non-payable payment target cards, one goal), Stories (two sets) and Newswire (four notes), with zero JavaScript page errors.
- Browser screenshots were made with CSS included. Actual relay and wallet operation was not validated end-to-end; these require live events and wallet services.
- Only signed events returned by NostrGateway are used in live mode. NIP-A3 payment targets are limited to the FLASH pubkey, and profile-based Lightning fallback is labeled separately.
- Non-Lightning payments are copy/deep-link only and do not imply confirmed settlement.
