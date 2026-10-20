import { verifyNostrEvent } from './verify.js';
import { ThreadGraph, eventReference, normalizeThreadEvent, referenceKey } from './threads.js';

const validHex = s => typeof s === 'string' && /^[0-9a-f]{64}$/i.test(s);
const tagValues = (evt,k) => evt.tags.filter(t=>t[0]===k).map(t=>t[1]).filter(Boolean);
export {tagValues};
export function uniqueRelays(input) {
  return [...new Set((input||[]).filter(s=>typeof s==='string' && /^wss:\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^?#]*)?$/i.test(s)))].slice(0,9);
}
export function matches(evt, filter) {
  if (filter.kinds && !filter.kinds.includes(evt.kind)) return false;
  if (filter.authors && !filter.authors.includes(evt.pubkey)) return false;
  if (filter.ids && !filter.ids.includes(evt.id)) return false;
  for(const [k,v] of Object.entries(filter)) {
    if(!k.startsWith('#')) continue;
    if(!v.some(x=>tagValues(evt,k.slice(1)).includes(x))) return false;
  }
  return true;
}
class Connection {
  constructor(url, verify) { this.url=url; this.verify=verify; this.subs=new Map(); this.ws=null; this.reconnectTimer=null; }
  connect() {
    if(this.ws && [0,1].includes(this.ws.readyState)) return;
    if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer=null; }
    try { this.ws=new WebSocket(this.url); } catch { this.reconnect(); return; }
    this.ws.onopen=()=> { for(const [id,s] of this.subs) this.send(['REQ',id,...s.filters]); };
    this.ws.onmessage=ev=>{
      try {
        const msg=JSON.parse(ev.data);
        if(!Array.isArray(msg)) return;
        const [,id,event]=msg;
        const sub=this.subs.get(id);
        if(!sub) return;
        if(msg[0]==='EOSE') { Promise.allSettled([...sub.pending]).then(()=>{ if(this.subs.has(id))sub.eose?.(); }); return; }
        if(msg[0]!=='EVENT' || !event || !sub.filters.some(f=>matches(event,f))) return;
        const pending=Promise.resolve(this.verify(event)).then(ok=> { if(ok && this.subs.has(id)) sub.onEvent(event); }).catch(()=>{});
        sub.pending.add(pending); pending.finally(()=>sub.pending.delete(pending));
      } catch { /* ignore malformed relay messages */ }
    };
    this.ws.onclose=()=>{this.ws=null; if(this.subs.size) this.reconnect();};
    this.ws.onerror=()=>{};
  }
  reconnect() { if(!this.reconnectTimer && this.subs.size) this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null;this.connect();},2000); }
  send(arr) { if(this.ws?.readyState===1) this.ws.send(JSON.stringify(arr)); }
  subscribe(filters, onEvent, eose) {
    const id='f'+Math.random().toString(36).slice(2,12);
    this.subs.set(id,{filters,onEvent,eose,pending:new Set()}); this.connect();
    if(this.ws?.readyState===1) this.send(['REQ',id,...filters]);
    return ()=>{this.subs.delete(id); this.send(['CLOSE',id]); if(!this.subs.size){clearTimeout(this.reconnectTimer);this.reconnectTimer=null;this.ws?.close();this.ws=null;}};
  }
}
export class NostrGateway {
  constructor(relays) { this.relays=uniqueRelays(relays); this.connections=new Map(); this.verified=new Map(); }
  connection(url) { if(!this.connections.has(url)) this.connections.set(url,new Connection(url, e=>this.verify(e))); return this.connections.get(url); }
  async verify(event) {
    if (!event || !validHex(event.id)) return false;
    if (!this.verified.has(event.id)) {
      this.verified.set(event.id,verifyNostrEvent(event).catch(()=>false));
      if(this.verified.size>1800) this.verified.delete(this.verified.keys().next().value);
    }
    return this.verified.get(event.id);
  }
  // A bounded relay request. Partial successful replies are returned even if other relays time out.
  async query(filters, { relays=this.relays, timeout=6500 }={}) {
    const urls=uniqueRelays(relays); if(!urls.length) return [];
    return new Promise(resolve=>{
      const found=new Map(); let pending=urls.length, finished=false, timer, cleanup=[];
      const done=()=>{ if(finished) return; finished=true; clearTimeout(timer); cleanup.forEach(fn=>fn()); resolve([...found.values()].sort((a,b)=>b.created_at-a.created_at)); };
      for(const url of urls){ let ended=false;
        const unsub=this.connection(url).subscribe(filters,e=>found.set(e.id,e),()=>{if(ended)return;ended=true; if(--pending===0) setTimeout(done,250);});
        cleanup.push(unsub);
      }
      timer=setTimeout(done,timeout);
    });
  }
  // Long-lived subscriptions; caller must close on navigation away.
  subscribe(filters, onEvent, {relays=this.relays}={}) {
    const unsubs=uniqueRelays(relays).map(url=>this.connection(url).subscribe(filters,onEvent));
    return ()=>unsubs.forEach(fn=>fn());
  }
  close() {for (const c of this.connections.values()) for (const id of [...c.subs.keys()]) {c.subs.delete(id); c.send(['CLOSE',id]);} for(const c of this.connections.values()) { clearTimeout(c.reconnectTimer); c.ws?.close(); } this.connections.clear();}
}

export class ThreadLoader {
  constructor(gateway,{timeout=6500,maxRequests=12,pageSize=150,maxDepth=4}={}) {
    this.gateway=gateway;this.timeout=timeout;this.maxRequests=maxRequests;this.pageSize=pageSize;this.maxDepth=maxDepth;this.cache=new Map();
  }
  async load(root,{onUpdate,signal}={}) {
    const rootReference=typeof root==='string' ? eventReference(root) : root?.type ? root : root?.id ? eventReference(root.id) : root;
    if (!rootReference) throw Error('A valid thread root is required.');
    const graph=new ThreadGraph(rootReference);
    if (root?.id) graph.add(root);
    graph.addMany([...this.cache.values()]
      .filter(event=>event.id===rootReference.id || referenceKey(event.root)===referenceKey(rootReference))
      .map(event=>event.rawEvent));
    const relayHints=new Set();
    const collectRelayHints=event=>{
      for(const tag of event?.tags||[]) {
        if (tag[0]==='relays') tag.slice(1).forEach(relay=>relayHints.add(relay));
        if ((tag[0]==='e' || tag[0]==='a') && tag[2]) relayHints.add(tag[2]);
      }
    };
    collectRelayHints(root);
    const notify=()=>onUpdate?.(graph);
    const query=async filters=>{
      if(signal?.aborted) return [];
      const relays=uniqueRelays([...(this.gateway.relays||[]),...relayHints]);
      const events=await this.gateway.query(filters,{timeout:this.timeout,relays});
      events.forEach(event=>{
        collectRelayHints(event);
        const normalized=normalizeThreadEvent(event);
        if(normalized)this.cache.set(event.id,normalized);
      });
      if(this.cache.size>2000)this.cache.delete(this.cache.keys().next().value);
      graph.addMany(events);notify();return events;
    };
    graph.loading=true;notify();
    let requests=0;
    const rootFilter=rootReference.type==='event'
      ? [{kinds:[1],'#e':[rootReference.id],limit:this.pageSize},{kinds:[1111],'#E':[rootReference.id],limit:this.pageSize}]
      : [{kinds:[1111],'#A':[rootReference.coordinate],limit:this.pageSize}];
    await query(rootFilter);requests++;
    let parentIds=[...graph.eventsById.keys()];
    for(let depth=0;depth<this.maxDepth && parentIds.length && requests<this.maxRequests && !signal?.aborted;depth++){
      const chunks=[];for(let i=0;i<parentIds.length;i+=40)chunks.push(parentIds.slice(i,i+40));
      const before=new Set(graph.eventsById.keys());
      for(const ids of chunks){
        if(requests>=this.maxRequests) break;
        await query([{kinds:[1,1111],'#e':ids,limit:this.pageSize}]);requests++;
      }
      const newIds=[...graph.eventsById.keys()].filter(id=>!before.has(id));
      if(!newIds.length) break;
      parentIds=newIds;
    }
    const unresolved=[...graph.eventsById.values()].map(event=>event.parent).filter(ref=>ref?.type==='event' && !graph.eventsById.has(ref.id)).map(ref=>ref.id);
    for(let i=0;i<unresolved.length && requests<this.maxRequests && !signal?.aborted;i+=40) {
      await query([{ids:[...new Set(unresolved.slice(i,i+40))],kinds:[1,1111]}]);requests++;
    }
    graph.loading=false;graph.complete=!signal?.aborted && requests<this.maxRequests;notify();
    return graph;
  }
}
