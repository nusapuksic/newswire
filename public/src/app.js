import { NostrGateway, ThreadLoader, tagValues, uniqueRelays } from './nostr.js';
import { addressReference, isOriginalKind1 } from './threads.js';
import { verifyNostrEvent } from './verify.js';
import { latestPaymentTargetsEvent, parsePaymentTargets, withLightningFallback, preferredLightningAddress, isLightningAddress, paytoUri, paymentAppUri } from './payment-targets.js';
import { ProfileCache, chunkPubkeys, decodeNpub, isProfileFresh, latestProfiles, validPubkey } from './profiles.js';
import { businessCard, emptyState, feedStatus, sectionHeading, storyCard as storyCardTemplate, supportPageShell, wirePage } from './templates.js';

const config=window.FLASH_CONFIG;
const demo=new URLSearchParams(location.search).get('demo')==='1';
const flashPubkey=config.pubkey;
const features=Object.freeze({
 curatedLists:config.showCuratedLists===true,
 crowdfunding:config.showCrowdfunding===true
});
const curator=config.curatorPubkey||flashPubkey;
const goalAuthor=flashPubkey;
const pool=new NostrGateway(config.relays);
const threadLoader=new ThreadLoader(pool);
const profileCache=new ProfileCache();
const main=document.querySelector('#main');
const imageLightbox=document.querySelector('#image-lightbox');
const lightboxImage=imageLightbox?.querySelector('img');
const state={profile:null, authorProfiles:new Map(), profileRequests:new Map(), feed:[], stories:[], goals:[], route:'', closeLive:null, oldest:null, canLoadMore:true, loading:false, results:new Set(), receiptCache:new Map(), paymentTargets:[], paymentTargetsLoaded:false};
const GOAL_KIND=9041;
const FLASH_AVATAR_URL='https://r2a.primal.net/uploads2/2/6b/6b/26b6b2a658e9248247c060851327d4eaab4de52d0d927d3b69090926c680a297.jpg';
const nt=e=>`https://njump.me/${e}`;

function $el(tag, cls='', text=null){ const n=document.createElement(tag); if(cls)n.className=cls; if(text!==null)n.textContent=text; return n; }
function add(parent,...children){children.flat().filter(Boolean).forEach(c=>parent.append(c));return parent;}
function tag(e,k){return tagValues(e,k)[0]||'';}
function safeUrl(raw,media=false){try{const u=new URL(raw);return (u.protocol==='https:' || (!media && u.protocol==='http:'))?u.href:null;}catch{return null;}}
function when(unix){if(!Number.isFinite(unix))return '';return new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(unix*1000));}
function ago(unix){const sec=Math.max(0,Math.round(Date.now()/1000)-unix);if(sec<60)return 'Just now';if(sec<3600)return `${Math.floor(sec/60)}m ago`;if(sec<86400)return `${Math.floor(sec/3600)}h ago`;if(sec<604800)return `${Math.floor(sec/86400)}d ago`;return when(unix);}
function announce(msg){const n=document.querySelector('#toast');n.textContent=msg;n.classList.add('show');clearTimeout(announce.timer);announce.timer=setTimeout(()=>n.classList.remove('show'),3400);}
function link(text,href,cls=''){const a=$el('a',cls,text);a.href=href; if(href.startsWith('http')){a.target='_blank';a.rel='noopener noreferrer';}return a;}
function btn(label,cb,cls=''){const b=$el('button',cls,label);b.type='button';b.addEventListener('click',cb);return b;}
function closeImageLightbox(){
  if(!imageLightbox||!lightboxImage)return;
  imageLightbox.hidden=true;
  lightboxImage.removeAttribute('src');
  document.body.classList.remove('lightbox-open');
}
function openImageLightbox(src,alt){
  if(!imageLightbox||!lightboxImage)return;
  lightboxImage.src=src;
  lightboxImage.alt=alt;
  imageLightbox.hidden=false;
  document.body.classList.add('lightbox-open');
  imageLightbox.querySelector('.image-lightbox-close')?.focus();
}
const marker=emptyState;
const buildStatus=feedStatus;
function syncFeatureVisibility(root=document){
 root.querySelectorAll('[data-feature]').forEach(node=>{
  const enabled=features[node.dataset.feature]===true;
  node.hidden=!enabled;
 });
}
function clearAndShow(node){syncFeatureVisibility(node);main.replaceChildren(node);}
function footnote(text){return $el('p','footnote',text);}
function demoBanner(){const b=document.querySelector('#demo-banner');b.classList.toggle('hidden',!demo);b.querySelector('a').href=location.pathname+location.search.replace(/\??demo=1&?/,'')+'#/';}
function validNoteEvent(e){return e?.kind===1 && typeof e.content==='string' && /^[a-f0-9]{64}$/i.test(e.id||'');}
function mediaFromNote(e){
  const note=e.content||'';
  const urls=(note.match(/https?:\/\/[^\s<>"'\]\)]+/gi)||[]).map(s=>s.replace(/[.,!?]+$/,''));
  const media=[];
  for(const url of urls) {
    const u=safeUrl(url,true);if(!u)continue;
    const path=new URL(u).pathname.toLowerCase();
    let type=/\.(jpg|jpeg|png|webp|gif|avif)$/.test(path)?'image':/\.(mp4|webm|mov)$/.test(path)?'video':null;
    if(type && !media.some(m=>m.url===u)) media.push({url:u,type});
    if(media.length>=3)break;
  }
  return media;
}
function richText(text){
  const p=$el('div','note-text');
  const re=/(https?:\/\/[^\s<>"'\]\)]+)/g;let from=0,m;
  while((m=re.exec(text))!==null){
    if(m.index>from)p.append(document.createTextNode(text.slice(from,m.index)));
    let candidate=m[0].replace(/[.,!?]+$/,'');let u=safeUrl(candidate);
    if(u){let a=link(candidate,u,'note-link');a.textContent=candidate;p.append(a);}else p.append(document.createTextNode(m[0]));
    from=m.index+m[0].length;
  }
  if(from<text.length)p.append(document.createTextNode(text.slice(from)));
  return p;
}
function imageOrVideo(media){
  const wrap=$el('div','post-media');
  if(media.type==='image'){
    const img=$el('img');img.loading='lazy';img.referrerPolicy='no-referrer';img.alt='Media included in the original Nostr post';img.src=media.url;
    img.tabIndex=0;img.setAttribute('role','button');img.setAttribute('aria-label','Open image full screen');
    const open=()=>openImageLightbox(media.url,img.alt);
    img.addEventListener('click',open);
    img.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
    img.addEventListener('error',()=>wrap.remove(),{once:true});wrap.append(img);
  }
  if(media.type==='video'){const video=$el('video');video.controls=true;video.preload='none';video.playsInline=true;video.referrerPolicy='no-referrer';const src=$el('source');src.src=media.url;src.type=/\.webm$/i.test(new URL(media.url).pathname)?'video/webm':'video/mp4';video.append(src);wrap.append(video);}
  return wrap;
}
function noteCard(evt,{compact=false}={}){
  const article=$el('article',compact?'note-card note-card-compact':'note-card');article.dataset.id=evt.id;
  const top=$el('div','note-top');const profile=state.authorProfiles.get(evt.pubkey?.toLowerCase());
  const pub=profile?.name||(evt.pubkey===flashPubkey?'FLASH':'Nostr contributor');
  const avatar=profile?.picture?$el('img','author-avatar'):(evt.pubkey===flashPubkey?$el('img','author-avatar'):$el('span','author-glyph','⚡'));
  if(profile?.picture){avatar.src=profile.picture;avatar.alt=`${pub} avatar`;avatar.referrerPolicy='no-referrer';avatar.addEventListener('error',()=>{const glyph=$el('span','author-glyph','⚡');glyph.setAttribute('aria-label',`${pub} avatar unavailable`);avatar.replaceWith(glyph);},{once:true});}
  else if(evt.pubkey===flashPubkey){avatar.src=FLASH_AVATAR_URL;avatar.alt='FLASH avatar';}
  add(top,avatar,$el('span','note-author',pub),$el('span','note-separator','·'));
  const time=$el('time','note-time',ago(evt.created_at));time.dateTime=new Date(evt.created_at*1000).toISOString();time.title=when(evt.created_at);top.append(time);
  add(article,top,richText(evt.content));
  if(!compact){for(const m of mediaFromNote(evt))article.append(imageOrVideo(m));}
  return article;
}
function threadBranch(node){
  const wrap=$el('div',node.missing?'thread-branch thread-missing':'thread-branch');
  if(node.missing) wrap.append($el('p','thread-missing-label','Referenced parent is unavailable.'));
  else wrap.append(noteCard(node.event.rawEvent,{compact:true}));
  if(node.children.length){
    const details=$el('details','thread-children');details.open=true;
    details.append($el('summary','thread-toggle',`Replies (${node.children.length})`),...node.children.map(threadBranch));
    wrap.append(details);
  }
  return wrap;
}
function renderDiscussion(target,graph){
  const tree=graph.tree();target.replaceChildren();
  if(tree.children.length)target.append(...tree.children.map(threadBranch));
  else if(graph.complete)target.append($el('p','thread-empty','No replies were found on the configured relays.'));
  if(graph.loading)target.append($el('p','thread-state','Loading discussion…'));
  else if(!graph.complete)target.append($el('p','thread-state','Some replies may still be unavailable from the configured relays.'));
}
function graphAuthors(graph){return [...graph.eventsById.values()].map(event=>event.rawEvent?.pubkey).filter(validPubkey);}
async function requestProfiles(pubkeys){
 const authors=chunkPubkeys(pubkeys).flat();
 const requested=authors.filter(pubkey=>!state.profileRequests.has(pubkey));
 const waiting=authors.filter(pubkey=>state.profileRequests.has(pubkey)).map(pubkey=>state.profileRequests.get(pubkey));
 let refresh=null;
 if(requested.length){
  refresh=(async()=>{
 try{
  let cached;
  try{cached=await profileCache.getMany(requested);}catch(error){console.warn('Profile cache could not be read.',error);cached=new Map();}
  let changed=false;
  for(const [pubkey,profile] of cached){if(!state.authorProfiles.has(pubkey)||state.authorProfiles.get(pubkey).cachedAt!==profile.cachedAt){state.authorProfiles.set(pubkey,profile);changed=true;}}
  const expired=requested.filter(pubkey=>!isProfileFresh(cached.get(pubkey)));
  if(!expired.length)return changed;
  const primary=uniqueRelays(config.profileRelays);
  const fallback=uniqueRelays(config.relays).filter(relay=>!primary.includes(relay));
  const found=[];
  for(const authors of chunkPubkeys(expired)){
   const events=await pool.query([{kinds:[0],authors,limit:authors.length}],{relays:primary,timeout:6500});
   found.push(...events);
   const resolved=latestProfiles(events);
   const missing=authors.filter(pubkey=>!resolved.has(pubkey));
   if(missing.length&&fallback.length)found.push(...await pool.query([{kinds:[0],authors:missing,limit:missing.length}],{relays:fallback,timeout:5000}));
  }
  const profiles=latestProfiles(found);
  if(profiles.size){
   for(const [pubkey,profile] of profiles)state.authorProfiles.set(pubkey,{...profile,cachedAt:Date.now()});
   try{await profileCache.putMany(profiles);}catch(error){console.warn('Profile cache could not be updated.',error);}
   changed=true;
  }
  return changed;
 } finally {requested.forEach(pubkey=>state.profileRequests.delete(pubkey));}
  })();
  requested.forEach(pubkey=>state.profileRequests.set(pubkey,refresh));
 }
 const results=await Promise.all([...(refresh?[refresh]:[]),...waiting]);
 return results.some(Boolean);
}
function hydrateDiscussionProfiles(graph,render){
 requestProfiles(graphAuthors(graph)).then(changed=>{if(changed)render();}).catch(error=>console.warn('Thread profile metadata could not be loaded.',error));
}
function discussion(evt,{noteLink=true,alwaysOpen=false}={}){
  const section=$el('section','discussion');
  const content=$el('div','discussion-content');content.hidden=true;
  const toggle=btn('View discussion',async()=>{
    content.hidden=!content.hidden;toggle.textContent=content.hidden?'View discussion':'Hide discussion';
    if(content.hidden || content.dataset.loaded)return;
    content.dataset.loaded='1';content.replaceChildren($el('p','thread-state','Loading discussion…'));
    try{await threadLoader.load(evt,{onUpdate:graph=>{const render=()=>renderDiscussion(content,graph);render();hydrateDiscussionProfiles(graph,render);}});}
    catch{content.replaceChildren($el('p','thread-state','Discussion could not be loaded from the configured relays.'));}
  },'discussion-button');
  if(!alwaysOpen)section.append(toggle);
  if(noteLink)section.append(link('Open note ↗',`#/note/${evt.id}`,'discussion-link'));
  section.append(content);
  if(alwaysOpen)toggle.click();
  return section;
}
// NIP-19 encode: special-purpose bech32 implementation for links, not signing.
const charset='qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(data){let chk=1;for(const v of data){let top=chk>>25;chk=((chk&0x1ffffff)<<5)^v;for(let i=0;i<5;i++)if((top>>i)&1)chk^=[0x3b6a57b2,0x26508e6d,0x1ea119fa,0x3d4233dd,0x2a1462b3][i];}return chk;}
function convertBits(data,from,to,pad=true){let acc=0,bits=0,result=[],max=(1<<to)-1;for(const v of data){acc=(acc<<from)|v;bits+=from;while(bits>=to){bits-=to;result.push((acc>>bits)&max);}}if(pad&&bits)result.push((acc<<(to-bits))&max);return result;}
function bech32(hrp,bytes){const data=convertBits(bytes,8,5);let vals=[...hrp].map(c=>c.charCodeAt(0)>>5).concat([0], [...hrp].map(c=>c.charCodeAt(0)&31),data,[0,0,0,0,0,0]);let mod=polymod(vals)^1;const sum=Array.from({length:6},(_,i)=>(mod>>(5*(5-i)))&31);return hrp+'1'+data.concat(sum).map(n=>charset[n]).join('');}
function hexBytes(h){return Uint8Array.from(h.match(/.{2}/g).map(s=>parseInt(s,16)));}
function encodeNevent(id){return bech32('note',hexBytes(id));}
function demoData(){
 const now=Math.floor(Date.now()/1000);
 const samples=[
  'SAMPLE REPORT — A short breaking-news update appears here. The live site displays FLASH’s actual signed posts, including linked media.',
  'SAMPLE REPORT — Follow-up context, new sources and developments can be published as ordinary kind-1 notes.',
  'SAMPLE REPORT — This layout supports plain text, source links, photos and videos directly from Nostr.',
  'SAMPLE REPORT — Curated stories collect relevant updates without rewriting or republishing them.'
 ];
 const notes=samples.map((content,i)=>({id:(i+1).toString(16).padStart(64,'0'),kind:1,created_at:now-(i*7200),pubkey:flashPubkey,content,tags:[]}));
 const lists=[{kind:30004,pubkey:curator,created_at:now-10,tags:[['d','developing-story'],['title','A developing story'],['description','An example of a curated timeline assembled from signed short-form updates.'],...notes.slice(0,3).map(n=>['e',n.id])],id:'a'.repeat(64)}, {kind:30004,pubkey:curator,created_at:now-500,tags:[['d','background'],['title','Background & context'],['description','A second example curation with source notes.'],...notes.slice(1).map(n=>['e',n.id])],id:'b'.repeat(64)}];
 const paymentEvent={kind:10133,created_at:now,pubkey:flashPubkey,id:'d'.repeat(64),tags:[['payto','lightning','demo@invalid.example'],['payto','bitcoin','DEMO-NOT-A-REAL-WALLET'],['payto','revolut','demo-recipient']]};
 const goals=[{id:'c'.repeat(64),kind:9041,pubkey:goalAuthor,created_at:now,tags:[['amount','500000000'],['relays','wss://relay.damus.io'],['summary','Support a reporting project']],content:'SAMPLE PROJECT — A crowdfunded extra reporting assignment. No real donations can be sent from demo mode.'}];
 return {notes,lists,goals,paymentEvent};
}
const example=demo?demoData():null;

function topWire(){
 const wrapper=wirePage();
 wrapper.querySelector('#load-more').addEventListener('click',()=>loadMore());
 return wrapper;
}
async function hydrateFeed(){
 const feed=document.querySelector('#feed-list');if(!feed)return;
 state.feed=[];state.results.clear();state.oldest=null;state.canLoadMore=true;
 await loadMore(true);
 if(!demo && state.route==='wire'){
   state.closeLive=pool.subscribe([{kinds:[1],authors:[flashPubkey],since:Math.floor(Date.now()/1000)-86400}], evt=>{
     if(state.route!=='wire'||!validNoteEvent(evt)||!isOriginalKind1(evt)||state.results.has(evt.id))return;
     state.results.add(evt.id);state.feed.unshift(evt);state.feed.sort((a,b)=>b.created_at-a.created_at);
     state.feed=state.feed.slice(0,config.maxFeedItems);
     updateFeed();
   });
 }
}
async function loadMore(first=false){
 if(state.loading || !state.canLoadMore)return;
 state.loading=true;
 const button=document.querySelector('#load-more');if(button)button.disabled=true;
 try{
 let added=0,exhausted=false,firstBatch=first;
 while(!exhausted && added<config.newsBatchSize && state.feed.length<config.maxFeedItems){
  const filters={kinds:[1],authors:[flashPubkey],limit:config.newsBatchSize};if(state.oldest)filters.until=state.oldest-1;
  const batch=demo?(firstBatch?example.notes:[]):await pool.query([filters],{timeout:7000});
  firstBatch=false;
  const selected=batch.filter(validNoteEvent).filter(isOriginalKind1).filter(e=>!state.results.has(e.id));
  selected.forEach(e=>{state.results.add(e.id);state.feed.push(e);});added+=selected.length;
  if(batch.length)state.oldest=Math.min(...batch.map(e=>e.created_at));
  exhausted=batch.length<config.newsBatchSize || demo;
 }
 state.feed.sort((a,b)=>b.created_at-a.created_at);
 if(exhausted||state.feed.length>=config.maxFeedItems)state.canLoadMore=false;
 updateFeed();
 }catch(e){announce('Could not load the newswire. Please try again.');}finally{state.loading=false;if(button)button.disabled=false;}
}
async function renderNote(id){
 const page=$el('div','page-shell inner-page');const back=link('← Latest dispatches','#/','back-link');
 const content=$el('div','story-updates');page.append(back,content);clearAndShow(page);
 if(!/^[a-f0-9]{64}$/i.test(id)){content.append(marker('Invalid note identifier.'));return;}
 const cached=state.feed.find(event=>event.id===id);
 const event=cached||(demo?example.notes.find(note=>note.id===id):(await pool.query([{ids:[id],kinds:[1]}],{timeout:7000}))[0]);
 if(state.route!=='note')return;
 if(!validNoteEvent(event)||!isOriginalKind1(event)){content.append(marker('This original FLASH report is not available.'));return;}
 content.append(noteCard(event),discussion(event,{noteLink:false,alwaysOpen:true}));
}
function updateFeed(){const target=document.querySelector('#feed-list');if(!target)return;target.replaceChildren();
 if(!state.feed.length){const empty=marker('No reports retrieved yet.');empty.append($el('p','', 'The connected relays may be temporarily unavailable. Try refreshing, or follow FLASH in a Nostr client.'));empty.append(btn('Try again',()=>{state.canLoadMore=true;loadMore(true);},'btn-secondary'));target.append(empty);}
 else state.feed.forEach(evt=>target.append(noteCard(evt),discussion(evt)));
 const btnMore=document.querySelector('#load-more');if(btnMore)btnMore.hidden=!state.canLoadMore;
}
function storyTitle(e){return tag(e,'title')||tag(e,'d')||'Untitled collection';}
function storyDesc(e){return tag(e,'description')||'Collected notes about an evolving topic.';}
function latestSets(events){const m=new Map();for(const e of events){const d=tag(e,'d');if(!d)continue;const current=m.get(d);if(!current||e.created_at>current.created_at)m.set(d,e);}return [...m.values()].sort((a,b)=>b.created_at-a.created_at);}
async function fetchStories(){const raw=demo?example.lists:await pool.query([{kinds:[30004],authors:[curator],limit:100}],{timeout:7000});state.stories=latestSets(raw);return state.stories;}
async function fillSidebar(){try{const stories=await fetchStories();const rail=document.querySelector('#rail-stories');if(!rail)return;rail.replaceChildren($el('p','eyebrow','EDITOR’S SELECTION'),$el('h3','rail-title','Developing stories'));
 if(!stories.length)rail.append($el('p','rail-muted','Curated story timelines will appear here when published.'));
 else for(const s of stories.slice(0,3)){const a=link('',`#/stories/${encodeURIComponent(tag(s,'d'))}`,'rail-story');add(a,$el('span','',storyTitle(s)),$el('span','rail-arrow','↗'));rail.append(a);}
 rail.append(link('View all stories →','#/stories','rail-view-all'));}catch{ /* home feed remains available */ }}
function storyCard(e){return storyCardTemplate({href:`#/stories/${encodeURIComponent(tag(e,'d'))}`,updates:tagValues(e,'e').length,title:storyTitle(e),description:storyDesc(e)});}
async function renderStories(){const page=$el('div','page-shell inner-page');page.append(sectionHeading('THE BIGGER PICTURE','Stories in context','Follow developing stories through curated collections of original Nostr updates, all in one place.'));
 const list=$el('div','story-grid');list.append($el('div','loading-card','Finding curated timelines…'));page.append(list);clearAndShow(page);
 const stories=await fetchStories();if(state.route!=='stories')return;list.replaceChildren();
 if(stories.length)stories.forEach(s=>list.append(storyCard(s)));
 else{const empty=marker('No curated stories published yet.');empty.append($el('p','','FLASH can publish NIP-51 curation sets from its Nostr identity. As soon as they appear on the relays, this page updates automatically.'));list.append(empty);}
}
async function renderStory(slug){const page=$el('div','page-shell inner-page');const back=link('← All stories','#/stories','back-link');const title=$el('div','story-lead');add(title,back,$el('p','eyebrow','CURATED REPORTING'),$el('h1','display-title','Loading story…'));
 const updates=$el('div','story-updates');page.append(title,updates);clearAndShow(page);
 if(!state.stories.length)await fetchStories();const s=state.stories.find(x=>tag(x,'d')===slug);if(state.route!=='story')return;
 if(!s){title.querySelector('h1').textContent='Story not found';updates.append(marker('This collection is not available on the selected relays.'));return;}
 title.querySelector('h1').textContent=storyTitle(s);add(title,$el('p','page-description',storyDesc(s)),add($el('p','story-signature'),$el('span','',`Curated by ${s.pubkey===flashPubkey?'FLASH':'a Nostr publisher'} · ${when(s.created_at)}`)));
 const ids=[...new Set(tagValues(s,'e').filter(x=>/^[a-f0-9]{64}$/i.test(x)))].slice(0,180);if(!ids.length){updates.append(marker('This collection has no note references yet.'));return;}
 updates.append($el('p','eyebrow',`${ids.length} REFERENCED UPDATES`));const notesArea=$el('div','story-feed');notesArea.append($el('div','loading-card','Retrieving referenced notes…'));updates.append(notesArea);
 const chunks=[];for(let i=0;i<ids.length;i+=40)chunks.push(ids.slice(i,i+40));
 const got=demo?example.notes.filter(n=>ids.includes(n.id)): (await Promise.all(chunks.map(ids=>pool.query([{ids,kinds:[1]}],{timeout:8000})))).flat();
 if(state.route!=='story')return;const byId=new Map(got.filter(validNoteEvent).map(e=>[e.id,e]));notesArea.replaceChildren();
 for(const id of ids){const evt=byId.get(id);if(evt)notesArea.append(noteCard(evt),discussion(evt));}
 const missing=ids.length-byId.size;if(missing)notesArea.append($el('p','footnote',`${missing} referenced update(s) could not be retrieved from the configured relays.`));
 if(!byId.size)notesArea.append(marker('No referenced notes were retrieved.'));
 const collectionDiscussion=$el('section','story-collection-discussion');
 collectionDiscussion.append($el('p','eyebrow','STORY DISCUSSION'),$el('p','thread-state','Comments on this collection are separate from discussions on its individual updates.'));
 const collectionRoot=addressReference(`${s.kind}:${s.pubkey}:${tag(s,'d')}`);
 if(collectionRoot)collectionDiscussion.append(discussion(collectionRoot,{noteLink:false}));
 updates.append(collectionDiscussion);
}
function goalAmount(goal){const n=tag(goal,'amount');if(!/^\d+$/.test(n))return 0;const v=Number(n);return Number.isSafeInteger(v)&&v>0?v:0;}
function goalRelays(goal){const row=goal.tags.find(t=>t[0]==='relays');return uniqueRelays(row?.slice(1)||[]);}
function validGoal(goal){return goal.kind===GOAL_KIND && goalAmount(goal)>0 && goalRelays(goal).length>0;}
function satsString(sats){return new Intl.NumberFormat('en').format(sats);}
function goalCard(g){
 const target=goalAmount(g)/1000,summary=tag(g,'summary')||g.content.slice(0,90)||'Reporting project';
 const card=$el('article','goal-card');const closed=Number(tag(g,'closed_at'));
 add(card,add($el('div','goal-top'),$el('span','goal-label',closed&&closed<Date.now()/1000?'PAST GOAL':'CROWDFUNDING GOAL'),$el('span','goal-amount',`${satsString(target)} sats target`)),$el('h3','',summary));
 if(g.content&&g.content!==summary)card.append($el('p','goal-description',g.content));
 const bar=$el('div','goal-meter');bar.setAttribute('role','presentation');bar.append($el('div','goal-meter-bar'));card.append(bar);
 const note=$el('div','goal-meta','Checking wallet-reported funding receipts…');card.append(note);
 if(demo)note.textContent='Demo only — no funding progress or payments.';
 else updateGoalProgress(g,bar.querySelector('.goal-meter-bar'),note);
 const actions=$el('div','goal-actions');
 if(!demo && !(closed&&closed<Date.now()/1000))actions.append(btn('Contribute with Lightning ↗',()=>openZap(g),'btn-primary'));
 actions.append(link('View signed goal ↗',nt(encodeNevent(g.id)),'btn-outline'));card.append(actions);
 if(demo)card.append($el('p','demo-disclaimer','Example goal only — no payment actions are available in demo mode.'));
 return card;
}
// NIP-57 receipts are verified against the recipient wallet's advertised signer.
// Wallet receipts describe payments, but they do not constitute independent settlement proofs.
function invoiceMsats(bolt11){
 if(typeof bolt11!=='string')return null;
 const m=/^ln(?:bc|tb|bcrt)([0-9]+)([munp]?)1/i.exec(bolt11);
 if(!m)return null;
 const n=BigInt(m[1]);
 const factors={'':100000000000n,m:100000000n,u:100000n,n:100n};
 if(m[2]==='p')return n%10n===0n?n/10n:null;
 return n*(factors[m[2]]??0n);
}
const cachedLnurl=new Map();
async function getLnurl(address){
 if(!cachedLnurl.has(address))cachedLnurl.set(address,fetchLnurl(address).catch(err=>{cachedLnurl.delete(address);throw err;}));
 return cachedLnurl.get(address);
}
async function updateGoalProgress(goal,fill,label){
 if(goal.pubkey!==flashPubkey || goal.tags.some(t=>t[0]==='zap')){
   label.textContent='Target shown. Split-payment goals require external receipt accounting.';return;
 }
 try{
   await Promise.allSettled([loadProfile(),loadPaymentTargets()]);
   const address=getLightningAddress();if(!address)throw Error('Wallet metadata unavailable');
   const wallet=await getLnurl(address);
   const receipts=await pool.query([{kinds:[9735],'#e':[goal.id],limit:500}],{relays:goalRelays(goal),timeout:7500});
   const cutoff=Number(tag(goal,'closed_at'))||Infinity;
   const accounted=new Set();let raised=0n;
   for(const receipt of receipts){
     if(receipt.created_at>cutoff||receipt.pubkey!==wallet.nostrPubkey || !tagValues(receipt,'e').includes(goal.id) || !tagValues(receipt,'p').includes(goal.pubkey))continue;
     let zap;try{zap=JSON.parse(tag(receipt,'description'));}catch{continue;}
     if(zap?.kind!==9734 || !await verifyNostrEvent(zap) || !tagValues(zap,'e').includes(goal.id) || !tagValues(zap,'p').includes(goal.pubkey))continue;
     const amount=tag(zap,'amount');if(!/^\d+$/.test(amount))continue;
     const invoiceAmount=invoiceMsats(tag(receipt,'bolt11'));
     if(invoiceAmount===null || invoiceAmount!==BigInt(amount))continue;
     const invoice=tag(receipt,'bolt11').toLowerCase();
     if(accounted.has(invoice))continue;accounted.add(invoice);raised+=invoiceAmount;
   }
   const target=BigInt(goalAmount(goal));const percentage=Number(raised*100n/target);
   fill.style.width=Math.min(100,percentage)+'%';
   label.textContent=`${satsString(Number(raised/1000n))} / ${satsString(Number(target/1000n))} sats · ${percentage}% wallet-reported`;
   label.title='Signed wallet receipts were checked against their signed zap requests and invoice amounts. These are not independent cryptographic settlement proofs.';
 } catch {label.textContent='Goal target available; receipt progress could not be verified from the wallet and relays.';}
}
async function fetchGoals(){const raw=demo?example.goals:await pool.query([{kinds:[9041],authors:[goalAuthor],limit:80}],{timeout:7500});state.goals=raw.filter(validGoal).sort((a,b)=>b.created_at-a.created_at);return state.goals;}
function signedLightningFallback(){return config.lightningAddressOverride || state.profile?.lud16 || null;}
function getLightningAddress(){return preferredLightningAddress(state.paymentTargets,signedLightningFallback());}
function sponsorReferences(about){
 if(typeof about!=='string')return [];
 const references=[],seen=new Set(),pattern=/(nostr:npub1[0-9a-z]+)/gi;
 let match;
 while((match=pattern.exec(about))!==null){
  const pubkey=decodeNpub(match[0].slice(6));
  if(!pubkey||seen.has(pubkey))continue;
  seen.add(pubkey);references.push({token:match[0],pubkey});
 }
 return references;
}
let paymentTargetsPending=null;
async function loadPaymentTargets(){
 if(state.paymentTargetsLoaded) return state.paymentTargets;
 if(paymentTargetsPending) return paymentTargetsPending;
 paymentTargetsPending=(async()=>{
  let events=demo?[example.paymentEvent]:[];
  if(!demo){
   // Combined query gets the current personal payment targets and the NIP-65 relay list.
   const discovered=await pool.query([
    {kinds:[10133],authors:[flashPubkey],limit:10},
    {kinds:[10002],authors:[flashPubkey],limit:5}
   ],{timeout:7000});
   events=discovered.filter(e=>e.kind===10133);
   const latestRelayList=discovered.filter(e=>e.kind===10002).sort((a,b)=>b.created_at-a.created_at)[0];
   const announced=uniqueRelays((latestRelayList?.tags||[]).filter(t=>t[0]==='r').map(t=>t[1]));
   const extras=announced.filter(url=>!pool.relays.includes(url));
   if(extras.length){
    try {
     const more=await pool.query([{kinds:[10133],authors:[flashPubkey],limit:10}],{relays:extras,timeout:5000});
     events=events.concat(more);
    }catch{ /* Default relay targets remain available. */ }
   }
  }
  state.paymentTargets=parsePaymentTargets(latestPaymentTargetsEvent(events,flashPubkey));
  state.paymentTargetsLoaded=true;
  return state.paymentTargets;
 })();
 try{return await paymentTargetsPending;}finally{paymentTargetsPending=null;}
}
async function copyValue(value,what){
 try { await navigator.clipboard.writeText(value); announce(`${what} copied`); }
 catch { announce('Copy unavailable. Select the address above to copy it manually.'); }
}
function copyNpub(value){ return copyValue(value,'npub'); }
// Browsers do not report whether a custom URI scheme has a handler, so infer failure
// when the page never loses focus/visibility shortly after the launch attempt.
function appLaunchLink(text,uri,cls){
 const a=link(text,uri,cls);
 if(/^https?:/.test(uri))return a;
 a.addEventListener('click',()=>{
  let left=false;
  const mark=()=>{left=true;};
  window.addEventListener('blur',mark,{once:true});
  document.addEventListener('visibilitychange',mark,{once:true});
  window.addEventListener('pagehide',mark,{once:true});
  setTimeout(()=>{
   window.removeEventListener('blur',mark);
   document.removeEventListener('visibilitychange',mark);
   window.removeEventListener('pagehide',mark);
   if(!left&&document.visibilityState==='visible'&&document.hasFocus())
    announce('No payment app opened this link. Copy the address and paste it into your wallet.');
  },1500);
 });
 return a;
}
function paymentCard(target){
 const card=$el('article','payment-card');
 const header=$el('div','payment-card-head');
 add(header,$el('h3','',target.label),$el('span','payment-source',target.source==='profile'?'NOSTR PROFILE':'SIGNED PAYMENT TARGET'));
 add(card,header,$el('p','payment-account',target.authority));
 const actions=$el('div','payment-actions');
 if(demo){
  card.append($el('p','demo-disclaimer','Illustrative payment target — not a payable account.'));
 } else {
  actions.append(btn('Copy address',()=>copyValue(target.authority,'Payment address'),'btn-outline'));
  const uri=paytoUri(target);
  if(uri)actions.append(btn('Copy payment URI',()=>copyValue(uri,'Payment URI'),'btn-outline'));
  const appUri=paymentAppUri(target);
  if(appUri)actions.append(appLaunchLink('Open payment app ↗',appUri,'btn-secondary'));
  if(target.type==='lightning' && isLightningAddress(target.authority))
   actions.append(btn('Zap FLASH ⚡',()=>openZap(null,target.authority),'btn-primary'));
 }
 card.append(actions);
 return card;
}
function supportPage(){
 const {page,businessCard:businessCardSlot,paymentStatus,paymentMethods,goalList}=supportPageShell();
 clearAndShow(page);
 businessCardSlot.replaceChildren(businessCard(null,[],copyNpub));
 Promise.allSettled([loadProfile(),loadPaymentTargets()]).then(async results=>{
  if(state.route!=='support')return;
  const sponsors=sponsorReferences(state.profile?.about);
  if(sponsors.length){
   try{await requestProfiles(sponsors.map(sponsor=>sponsor.pubkey));}
   catch(error){console.warn('Sponsor profile metadata could not be loaded.',error);}
  }
  const resolvedSponsors=sponsors.map(sponsor=>({...sponsor,name:state.authorProfiles.get(sponsor.pubkey)?.name||null}));
  businessCardSlot.replaceChildren(businessCard(state.profile,resolvedSponsors,copyNpub));
  const targetError=results[1].status==='rejected';
  const profileError=results[0].status==='rejected';
  const fallback=signedLightningFallback();
  const targets=withLightningFallback(state.paymentTargets,fallback);
  paymentMethods.replaceChildren();
  if(targets.length){
   paymentStatus.textContent=targetError?'Payment targets could not be retrieved; showing profile Lightning fallback where available.':
     `Available payment methods · ${targets.filter(t=>t.source==='nip-a3').length} from kind:10133${targets.some(t=>t.source==='profile')?' plus profile Lightning':''}`;
   targets.forEach(t=>paymentMethods.append(paymentCard(t)));
  } else {
   paymentStatus.textContent=targetError || profileError?'Payment information could not be retrieved from the configured relays.':'No payment targets have been found for FLASH.';
   paymentMethods.append($el('p','payment-empty','FLASH can publish a NIP-A3 kind:10133 event to accept Bitcoin, Lightning or other supported payments. The signed profile Lightning address is used automatically when available.'));
  }
 });
 if(features.crowdfunding)fetchGoals().then(goals=>{if(state.route!=='support')return;goalList.replaceChildren();
  if(goals.length)goals.forEach(g=>goalList.append(goalCard(g)));
  else{const empty=marker('No reporting campaigns currently published.');empty.append($el('p','','If FLASH publishes a NIP-75 zap goal, it will appear here automatically. General support is available above.'));goalList.append(empty);}
 }).catch(()=>{if(state.route==='support')goalList.replaceChildren(marker('Funding goals could not be loaded.'));});
}
async function loadProfile(){if(state.profile)return state.profile;if(demo){state.profile={name:'FLASH',lud16:null,about:'Demo'};return state.profile;}
 await requestProfiles([flashPubkey]);
 const profile=state.authorProfiles.get(flashPubkey);
 state.profile=profile?{name:profile.name||'FLASH',lud16:profile.lud16,about:profile.about,picture:profile.picture,banner:profile.banner}:null;
 return state.profile;
}
async function openZap(goal=null, selectedAddress=null){
 if(!window.nostr?.getPublicKey||!window.nostr?.signEvent){announce('A NIP-07 signer is required. Open the signed goal in your Nostr client instead.');return;}
 if(demo){announce('Payments are disabled in demo mode.');return;}
 const address=selectedAddress||getLightningAddress();if(!address){announce('The publisher has no Lightning address available.');return;}
 const dialog=$el('dialog','zap-modal');
 const body=$el('div','zap-body');add(body,btn('×',()=>dialog.close(),'modal-close'),$el('p','eyebrow','LIGHTNING SUPPORT'),$el('h2','',goal?'Contribute to this goal':'Zap the FLASH newswire'),$el('p','',goal?(tag(goal,'summary')||goal.content):'A general Lightning zap to support ongoing reporting.'));
 const form=$el('form','zap-form');form.method='dialog';
 const label=$el('label','','Amount in sats');label.htmlFor='zap-amount';const inp=$el('input');inp.id='zap-amount';inp.type='number';inp.min='21';inp.step='1';inp.max='10000000';inp.value='1000';inp.required=true;
 const invoiceLabel=goal?'Create goal zap invoice ↗':'Create support zap invoice ↗';
 const submit=btn(invoiceLabel,async()=>{const sats=Number(inp.value);if(!Number.isSafeInteger(sats)||sats<21||sats>10000000){announce('Enter an amount from 21 to 10,000,000 sats.');return;}
 submit.disabled=true;submit.textContent='Requesting invoice…';try{await createGoalInvoice({goal,sats,dialog,body,address});}catch(err){announce(err.message||'Unable to generate invoice.');submit.disabled=false;submit.textContent=invoiceLabel;}},'btn-primary');
 const note=$el('p','footnote','Requires a NIP-07 signer and a NIP-57-enabled Lightning address. The invoice is only created, not paid, by this website.');
 add(form,label,inp,submit,note);body.append(form);dialog.append(body);document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
async function fetchLnurl(address){
 const [user,domain,...extra]=address.split('@');if(extra.length||!user||!/^[a-z0-9._-]+$/i.test(user)||!/^[a-z0-9.-]+(?::\d+)?$/i.test(domain))throw Error('Unsupported Lightning address.');
 const url=`https://${domain}/.well-known/lnurlp/${encodeURIComponent(user)}`;
 const resp=await fetch(url,{mode:'cors',cache:'no-store'});if(!resp.ok)throw Error('Lightning endpoint unavailable or blocked by CORS.');
 const json=await resp.json();const callback=safeUrl(json.callback,true);
 if(!callback||!json.allowsNostr||!/^[a-f0-9]{64}$/i.test(json.nostrPubkey||''))throw Error('Wallet does not expose NIP-57 zaps. Use your Nostr client instead.');
 return {...json,callback};
}
async function createGoalInvoice({goal,sats,body,address}){
 const meta=await getLnurl(address);
 const msats=sats*1000;if(msats<meta.minSendable||msats>meta.maxSendable)throw Error('Amount outside wallet limits.');
 const sender=await window.nostr.getPublicKey();if(!/^[a-f0-9]{64}$/i.test(sender))throw Error('Invalid signer identity.');
 const relays=goal?goalRelays(goal):uniqueRelays(config.relays);const tags=[['relays',...relays],['amount',String(msats)],['p',goal?goal.pubkey:flashPubkey]];
 if(goal) tags.push(['e',goal.id],['k','9041']);
 const template={kind:9734,created_at:Math.floor(Date.now()/1000),pubkey:sender,content:'',tags};
 const signed=await window.nostr.signEvent(template);if(!await verifyNostrEvent(signed)||signed.pubkey!==sender||signed.kind!==9734||(goal?!tagValues(signed,'e').includes(goal.id):tagValues(signed,'e').length>0)||!tagValues(signed,'p').includes(goal?goal.pubkey:flashPubkey)||tag(signed,'amount')!==String(msats))throw Error('Signer returned an invalid or changed zap request.');
 const callback=new URL(meta.callback);callback.searchParams.set('amount',String(msats));callback.searchParams.set('nostr',JSON.stringify(signed));
 const response=await fetch(callback.href,{mode:'cors',cache:'no-store'});if(!response.ok)throw Error('The Lightning invoice endpoint did not respond.');
 const data=await response.json();if(data.status==='ERROR'||typeof data.pr!=='string'||!/^ln(bc|tb|bcrt)/i.test(data.pr))throw Error(data.reason||'No valid invoice was returned.');
 body.querySelector('.zap-form')?.remove();
 const label=$el('p','invoice-lede',`${satsString(sats)} sats invoice created ${goal?'for this Nostr funding goal':'to support FLASH'}.`);const invoice=$el('textarea','invoice-text',data.pr);invoice.readOnly=true;invoice.rows=3;invoice.setAttribute('aria-label','Lightning invoice');
 const actions=$el('div','invoice-actions');add(actions,link('Open in Lightning wallet ↗','lightning:'+data.pr,'btn-primary'),btn('Copy invoice',()=>navigator.clipboard.writeText(data.pr).then(()=>announce('Invoice copied')).catch(()=>announce('Select the invoice to copy.')),'btn-outline'));
 add(body,label,invoice,actions,$el('p','footnote','Payment is completed in your wallet. This site does not confirm settlement or keep a payment history.'));
}
function renderWire(){const page=topWire();clearAndShow(page);hydrateFeed();if(features.curatedLists)fillSidebar();}
function route(){closeImageLightbox();state.closeLive?.();state.closeLive=null;const parts=decodeURI((location.hash||'#/').replace(/^#\/?/,'')).split('/').filter(Boolean);const name=parts[0]||'';
 const hiddenStoriesRoute=name==='stories'&&!features.curatedLists;
 if(hiddenStoriesRoute)history.replaceState(null,'','#/');
 const routeName=hiddenStoriesRoute?'':name;
 state.route=routeName==='stories'?(parts.length>1?'story':'stories'):routeName==='support'?'support':routeName==='note'?'note':'wire';
 document.querySelectorAll('[data-nav]').forEach(a=>a.classList.toggle('active',a.dataset.nav===(state.route==='story'?'stories':state.route)));
 document.querySelector('.main-nav')?.classList.remove('open');document.querySelector('#mobile-nav')?.setAttribute('aria-expanded','false');
 if(state.route==='stories')renderStories();else if(state.route==='story')renderStory(decodeURIComponent(parts.slice(1).join('/')));else if(state.route==='note')renderNote(parts[1]||'');else if(state.route==='support')supportPage();else renderWire();
 window.scrollTo({top:0,behavior:'instant'});
}
document.querySelector('#mobile-nav')?.addEventListener('click',()=>{const nav=document.querySelector('.main-nav');const expanded=nav.classList.toggle('open');document.querySelector('#mobile-nav').setAttribute('aria-expanded',String(expanded));});
imageLightbox?.addEventListener('click',closeImageLightbox);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!imageLightbox?.hidden)closeImageLightbox();});
window.addEventListener('hashchange',route);
syncFeatureVisibility();demoBanner();route();
window.addEventListener('pagehide',()=>pool.close());
