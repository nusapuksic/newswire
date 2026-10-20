// Read-only BIP-340 verification for Nostr events, with no runtime dependencies.
// Never sign with this module. Private keys never belong in an nsite.
const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G = { x: 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n,
            y: 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n, z: 1n };
const INF = { x: 0n, y: 1n, z: 0n };
const enc = new TextEncoder();
const mod = (a, m = P) => ((a % m) + m) % m;
const power = (a, e, m = P) => { let r = 1n; a = mod(a, m); while (e > 0n) { if (e & 1n) r = r * a % m; a = a * a % m; e >>= 1n; } return r; };
const byteHex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
const fromHex = h => new Uint8Array(h.match(/../g).map(x => parseInt(x, 16)));
const toNumber = b => BigInt('0x' + byteHex(b));
function concat(...chunks) { const o = new Uint8Array(chunks.reduce((s,b)=>s+b.length,0)); let p=0; for(const b of chunks){o.set(b,p);p+=b.length;} return o; }
async function sha256(bytes) { return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)); }
const cachedTags = new Map();
async function taggedHash(tag, data) {
  let tagHash = cachedTags.get(tag);
  if (!tagHash) { tagHash = await sha256(enc.encode(tag)); cachedTags.set(tag, tagHash); }
  return sha256(concat(tagHash, tagHash, data));
}
function double(a) {
  if (a.z === 0n || a.y === 0n) return INF;
  const yy = mod(a.y*a.y), yyyy = mod(yy*yy), s = mod(4n*a.x*yy), m = mod(3n*a.x*a.x);
  return { x: mod(m*m - 2n*s), y: mod(m*(s - mod(m*m-2n*s)) - 8n*yyyy), z: mod(2n*a.y*a.z) };
}
function add(a, b) {
  if (a.z === 0n) return b;
  if (b.z === 0n) return a;
  const z1z1 = mod(a.z*a.z), z2z2 = mod(b.z*b.z);
  const u1 = mod(a.x*z2z2), u2 = mod(b.x*z1z1);
  const s1 = mod(a.y*b.z*z2z2), s2 = mod(b.y*a.z*z1z1);
  if (u1 === u2) return s1 === s2 ? double(a) : INF;
  const h = mod(u2-u1), r = mod(s2-s1), hh = mod(h*h), hhh = mod(h*hh), v = mod(u1*hh);
  return { x: mod(r*r-hhh-2n*v), y: mod(r*(v-mod(r*r-hhh-2n*v))-s1*hhh), z: mod(h*a.z*b.z) };
}
function multiply(n, point) {
  let result=INF, p=point;
  while(n>0n) { if(n&1n) result=add(result,p); p=double(p); n >>= 1n; }
  return result;
}
function liftX(x) {
  if (x>=P) return null;
  const y2=mod(x*x*x+7n), y=power(y2,(P+1n)/4n);
  if(mod(y*y)!==y2) return null;
  return { x, y: y&1n ? P-y : y, z:1n };
}
export async function verifySchnorr(signatureHex, publicKeyHex, messageHex) {
  if (![signatureHex, publicKeyHex, messageHex].every(s => typeof s === 'string') ||
      !/^[0-9a-f]{128}$/i.test(signatureHex) || !/^[0-9a-f]{64}$/i.test(publicKeyHex) || !/^[0-9a-f]{64}$/i.test(messageHex)) return false;
  const r=BigInt('0x'+signatureHex.slice(0,64)), s=BigInt('0x'+signatureHex.slice(64));
  if (r>=P || s>=N) return false;
  const pub=liftX(BigInt('0x'+publicKeyHex));
  if (!pub) return false;
  const e=toNumber(await taggedHash('BIP0340/challenge',concat(fromHex(signatureHex.slice(0,64)),fromHex(publicKeyHex),fromHex(messageHex))))%N;
  const R=add(multiply(s,G),multiply(mod(-e,N),pub));
  if(R.z===0n) return false;
  const zInv=power(R.z,P-2n), z2=mod(zInv*zInv);
  const x=mod(R.x*z2), y=mod(R.y*z2*zInv);
  return x===r && y%2n===0n;
}
export async function verifyNostrEvent(event) {
  if (!event || typeof event !== 'object' || !Number.isInteger(event.kind) || !Number.isInteger(event.created_at) ||
      typeof event.content !== 'string' || !Array.isArray(event.tags) ||
      !event.tags.every(t=>Array.isArray(t) && t.every(v=>typeof v==='string')) ||
      !/^[0-9a-f]{64}$/i.test(event.id||'') || !/^[0-9a-f]{64}$/i.test(event.pubkey||'')) return false;
  if(event.created_at > Math.floor(Date.now()/1000)+600 || event.content.length > 400000) return false;
  try {
    const canonical=JSON.stringify([0,event.pubkey,event.created_at,event.kind,event.tags,event.content]);
    const digest=byteHex(await sha256(enc.encode(canonical)));
    return digest===event.id && await verifySchnorr(event.sig,event.pubkey,event.id);
  } catch { return false; }
}
