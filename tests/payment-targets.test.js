import test from 'node:test';
import assert from 'node:assert/strict';
import { latestPaymentTargetsEvent, parsePaymentTargets, withLightningFallback, preferredLightningAddress, isLightningAddress, paytoUri } from '../public/src/payment-targets.js';
const pk='1'.repeat(64);
const e=(at, tags, more={})=>({id:String(at).padStart(64,'0'),kind:10133,pubkey:pk,created_at:at,tags,...more});
test('newest verified-event candidate wins for replaceable kind 10133',()=>{
 const selected=latestPaymentTargetsEvent([e(2,[]),e(5,[]),e(4,[]),e(6,[],{pubkey:'2'.repeat(64)}),e(100,[],{kind:1})],pk);
 assert.equal(selected.created_at,5);
});
test('parse NIP-A3 payto tags with normalization, dedupe, unknown schemes and extras',()=>{
 const targets=parsePaymentTargets(e(100,[
  ['payto','BITCOIN','bc1abc'],['payto','bitcoin','bc1abc'],['payto','monero','4address','description'],
  ['payto','unknown-wallet','abc'],['payto','in$valid','account'],['payto','eth',''],['e','irrelevant']
 ]));
 assert.deepEqual(targets.map(t=>[t.type,t.authority,t.recognized]),[
  ['bitcoin','bc1abc',true],['monero','4address',true],['unknown-wallet','abc',false]
 ]);
});
test('empty latest event intentionally clears previously configured methods',()=>{
 const selected=latestPaymentTargetsEvent([e(3, [['payto','bitcoin','abc']]),e(4,[])],pk);
 assert.deepEqual(parsePaymentTargets(selected),[]);
});
test('unsafe account characters are handled without URI injection',()=>{
 const targets=parsePaymentTargets(e(1,[['payto','revolut','joe?redirect=https://phish.test#part']]));
 assert.equal(paytoUri(targets[0]),'payto://revolut/joe%3Fredirect%3Dhttps%3A%2F%2Fphish.test%23part');
 assert.deepEqual(parsePaymentTargets(e(1,[['payto','bitcoin','xxx\nfoo']])),[]);
});
test('profile Lightning is fallback, alongside other methods, with no duplication',()=>{
 const nonLn=[{type:'bitcoin',authority:'btc',source:'nip-a3'}];
 const resolved=withLightningFallback(nonLn,'alice@example.com');
 assert.equal(resolved.length,2);
 assert.equal(resolved[1].source,'profile');
 assert.equal(preferredLightningAddress(resolved,'bob@example.com'),'alice@example.com');
 assert.equal(withLightningFallback(resolved,'alice@example.com').length,2);
});
test('signed Lightning payment target takes priority, unsupported target preserves fallback',()=>{
 const targets=[{type:'lightning',authority:'alice@pay.example',source:'nip-a3'}];
 assert.equal(preferredLightningAddress(targets,'bob@example.com'),'alice@pay.example');
 assert.equal(preferredLightningAddress([{type:'lightning',authority:'lnurl1something'}],'bob@example.com'),'bob@example.com');
 assert.equal(isLightningAddress('http://evil.com'),false);
});
