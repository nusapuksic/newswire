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
