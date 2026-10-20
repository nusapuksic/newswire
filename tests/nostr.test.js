import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySchnorr, verifyNostrEvent } from '../public/src/verify.js';
import { matches, uniqueRelays } from '../public/src/nostr.js';

test('BIP-340 vector 0 valid', async()=>{
 const ok=await verifySchnorr(
  'E907831F80848D1069A5371B402410364BDF1C5F8307B0084C55F1CE2DCA821525F66A4A85EA8B71E482A74F382D2CE5EBEEE8FDB2172F477DF4900D310536C0',
  'F9308A019258C31049344F85F89D5229B531C845836F99B08601F113BCE036F9',
  '0000000000000000000000000000000000000000000000000000000000000000');
 assert.equal(ok,true);
});
test('BIP-340 valid vector 1', async()=>{
 const ok=await verifySchnorr(
  '6896BD60EEAE296DB48A229FF71DFE071BDE413E6D43F917DC8DCF8C78DE33418906D11AC976ABCCB20B091292BFF4EA897EFCB639EA871CFA95F6DE339E4B0A',
  'DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659',
  '243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89');
 assert.equal(ok,true);
});
test('BIP-340 invalid signature', async()=>{
 const ok=await verifySchnorr(
  '6CFF5C3BA86C69EA4B7376F31A9BCB4F74C1976089B2D9963DA2E5543E177769961764B3AA9B2FFCB6EF947B6887A226E8D7C93E00C5ED0C1834FF0D0C2E6DA6',
  'DFF1D77F2A671C5F36183726DB2341BE58FEAE1DA2DECED843240F7B502BA659',
  '243F6A8885A308D313198A2E03707344A4093822299F31D0082EFA98EC4E6C89');
 assert.equal(ok,false);
});
test('malformed Nostr events rejected', async()=>{
 assert.equal(await verifyNostrEvent({kind:1,content:'hello',tags:[],created_at:1,id:'0'.repeat(64),pubkey:'0'.repeat(64),sig:'1'.repeat(128)}),false);
});
test('relay and local filter safety', ()=>{
 const ev={id:'a'.repeat(64),pubkey:'b'.repeat(64),kind:1,tags:[['e','c'.repeat(64)]]};
 assert.equal(matches(ev,{kinds:[1],authors:['b'.repeat(64)],'#e':['c'.repeat(64)]}),true);
 assert.equal(matches(ev,{kinds:[30004]}),false);
 assert.deepEqual(uniqueRelays(['wss://nos.lol','https://invalid.com','wss://nos.lol']),['wss://nos.lol']);
});

test('relay query waits for asynchronous event verification before EOSE', async()=>{
 class MockWebSocket {
  constructor(url){this.url=url;this.readyState=0;queueMicrotask(()=>{this.readyState=1;this.onopen?.();});}
  send(raw){
   const [command,id]=JSON.parse(raw);
   if(command==='REQ'){
    const evt={id:'a'.repeat(64),pubkey:'b'.repeat(64),kind:1,tags:[],created_at:1,content:'test'};
    queueMicrotask(()=>{this.onmessage?.({data:JSON.stringify(['EVENT',id,evt])});this.onmessage?.({data:JSON.stringify(['EOSE',id])});});
   }
  }
  close(){this.readyState=3;}
 }
 const old=globalThis.WebSocket;globalThis.WebSocket=MockWebSocket;
 try{
  const {NostrGateway}=await import('../public/src/nostr.js');
  const pool=new NostrGateway(['wss://relay.example.com']);
  pool.verify=async()=>{await new Promise(r=>setTimeout(r,55));return true;};
  const result=await pool.query([{kinds:[1],authors:['b'.repeat(64)]}],{timeout:1000});
  assert.equal(result.length,1);
  pool.close();
 } finally {globalThis.WebSocket=old;}
});
