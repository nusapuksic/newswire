// NIP-A3 / kind:10133 payment target handling. No private data or wallet operations.
// The caller must fetch signature-verified Nostr events before calling these helpers.
const DISPLAY = Object.freeze({
  bitcoin: 'Bitcoin', cashme: 'Cash App', ethereum: 'Ethereum', geyser: 'Geyser',
  lightning: 'Lightning', monero: 'Monero', nano: 'Nano',
  revolut: 'Revolut', venmo: 'Venmo'
});

export function latestPaymentTargetsEvent(events, pubkey) {
  return (events || []).filter(e => e?.kind === 10133 && e.pubkey === pubkey && Number.isSafeInteger(e.created_at))
    .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))[0] || null;
}

export function parsePaymentTargets(event) {
  if(!event || event.kind !== 10133 || !Array.isArray(event.tags)) return [];
  const out = [], seen = new Set();
  for(const row of event.tags) {
    if(!Array.isArray(row) || row.length < 3 || row[0] !== 'payto') continue;
    if(typeof row[1] !== 'string' || typeof row[2] !== 'string') continue;
    const type = row[1].trim().toLowerCase(), authority = row[2].trim();
    if(!/^[a-z0-9-]+$/.test(type) || !authority || authority.length > 512 || /[\x00-\x1f\x7f]/.test(authority)) continue;
    const key = `${type}\0${authority}`;
    if(seen.has(key)) continue;
    seen.add(key);
    out.push({type, authority, label: DISPLAY[type] || type, recognized: Boolean(DISPLAY[type]), source:'nip-a3'});
    if(out.length >= 32) break;
  }
  return out;
}

export function isLightningAddress(address) {
  if(typeof address !== 'string' || address.length > 254) return false;
  const bits = address.split('@');
  return bits.length === 2 && /^[a-z0-9._-]+$/i.test(bits[0]) && /^[a-z0-9.-]+$/i.test(bits[1]) && bits[1].includes('.');
}

export function withLightningFallback(targets, address) {
  const result = [...targets];
  if(isLightningAddress(address) && !result.some(t=>t.type === 'lightning' && isLightningAddress(t.authority))) {
    result.push({type:'lightning', authority:address, label:'Lightning', recognized:true, source:'profile'});
  }
  return result;
}

export function preferredLightningAddress(targets, fallback) {
  const payment = targets.find(t=>t.type === 'lightning' && isLightningAddress(t.authority));
  return payment?.authority || (isLightningAddress(fallback) ? fallback : null);
}

export function paytoUri(target) {
  if(!target || !/^[a-z0-9-]+$/.test(target.type || '') || typeof target.authority !== 'string') return null;
  // Percent-escape the account path so an event cannot inject URL queries/fragments.
  return `payto://${target.type}/${encodeURIComponent(target.authority)}`;
}

// Wallets and payment apps register their native schemes / web profile links, not payto:.
// Authorities are strictly validated so a published event cannot inject arbitrary URLs.
const APP_LINKS = Object.freeze({
  bitcoin: a => /^(bc1[02-9ac-hj-np-z]{8,87}|BC1[02-9AC-HJ-NP-Z]{8,87}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(a) ? `bitcoin:${a}` : null,
  lightning: a => isLightningAddress(a) || /^lnurl1[02-9ac-hj-np-z]+$/i.test(a) ? `lightning:${a}` : null,
  ethereum: a => /^0x[0-9a-fA-F]{40}$/.test(a) ? `ethereum:${a}` : null,
  monero: a => /^[1-9A-HJ-NP-Za-km-z]{95,106}$/.test(a) ? `monero:${a}` : null,
  nano: a => /^(nano|xrb)_[13][13-9a-km-uw-z]{59}$/.test(a) ? `nano:${a}` : null,
  revolut: a => (a = a.replace(/^@/, ''), /^[A-Za-z0-9._-]{1,64}$/.test(a) ? `https://revolut.me/${a}` : null),
  venmo: a => (a = a.replace(/^@/, ''), /^[A-Za-z0-9_-]{1,64}$/.test(a) ? `https://venmo.com/u/${a}` : null),
  cashme: a => (a = a.replace(/^\$/, ''), /^[A-Za-z0-9_-]{1,32}$/.test(a) ? `https://cash.app/$${a}` : null)
});

export function paymentAppUri(target) {
  if(!target || typeof target.authority !== 'string' || !Object.hasOwn(APP_LINKS, target.type)) return null;
  return APP_LINKS[target.type](target.authority.trim());
}
