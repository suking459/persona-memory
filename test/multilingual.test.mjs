import {testTimeout} from '../tools/test-limits.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {PersonaMemory} from '../src/index.js';
import {createMemoryBridge} from '../adapters/memory/index.js';
import {handleMcp} from '../adapters/mcp/server.js';
import {normalizeLocale,memoryHeader} from '../src/locale.js';
import {prepareAgentBundle,createAgentSession,normalizeBinding} from '../adapters/agent/index.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const fixture=JSON.parse(fs.readFileSync(new URL('../tools/fixtures/multilingual-cases.json',import.meta.url),'utf8'));
const subject={type:'user',id:'multilingual-user'};
function directory(t){
  const base=path.join(root,'.artifacts');fs.mkdirSync(base,{recursive:true});
  const dir=fs.mkdtempSync(path.join(base,'multilingual-'));
  t.after(()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(base)+path.sep));fs.rmSync(dir,{recursive:true,force:true});});return dir;
}
function record(pm,id,value,who=subject){return pm.putMemory({id,subject:who,kind:'preference',key:'field-'+id,value,source:'manual'});}
for(const item of fixture.cases)test('literal multilingual recall keeps source values and scope: '+item.locale,()=>{
  const pm=new PersonaMemory();record(pm,'target',item.value);record(pm,'other','unrelated alternative');
  record(pm,'private',item.value,{type:'user',id:'another-user'});
  const before=JSON.stringify(pm.export()),result=pm.searchMemories({subject,query:item.query,locale:item.locale});
  assert.deepEqual(result.matches.map(hit=>hit.record.id),['target']);
  assert.equal(result.matches[0].record.value,item.value);assert.equal(JSON.stringify(pm.export()),before);
});
test('Thai segmentation also works with the compatible unspecified-locale API',()=>{
  const pm=new PersonaMemory();record(pm,'target','ฉันชอบกาแฟดำ');
  assert.deepEqual(pm.searchMemories({subject,query:'กาแฟ'}).matches.map(x=>x.record.id),['target']);
});
test('Bengali marks distinguish কফি from কফ instead of returning both',()=>{
  const pm=new PersonaMemory();record(pm,'coffee','কফি');record(pm,'different','কফ');
  assert.deepEqual(pm.searchMemories({subject,query:'কফি',locale:'bn'}).matches.map(x=>x.record.id),['coffee']);
});
test('Hindi vowel/nukta marks do not reduce a word to partial-character false positives',()=>{
  const pm=new PersonaMemory();record(pm,'coffee','मुझे कॉफ़ी पसंद है');record(pm,'address','घर का पता');
  assert.deepEqual(pm.searchMemories({subject,query:'कॉफ़ी',locale:'hi'}).matches.map(x=>x.record.id),['coffee']);
});
test('search matches canonical Unicode forms without rewriting the saved form',()=>{
  const pm=new PersonaMemory(),original='cafe\u0301';record(pm,'coffee',original);
  assert.equal(pm.searchMemories({subject,query:'CAFÉ',locale:'fr'}).matches[0].record.value,original);
  assert.equal(pm.getMemory('coffee').value,original);
});
test('explicit Turkish case mapping and stopword policy preserve meaningful Can',()=>{
  const pm=new PersonaMemory();record(pm,'city','İSTANBUL');record(pm,'person','Can');
  assert.deepEqual(pm.searchMemories({subject,query:'istanbul',locale:'tr-TR'}).matches.map(x=>x.record.id),['city']);
  assert.deepEqual(pm.searchMemories({subject,query:'Can',locale:'tr'}).matches.map(x=>x.record.id),['person']);
});
test('locale validation is bounded and fails before data or pending context changes',()=>{
  const pm=new PersonaMemory(),before=JSON.stringify(pm.export());
  for(const locale of ['',[],{},'en_US','bad tag','a'.repeat(65)]){
    assert.throws(()=>pm.buildMemoryContext({subject,locale}),/locale|language/i);
    assert.equal(JSON.stringify(pm.export()),before);assert.equal(pm._pending.size,0);
  }
  assert.equal(normalizeLocale('EN-us'),'en-US');
});
test('headers are localized independently of data and final Unicode budgets remain exact',()=>{
  const pm=new PersonaMemory(),value='قهوة 咖啡 कॉफ़ी 👩🏽‍💻 \u202e data';record(pm,'mixed',value);
  for(const locale of ['en','zh-CN','fr','ar']){
    const context=pm.buildMemoryContext({subject,locale,budget:10000});
    assert.ok(context.text.startsWith(memoryHeader(locale)));
    assert.equal(context.characters,Array.from(context.text).length);
    const line=JSON.parse(context.text.split('\n')[1].slice(2));assert.equal(line.value,value);
    assert.ok(!context.text.includes('\u202e'));
    assert.equal(pm.buildMemoryContext({subject,locale,budget:context.characters}).records.length,1);
    assert.equal(pm.buildMemoryContext({subject,locale,budget:context.characters-1}).records.length,0);
  }
});
test('literal multilingual support does not silently pretend to translate queries',()=>{
  const pm=new PersonaMemory();record(pm,'french','café');
  assert.equal(pm.searchMemories({subject,query:'coffee',locale:'en'}).matches.length,0);
});
test('multilingual values and Unicode identities persist exactly across reload',async t=>{
  const dir=directory(t),storage=path.join(dir,'数据-é-بيانات'),persona='語言',scope='प्रकल्प';
  const pm=new PersonaMemory({storage,persona,scope});
  for(const [i,item]of fixture.cases.entries())record(pm,'r'+i,item.value);
  const unicode={type:'project',id:'工程-प्रकल्प-مشروع'};
  record(pm,'unicode-id','δοκιμή',unicode);await pm.persist();
  const reopened=new PersonaMemory({storage,persona,scope});
  for(const [i,item]of fixture.cases.entries())assert.equal(reopened.getMemory('r'+i).value,item.value);
  assert.deepEqual(reopened.getMemory('unicode-id').subject,unicode);
});
test('changing a bundle locale changes presentation, not project identity or grants',t=>{
  const dir=directory(t);
  const en=prepareAgentBundle({host:'workbuddy',out:path.join(dir,'en'),project:dir,locale:'en-US'});
  const zh=prepareAgentBundle({host:'workbuddy',out:path.join(dir,'zh'),project:dir,locale:'zh-CN'});
  assert.equal(en.binding.namespace,zh.binding.namespace);assert.deepEqual(en.binding.subjects,zh.binding.subjects);
  assert.match(fs.readFileSync(path.join(en.directory,'WORKFLOW.md'),'utf8'),/# Memory workflow/);
  assert.match(fs.readFileSync(path.join(zh.directory,'WORKFLOW.md'),'utf8'),/# 记忆工作流/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(zh.directory,'connector-meta.json'))).name,'项目记忆');
});
test('Agent query locale overrides presentation/search only and cannot widen scopes',async t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'codex',out:path.join(dir,'bundle'),project:dir});
  const binding=bundle.binding,pm=new PersonaMemory({storage:binding.storage,persona:binding.persona,scope:binding.namespace});
  record(pm,'city','İSTANBUL',binding.subjects.project);await pm.persist();
  const session=createAgentSession(pm,binding);
  assert.equal((await session.call('memory_recall',{scope:'project',query:'istanbul',locale:'tr'})).matches[0].record.id,'city');
  await assert.rejects(session.call('memory_recall',{scope:'private',query:'istanbul',locale:'tr'}),/not granted/);
  await assert.rejects(session.call('memory_context',{scope:'project',locale:null}),/locale/);
  const {locale,...legacyBinding}=binding;assert.equal(normalizeBinding(legacyBinding).locale,'en');
});
test('a real capture server, owner CLI and restarted reader preserve mixed-language proposals',t=>{
  const dir=directory(t),bundle=prepareAgentBundle({host:'claude-code',out:path.join(dir,'bundle'),project:dir,locale:'fr'});
  const bindingFile=path.join(bundle.directory,'binding.json'),value='cafe\u0301 — قهوة — कॉफ़ी 👩🏽‍💻';
  const init={jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'language-test',version:'1'}}};
  function rpc(name,args){
    const result=spawnSync(process.execPath,['adapters/agent/server.js','--binding',bindingFile],{cwd:root,input:[init,{jsonrpc:'2.0',id:2,method:'tools/call',params:{name,arguments:args}}].map(x=>JSON.stringify(x)+'\n').join(''),encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
    assert.equal(result.status,0,result.stderr);const rows=result.stdout.trim().split('\n').map(x=>JSON.parse(x));return rows.find(x=>x.id===2).result;
  }
  const proposed=rpc('memory_propose',{scope:'project',kind:'preference',key:'drink',value,evidenceId:'multilingual-message',reason:'Explicit synthetic source'});
  assert.equal(proposed.structuredContent.candidate.memory.value,value);
  const candidate=proposed.structuredContent.candidate;
  const reviewed=spawnSync(process.execPath,['tools/connect.mjs','review','--binding',bindingFile,'--scope','project','--candidate',candidate.id,'--revision','1','--decision','accept'],{cwd:root,encoding:'utf8',windowsHide:true,timeout:testTimeout(10000)});
  assert.equal(reviewed.status,0,reviewed.stderr);
  const found=rpc('memory_recall',{scope:'project',query:'CAFÉ',locale:'fr'});
  assert.equal(found.structuredContent.matches[0].record.value,value);
});
test('query term limits still bound dictionary languages and malformed tags',()=>{
  const pm=new PersonaMemory(),before=JSON.stringify(pm.export());
  assert.throws(()=>pm.searchMemories({subject,locale:'th',query:Array.from({length:90},(_,i)=>'กาแฟ'+i).join(' ')}),/query/);
  assert.equal(JSON.stringify(pm.export()),before);
});

test('model bridge carries the configured locale into search and context',async()=>{
  const pm=new PersonaMemory();record(pm,'city','İSTANBUL');
  const bridge=createMemoryBridge(pm,{subject,locale:'tr',budget:2000});
  const result=await bridge.invoke({text:'istanbul',turnId:'locale-bridge'},values=>{
    assert.match(values.memory,/İSTANBUL/);assert.match(values.memory,/Memory data/);return 'ok';
  });
  assert.equal(result.usage.memoryCount,1);
});
test('legacy MCP advertises and accepts locale without enabling typed writes',async()=>{
  const pm=new PersonaMemory();record(pm,'city','İSTANBUL');
  const listing=await handleMcp({jsonrpc:'2.0',id:1,method:'tools/list'},pm);
  for(const name of ['memory_search_records','memory_records_context']){
    assert.equal(listing.result.tools.find(x=>x.name===name).inputSchema.properties.locale.type,'string');
  }
  const message=await handleMcp({jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'memory_records_context',arguments:{subject,query:'istanbul',locale:'tr',budget:2000}}},pm);
  const context=JSON.parse(message.result.content[0].text);
  assert.match(context.text,/İSTANBUL/);assert.match(context.text,/Memory data/);
});
