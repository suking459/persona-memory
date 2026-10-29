import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {PersonaMemory} from '../src/index.js';
import {createPreset} from '../src/presets.js';

const HOUR=3600000,DAY=24*HOUR;
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/snapshot-0.3.json',import.meta.url),'utf8'));

test('a real 0.3 disk snapshot migrates, preserves interactions and visitors, then reloads',t=>{
  assert.equal(fixture.provenance.sourceCommit,'cb1ed406e3dba989d5058096220de81a66122303');
  assert.equal(fixture.provenance.sourcePath,'src/index.js');
  assert.equal(fixture.provenance.synthetic,true);
  assert.equal(fixture.snapshot.schemaVersion,1);
  const storage=fs.mkdtempSync(path.join(os.tmpdir(),'pm-upgrade-'));
  t.after(()=>{
    const target=path.resolve(storage),tempRoot=path.resolve(os.tmpdir())+path.sep;
    assert.ok(target.startsWith(tempRoot) && path.basename(target).startsWith('pm-upgrade-'));
    fs.rmSync(target,{recursive:true,force:true});
  });
  const file=path.join(storage,fixture.snapshot.persona+'.json');
  fs.writeFileSync(file,JSON.stringify(fixture.snapshot));
  let now=fixture.provenance.generatedAt;
  const options={storage,persona:fixture.snapshot.persona,clock:()=>now};
  const migrated=new PersonaMemory(options),state=migrated.export();
  assert.equal(state.schemaVersion,5);
  assert.equal(migrated.diagnostics().profiles,2);
  for(const chatId of ['synthetic-chat-a','synthetic-chat-b']) {
    const old=fixture.snapshot.sessions[chatId]['synthetic-member'];
    const profile=migrated.getProfile(chatId,'synthetic-member');
    assert.equal(profile.affinity.value,old.affinity.value);
    assert.equal(profile.affinity.lastInteractiveAt,old.affinity.lastInteractiveAt);
    assert.equal(profile.lastAt,old.lastAt);
    assert.equal(profile.style.count,old.style.count);
    assert.equal(state.sessions[chatId]['synthetic-member'].affinity.lastDecayAt,old.affinity.lastInteractiveAt);
    assert.equal(profile.tags[0].injections,1);
  }
  assert.deepEqual(migrated.getVisitor('synthetic-visitor'),{
    userId:'synthetic-visitor',...fixture.snapshot.visitors['synthetic-visitor'],
  });
  assert.match(migrated.buildContext({chatId:'synthetic-chat-a',
    userIds:['synthetic-member','synthetic-visitor']}).text,/来过 2 次/);
  now+=DAY;
  migrated.maintain();
  migrated.flush();
  assert.equal(JSON.parse(fs.readFileSync(file,'utf8')).schemaVersion,5);
  const reloaded=new PersonaMemory(options);
  assert.deepEqual(reloaded.export(),migrated.export());
  for(const chatId of ['synthetic-chat-a','synthetic-chat-b']) {
    const old=fixture.snapshot.sessions[chatId]['synthetic-member'];
    const profile=reloaded.getProfile(chatId,'synthetic-member');
    assert.equal(profile.affinity.lastInteractiveAt,old.affinity.lastInteractiveAt);
    assert.equal(profile.lastAt,old.lastAt);
    assert.ok(profile.affinity.value<old.affinity.value);
  }
  assert.equal(reloaded.getVisitor('synthetic-visitor').count,2);
});

test('support correction, confirmation, restore and expiry remain isolated by channel',()=>{
  const start=Date.UTC(2026,0,2,12);
  let now=start;
  const config=createPreset('support'),pm=new PersonaMemory({config,clock:()=>now});
  for(const chatId of ['synthetic-refund','synthetic-invoice']) {
    const result=pm.ingest({chatId,userId:'synthetic-customer',eventId:'request-1',
      text:'今天升职了但处理订单好累，请帮我核实订单',directedToBot:true});
    assert.equal(result.duplicate,undefined);
    assert.deepEqual(result.tags,[]);
    pm.setTag({chatId,userId:'synthetic-customer',eventId:'status-1',tag:'待跟进',source:'host',
      advice:chatId==='synthetic-refund'?'核实退款进度':'核实发票信息',expiresAt:start+4*HOUR});
  }
  now+=60000;
  pm.setTag({chatId:'synthetic-refund',userId:'synthetic-customer',eventId:'resolution-1',
    tag:'已解决',replace:['待跟进'],source:'host',advice:'退款已到账，不再重复询问该问题',
    expiresAt:start+2*HOUR});
  const before=pm.export();
  const preview=pm.buildContext({chatId:'synthetic-refund',userIds:['synthetic-customer']});
  assert.match(preview.text,/已解决.*退款已到账/);
  assert.doesNotMatch(preview.text,/待跟进|核实发票|起个哄|熬夜|生疏/);
  assert.deepEqual(pm.export(),before);
  assert.equal(pm.confirmContext(preview,{turnId:'synthetic-answer'}).tagCount,1);
  assert.equal(pm.confirmContext(preview,{turnId:'synthetic-answer'}).duplicate,true);
  const restored=new PersonaMemory({config,clock:()=>now});
  restored.import(pm.export());
  assert.equal(restored.getProfile('synthetic-refund','synthetic-customer').tags[0].injections,1);
  const invoice=restored.buildContext({chatId:'synthetic-invoice',userIds:['synthetic-customer']});
  assert.match(invoice.text,/待跟进.*核实发票信息/);
  assert.doesNotMatch(invoice.text,/已解决|退款已到账/);
  now=start+2*HOUR;
  assert.equal(restored.maintain().expired,1);
  assert.equal(restored.getProfile('synthetic-refund','synthetic-customer').tags.length,0);
  assert.equal(restored.getProfile('synthetic-invoice','synthetic-customer').tags[0].tag,'待跟进');
  now=start+4*HOUR;
  assert.equal(restored.maintain().expired,1);
  assert.equal(restored.diagnostics().tags,0);
});

test('NPC verified events and corrected state survive restore without crossing channels',()=>{
  const start=Date.UTC(2026,0,3,12);
  let now=start;
  const config=createPreset('npc'),pm=new PersonaMemory({config,clock:()=>now});
  pm.ingest({chatId:'synthetic-forest',userId:'synthetic-player',eventId:'message-1',
    text:'好累，先在营地休息',directedToBot:true});
  pm.ingest({chatId:'synthetic-town',userId:'synthetic-player',eventId:'message-1',
    text:'你好，城镇向导',directedToBot:true});
  pm.recordEvent({chatId:'synthetic-forest',userId:'synthetic-player',eventId:'quest-1',
    type:'verified-promise-kept',changes:{trust:10}});
  assert.equal(pm.getProfile('synthetic-forest','synthetic-player').dimensions.trust.value,60);
  assert.equal(pm.getProfile('synthetic-town','synthetic-player').dimensions.trust.value,50);
  now+=60000;
  pm.setTag({chatId:'synthetic-forest',userId:'synthetic-player',eventId:'rest-complete',
    tag:'已休息',replace:['最近很累'],source:'host',advice:'精力恢复，可正常安排探索',expiresAt:start+DAY});
  const preview=pm.buildContext({chatId:'synthetic-forest',userIds:['synthetic-player']});
  assert.match(preview.text,/已休息.*精力恢复/);
  assert.doesNotMatch(preview.text,/最近很累/);
  assert.equal(pm.confirmContext(preview,{turnId:'synthetic-npc-answer'}).tagCount,1);
  const restored=new PersonaMemory({config,clock:()=>now});
  restored.import(pm.export());
  assert.equal(restored.recordEvent({chatId:'synthetic-forest',userId:'synthetic-player',eventId:'quest-1',
    type:'verified-promise-kept',changes:{trust:10}}).duplicate,true);
  assert.equal(restored.getProfile('synthetic-forest','synthetic-player').dimensions.trust.value,60);
  assert.equal(restored.getProfile('synthetic-town','synthetic-player').tags.length,0);
  assert.doesNotMatch(restored.buildContext({chatId:'synthetic-town',userIds:['synthetic-player']}).text,/已休息|精力恢复/);
  now=start+DAY;
  assert.equal(restored.maintain().expired,1);
  assert.equal(restored.diagnostics().tags,0);
  assert.equal(restored.getProfile('synthetic-forest','synthetic-player').dimensions.trust.value,60);
  assert.equal(restored.getProfile('synthetic-forest','synthetic-player').affinity.lastInteractiveAt,start);
  assert.equal(restored.getProfile('synthetic-town','synthetic-player').affinity.lastInteractiveAt,start);
});