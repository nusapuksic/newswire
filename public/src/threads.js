import { parseNip10References } from './nip10.js';
import { parseNip22References } from './nip22.js';

const eventId = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const sameReference = (left,right) => left && right && left.type===right.type &&
  (left.type==='event' ? left.id===right.id : left.coordinate===right.coordinate);
export const referenceKey = reference => reference ? `${reference.type}:${reference.id||reference.coordinate}` : '';
export const eventReference = id => eventId(id) ? { type:'event',id:id.toLowerCase() } : null;
export const addressReference = coordinate => typeof coordinate==='string' ? { type:'address',coordinate } : null;

export function parseThreadReferences(event) {
  if (event?.kind===1) return parseNip10References(event);
  if (event?.kind===1111) return parseNip22References(event);
  return {root:null,parent:null,references:[]};
}

export function normalizeThreadEvent(event) {
  if (!event || !eventId(event.id) || !eventId(event.pubkey) || ![1,1111].includes(event.kind)) return null;
  const parsed=parseThreadReferences(event);
  return {
    id:event.id.toLowerCase(), kind:event.kind, pubkey:event.pubkey.toLowerCase(),
    created_at:event.created_at, content:event.content, root:parsed.root, parent:parsed.parent,
    references:parsed.references, rootKind:parsed.rootKind??null, parentKind:parsed.parentKind??null, rawEvent:event
  };
}

export const isOriginalKind1 = event => {
  const normalized=normalizeThreadEvent(event);
  return normalized?.kind===1 && !normalized.parent;
};

export class ThreadGraph {
  constructor(root) {
    this.root=typeof root==='string' ? eventReference(root) : root;
    this.eventsById=new Map();
    this.childrenByParentId=new Map();
    this.missingParents=new Set();
    this.loading=false;
    this.complete=false;
  }

  add(event) {
    const normalized=normalizeThreadEvent(event);
    if (!normalized || this.eventsById.has(normalized.id)) return false;
    if (normalized.root && !sameReference(normalized.root,this.root)) return false;
    if (normalized.id===this.root?.id) {
      if (normalized.parent) return false;
      this.eventsById.set(normalized.id,normalized);
      return true;
    }
    if (normalized.id===normalized.parent?.id) return false;
    this.eventsById.set(normalized.id,normalized);
    return true;
  }

  addMany(events) { return events.reduce((count,event)=>count+Number(this.add(event)),0); }

  tree() {
    const rootId=this.root?.type==='event' ? this.root.id : null;
    const nodes=new Map([...this.eventsById].map(([id,event])=>[id,{event,children:[],missing:false}]));
    const topLevel=[];
    this.childrenByParentId.clear();
    this.missingParents.clear();
    const invalid=new Set();
    const validChain=(id,visited=new Set()) => {
      const event=this.eventsById.get(id);
      if (!event || visited.has(id)) return false;
      const parentId=event.parent?.type==='event' ? event.parent.id : null;
      if (!parentId) return id===rootId;
      if (parentId===rootId) return true;
      if (!this.eventsById.has(parentId)) return true;
      visited.add(id);
      return validChain(parentId,visited);
    };
    for (const [id,event] of this.eventsById) {
      if (id===rootId || !event.parent || !validChain(id)) { if(id!==rootId) invalid.add(id); continue; }
      if (event.rootKind!==null && rootId && this.eventsById.get(rootId)?.kind!==event.rootKind) { invalid.add(id); continue; }
      if (sameReference(event.parent,this.root)) {
        topLevel.push(nodes.get(id));
        continue;
      }
      const parentId=event.parent.type==='event' ? event.parent.id : null;
      if (!parentId) { invalid.add(id); continue; }
      const parentNode=nodes.get(parentId);
      if (parentNode && event.parentKind!==null && parentNode.event.kind!==event.parentKind) { invalid.add(id); continue; }
      if (parentNode) {
        parentNode.children.push(nodes.get(id));
      } else {
        this.missingParents.add(parentId);
        const missingId=`missing:${parentId}`;
        if (!nodes.has(missingId)) nodes.set(missingId,{event:{id:parentId,content:'Referenced parent is unavailable.',created_at:event.created_at},children:[],missing:true});
        nodes.get(missingId).children.push(nodes.get(id));
      }
      if (!this.childrenByParentId.has(parentId)) this.childrenByParentId.set(parentId,new Set());
      this.childrenByParentId.get(parentId).add(id);
    }
    const sort=node => {
      node.children.sort((a,b)=>(a.event.created_at-b.event.created_at)||a.event.id.localeCompare(b.event.id));
      node.children.forEach(sort);
      return node;
    };
    const rootNode=rootId && nodes.get(rootId);
    const detached=[...nodes.values()].filter(node=>node.missing && !invalid.has(node.event.id));
    if (rootNode) {
      topLevel.forEach(node=>rootNode.children.push(node));
      detached.forEach(node=>rootNode.children.push(node));
      return sort(rootNode);
    }
    return sort({event:null,children:[...topLevel,...detached],missing:false});
  }
}
