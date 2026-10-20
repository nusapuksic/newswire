// Native HTML templates keep repeated view structure separate from application behavior.
function createTemplate(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template;
}

function clone(template) {
  return template.content.firstElementChild.cloneNode(true);
}

function text(node, selector, value) {
  node.querySelector(selector).textContent = value;
}

const pageHeadingTemplate = createTemplate(`
  <div class="page-heading">
    <p class="eyebrow"></p>
    <h1 class="display-title"></h1>
    <p class="page-description"></p>
  </div>
`);

const emptyStateTemplate = createTemplate(`
  <div class="empty-state">
    <span class="empty-icon" aria-hidden="true">↗</span>
    <h3></h3>
  </div>
`);

const feedStatusTemplate = createTemplate(`
  <div class="feed-status">
    <span class="status-dot"></span>
    <span class="status-label"></span>
  </div>
`);

const storyCardTemplate = createTemplate(`
  <a class="story-card">
    <div class="story-card-meta"></div>
    <h3></h3>
    <p></p>
    <div class="story-card-bottom">Explore timeline ↗</div>
  </a>
`);

const businessCardTemplate = createTemplate(`
  <section class="business-card" aria-label="FLASH profile">
    <img class="business-card-banner" data-slot="banner" alt="" aria-hidden="true" hidden>
    <div class="business-card-avatar" data-slot="avatar" aria-hidden="true"></div>
    <div class="business-card-copy">
      <p class="eyebrow">FLASH / NOSTR PROFILE</p>
      <div class="business-card-name-row">
        <h2 class="business-card-name"></h2>
        <button class="business-card-npub-copy" type="button" aria-label="Copy npub to clipboard" title="Copy npub to clipboard" hidden>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M4 4h5v5H4zM15 4h5v5h-5zM4 15h5v5H4zM15 15h2v2h-2zM18 18h2v2h-2zM15 11h2v2h-2zM18 13h2v2h-2zM11 4h2v2h-2zM11 8h2v5h-2zM13 15h2v5h-2z"/>
          </svg>
        </button>
      </div>
      <p class="business-card-about"></p>
      <p class="business-card-contact" data-slot="contact" hidden>
        <span class="business-card-contact-label">LIGHTNING</span>
        <span data-slot="lud16"></span>
      </p>
    </div>
    <div class="business-card-mark" aria-hidden="true">F.</div>
  </section>
`);

const wireTemplate = createTemplate(`
  <div class="page-shell">
    <section class="news-hero">
      <div class="hero-copy">
        <p class="eyebrow eyebrow-light">INDEPENDENT. UNSCRIPTED. IN REAL TIME.</p>
        <h1 class="hero-title">The world doesn’t wait for the next edition.</h1>
        <p class="hero-description">FLASH. Free to read, supported by readers.</p>
      </div>
    </section>
    <div class="content-grid">
      <section class="content-main">
        <div class="section-title-row">
          <div>
            <p class="eyebrow">NOW REPORTING</p>
            <h2 class="section-title">Latest dispatches</h2>
          </div>
          <span data-slot="feed-status"></span>
        </div>
        <div id="feed-list" class="feed-list">
          <div class="loading-card">
            <div class="skeleton"></div>
            <div class="skeleton medium"></div>
            <div class="skeleton short"></div>
          </div>
        </div>
        <button id="load-more" class="load-more" type="button" hidden>Load earlier updates ↓</button>
      </section>
      <aside class="right-rail">
        <section id="rail-stories" class="rail-panel" data-feature="curatedLists" hidden>
          <p class="eyebrow">EDITOR’S SELECTION</p>
          <h3 class="rail-title">Developing stories</h3>
          <p class="rail-muted">Curated timelines are loading…</p>
        </section>
        <section class="rail-support">
          <p class="eyebrow eyebrow-light">THE NEWS IS FREE</p>
          <h3>The work behind it isn’t.</h3>
          <p>Help keep independent news gathering going.</p>
          <a class="rail-cta" href="#/support">Support FLASH  ↗</a>
        </section>
      </aside>
    </div>
  </div>
`);

const supportTemplate = createTemplate(`
  <div class="page-shell inner-page">
    <div class="page-heading">
      <p class="eyebrow">SUSTAIN THE SIGNAL</p>
      <h1 class="display-title">The news is free. The work is not.</h1>
      <p class="page-description">Your support helps maintain an open stream of reports, source gathering and context.</p>
    </div>
    <div data-slot="business-card"></div>
    <div class="support-grid">
      <section class="support-panel">
        <p class="eyebrow">01 / SUSTAIN</p>
        <h2>Support FLASH directly</h2>
        <p class="payment-status">Checking payment targets and Nostr profile…</p>
        <div class="payment-methods"></div>
      </section>
      <section class="support-panel" data-feature="crowdfunding" hidden>
        <p class="eyebrow">02 / EXPAND</p>
        <h2>Fund a specific project</h2>
        <p>When FLASH publishes a funding goal, help finance an extra reporting assignment or research project. Goal-linked zaps are distinct from general payment targets.</p>
      </section>
    </div>
    <section class="campaign-section" data-feature="crowdfunding" hidden>
      <p class="eyebrow">OPEN CALLS</p>
      <h2 class="section-title">Reporting projects</h2>
      <div class="goals-grid">
        <div class="loading-card">Checking for published funding goals…</div>
      </div>
    </section>
    <p class="footnote">Non-Lightning methods are direct payments to the published recipient; this site cannot track or verify them. "Open payment app" needs a wallet installed for that method; if nothing opens, copy the address instead. Always verify the destination in your wallet. Lightning payments are irreversible.</p>
  </div>
`);

export function sectionHeading(kicker, title, description) {
  const node = clone(pageHeadingTemplate);
  text(node, '.eyebrow', kicker);
  text(node, '.display-title', title);
  text(node, '.page-description', description);
  return node;
}

export function emptyState(message) {
  const node = clone(emptyStateTemplate);
  text(node, 'h3', message);
  return node;
}

export function feedStatus(offline = false) {
  const node = clone(feedStatusTemplate);
  node.querySelector('.status-dot').classList.toggle('quiet', offline);
  text(node, '.status-label', offline ? 'Connection unavailable' : 'Reading Nostr relays');
  return node;
}

export function storyCard({ href, updates, title, description }) {
  const node = clone(storyCardTemplate);
  node.href = href;
  text(node, '.story-card-meta', `CURATED NEWS · ${updates} UPDATES`);
  text(node, 'h3', title);
  text(node, 'p', description);
  return node;
}

function aboutContent(value,sponsors) {
  const content=[];
  const references=new Map((sponsors||[]).map(sponsor=>[sponsor.token.toLowerCase(),sponsor]));
  const pattern=/(nostr:npub1[0-9a-z]+)/gi;
  let from=0,match;
  while((match=pattern.exec(value))!==null){
    if(match.index>from)content.push(document.createTextNode(value.slice(from,match.index)));
    const sponsor=references.get(match[0].toLowerCase());
    if(sponsor?.name){
      const name=document.createElement('span');
      name.className='business-card-sponsor';
      name.textContent=`@${sponsor.name}`;
      content.push(name);
    } else content.push(document.createTextNode(match[0]));
    from=match.index+match[0].length;
  }
  if(from<value.length)content.push(document.createTextNode(value.slice(from)));
  return content;
}

export function businessCard(profile,sponsors=[],onNpubCopy=null) {
  const node = clone(businessCardTemplate);
  const name = profile?.name || 'FLASH';
  text(node, '.business-card-name', name);
  const npubCopy=node.querySelector('.business-card-npub-copy');
  if(typeof onNpubCopy==='function' && window.FLASH_CONFIG?.npub){
    npubCopy.hidden=false;
    npubCopy.addEventListener('click',()=>onNpubCopy(window.FLASH_CONFIG.npub));
  }
  const about=node.querySelector('.business-card-about');
  const aboutText=profile?.about || 'Independent news published directly to Nostr.';
  about.replaceChildren(...aboutContent(aboutText,sponsors));

  if(profile?.banner){
    const banner=node.querySelector('[data-slot="banner"]');
    banner.src=profile.banner;
    banner.hidden=false;
    banner.addEventListener('error',()=>banner.remove(),{once:true});
  }

  const avatar = node.querySelector('[data-slot="avatar"]');
  if (profile?.picture) {
    const image = document.createElement('img');
    image.src = profile.picture;
    image.alt = `${name} profile`;
    image.referrerPolicy = 'no-referrer';
    image.addEventListener('error', () => {
      avatar.textContent = 'F';
      avatar.classList.add('business-card-avatar-fallback');
    }, { once: true });
    avatar.append(image);
  } else {
    avatar.textContent = 'F';
    avatar.classList.add('business-card-avatar-fallback');
  }

  if (profile?.lud16) {
    const contact = node.querySelector('[data-slot="contact"]');
    contact.hidden = false;
    text(contact, '[data-slot="lud16"]', profile.lud16);
  }
  return node;
}

export function wirePage() {
  return clone(wireTemplate);
}

export function supportPageShell() {
  const node = clone(supportTemplate);
  return {
    page: node,
    businessCard: node.querySelector('[data-slot="business-card"]'),
    paymentStatus: node.querySelector('.payment-status'),
    paymentMethods: node.querySelector('.payment-methods'),
    goalList: node.querySelector('.goals-grid')
  };
}
