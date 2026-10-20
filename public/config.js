// Public settings only. Never put a private key or API secret in an nsite.
window.FLASH_CONFIG = Object.freeze({
  title: 'FLASH',
  tagline: 'Independent news. In real time.',
  npub: 'npub1f4uyypghstsd8l4sxng4ptwzk6awfm3mf9ux0yallfrgkm6mj6es50r407',
  pubkey: '4d7842051782e0d3feb034d150adc2b6bae4ee3b49786793bffa468b6f5b96b3',
  relays: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net'
  ],
  // Profile metadata is cache-first and fetched separately from content discovery.
  profileRelays: [
    'wss://profiles.nostr1.com'
  ],
  // News remains free; goals are displayed only when published under this pubkey.
  newsBatchSize: 24,
  maxFeedItems: 120,
  newsRefreshSeconds: 45,
  noteLinkBase: 'https://njump.me/',
  // Keep the editorial-list and crowdfunding code available without exposing those surfaces.
  showCuratedLists: false,
  showCrowdfunding: false,
  // Optional alternative publisher for curator lists: null means FLASH signs them.
  curatorPubkey: null,
  // NIP-A3 payment targets (kind:10133) are discovered from FLASH and its NIP-65 relays.
  // Funding goals must be signed by FLASH; recipient identity is not configurable.
  // Set an email/Lightning address ONLY with FLASH's consent if metadata is missing.
  lightningAddressOverride: null
});
