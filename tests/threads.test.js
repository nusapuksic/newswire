import test from 'node:test';
import assert from 'node:assert/strict';
import { isOriginalKind1, normalizeThreadEvent, ThreadGraph } from '../public/src/threads.js';

const id=letter=>letter.repeat(64);
const note=(letter,tags=[],kind=1)=>({id:id(letter),pubkey:id('f'),kind,created_at:letter.charCodeAt(0),content:letter,tags});

test('NIP-10 recognizes marked and positional replies while preserving quote posts',()=>{
 assert.equal(isOriginalKind1(note('a',[['q',id('b')]])),true);
 assert.equal(isOriginalKind1(note('a',[['e',id('b'),'','root']])),false);
 const legacy=normalizeThreadEvent(note('a',[['e',id('b')],['e',id('c')]]));
 assert.equal(legacy.root.id,id('b'));
 assert.equal(legacy.parent.id,id('c'));
});

test('unified graph nests mixed kind replies by parent',()=>{
 const root=note('a');
 const reply=note('b',[['e',id('a'),'','root'],['e',id('a'),'','reply']]);
 const comment=note('c',[['E',id('a')],['K','1'],['e',id('b')],['k','1']],1111);
 const nested=note('d',[['E',id('a')],['K','1'],['e',id('c')],['k','1111']],1111);
 const graph=new ThreadGraph(id('a')); graph.addMany([root,reply,comment,nested]);
 const tree=graph.tree();
 assert.deepEqual(tree.children.map(node=>node.event.id),[id('b')]);
 assert.deepEqual(tree.children[0].children.map(node=>node.event.id),[id('c')]);
 assert.deepEqual(tree.children[0].children[0].children.map(node=>node.event.id),[id('d')]);
});

test('graph keeps unavailable parents visible and rejects conflicting roots',()=>{
 const root=note('a');
 const missing=note('b',[['E',id('a')],['e',id('c')]],1111);
 const conflict=note('d',[['E',id('e')],['e',id('a')]],1111);
 const graph=new ThreadGraph(id('a')); graph.addMany([root,missing,conflict]);
 const tree=graph.tree();
 assert.equal(tree.children[0].missing,true);
 assert.equal(tree.children[0].children[0].event.id,id('b'));
 assert.equal(graph.eventsById.has(id('d')),false);
});

test('NIP-22 declared root and parent kinds are validated when resolvable',()=>{
 const root=note('a');
 const wrongRootKind=note('b',[['E',id('a')],['K','1111'],['e',id('a')],['k','1']],1111);
 const graph=new ThreadGraph(id('a')); graph.addMany([root,wrongRootKind]);
 assert.equal(graph.tree().children.length,0);
});
