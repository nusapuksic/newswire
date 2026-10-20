const eventId = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
const eventRef = id => eventId(id) ? { type:'event', id:id.toLowerCase() } : null;

export function parseNip10References(event) {
  const tags=Array.isArray(event?.tags) ? event.tags : [];
  const eTags=tags.filter(tag=>tag[0]==='e' && eventRef(tag[1]));
  const markedRoot=eTags.find(tag=>tag[3]==='root');
  const markedReply=eTags.find(tag=>tag[3]==='reply');
  const positional=eTags.filter(tag=>!tag[3]);
  let root=eventRef(markedRoot?.[1]);
  let parent=eventRef(markedReply?.[1]);

  if (!root && positional.length) root=eventRef(positional[0][1]);
  if (!parent) {
    if (markedRoot) parent=root;
    else if (positional.length) parent=eventRef(positional[positional.length-1][1]);
  }
  return {
    root,
    parent,
    references:[
      ...eTags.map(tag=>eventRef(tag[1])),
      ...tags.filter(tag=>tag[0]==='q').map(tag=>eventRef(tag[1]))
    ].filter(Boolean)
  };
}
