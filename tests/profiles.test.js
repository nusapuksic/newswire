import test from 'node:test';
import assert from 'node:assert/strict';
import { PROFILE_TTL_MS, chunkPubkeys, decodeNpub, isProfileFresh, latestProfiles, profileFromEvent, validPubkey } from '../public/src/profiles.js';

const pubkey=letter=>letter.repeat(64);
const event=(createdAt,content,more={})=>({id:createdAt.toString(16).padStart(64,'0'),kind:0,pubkey:pubkey('a'),created_at:createdAt,content,...more});

test('NIP-19 npub references decode to profile pubkeys',()=>{
 const sponsor='npub1h6sntuq7ucvzhpsc4j42tmha2fclyt2u3v5zwsflaz22wgq9rsmqfl3tt5';
 const decoded=decodeNpub(sponsor);
 assert.equal(validPubkey(decoded),true);
 assert.equal(decodeNpub(`${sponsor.slice(0,-1)}q`),null);
});

test('profile metadata prefers display_name and rejects unsafe avatars',()=>{
 const profile=profileFromEvent(event(1,JSON.stringify({display_name:'  Alice  ',name:'Fallback',picture:'http://unsafe.example/a.jpg',banner:'https://images.example/banner.jpg',lud16:'alice@example.com'})));
 assert.deepEqual(profile,{pubkey:pubkey('a'),name:'Alice',picture:null,banner:'https://images.example/banner.jpg',lud16:'alice@example.com',about:''});
});

test('profile about reads content and falls back to an about tag',()=>{
 const fromContent=profileFromEvent(event(1,JSON.stringify({about:'  Reporting from the field.  '}),{tags:[['about','Tag fallback']] }));
 const fromTag=profileFromEvent(event(2,JSON.stringify({name:'FLASH'}),{tags:[['about','  Independent reporting.  ']]}));
 assert.equal(fromContent.about,'Reporting from the field.');
 assert.equal(fromTag.about,'Independent reporting.');
});

test('profile about accepts longer kind 0 descriptions',()=>{
 const about='A '.repeat(120).trim();
 assert.equal(profileFromEvent(event(1,JSON.stringify({about}))).about,about);
});

test('newest valid kind 0 profile wins per pubkey',()=>{
 const profiles=latestProfiles([
  event(2,JSON.stringify({name:'Older'})),
  event(5,JSON.stringify({name:'Newer',picture:'https://images.example/newer.jpg'})),
  event(9,'not json'),
  event(12,JSON.stringify({name:'Other'}),{pubkey:pubkey('b')})
 ]);
 assert.equal(profiles.get(pubkey('a')).name,'Newer');
 assert.equal(profiles.get(pubkey('a')).picture,'https://images.example/newer.jpg');
 assert.equal(profiles.get(pubkey('b')).name,'Other');
});

test('profile cache freshness expires after one day',()=>{
 const now=1_000_000_000;
 assert.equal(isProfileFresh({cachedAt:now},now+PROFILE_TTL_MS-1),true);
 assert.equal(isProfileFresh({cachedAt:now},now+PROFILE_TTL_MS),false);
 assert.equal(isProfileFresh({cachedAt:'invalid'},now),false);
});

test('profile lookup author filters are deduplicated and bounded',()=>{
 const authors=[pubkey('a'),pubkey('a'),pubkey('b'),pubkey('c'),pubkey('d'),pubkey('e')];
 assert.deepEqual(chunkPubkeys(authors,2),[[pubkey('a'),pubkey('b')],[pubkey('c'),pubkey('d')],[pubkey('e')]]);
});
