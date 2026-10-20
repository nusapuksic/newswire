const PROFILE_TTL_MS=24*60*60*1000;
const PROFILE_DB_NAME='flash-profile-cache-v3';
const PROFILE_STORE='profiles';
const BECH32_CHARSET='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const validPubkey=value=>typeof value==='string'&&/^[a-f0-9]{64}$/i.test(value);

function safeAvatar(value){
  try {
    const url=new URL(value);
    return url.protocol==='https:'?url.href:null;
  } catch {
    return null;
  }
}

function text(value,maxLength=160){
  return typeof value==='string'&&value.trim()&&value.trim().length<=maxLength?value.trim():'';
}

function taggedText(tags,name,maxLength=160){
  const row=(tags||[]).find(tag=>Array.isArray(tag)&&tag[0]===name);
  return text(row?.[1],maxLength);
}

export {PROFILE_TTL_MS,validPubkey};

export function decodeNpub(value){
  if(typeof value!=='string')return null;
  const normalized=value.toLowerCase();
  const separator=normalized.indexOf('1');
  if(!normalized.startsWith('npub1')||separator<4)return null;
  const values=[];
  for(const character of normalized.slice(separator+1)){
    const index=BECH32_CHARSET.indexOf(character);
    if(index<0)return null;
    values.push(index);
  }
  if(values.length<7)return null;
  const expandedHrp=[...'npub'].map(character=>character.charCodeAt(0)>>5).concat([0],[...'npub'].map(character=>character.charCodeAt(0)&31));
  let checksum=1;
  for(const valuePart of [...expandedHrp,...values]) {
    const top=checksum>>25;
    checksum=((checksum&0x1ffffff)<<5)^valuePart;
    for(let index=0;index<5;index++)if((top>>index)&1)checksum^=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3][index];
  }
  if(checksum!==1)return null;
  const payload=values.slice(0,-6);
  let accumulator=0,bits=0;
  const bytes=[];
  for(const valuePart of payload){
    accumulator=(accumulator<<5)|valuePart;
    bits+=5;
    while(bits>=8){
      bits-=8;
      bytes.push((accumulator>>bits)&255);
    }
    accumulator=bits?accumulator&((1<<bits)-1):0;
  }
  if(bits>=5||(((accumulator<<(8-bits))&255)!==0)||bytes.length!==32)return null;
  return bytes.map(byte=>byte.toString(16).padStart(2,'0')).join('');
}

export function profileFromEvent(event){
  if(event?.kind!==0||!validPubkey(event.pubkey)||typeof event.content!=='string')return null;
  try {
    const metadata=JSON.parse(event.content);
    if(!metadata||typeof metadata!=='object'||Array.isArray(metadata))return null;
    return {
      pubkey:event.pubkey.toLowerCase(),
      name:text(metadata.display_name)||text(metadata.name)||null,
      picture:safeAvatar(metadata.picture),
      banner:safeAvatar(metadata.banner),
      lud16:text(metadata.lud16)||null,
      about:text(metadata.about,1000)||taggedText(event.tags,'about',1000)
    };
  } catch {
    return null;
  }
}

export function latestProfiles(events){
  const selected=new Map();
  for(const event of events||[]){
    const profile=profileFromEvent(event);
    if(!profile)continue;
    const current=selected.get(profile.pubkey);
    if(!current||event.created_at>current.eventCreatedAt||(event.created_at===current.eventCreatedAt&&event.id>current.eventId)){
      selected.set(profile.pubkey,{...profile,eventCreatedAt:event.created_at,eventId:event.id});
    }
  }
  return selected;
}

export function isProfileFresh(record,now=Date.now()){
  return Boolean(record&&Number.isFinite(record.cachedAt)&&now-record.cachedAt<PROFILE_TTL_MS);
}

export function chunkPubkeys(pubkeys,size=40){
  const unique=[...new Set((pubkeys||[]).filter(validPubkey).map(value=>value.toLowerCase()))];
  const chunks=[];
  for(let index=0;index<unique.length;index+=size)chunks.push(unique.slice(index,index+size));
  return chunks;
}

export class ProfileCache {
  constructor(indexedDb=globalThis.indexedDB){this.indexedDb=indexedDb;this.database=null;}
  async open(){
    if(this.database)return this.database;
    if(!this.indexedDb)return null;
    this.database=await new Promise((resolve,reject)=>{
      const request=this.indexedDb.open(PROFILE_DB_NAME,1);
      request.onupgradeneeded=()=>request.result.createObjectStore(PROFILE_STORE,{keyPath:'pubkey'});
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error||Error('Profile cache could not be opened.'));
    });
    return this.database;
  }
  async getMany(pubkeys){
    const db=await this.open();
    const result=new Map();
    if(!db)return result;
    const keys=[...new Set((pubkeys||[]).filter(validPubkey).map(value=>value.toLowerCase()))];
    await Promise.all(keys.map(pubkey=>new Promise((resolve,reject)=>{
      const request=db.transaction(PROFILE_STORE,'readonly').objectStore(PROFILE_STORE).get(pubkey);
      request.onsuccess=()=>{if(request.result)result.set(pubkey,request.result);resolve();};
      request.onerror=()=>reject(request.error||Error('Profile cache could not be read.'));
    })));
    return result;
  }
  async putMany(profiles,now=Date.now()){
    const db=await this.open();
    if(!db||!profiles?.size)return;
    await new Promise((resolve,reject)=>{
      const transaction=db.transaction(PROFILE_STORE,'readwrite');
      for(const profile of profiles.values())transaction.objectStore(PROFILE_STORE).put({...profile,cachedAt:now});
      transaction.oncomplete=resolve;
      transaction.onerror=()=>reject(transaction.error||Error('Profile cache could not be updated.'));
      transaction.onabort=()=>reject(transaction.error||Error('Profile cache update was aborted.'));
    });
  }
}
