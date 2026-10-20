const eventId = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const addressCoordinate = value => {
  if (typeof value !== 'string') return null;
  const [kind,pubkey,...identifier]=value.split(':');
  return /^\d+$/.test(kind) && eventId(pubkey) && identifier.length ? value : null;
};
const eventRef = id => eventId(id) ? { type:'event', id:id.toLowerCase() } : null;
const addressRef = coordinate => {
  const valid=addressCoordinate(coordinate);
  return valid ? { type:'address', coordinate:valid } : null;
};
const first = (tags,name,parser) => {
  const tag=tags.find(candidate=>candidate[0]===name && parser(candidate[1]));
  return tag ? parser(tag[1]) : null;
};

export function parseNip22References(event) {
  const tags=Array.isArray(event?.tags) ? event.tags : [];
  const root=first(tags,'E',eventRef) || first(tags,'A',addressRef);
  const parent=first(tags,'e',eventRef) || first(tags,'a',addressRef) || root;
  const rootKind=tags.find(tag=>tag[0]==='K' && /^\d+$/.test(tag[1]))?.[1];
  const parentKind=tags.find(tag=>tag[0]==='k' && /^\d+$/.test(tag[1]))?.[1];
  return {
    root,
    parent,
    rootKind:rootKind===undefined ? null : Number(rootKind),
    parentKind:parentKind===undefined ? null : Number(parentKind),
    references:[
      ...tags.filter(tag=>tag[0]==='E' || tag[0]==='e').map(tag=>eventRef(tag[1])),
      ...tags.filter(tag=>tag[0]==='A' || tag[0]==='a').map(tag=>addressRef(tag[1]))
    ].filter(Boolean)
  };
}
