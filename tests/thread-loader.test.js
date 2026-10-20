import test from 'node:test';
import assert from 'node:assert/strict';
import { ThreadLoader } from '../public/src/nostr.js';

const id=letter=>letter.repeat(64);
const root={id:id('a'),pubkey:id('f'),kind:1,created_at:1,content:'root',tags:[]};
const comment={id:id('b'),pubkey:id('f'),kind:1111,created_at:2,content:'comment',tags:[['E',id('a')],['K','1'],['e',id('a')],['k','1']]};

test('thread loader queries both root conventions and builds verified results incrementally',async()=>{
 const calls=[];
 const gateway={query:async filters=>{calls.push(filters);return calls.length===1?[comment]:[];}};
 const updates=[];
 const graph=await new ThreadLoader(gateway,{maxDepth:1}).load(root,{onUpdate:current=>updates.push(current.tree().children.length)});
 assert.equal(calls[0][0]['#e'][0],id('a'));
 assert.equal(calls[0][1]['#E'][0],id('a'));
 assert.equal(graph.tree().children[0].event.id,id('b'));
 assert.ok(updates.some(count=>count===1));
});
