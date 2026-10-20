# FLASH — independent Nostr newswire (nsite MVP)

A standalone, dependency-free, read-only-first, responsive website built for **FLASH** (`npub1f4uyypghstsd8l4sxng4ptwzk6awfm3mf9ux0yallfrgkm6mj6es50r407`). The website is static; the reporting and payment targets are signed Nostr events fetched in the visitor's browser. Optional editorial-list and crowdfunding code paths remain available but are hidden by default. There is **no Symfony, database, React, Node server, or Unfold dependency**.

The client-side UI uses native HTML `<template>` elements in `public/src/templates.js` for repeated page and card structures. Dynamic event data is always inserted with `textContent`, not HTML interpolation, so moving markup out of the controller code does not weaken the existing rendering safety model.

> **Status:** Working MVP source and deployable static directory. No site has been published, and no funds have been sent. FLASH's consent, editorial input, and funding-goal publishing are still required for an official deployment.

## What works

- **Newswire** (`/#/`) loads signed, verified `kind:1` posts authored by FLASH from three public Nostr relays. Displays text, source links, embedded HTTPS images/video, timestamps, and links to the original events. Live WebSocket subscriptions receive newly published posts. Load earlier updates in batches.
- **Support** (`/#/support`) displays a FLASH business card from the latest verified **`kind:0` profile** (name, HTTPS avatar, banner image, about text from profile content or an `about` tag, and Lightning address when available). `nostr:npub...` sponsor references in the about text are resolved through the same verified profile cache used by comments and displayed as sponsor names. The page also discovers the latest signed **NIP-A3 `kind:10133` payment-targets event** alongside that metadata. Every valid `payto` entry is presented separately (Bitcoin, Lightning, Ethereum, Monero, Nano, Revolut, Venmo, Cash App, Geyser and future/unknown types). Visitors can copy the published recipient account, copy the `payto://` URI or try opening a compatible payment app. A signed Lightning address also offers a **general NIP-57 zap**, independently of a funding goal. If no usable Lightning target is published, the profile `lud16` is a fallback. The site also checks the author's NIP-65 `kind:10002` relay list when discovering targets.
- **Hidden optional surfaces** retain the Stories/NIP-51 list and crowdfunding/NIP-75 goal functionality in the source, but both are disabled by default. The public experience is intentionally limited to the event firehose and general payment targets.
- **Safety:** Validates SHA-256 event IDs and BIP-340 Schnorr signatures before rendering; filters by exact publisher keys; uses text nodes rather than interpreting Nostr text as HTML; limits media URLs to HTTPS; no private keys in the website.
- **Thread profiles:** Thread author names and avatars come from verified `kind:0` metadata. Fresh metadata is hydrated first from a local IndexedDB cache for up to one day; expired or unseen profiles are then fetched from `wss://profiles.nostr1.com`, with the configured content relays as fallback. Avatar images remain remote HTTPS resources, so their hosts can receive visitors’ IP addresses.
- **Demo mode** (`/?demo=1#/`) renders example event cards and payment targets without contacting relays or initiating payments. All demo content is labeled as fictional.

## Support-page configuration

`/#/support` works without any additional configuration. It fetches the latest **signed `kind:10133`** for the FLASH pubkey, parses `['payto', '<type>', '<authority>']` tags, and displays all valid targets. This is **NIP-A3** as implemented by Decent Newsroom; the supported set is extensible, not restricted to Lightning. Targets are **publisher-controlled**; do not hardcode recipient details in the theme. An example unsigned event is in `examples/payment-targets-unsigned.json`. The browser also discovers extra relay endpoints from the author's **signed `kind:10002` (NIP-65)** if available. Curated lists and crowdfunding remain hidden until explicitly enabled in `public/config.js`.

For each payment target, the recipient address can be copied, the `payto://type/account` URI can be copied, or a `payto:` handler can be launched. Not every browser or wallet recognizes `payto:` links; copying the address and pasting it into the chosen wallet is the reliable fallback. No website action proves that a non-Lightning payment occurred. URLs, keys, and recipient details should be verified independently before sending.

`lightning` payto targets that contain a Lightning address also expose a **general zap** button, using a NIP-07 signer and NIP-57-compatible LNURL service; goal-linked zaps remain separate and reference the NIP-75 event. A missing `lud16` in the kind-0 profile does not break the page. `public/config.js` still supports the consent-only `lightningAddressOverride` fallback. Crowdfunding cards appear only if FLASH has published signed, valid NIP-75 kind-9041 goal events. Demo mode displays three **fake, non-payable** target examples and a fake goal, with all payment actions disabled.

## Quick start (no install step required)

Run a local HTTP server from the project root:

```sh
python3 -m http.server 8080 --directory public
```

Then browse:

- `http://localhost:8080/#/` — real Nostr feed
- `http://localhost:8080/?demo=1#/` — offline illustrative demo (safe to preview)
- `http://localhost:8080/#/support` — reporting support

Automated tests require Node 20 or later but there are no npm dependencies:

```sh
npm test
```

All files to publish are in **`public/`**. Do not upload the project root, tests or example templates.

## Publish as a NIP-5A nsite

Install [nsyte](https://github.com/sandwichfarm/nsyte) using its documented method, then from the project directory:

```sh
nsyte init
nsyte scan
nsyte deploy ./public
nsyte status
```

`nsyte init` configures publishing identity, relays, and Blossom servers. These operations require keys/remote infrastructure and were **not** executed in this package. The NIP-5A manifest is generated and signed during deployment; **we do not ship a fake manifest**. A dedicated nsite key can own the site while it displays signed reporting from FLASH's existing key. FLASH never needs to disclose their reporting private key. Publishing under their name/domain should be approved by them.

The site uses hash routes (`/#/stories/...`) so static gateways do not need server-side path rewrites. Keep `index.html`, `config.js`, `styles.css`, `favicon.svg`, `404.html`, and `src/` together.

## Configure the publication

Modify `public/config.js` (only public values):

- `npub` / `pubkey`: FLASH's author identity; leave unchanged for this site.
- `relays`: publicly readable WebSocket relays that carry the author's notes, lists, and goals. These are discovery queries, not a requirement to self-host a relay.
- `profileRelays`: public relays used for thread-author `kind:0` metadata. The default is `wss://profiles.nostr1.com`; profile data is retained in the browser’s IndexedDB cache for one day before it is refreshed.
- `showCuratedLists`: set to `true` to expose the retained Stories/NIP-51 UI; defaults to `false`.
- `showCrowdfunding`: set to `true` to expose the retained NIP-75 goal UI and contribution flow; defaults to `false`.
- `curatorPubkey`: optional separate, *trusted* Nostr account to publish curation sets when curated lists are enabled. By default, lists must be signed by FLASH.
- `lightningAddressOverride`: only for an expressly consented Lightning address if a signed `kind:10133` lightning target and signed `kind:0` `lud16` are unavailable. The default is `null`.
- `newsBatchSize`, `maxFeedItems`: simple feed limits.

There is no server configuration and no signing key in `config.js`.

## Publish a curated story

With the Nostr identity selected by `curatorPubkey` (FLASH by default), sign and publish a **kind `30004`** NIP-51 event. The `d` tag is a stable story slug, `title` and `description` feed the UI, and each `e` tag is the 64-character hex event ID of a kind-1 note. See `examples/story-unsigned.json` (template, not signed/publishable as-is).

To update a story, publish a newer event with the **same author and `d` tag** and updated `e` tags. NIP-51 lists may reference posts from other authors; the site displays the original note attribution. This MVP supports **`e` references only**, intentionally omitting long-form `a` references because the project is focused on kind-1 news.

## Publish a crowdfunding goal

With FLASH's account, sign and publish a **kind `9041`** NIP-75 event. Its `amount` tag is in **millisatoshis** (example: 1,000,000 sats = 1,000,000,000 msats), and its `relays` tag specifies where wallet zap receipts should be announced. The `content` describes what is being funded, and `summary` is an optional shorter title. See `examples/goal-unsigned.json`.

The site requires goal events to be authored by FLASH and assumes funds are payable to FLASH's published Lightning address. Goals with NIP-57 `zap` split tags can still be discovered and linked, but local receipt accounting is disabled for those complex payouts.

**Invoice request flow:** Visitor chooses a goal → chooses sats → NIP-07 signer signs a kind-9734 zap request that references the goal → FLASH's Lightning service creates an invoice → visitor pays using their wallet. If the browser has no signer or the Lightning endpoint blocks cross-origin access, visitors can instead use the goal's Nostr link and a compatible Nostr client. NIP-75 does not provide escrow or project milestone enforcement.

## Intentional limitations

1. **Community/patron chat is entirely out of scope.** No login, memberships, paywall, access control or hidden news.
2. No editorial dashboard or event publishing interface. FLASH posts from their Nostr client; Unfold is not needed.
3. No guarantee of SEO indexing for event text (client-side rendering), nor social-media previews for individual notes; a prerendered publication snapshot could be added later.
4. Relay responses are best-effort, bounded by timeouts and affected by relay availability, CORS for Lightning, and event propagation. Events not available from the chosen relays will be omitted with a suitable warning.
5. Receipt progress is **wallet-reported, not cryptographic proof of payment**: signed receipt checks do not verify BOLT-11 description hashes or blockchain/wallet settlement. The website never claims guaranteed funds received. If the wallet lookup fails, progress is withheld.
6. No comment/reply UI, event zaps under tragic news, payment escrow, fiat processing, subscriptions or custom storage service.
7. Remote photo/video assets are loaded from original hosts when shown. Those servers may learn visitors' IP addresses; use a trusted media proxy if that matters.
8. The browser-side BIP-340 implementation is purpose-built for reading, verified against official known test vectors; a production security review and migration to a widely audited crypto library are advisable before relying on it at large scale.

## Project structure

```text
public/               # publish ONLY this directory as the nsite
  index.html          # hash-route shell and accessible navigation
  config.js           # public site settings
  styles.css          # responsive editorial design
  favicon.svg
  404.html
  src/app.js          # newswire, stories, funding and tip UI, invoice flow
  src/templates.js    # native HTML templates for reusable page and card structures
  src/payment-targets.js # kind 10133 normalization, URLs, Lightning fallback
  src/nostr.js        # bounded relay queries, subscriptions, deduplication
  src/verify.js       # dependency-free BIP-340 and Nostr event verification
tests/                # Node built-in tests, including payment target tests
examples/             # UNSIGNED NIP-51 and NIP-75 event templates
package.json          # only used for the tests, zero dependencies
```

## Protocol references

- [NIP-5A — Static Websites](https://github.com/nostr-protocol/nips/blob/master/5A.md)
- [NIP-51 — Lists](https://github.com/nostr-protocol/nips/blob/master/51.md)
- [NIP-75 — Zap Goals](https://github.com/nostr-protocol/nips/blob/master/75.md)
- [NIP-A3 — Payment Targets](https://github.com/decent-newsroom/newsroom/blob/main/documentation/NIP/A3.md)
- [NIP-65 — Relay List Metadata](https://github.com/nostr-protocol/nips/blob/master/65.md)
- [NIP-57 — Lightning Zaps](https://github.com/nostr-protocol/nips/blob/master/57.md)
- [NIP-07 — Browser Extension](https://github.com/nostr-protocol/nips/blob/master/07.md)
- [nsyte deployment CLI](https://github.com/sandwichfarm/nsyte)
